# Relé do painel remoto

O painel no navegador fala com a YAMI do PC de casa por um relé. A
conexão é de saída: o aplicativo inicia, ninguém abre porta no computador.

## Por que não é um WebSocket na Vercel

Funções serverless da Vercel não mantêm conexões longas. O protocolo
implementado hoje é coleta periódica (HTTP GET a cada 2–3 s) sobre a
interface `RelayAdapter` (`lib/relay`).

## Implementação atual: memória

`RELAY_PROVIDER=memory` (padrão). Filas em processo. Serve para
desenvolvimento e para demonstrar o painel. Em produção na Vercel, cada
instância tem a própria memória: um pedido feito numa função pode não ser
visto por outra, e o estado “online” se perde no cold start.

Antes de oferecer o painel remoto de verdade, troque por um dos caminhos
abaixo. Este repositório **não cria contas** nesses serviços e **não
contrata** nada.

## Opções gerenciadas (não contratadas)

Estimativas de 2026, para decisão — confira o preço atual no site de cada
um antes de pagar.

| Opção | Uso | Faixa de preço | Observação |
| --- | --- | --- | --- |
| **Ably** | Pub/sub com presença | Faixa gratuita (~6 milhões de mensagens/mês); depois cerca de US$ 29/mês | Encaixa bem em “PC online / offline”. |
| **Pusher Channels** | Idem | Faixa gratuita limitada (~200 mil mensagens/dia); depois cerca de US$ 49/mês | Similar ao Ably. |
| **Fly.io** (processo pequeno com WebSocket) | Servidor próprio do relé | Costuma começar em torno de US$ 3–5/mês para uma máquina pequena | Controle total; você opera o processo. |
| **Railway** | Idem | Faixa similar, às vezes com crédito inicial | Mesma ideia: um serviço Node com WebSocket. |

A interface `RelayAdapter` (`lib/relay/types.ts`) é o ponto de encaixe.
`getRelay()` hoje avisa e cai na memória se `ably` ou `pusher` forem
pedidos sem o adaptador implementado.

## O que o aplicativo precisa fazer

Veja `desktop-client/SPEC.md`. Resumo: parear com código na tela,
guardar o `deviceToken`, coletar `/api/relay/desktop`, e **aprovar no
próprio PC** qualquer ação de arquivo ou comando.
