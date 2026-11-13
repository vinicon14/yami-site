import {
  emailEnabled,
  formatPriceBrl,
  getEmailFrom,
  getResendApiKey,
  getSiteUrl,
  PRODUCT,
} from "./config";

export async function maybeSendLicenseEmail(opts: {
  email: string;
  licenseKey: string;
  downloadToken: string;
  expiresAt: string;
  orderId: string;
}): Promise<{ sent: boolean; reason?: string }> {
  if (!emailEnabled()) return { sent: false, reason: "disabled" };
  if (!opts.downloadToken) return { sent: false, reason: "no_token" };

  const url = `${getSiteUrl()}/api/download?token=${encodeURIComponent(opts.downloadToken)}`;
  const expiry = new Date(opts.expiresAt).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
  });
  const body = {
    from: getEmailFrom(),
    to: [opts.email],
    subject: `Sua licença da ${PRODUCT.name} ${PRODUCT.version}`,
    text: [
      `Obrigado por comprar a ${PRODUCT.name}.`,
      ``,
      `Pedido: ${opts.orderId}`,
      `Valor: ${formatPriceBrl()}`,
      `Chave de licença: ${opts.licenseKey}`,
      ``,
      `Link para baixar o instalador (expira em ${expiry}, horário de Brasília):`,
      url,
      ``,
      `Guarde a chave. O link de download é pessoal e tem validade limitada.`,
    ].join("\n"),
  };

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getResendApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) return { sent: false, reason: `http_${res.status}` };
  return { sent: true };
}
