# Integração do relé YAMI no aplicativo Electron

Este documento é a especificação para o bot Automaton (ou quem for)
encaixar o módulo `desktop-client/` no aplicativo Windows da YAMI.
**Não altere o `build-src` a partir do repositório do site.** Copie ou
importe `desktop-client/index.ts` e `desktop-client/types.ts` para o
código do app, e ligue os pontos abaixo.

Site de produção: `https://yami-site-pi.vercel.app`

O relé é **Postgres no Neon já ligado ao projeto** (`RELAY_PROVIDER=postgres`).
Não há Ably, Pusher nem servidor extra. O aplicativo só faz HTTPS de saída.

## O que o aplicativo precisa fazer

1. **Tela de pareamento** — pedir um código, mostrá-lo em destaque, esperar
   a pessoa digitá-lo em `/painel` ou `/conta`.
2. **Guardar o `deviceToken`** no cofre seguro do Electron
   (`safeStorage.encryptString`), nunca em log, nunca no repositório.
3. **Laço em segundo plano** — enquanto a YAMI estiver aberta, long-poll
   em `GET /api/relay/device/pull` (até ~25 s) ou coleta curta a cada 1–2 s.
4. **Mapear mensagens** para o IPC já existente de chat e Forage.
5. **Aprovar no PC** qualquer ação de arquivo ou comando, antes de executar.
6. **Responder** por `POST /api/relay/device/push` (chat, status, log do
   Forage, resultado da aprovação).
7. Se o pull voltar **401**, o token foi revogado: limpar o cofre e voltar
   à tela de pareamento.

## Módulo pronto

```ts
import {
  YamiDesktopClient,
  mapRelayToIpc,
  needsLocalApproval,
} from "./desktop-client"; // ajuste o caminho no app

const client = new YamiDesktopClient({
  baseUrl: "https://yami-site-pi.vercel.app",
  waitMs: 20_000,        // long-poll (o servidor corta em 25 s)
  pollIntervalMs: 2000,  // espera depois de erro
});
```

## 1. Tela de pareamento (mostra o código)

```ts
const ac = new AbortController();

const device = await client.waitForPairing(({ code, expiresAt }) => {
  // Mostre `code` (6 caracteres) em fonte grande.
  // `expiresAt` é ISO; o código vale 10 minutos.
  mainWindow.webContents.send("yami:pairing:code", { code, expiresAt });
}, ac.signal);

// device = { deviceId, deviceName, deviceToken }
// Guarde deviceToken com safeStorage. Nunca logue o token.
```

Fluxo HTTP equivalente, se preferir controlar a tela à mão:

| Quem | Método | Caminho | Auth | Corpo / query | Resposta |
| --- | --- | --- | --- | --- | --- |
| App | `POST` | `/api/pairing/start` | — | — | `{ code, pollToken, expiresAt }` |
| App | `GET` | `/api/pairing/poll?pollToken=` | — | | `pending` / `ready` / `consumed` / `expired` |
| Site (pessoa) | `POST` | `/api/pairing/confirm` | cookie de sessão + origem | `{ code, deviceName }` | `{ ok, device: { id, name, createdAt } }` — exige licença paga |

O `deviceToken` em claro só vem **uma vez**, em `status: "ready"`. A
próxima coleta do mesmo `pollToken` devolve `consumed`.

Alfabeto do código: `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (sem 0/O/1/I/L).

## 2. Laço de coleta em segundo plano

```ts
const ac = new AbortController();
let afterSeq = 0; // persista se quiser retomar o histórico

await client.runPollLoop(
  deviceToken,
  {
    async onMessages(messages, lastSeq) {
      afterSeq = lastSeq;
    },
    async onChat(message) {
      mainWindow.webContents.send("yami:chat:inbound", message.payload);
    },
    async onForage(message) {
      mainWindow.webContents.send("yami:forage:inbound", message.payload);
    },
    async onConfig(message) {
      mainWindow.webContents.send("yami:config:inbound", message.payload);
    },
    async onStatus(message) {
      mainWindow.webContents.send("yami:status:inbound", message.payload);
    },
    async onApprovalNeeded(message) {
      // Sempre diálogo nativo no PC — nunca executar direto.
      const decision = await client.handleIncoming(message, showLocalApprovalDialog);
      await client.push(deviceToken, {
        kind: "approval_result",
        payload: { decision: decision.decision, messageId: message.id },
      });
      if (decision.proceed) {
        await executeLocally(message); // só aqui, no processo do app
      }
    },
    onUnauthorized() {
      // Token revogado: apague o cofre e abra a tela de pareamento.
    },
    onError(err) {
      console.warn("relay", err);
    },
  },
  ac.signal,
  afterSeq,
);
```

`runPollLoop` já chama `GET /api/relay/device/pull?afterSeq=&waitMs=` com
`Authorization: Bearer <deviceToken>`. Cada pull bem-sucedido **atualiza
`last_seen_at`**: o painel considera o PC **ligado** se o último sinal
tiver menos de **30 segundos**.

Para coleta curta (1–2 s) em vez de long-poll, construa o cliente com
`waitMs: 0` e trate o intervalo no próprio laço, ou passe `waitMs: 0`
em `client.pull`.

## 3. API do relé — contrato exato

Base: `https://yami-site-pi.vercel.app`

### `GET /api/relay/device/pull`

Cabeçalho: `Authorization: Bearer <deviceToken>`.

Query:

- `afterSeq` (número, padrão 0) — só mensagens com `seq` maior que este.
- `waitMs` (0–25000, padrão 20000) — o servidor espera até esse tempo se
  não houver mensagem. Resposta vazia é normal; faça a próxima coleta.

Resposta `200`:

```json
{
  "ok": true,
  "deviceId": "<uuid>",
  "messages": [ /* RelayMessage[] direção down (painel → PC) */ ],
  "lastSeq": 12,
  "serverTime": "<ISO>"
}
```

Erros: `401` token inválido ou revogado; `403` conta sem licença;
`429` rate limit.

O aparelho **só recebe** mensagens `direction: "down"`. Use `lastSeq`
como `afterSeq` da próxima vez (é o maior seq do aparelho, inclusive
mensagens `up` que o próprio app enviou — por isso um `afterSeq` alto
não perde o próximo `down`).

> Na prática: `lastSeq` é o contador global do aparelho (sobe em todo
> push, dos dois lados). Depois de um `push` seu, o `lastSeq` mundial já
> avançou. O próximo `pull` deve usar o `lastSeq` **devolvido no pull
> anterior**, não um seq que você inventou. Se você mandar um push no
> meio, continue usando o `lastSeq` do último **pull** — mensagens `down`
> novas ainda têm seq maior e chegam. Se um `down` for intercalado com
> um `up` e você pular seq, o filtro `direction=down AND seq > afterSeq`
> ainda entrega o `down`. Sempre propague `lastSeq` do servidor.

### `POST /api/relay/device/push`

Cabeçalho: `Authorization: Bearer <deviceToken>`,
`Content-Type: application/json`.

Corpo:

```json
{ "kind": "chat", "payload": { "text": "Olá do PC" }, "needsLocalApproval": false }
```

Resposta `200`: `{ "ok": true, "message": { /* RelayMessage com seq, id */ } }`.

Erros: `401`, `403`, `413` (payload > 64 KiB), `429`.

Esta rota **não exige mesma origem** (o app Electron é outra origem).
Não envie cookie de sessão do site; só o Bearer.

### Painel (só o site, cookie de sessão)

Documentado aqui para o mapeamento IPC; o app **não** chama estas rotas.

- `GET /api/relay/painel/pull?deviceId=&afterSeq=&waitMs=&history=1`
- `POST /api/relay/painel/push` — origem do site, corpo
  `{ deviceId, kind, payload, needsLocalApproval }`.

Rotas antigas `/api/relay/desktop` e `/api/relay/browser` ainda
funcionam como apelido, mas o módulo novo usa só
`/api/relay/device/*`.

## 4. Forma da mensagem (`RelayMessage`)

```ts
{
  id: string;             // uuid
  seq: number;            // monotônico por aparelho (os dois sentidos)
  deviceId: string;
  direction: "up" | "down";  // up = PC → painel, down = painel → PC
  kind: "chat" | "forage" | "config" | "approval_request"
      | "approval_result" | "status" | "event";
  payload: unknown;
  needsLocalApproval?: boolean;
  from: "browser" | "desktop";
  createdAt: string;      // ISO
}
```

### Chat

Painel → PC (`down`, `kind: "chat"`):

```json
{ "text": "Qual é o status?", "action": "chat" }
```

Se a pessoa pediu um arquivo ou comando, `action` é `"command"` ou
`"file"` e `needsLocalApproval` é `true`.

PC → painel (`up`, `kind: "chat"`):

```json
{ "text": "Resposta da YAMI" }
```

No app: encaminhe `payload.text` para o IPC de chat já existente
(o mesmo que a janela local usa).

### Forage

Painel → PC (`down`, `kind: "forage"`):

```json
{ "action": "start" }
{ "action": "stop" }
{ "action": "status" }
```

PC → painel (`up`, `kind: "forage"`), o que o painel mostra no registro
ao vivo e no status:

```json
{ "action": "started", "running": true, "text": "Forage ligado" }
{ "action": "stopped", "running": false, "text": "Forage pausado" }
{ "action": "status",  "running": true }
{ "action": "log",     "running": true, "line": "publicando post …", "text": "publicando post …" }
{ "action": "error",   "running": false, "text": "falha ao publicar" }
```

Mapeie `action: "start"|"stop"` para o mesmo IPC que os botões locais
do Forage. Empurre logs com `kind: "forage"` e `action: "log"` para o
painel acompanhar.

### Status de presença

A cada pull o servidor já marca o aparelho como visto. Ainda assim,
envie de vez em quando:

```json
{ "kind": "status", "payload": { "forageRunning": false, "version": "0.62.0" } }
```

### Aprovação local (obrigatória)

Qualquer mensagem com `needsLocalApproval: true`, ou `kind` / `payload.action`
em `file`, `command`, `shell`, `approval_request`, **só executa depois de
a pessoa aceitar num diálogo nativo no PC**. O painel remoto não atravessa
essa trava. Use `needsLocalApproval()` e `handleIncoming()`.

Depois, avise o painel:

```json
{ "kind": "approval_result", "payload": { "decision": "approved", "messageId": "<id>" } }
```

## 5. Canais de IPC sugeridos

`mapRelayToIpc(message)` devolve um destes (pronto para
`webContents.send(channel, message)`):

| Canal | Quando |
| --- | --- |
| `yami:pairing:code` | Novo código para a tela (você dispara, não o mapper) |
| `yami:chat:inbound` | Mensagem de chat do painel |
| `yami:forage:inbound` | Pedido ou consulta Forage |
| `yami:config:inbound` | Configuração remota (só aplica o que o app já permitiria localmente) |
| `yami:approval:needed` | Precisa de diálogo no PC |
| `yami:status:inbound` | Status genérico |
| `yami:event:inbound` | Outros `kind` |

Do processo de renderização para o main, no sentido inverso (respostas):

| Canal | Efeito no main |
| --- | --- |
| `yami:chat:outbound` | `client.push(token, { kind: "chat", payload })` |
| `yami:forage:outbound` | `client.push(token, { kind: "forage", payload })` |
| `yami:approval:decision` | Segue `handleIncoming` / `approval_result` |
| `yami:pairing:cancel` | `AbortController.abort()` |

Encaixe nos IPC **já existentes** de chat e Forage se os nomes forem
outros; o importante é a forma do `payload`.

## 6. Segurança

- Licença paga obrigatória (403 sem licença).
- Token por aparelho, revogável em `/conta` (`POST /api/pairing/revoke`).
  O próximo pull responde 401.
- Rate limit por IP (cerca de 120 coletas e 60 envios por minuto).
- Teto de payload: 64 KiB; acima disso, 413.
- Toda subida e descida vai para `audit_log`.
- Arquivo e comando: aprovação no PC, sempre.
- Nunca envie chaves, senhas, carteiras ou o `deviceToken` pelo relé ou
  no log.
- Mensagens expiram em 7 dias (limpeza no servidor).

## 7. Checklist para o Automaton

- [ ] Copiar `desktop-client/index.ts` e `types.ts` para o app (sem
      modificar o `build-src` pelo repositório do site).
- [ ] Tela de pareamento mostra o `code` de `waitForPairing`.
- [ ] `deviceToken` no `safeStorage`, restaurado na abertura.
- [ ] `runPollLoop` começa com a janela principal e para no quit.
- [ ] Chat inbound → IPC de conversa; respostas → `push` `kind: "chat"`.
- [ ] Forage start/stop → IPC do Forage; logs/status → `push` `kind: "forage"`.
- [ ] Diálogo nativo para `needsLocalApproval`; nada é executado antes.
- [ ] 401 abre de novo a tela de pareamento e apaga o token.
- [ ] O PC ligado (poll a cada ≤ 30 s) aparece como “ligado” em `/painel`.
