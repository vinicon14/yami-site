# Cliente de desktop da YAMI — especificação

Este diretório descreve como o aplicativo Windows se liga ao site da YAMI
(pareamento e painel remoto). Não altere o `build-src` da YAMI a partir
deste repositório: copie ou importe este módulo no código do aplicativo.

## Visão geral

1. A pessoa instala a YAMI no PC de casa e a deixa aberta.
2. O aplicativo chama `POST /api/pairing/start` e **mostra o código** na tela.
3. No site (este mesmo, em `/conta` ou `/painel`), a pessoa entra na conta e
   digita o código.
4. O aplicativo coleta `GET /api/pairing/poll?pollToken=…` até receber
   `status: "ready"` com um `deviceToken`. Guarda o token com segurança.
5. Daí em diante, o aplicativo faz a conexão de saída: coleta
   `GET /api/relay/desktop` com `Authorization: Bearer <deviceToken>` e
   envia respostas em `POST /api/relay/desktop`.
6. O painel no navegador nunca abre uma porta no PC. Se o aplicativo estiver
   fechado, o painel avisa que o dispositivo está desligado.

## Pareamento

### `POST /api/pairing/start`

Sem autenticação. Resposta:

```json
{ "code": "AB3K7P", "pollToken": "<hex>", "expiresAt": "<ISO>" }
```

- `code` tem 6 caracteres, alfabeto sem 0/O/1/I/L, vale 10 minutos.
- Mostre só o `code`. O `pollToken` fica no aplicativo, nunca na tela.

### `GET /api/pairing/poll?pollToken=`

- `pending` — ainda não confirmado no site.
- `ready` — traga `deviceId`, `deviceName`, `deviceToken`. O token em claro
  só é entregue **uma vez**.
- `consumed` — já foi coletado.
- `expired` — peça um código novo.

### `POST /api/pairing/confirm` (site, pessoa autenticada)

Corpo: `{ "code", "deviceName" }`. Liga o aparelho à conta.

### `POST /api/pairing/revoke`

A pessoa desconecta o aparelho. O próximo `GET /api/relay/desktop` responde 401.

## Relé

Vercel não segura WebSocket longo. O protocolo atual é coleta periódica
(2–3 s). A interface (`lib/relay`) admite um provedor gerenciado (Ably,
Pusher) ou um processo pequeno (Fly.io, Railway); veja `docs/RELAY.md`.

### `GET /api/relay/desktop`

Cabeçalho `Authorization: Bearer <deviceToken>`. Marca o aparelho como
online e devolve `{ messages: RelayMessage[] }`.

### `POST /api/relay/desktop`

Envia um evento ao navegador: `{ kind, payload, needsLocalApproval }`.

### `GET`/`POST /api/relay/browser`

Usado pelo painel, com o cookie de sessão. O `POST` exige `deviceId`.
Se o PC estiver offline, responde 409 com uma mensagem clara.

## Aprovação local (obrigatória)

Qualquer mensagem com `needsLocalApproval: true`, ou `kind`/`action` em
`file`, `command`, `shell`, `approval_request`, **só é executada depois
que a pessoa aprovar no PC de casa**. O painel remoto não atravessa essa
trava. Use `YamiDesktopClient.handleIncoming`.

## Segurança

- Rate limit nos endpoints de pareamento e login.
- Tokens de aparelho e de sessão ficam só como hash no servidor.
- Registro de acesso (`audit_log`) na conta, com opção de desconectar.
- Nunca envie chaves, senhas, carteiras ou o `deviceToken` em log.
- A origem das rotas de conta é checada (mesmo site).
