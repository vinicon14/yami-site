# Bot de vídeos promocionais da Yami — design

Data: 2026-11-22
Status: aprovado no brainstorm

## Contexto

A YAMI é um agente de IA para Windows vendido por R$ 20, com site Next.js
(`github.com/vinicon14/yami-site`) e instalador próprio. O README do site já
aponta a falta de capturas reais do produto. Não existe hoje nenhum processo
de geração de vídeo para divulgação.

## Objetivo

Criar um agente OpenBot que, a partir de um pedido em linguagem natural,
produza vídeos promocionais verticais (9:16, até 60 s) da Yami para Shorts,
Reels e TikTok, atendendo a dois públicos: clientes finais e parceiros /
investidores.

## Não-objetivos

- Publicar automaticamente nas redes sociais.
- Narração com voz sintetizada sem aprovação explícita do titular.
- Vídeos horizontais ou longos (acima de 60 s) nesta primeira versão.
- Criar um serviço pago ou dependente de chave de API externa para funcionar.

## Decisões do brainstorm

| Pergunta | Decisão |
| --- | --- |
| Forma do bot | Novo agente OpenBot, acionado pelo chat |
| Skills | Combinar reuso das instaladas + criar novas + orquestrar ferramentas |
| Público | Clientes finais e parceiros/investidores |
| Canal | Shorts / Reels / TikTok (vertical 9:16, 15–60 s) |
| Cenas | Misto: capturas reais do app/site + IA para transições e cenários |
| Arquitetura | Orquestrador + skills isoladas (abordagem recomendada) |

## Arquitetura

Um agente orquestrador, **Yami Vídeos**, interpreta o pedido e escolhe o
roteiro conforme o público. Ele não gera vídeo diretamente: delega para
skills com responsabilidade única e fronteira bem definida.

### Skills novas

1. `yami-promo-hook` — gera os primeiros 3 segundos (gancho vertical) com IA.
   Entrada: público, tom, produto. Saída: clipe curto.
2. `yami-promo-demo` — monta a demonstração com capturas reais do app e do
   site, usando Remotion para animação. Entrada: assets, trecho de roteiro.
   Saída: sequência animada.
3. `yami-promo-cta` — cria o fechamento com preço (R$ 20,00) e chamada para o
   site. Entrada: público. Saída: clipe final.
4. `yami-promo-export` — junta as partes, aplica legendas, ritmo e música
   livre de royalties, e exporta 1080×1920 H.264. Saída: arquivo `.mp4`.

### Skills reusadas

- `ai-video-generation` — geração por modelo (RunComfy) quando disponível.
- `animate` — fallback local com Framer Motion, sem crédito externo.
- `remotion-best-practices` — padrões de composição para o `yami-promo-demo`.

### Limites de fronteira

Cada skill recebe parâmetros explícitos e devolve um artefato em caminho
conhecido. O orquestrador nunca edita o interior de uma skill; uma skill nunca
chama outra diretamente. Isso mantém cada unidade compreensível e testável
de forma independente.

## Fluxo de dados

1. O titular pede, por exemplo: "cria um vídeo de 20 s pras redes, público
   cliente".
2. O orquestrador extrai público (cliente / parceiro), duração e tom.
3. Carrega o roteiro padrão: gancho (3 s) → demonstração (resto) → CTA.
4. `yami-promo-hook` gera o gancho; `yami-promo-demo` monta cenas reais com
   Remotion; `yami-promo-cta` cria o fechamento.
5. `yami-promo-export` renderiza 1080×1920, H.264, com legendas e música
   livre de royalties.
6. O `.mp4` volta anexado no chat via `openbot.attach_files_to_response`.

## Tratamento de erros

- **IA indisponível:** se `ai-video-generation` falhar (por exemplo, saldo do
  RunComfy esgotado — situação já observada neste PC com outro provedor), o
  `yami-promo-hook` cai para `animate` local, que não depende de crédito
  externo. A queda é informada ao titular.
- **Sem capturas reais:** a pasta de assets é `docs/assets/yami-video/` neste
  repositório. Se ela estiver vazia, o agente avisa e usa marcadores
  explícitos no lugar das imagens. Nunca inventa print do produto.
- **Renderização falha:** o `yami-promo-export` reporta o erro e preserva os
  artefatos intermediários para reprocessamento.

## Limites

- Duração máxima: 60 s por vídeo.
- Formato: sempre vertical 9:16.
- Sem narração sintetizada sem aprovação prévia; apenas música e legendas.
- Nenhuma publicação automática em redes sociais.

## Critério de aceite

Um vídeo de 15 s, com público "cliente", percorrendo as quatro skills de ponta
a ponta, exportado em 1080×1920 H.264 e entregue anexado no chat. O teste só
passa se o arquivo existir, abrir e corresponder ao roteiro
(gancho → demo → CTA).

## Próximo passo

Converter este spec em plano de implementação com a skill `writing-plans`.
