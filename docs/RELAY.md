# Relé do painel remoto

O painel no navegador fala com a YAMI do PC de casa por um relé. A
conexão é de saída: o aplicativo inicia, ninguém abre porta no computador.

## Implementação atual: Postgres (`RELAY_PROVIDER=postgres`)

As filas ficam na tabela `remote_messages` do Neon já ligado ao projeto
(mesmo `DATABASE_URL`). Não há conta nova, nem Ably, nem Pusher, nem
servidor extra.

- Direção `down`: painel → PC. Direção `up`: PC → painel.
- `seq` monotônico por aparelho. O cliente envia `afterSeq`.
- Long-poll até 25 s (`waitMs`) ou coleta curta (1–2 s, `waitMs=0`).
- O aparelho está **ligado** se `devices.last_seen_at` tem menos de 30 s
  (atualizado a cada pull/push do token).
- Mensagens expiram em 7 dias (limpeza no próprio relé).
- Teto de 64 KiB, licença paga, token revogável, rate limit, `audit_log`.
- Arquivo e comando exigem aprovação no PC de casa.

Rotas canônicas:

- `GET /api/relay/device/pull` e `POST /api/relay/device/push` — token do aparelho.
- `GET /api/relay/painel/pull` e `POST /api/relay/painel/push` — sessão da pessoa.

`/api/relay/desktop` e `/api/relay/browser` continuam como apelido.

O módulo do aplicativo e a especificação de IPC estão em
`desktop-client/INTEGRATION.md`.

## Por que não é um WebSocket na Vercel

Funções serverless da Vercel não mantêm conexões longas. O protocolo é
HTTP com long-poll (até ~25 s, `maxDuration` 30) sobre a interface
`RelayAdapter` (`lib/relay`).

## Outros provedores (não usados)

`RELAY_PROVIDER=memory` serve só neste processo (desenvolvimento local).
Na Vercel a memória não atravessa instâncias, e o painel não abre nesse
modo. `ably` e `pusher` têm a interface, mas **não estão implementados**
e **não devem ser contratados** daqui — o Postgres já resolve.

## O que o aplicativo precisa fazer

Veja `desktop-client/INTEGRATION.md`. Resumo: parear com código na tela,
guardar o `deviceToken`, coletar `/api/relay/device/pull`, enviar em
`/api/relay/device/push`, e **aprovar no próprio PC** qualquer ação de
arquivo ou comando.
