# Cliente de desktop da YAMI — especificação

Este diretório descreve como o aplicativo Windows se liga ao site da YAMI
(pareamento e painel remoto). Não altere o `build-src` da YAMI a partir
deste repositório: copie ou importe este módulo no código do aplicativo.

A integração completa, com IPC e exemplos, está em `INTEGRATION.md`.

## Visão geral

1. A pessoa instala a YAMI no PC de casa e a deixa aberta.
2. O aplicativo chama `POST /api/pairing/start` e **mostra o código** na tela.
3. No site (este mesmo, em `/conta` ou `/painel`), a pessoa entra na conta e
   digita o código.
4. O aplicativo coleta `GET /api/pairing/poll?pollToken=…` até receber
   `status: "ready"` com um `deviceToken`. Guarda o token com segurança.
5. Daí em diante, o aplicativo faz a conexão de saída:
   `GET /api/relay/device/pull?afterSeq=&waitMs=` com
   `Authorization: Bearer <deviceToken>` (long-poll até 25 s, ou coleta
   curta 1–2 s) e envia respostas em `POST /api/relay/device/push`.
6. O painel no navegador nunca abre uma porta no PC. O aparelho aparece
   **ligado** se o último pull tiver menos de 30 segundos.

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

### `POST /api/pairing/confirm` (site, pessoa autenticada e com licença)

Corpo: `{ "code", "deviceName" }`. Liga o aparelho à conta.

### `POST /api/pairing/revoke`

A pessoa desconecta o aparelho. O próximo `GET /api/relay/device/pull`
responde 401.

## Relé (Postgres, `RELAY_PROVIDER=postgres`)

Filas em `remote_messages` no Neon já ligado ao projeto. Sem WebSocket,
sem conta extra. O protocolo é long-poll HTTP (até 25 s, dentro do
limite da Vercel) ou coleta curta.

### `GET /api/relay/device/pull`

Cabeçalho `Authorization: Bearer <deviceToken>`. Query: `afterSeq`,
`waitMs`. Marca o aparelho como visto e devolve
`{ ok, deviceId, messages, lastSeq, serverTime }`.

### `POST /api/relay/device/push`

Envia um evento ao painel: `{ kind, payload, needsLocalApproval }`.

### Painel

`GET`/`POST /api/relay/painel/pull` e `/push`, com o cookie de sessão e
licença paga. O `POST` exige `deviceId` e a origem do site. Pedidos para
um PC desligado entram na fila.

As rotas antigas `/api/relay/desktop` e `/api/relay/browser` continuam
como apelido.

## Aprovação local (obrigatória)

Qualquer mensagem com `needsLocalApproval: true`, ou `kind`/`action` em
`file`, `command`, `shell`, `approval_request`, **só é executada depois
que a pessoa aprovar no PC de casa**. O painel remoto não atravessa essa
trava. Use `YamiDesktopClient.handleIncoming`.

## Segurança

- Só conta com licença paga usa o relé.
- Rate limit nos endpoints de pareamento, relé e login.
- Tokens de aparelho e de sessão ficam só como hash no servidor.
- Teto de 64 KiB por mensagem; mensagens expiram em 7 dias.
- Registro de acesso (`audit_log`) na conta, com opção de desconectar.
- Nunca envie chaves, senhas, carteiras ou o `deviceToken` em log.
- A origem das rotas de conta e do push do painel é checada (mesmo site).
