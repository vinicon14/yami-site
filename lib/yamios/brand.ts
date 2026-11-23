/**
 * Nome oficial do sistema, o mesmo de `produto` em lib/yamios/latest.json.
 * Troque só esta constante para renomear o YAMI OS no texto do site.
 */
export const YAMI_OS_NAME = "YAMI OS";

/** Primeira versão em que a ISO pode ser baixada de graça, sem licença. */
export const YAMI_OS_FREE_ISO_FROM = "1.1.0";

export const YAMI_OS_ISO_SOON = `em breve na versão ${YAMI_OS_FREE_ISO_FROM}`;

/**
 * Abaixo de 1.1.0 a ISO ainda exige licença, então o destaque fala no futuro.
 * "de graça para baixar" só entra quando a versão anunciada já é 1.1.0 ou maior.
 */
export function yamiOsPromoCopy(freeToDownload: boolean): { title: string; windowsOffer: string } {
  return {
    title: freeToDownload
      ? `O ${YAMI_OS_NAME} é de graça para baixar`
      : `O ${YAMI_OS_NAME} vai ser grátis a partir da versão ${YAMI_OS_FREE_ISO_FROM}`,
    windowsOffer: "Quem quiser pode pagar para usar a YAMI no Windows.",
  };
}
