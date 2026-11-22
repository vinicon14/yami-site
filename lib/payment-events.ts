export type PaymentEventType = "webhook" | "fulfill" | "duplicate" | "match_failed" | "api_error";

export type PaymentEventInput = {
  orderId: string | null;
  paymentId: string | null;
  eventType: PaymentEventType;
  result: "ok" | "skipped" | "error";
  reasonCode: string;
};

const ALLOWED_REASONS = new Set([
  "approved",
  "duplicate",
  "missing_external_reference",
  "external_reference_mismatch",
  "currency_mismatch",
  "amount_mismatch",
  "price_changed",
  "unknown_order",
  "signature_invalid",
  "payment_fetch_failed",
  "status_rejected",
  "status_cancelled",
  "ignored_topic",
  "charges_disabled",
  "no_payment_id",
  "no_reference",
  "status_pending",
  "status_in_process",
]);

export function normalizePaymentEvent(input: PaymentEventInput): PaymentEventInput {
  const reasonCode = ALLOWED_REASONS.has(input.reasonCode) ? input.reasonCode : "other";
  return {
    orderId: input.orderId?.slice(0, 80) ?? null,
    paymentId: input.paymentId?.slice(0, 40) ?? null,
    eventType: input.eventType,
    result: input.result,
    reasonCode,
  };
}
