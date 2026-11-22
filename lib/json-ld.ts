/** Serializa JSON-LD com `<` e `>` escapados, evitando quebras da tag <script>. */
export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e");
}
