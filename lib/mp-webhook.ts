import {
  getMpAccessToken,
  getMpMode,
  getWebhookSecret,
  hasMpAccessToken,
} from "./config";
import { getStore, type Store } from "./db";
import { fulfillApprovedPayment, paymentMatchesOrder } from "./fulfill";
import { fetchPayment } from "./mp-checkout";
import { verifyMercadoPagoSignature } from "./mp-signature";
import { normalizePaymentEvent } from "./payment-events";

export const SIGNATURE_MAX_AGE_SEC = 60 * 15;

export type WebhookHeaders = {
  signature: string | null;
  requestId: string | null;
};

export type WebhookProcessResult =
  | { ok: true; skipped?: string; fulfilled?: boolean; alreadyPaid?: boolean }
  | { ok: false; error: string; status: number };

export function pickDataId(body: unknown, url: URL): string {
  if (body && typeof body === "object") {
    const data = (body as { data?: { id?: unknown } }).data;
    if (data && data.id != null) return String(data.id);
    const id = (body as { id?: unknown }).id;
    if (id != null && (body as { type?: string }).type === "payment") {
      return String(id);
    }
  }
  const q = url.searchParams.get("data.id") ?? url.searchParams.get("id");
  return q ?? "";
}

export function isPaymentTopic(body: unknown, url: URL): boolean {
  const type =
    (body && typeof body === "object" && (body as { type?: string }).type) ||
    url.searchParams.get("type") ||
    url.searchParams.get("topic");
  return type === "payment" || type === "payment.updated" || !type;
}

/**
 * Processa uma notificação do Mercado Pago.
 *
 * Segurança principal: o corpo da notificação NÃO é confiável. Sempre
 * buscamos o pagamento em GET /v1/payments/{id} com o access token e
 * só liberamos se status=approved, external_reference = id do pedido
 * e valor = preço configurado (R$ 20,00). O processamento é idempotente.
 *
 * Se MP_WEBHOOK_SECRET estiver definido, a assinatura x-signature também
 * é exigida. Sem o segredo, a busca autenticada na API é a verificação.
 */
export async function processMercadoPagoNotification(opts: {
  body: unknown;
  url: URL;
  headers: WebhookHeaders;
  now?: Date;
  fetchPaymentFn?: typeof fetchPayment;
  store?: Store;
}): Promise<WebhookProcessResult> {
  const secret = getWebhookSecret();
  const dataId = pickDataId(opts.body, opts.url);

  const logEvent = async (
    eventType: "webhook" | "fulfill" | "duplicate" | "match_failed" | "api_error",
    result: "ok" | "skipped" | "error",
    reasonCode: string,
    orderId: string | null = null,
  ) => {
    try {
      const target = opts.store ?? (await getStore());
      await target.addPaymentEvent({
        ...normalizePaymentEvent({
          orderId,
          paymentId: dataId || null,
          eventType,
          result,
          reasonCode,
        }),
        id: crypto.randomUUID(),
      });
    } catch {
      // Auditoria é best-effort: falha ao gravar não pode alterar a resposta
      // do webhook nem impedir a liberação do pagamento.
      console.error("falha ao registrar evento de pagamento");
    }
  };

  if (secret) {
    const requestId = opts.headers.requestId ?? "";
    const result = verifyMercadoPagoSignature({
      xSignature: opts.headers.signature,
      xRequestId: opts.headers.requestId,
      dataId,
      secret,
      nowSec: opts.now ? Math.floor(opts.now.getTime() / 1000) : undefined,
      maxAgeSec: SIGNATURE_MAX_AGE_SEC,
    });
    if (!result.ok) {
      await logEvent("webhook", "error", "signature_invalid");
      return { ok: false, error: "assinatura inválida", status: 401 };
    }
  }

  if (!dataId) {
    await logEvent("webhook", "skipped", "no_payment_id");
    return { ok: true, skipped: "no_payment_id" };
  }
  if (!isPaymentTopic(opts.body, opts.url)) {
    await logEvent("webhook", "skipped", "ignored_topic");
    return { ok: true, skipped: "ignored_topic" };
  }
  // O processamento do webhook depende apenas de acesso autenticado à API e
  // de uma assinatura válida quando MP_WEBHOOK_SECRET está configurado.
  // chargesEnabled() também exige o segredo para abrir a venda, mas aqui a
  // confirmação de um pagamento real continua válida sem ele.
  if (getMpMode() !== "production" || !hasMpAccessToken()) {
    await logEvent("webhook", "skipped", "charges_disabled");
    return { ok: true, skipped: "charges_disabled" };
  }

  const fetchFn = opts.fetchPaymentFn ?? fetchPayment;
  let payment;
  try {
    payment = await fetchFn(dataId, getMpAccessToken());
  } catch {
    // 500 faz o MP tentar de novo; não confiamos no corpo.
    await logEvent("api_error", "error", "payment_fetch_failed");
    return { ok: false, error: "falha ao consultar pagamento", status: 500 };
  }

  const orderId = payment.external_reference;
  if (!orderId) {
    await logEvent("webhook", "skipped", "no_reference");
    return { ok: true, skipped: "no_reference" };
  }

  const store = opts.store ?? (await getStore());
  const order = await store.getOrderById(orderId);
  if (!order) {
    await logEvent("webhook", "skipped", "unknown_order");
    return { ok: true, skipped: "unknown_order" };
  }

  const check = paymentMatchesOrder(payment, order);
  if (!check.ok) {
    await logEvent("match_failed", "skipped", check.reason ?? "match_failed", order.id);
    if (payment.status === "rejected" || payment.status === "cancelled") {
      await store.markFailed(order.id);
      await logEvent(
        "webhook",
        "skipped",
        payment.status === "rejected" ? "status_rejected" : "status_cancelled",
        order.id,
      );
    }
    return { ok: true, skipped: check.reason };
  }

  const fulfilled = await fulfillApprovedPayment({
    store,
    orderId: order.id,
    paymentId: String(payment.id),
    payment,
  });
  await logEvent(
    fulfilled.alreadyPaid ? "duplicate" : "fulfill",
    "ok",
    fulfilled.alreadyPaid ? "duplicate" : "approved",
    order.id,
  );
  return { ok: true, fulfilled: true, alreadyPaid: fulfilled.alreadyPaid };
}
