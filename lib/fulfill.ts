import {
  chargesEnabled,
  getDownloadSecret,
  getDownloadTtlHours,
  getMaxDownloads,
  getMpAccessToken,
  getPriceBrl,
} from "./config";
import { getStore, type License, type Order, type Store } from "./db";
import {
  checkDownloadToken,
  generateDownloadToken,
  hashToken,
  tokenExpiry,
} from "./download-token";
import { maybeSendLicenseEmail } from "./email";
import { generateLicenseKey } from "./license";
import { fetchPayment, type MpPayment } from "./mp-checkout";

const AMOUNT_TOLERANCE = 0.009;

export type FulfillResult = {
  order: Order;
  license: License;
  downloadToken: string;
  expiresAt: string;
  alreadyPaid: boolean;
};

export function paymentMatchesOrder(payment: MpPayment, order: Order): {
  ok: boolean;
  reason?: string;
} {
  if (payment.status !== "approved") {
    return { ok: false, reason: `status_${payment.status}` };
  }
  if (payment.external_reference && payment.external_reference !== order.id) {
    return { ok: false, reason: "external_reference_mismatch" };
  }
  if (payment.currency_id && payment.currency_id !== "BRL") {
    return { ok: false, reason: "currency_mismatch" };
  }
  if (
    typeof payment.transaction_amount === "number" &&
    Math.abs(payment.transaction_amount - order.amountBrl) > AMOUNT_TOLERANCE
  ) {
    return { ok: false, reason: "amount_mismatch" };
  }
  const expected = getPriceBrl();
  if (Math.abs(order.amountBrl - expected) > AMOUNT_TOLERANCE) {
    return { ok: false, reason: "price_changed" };
  }
  return { ok: true };
}

export async function fulfillApprovedPayment(opts: {
  store?: Store;
  orderId: string;
  paymentId: string;
  payment?: MpPayment;
}): Promise<FulfillResult> {
  const store = opts.store ?? (await getStore());
  const byPayment = await store.getOrderByPaymentId(String(opts.paymentId));
  const order = await store.getOrderById(opts.orderId);
  if (!order) throw new Error("pedido não encontrado");
  if (byPayment && byPayment.id !== order.id) {
    throw new Error("pagamento já associado a outro pedido");
  }

  if (opts.payment) {
    const check = paymentMatchesOrder(opts.payment, order);
    if (!check.ok) throw new Error(check.reason ?? "pagamento inválido");
  }

  let paid = order;
  let alreadyPaid = order.status === "paid";
  if (!alreadyPaid) {
    paid = await store.markPaid(order.id, String(opts.paymentId));
  } else if (!order.mpPaymentId) {
    paid = await store.markPaid(order.id, String(opts.paymentId));
    alreadyPaid = true;
  }

  let license = await store.getLicenseByOrderId(paid.id);
  if (!license) {
    license = await store.createLicense(paid.id, generateLicenseKey());
  }

  const issued = await issueDownloadToken(store, paid, license);

  // E-mail é opcional e não bloqueia a entrega.
  void maybeSendLicenseEmail({
    email: paid.email,
    licenseKey: license.key,
    downloadToken: issued.token,
    expiresAt: issued.expiresAt,
    orderId: paid.id,
  }).catch(() => undefined);

  return {
    order: paid,
    license,
    downloadToken: issued.token,
    expiresAt: issued.expiresAt,
    alreadyPaid,
  };
}

export async function issueDownloadToken(
  store: Store,
  order: Order,
  license: License,
): Promise<{ token: string; expiresAt: string }> {
  const max = getMaxDownloads();
  const used = await store.totalDownloadsForOrder(order.id);
  if (used >= max) {
    const latest = await store.getLatestDownloadToken(order.id);
    // Sem token novo se o limite global estourou; devolve um token
    // existente só para a página de sucesso explicar o limite.
    return {
      token: "",
      expiresAt: latest?.expiresAt ?? new Date().toISOString(),
    };
  }

  const latest = await store.getLatestDownloadToken(order.id);
  if (latest) {
    const check = checkDownloadToken({
      expiresAt: new Date(latest.expiresAt),
      downloadsUsed: used,
      maxDownloads: max,
    });
    // Não dá para reaver o token em claro (só o hash fica gravado).
    // Sempre emite um novo se o anterior ainda seria válido no prazo,
    // mas só quando a página de sucesso precisa mostrar o link —
    // um token ainda válido e recente (menos de 30 min) é substituído
    // mesmo assim, porque o valor em claro não está no banco.
  }
  void latest;

  const token = generateDownloadToken();
  const expires = tokenExpiry(getDownloadTtlHours());
  await store.createDownloadToken({
    id: crypto.randomUUID(),
    orderId: order.id,
    licenseId: license.id,
    tokenHash: hashToken(token, getDownloadSecret()),
    expiresAt: expires.toISOString(),
    downloadsUsed: 0,
    maxDownloads: max,
  });
  return { token, expiresAt: expires.toISOString() };
}

export async function reconcileFromReturn(opts: {
  orderId?: string;
  paymentId?: string;
}): Promise<FulfillResult | { error: string; pending?: boolean }> {
  if (!opts.orderId) return { error: "pedido ausente" };
  const store = await getStore();
  const order = await store.getOrderById(opts.orderId);
  if (!order) return { error: "pedido não encontrado" };

  if (order.status === "paid") {
    const license = await store.getLicenseByOrderId(order.id);
    if (!license) return { error: "licença ausente" };
    const issued = await issueDownloadToken(store, order, license);
    return {
      order,
      license,
      downloadToken: issued.token,
      expiresAt: issued.expiresAt,
      alreadyPaid: true,
    };
  }

  if (!opts.paymentId) {
    return { error: "aguardando confirmação do pagamento", pending: true };
  }

  if (!chargesEnabled()) {
    return { error: "pagamento ainda não confirmado", pending: true };
  }

  let payment: MpPayment;
  try {
    payment = await fetchPayment(opts.paymentId, getMpAccessToken());
  } catch {
    return { error: "não foi possível consultar o pagamento", pending: true };
  }

  const check = paymentMatchesOrder(payment, order);
  if (!check.ok) {
    if (payment.status === "pending" || payment.status === "in_process") {
      return { error: "pagamento em processamento", pending: true };
    }
    return { error: "pagamento não aprovado" };
  }

  return fulfillApprovedPayment({
    store,
    orderId: order.id,
    paymentId: String(payment.id),
    payment,
  });
}
