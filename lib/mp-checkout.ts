/**
 * Monta a preferência do Checkout Pro (Pix + cartão).
 * A chamada HTTP à API só acontece em createPreference(),
 * e a rota de checkout só a invoca com chargesEnabled().
 */

export type PreferencePayload = {
  items: Array<{
    id: string;
    title: string;
    description: string;
    quantity: number;
    currency_id: "BRL";
    unit_price: number;
    category_id: string;
  }>;
  payer: { email: string; name?: string };
  back_urls: { success: string; failure: string; pending: string };
  auto_return?: "approved";
  notification_url: string;
  external_reference: string;
  statement_descriptor: string;
  payment_methods: {
    excluded_payment_types: Array<{ id: string }>;
    installments: number;
    default_installments: number;
  };
  metadata: Record<string, string>;
};

export function buildPreferencePayload(opts: {
  orderId: string;
  email: string;
  name?: string | null;
  price: number;
  siteUrl: string;
  version: string;
}): PreferencePayload {
  const payload: PreferencePayload = {
    items: [
      {
        id: "yami-licenca",
        title: "YAMI — licença e instalador",
        description: `YAMI ${opts.version} para Windows 10/11 x64. Pagamento único: licença e download do instalador.`,
        quantity: 1,
        currency_id: "BRL",
        unit_price: opts.price,
        category_id: "services",
      },
    ],
    payer: { email: opts.email },
    back_urls: {
      success: `${opts.siteUrl}/sucesso`,
      failure: `${opts.siteUrl}/checkout?status=falhou`,
      pending: `${opts.siteUrl}/checkout?status=pendente`,
    },
    notification_url: `${opts.siteUrl}/api/mp/webhook`,
    external_reference: opts.orderId,
    statement_descriptor: "YAMI",
    // Pix é bank_transfer/pix — não excluir bank_transfer.
    // Cartão de crédito e débito entram por padrão.
    // Exclui boleto (ticket) e caixa eletrônico.
    payment_methods: {
      excluded_payment_types: [{ id: "ticket" }, { id: "atm" }],
      installments: 1,
      default_installments: 1,
    },
    metadata: {
      product: "yami",
      version: opts.version,
      order_id: opts.orderId,
    },
  };
  if (opts.name) payload.payer.name = opts.name;
  // auto_return exige HTTPS (o Mercado Pago rejeita em http://localhost).
  if (opts.siteUrl.startsWith("https://")) {
    payload.auto_return = "approved";
  }
  return payload;
}

export type CreatedPreference = {
  id: string;
  init_point: string;
  sandbox_init_point?: string;
};

export async function createPreference(
  payload: PreferencePayload,
  accessToken: string,
): Promise<CreatedPreference> {
  const res = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-Idempotency-Key": payload.external_reference,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    // Não incluir o corpo bruto: pode vazar dados do pagador.
    throw new Error(`Falha ao criar preferência no Mercado Pago (${res.status})`);
  }
  const data = (await res.json()) as CreatedPreference;
  if (!data?.id || !data?.init_point) {
    throw new Error("Resposta incompleta do Mercado Pago");
  }
  return data;
}

export type MpPayment = {
  id: number | string;
  status: string;
  status_detail?: string;
  live_mode?: boolean;
  transaction_amount?: number;
  currency_id?: string;
  external_reference?: string;
  payer?: { email?: string };
};

export async function fetchPayment(
  paymentId: string,
  accessToken: string,
): Promise<MpPayment> {
  const res = await fetch(
    `https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    },
  );
  if (!res.ok) {
    throw new Error(`Falha ao consultar pagamento (${res.status})`);
  }
  return (await res.json()) as MpPayment;
}

/** Tipos de pagamento que o Checkout Pro desta loja aceita (Pix + cartão). */
export const ACCEPTED_PAYMENT_COPY =
  "Pix ou cartão de crédito e débito, pelo Mercado Pago.";
