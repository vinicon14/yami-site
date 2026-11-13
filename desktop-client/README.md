# desktop-client

Módulo TypeScript e especificação para o aplicativo Windows da YAMI se
conectar a este site (pareamento + relé Postgres).

- Contrato e IPC: veja **`INTEGRATION.md`** (é o documento que o
  Automaton deve seguir para encaixar no app Electron).
- Resumo do protocolo: `SPEC.md`.
- Código: `index.ts`, `types.ts`.

Não altera o `build-src` da YAMI neste repositório: copie ou importe
o módulo no código do aplicativo.
