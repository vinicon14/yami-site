/**
 * Nome oficial do sistema, o mesmo de `produto` em lib/yamios/latest.json.
 * Troque só esta constante para renomear o YAMI OS no texto do site.
 */
export const YAMI_OS_NAME = "YAMI OS";

/** Primeira versão em que a ISO pode ser baixada de graça, sem licença. */
export const YAMI_OS_FREE_ISO_FROM = "1.1.0";

export const YAMI_OS_ISO_SOON = `em breve na versão ${YAMI_OS_FREE_ISO_FROM}`;

export function yamiOsPromoCopy(): { title: string; windowsOffer: string } {
  return {
    title: `O ${YAMI_OS_NAME} é de graça para baixar`,
    windowsOffer: "Quem quiser pode pagar para usar a YAMI no Windows.",
  };
}
