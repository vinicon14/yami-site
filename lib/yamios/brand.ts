/**
 * Nome oficial do sistema, o mesmo de `produto` em lib/yamios/latest.json.
 * Troque só esta constante para renomear o YAMI OS no texto do site.
 */
export const YAMI_OS_NAME = "YAMI OS";

/** Primeira versão em que a ISO pode ser baixada de graça, sem licença. */
export const YAMI_OS_FREE_ISO_FROM = "1.0.0";

export const YAMI_OS_ISO_SOON = `em breve na versão ${YAMI_OS_FREE_ISO_FROM}`;

/**
 * O destaque só anuncia download gratuito quando a ISO está publicada e validada.
 * A versão anunciada, sozinha, não significa que os arquivos estejam disponíveis.
 */
export function yamiOsPromoCopy(freeToDownload: boolean): { title: string; windowsOffer: string } {
  return {
    title: freeToDownload
      ? `O ${YAMI_OS_NAME} é de graça para baixar`
      : `O download gratuito do ${YAMI_OS_NAME} estará disponível em breve`,
    windowsOffer: "Quem quiser pode pagar para usar a YAMI no Windows.",
  };
}
