# Bot de vídeos promocionais da Yami — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar o agente OpenBot "Yami Vídeos" com quatro skills isoladas que geram clipes verticais promocionais da Yami (hook → demo → CTA → export) para Shorts/Reels/TikTok.

**Architecture:** Um agente orquestrador interpreta o pedido e delega para skills com responsabilidade única. Cada skill é uma pasta com `SKILL.md` no formato Agent Skills, registrada no catálogo local do OpenBot e instalada no agente. As skills reusam `ai-video-generation`, `animate` e `remotion-best-practices`. Nenhuma skill chama outra; o orquestrador passa parâmetros explícitos e recebe artefatos em caminhos conhecidos.

**Tech Stack:** Agent Skills (SKILL.md), OpenBot (`create_skill`, `create_agent`, `install_local_skill`), RunComfy CLI, Framer Motion (via `animate`), Remotion, FFmpeg.

---

## File Structure

```
docs/assets/yami-video/                  # capturas reais (entrada)
  README.md
  .gitkeep
skills/yami-promo-hook/SKILL.md          # gancho 3s com IA + fallback local
skills/yami-promo-demo/SKILL.md          # demo com capturas reais + Remotion
skills/yami-promo-cta/SKILL.md           # fechamento com preço e site
skills/yami-promo-export/SKILL.md        # junção, legendas, export 1080x1920
docs/superpowers/plans/2026-11-22-yami-video-bot.md  # este plano
docs/superpowers/specs/2026-11-22-yami-video-bot-design.md  # spec aprovado
```

---

### Task 1: Pasta de assets e contrato de entrada

**Files:**
- Create: `docs/assets/yami-video/README.md`
- Create: `docs/assets/yami-video/.gitkeep`

- [ ] **Step 1: Criar a pasta e o README com o contrato dos assets**

```markdown
# Assets para vídeos promocionais da Yami

Esta pasta alimenta a skill `yami-promo-demo`.

## Arquivos esperados

- `app-01.png` a `app-05.png` — capturas reais do aplicativo YAMI (Windows), 16:9 ou 9:16.
- `site-01.png` a `site-03.png` — capturas reais do site yami-site.
- `logo.png` — logotipo da Yami em PNG com fundo transparente.

## Regras

- Nunca inventar print de produto. Se faltar arquivo, a skill deve avisar e usar marcador explícito.
- Imagens de cliente final: mostrar a interface e o benefício.
- Imagens de parceiro: mostrar arquitetura, site e painel.
- Resolução mínima: 1280x720. Prefira 1080x1920 para vertical.

## Fallback

Se esta pasta estiver vazia, o agente avisa o titular antes de gerar o vídeo.
```

- [ ] **Step 2: Criar o `.gitkeep` vazio**

Conteúdo: uma linha vazia.

- [ ] **Step 3: Verificar**

Run: `git -C "C:\Users\vinim\Downloads\open code yami edit" status --short`
Expected: `?? docs/assets/yami-video/`

- [ ] **Step 4: Commit**

```bash
git add docs/assets/yami-video/README.md docs/assets/yami-video/.gitkeep
git commit -m "feat(yami-video): add asset input contract"
```

---

### Task 2: Skill `yami-promo-hook`

**Files:**
- Create: `skills/yami-promo-hook/SKILL.md`

- [ ] **Step 1: Escrever o SKILL.md completo**

```markdown
---
name: yami-promo-hook
description: Gera os 3 primeiros segundos de um vídeo promocional vertical da Yami. Use quando o pedido for criar o gancho/abertura de um Short, Reel ou TikTok da Yami. Entrada: público (cliente|parceiro), tom, duração fixa de 3s. Saída: arquivo .mp4 em docs/assets/yami-video/out/hook.mp4.
---

# Yami Promo Hook

Você produz apenas o gancho de 3 segundos, em vertical 9:16, para vídeos promocionais da Yami.

## Parâmetros de entrada

- `publico`: `cliente` ou `parceiro` (obrigatório).
- `tom`: curto, direto, sem promessa exagerada (padrão: "direto").
- `saida`: `docs/assets/yami-video/out/hook.mp4` (padrão).

## Roteiro fixo

- Cliente: "Seu agente de IA, do seu jeito."
- Parceiro: "Yami: agente local, controle total."

## Procedimento

1. Tente a skill `ai-video-generation` com o prompt do roteiro acima, 3 segundos, 9:16, sem áudio de voz.
2. Se falhar (saldo esgotado, erro de API, falta de CLI), use a skill `animate` local com Framer Motion: texto animado sobre fundo escuro, 1080x1920, 3s.
3. Informe sempre qual caminho foi usado (IA ou local).
4. Salve o resultado em `saida`. Se o diretório não existir, crie-o.

## Regras

- Nunca use narração sintetizada.
- Nunca prometa funcionalidade que a Yami não tem.
- Nunca invente print de produto.
- Se ambos os caminhos falharem, reporte o erro e pare; não entregue arquivo inválido.

## Verificação

Antes de devolver, confirme que `saida` existe e é um `.mp4` com duração aproximada de 3s
(`ffprobe -v error -show_entries format=duration -of default=nw=1 <arquivo>`).
```

- [ ] **Step 2: Validar o frontmatter**

Run: `Select-String -Path "skills\yami-promo-hook\SKILL.md" -Pattern '^name:|^description:'`
Expected: duas linhas, uma com `name: yami-promo-hook` e outra começando `description:`.

- [ ] **Step 3: Registrar a skill no catálogo local**

Chamada OpenBot:
```json
openbot.create_skill({ "sourcePath": "C:\\Users\\vinim\\Downloads\\open code yami edit\\skills\\yami-promo-hook" })
```
Expected: retorno com `status` de criação e um `skillId`.

- [ ] **Step 4: Commit**

```bash
git add skills/yami-promo-hook/SKILL.md
git commit -m "feat(yami-video): add promo hook skill"
```

---

### Task 3: Skill `yami-promo-demo`

**Files:**
- Create: `skills/yami-promo-demo/SKILL.md`

- [ ] **Step 1: Escrever o SKILL.md completo**

```markdown
---
name: yami-promo-demo
description: Monta a demonstração de 8 a 12 segundos de um vídeo promocional vertical da Yami usando capturas reais do app e do site. Use depois do hook e antes do CTA. Entrada: público, duração, lista de assets. Saída: docs/assets/yami-video/out/demo.mp4.
---

# Yami Promo Demo

Você monta somente o bloco de demonstração, em vertical 9:16.

## Parâmetros de entrada

- `publico`: `cliente` ou `parceiro` (obrigatório).
- `duracao_segundos`: inteiro entre 8 e 12 (padrão: 10).
- `assets_dir`: `docs/assets/yami-video` (padrão).
- `saida`: `docs/assets/yami-video/out/demo.mp4` (padrão).

## Procedimento

1. Liste `assets_dir` e confirme a presença de `app-01.png` a `app-03.png` e `site-01.png`.
2. Se faltar algum arquivo, avise o titular pelo nome e use um marcador retangular com o texto
   "CAPTURA PENDENTE: <nome>" no lugar da imagem. Nunca substitua por imagem inventada.
3. Carregue a skill `remotion-best-practices` antes de escrever a composição.
4. Monte uma composição Remotion 1080x1920 com:
   - fundo escuro (#0B0B10),
   - logo no canto superior por 1s,
   - cada captura em destaque por 2s com transição de 0,3s,
   - legenda curta abaixo de cada cena.
5. Roteiro por público:
   - cliente: "Fala. Decide. Executa." / "Na sua máquina." / "R$ 20,00, uma vez."
   - parceiro: "Roda local." / "Backend próprio." / "Painel remoto."
6. Renderize com `npx remotion render` para `saida`.
7. Se Remotion não estiver disponível, use a skill `animate` local para sequência equivalente em HTML/CSS e grave com FFmpeg.

## Regras

- Sem narração. Apenas música e legendas.
- Sem promessa de funcionalidade inexistente.
- Duração final dentro de 8–12s.

## Verificação

`ffprobe -v error -show_entries format=duration -of default=nw=1 <saida>` deve retornar
valor entre 8 e 12. Confirme também que o arquivo existe.
```

- [ ] **Step 2: Validar o frontmatter e o contrato de assets**

Run:
```powershell
Select-String -Path "skills\yami-promo-demo\SKILL.md" -Pattern '^name: yami-promo-demo','CAPTURA PENDENTE','remotion-best-practices'
```
Expected: três correspondências.

- [ ] **Step 3: Registrar a skill**

```json
openbot.create_skill({ "sourcePath": "C:\\Users\\vinim\\Downloads\\open code yami edit\\skills\\yami-promo-demo" })
```

- [ ] **Step 4: Commit**

```bash
git add skills/yami-promo-demo/SKILL.md
git commit -m "feat(yami-video): add promo demo skill"
```

---

### Task 4: Skill `yami-promo-cta`

**Files:**
- Create: `skills/yami-promo-cta/SKILL.md`

- [ ] **Step 1: Escrever o SKILL.md completo**

```markdown
---
name: yami-promo-cta
description: Cria o fechamento de 4 a 5 segundos de um vídeo promocional vertical da Yami com preço e chamada para o site. Use como última etapa de conteúdo, antes da exportação. Saída: docs/assets/yami-video/out/cta.mp4.
---

# Yami Promo CTA

Você produz somente o fechamento, em vertical 9:16.

## Parâmetros de entrada

- `publico`: `cliente` ou `parceiro` (obrigatório).
- `site_url`: URL do site de vendas (padrão: texto "yami-site", sem inventar domínio).
- `saida`: `docs/assets/yami-video/out/cta.mp4` (padrão).

## Texto fixo

- Cliente: "YAMI — R$ 20,00. Link na bio."
- Parceiro: "YAMI. Vamos conversar."

## Procedimento

1. Renderize o texto fixo em 1080x1920, fundo escuro, com a skill `animate` local (Framer Motion).
2. Duração: 4s (cliente) ou 5s (parceiro).
3. Sem narração. Música opcional, livre de royalties.
4. Salve em `saida`.

## Regras

- Nunca invente domínio, desconto ou condição de pagamento além de R$ 20,00 uma vez.
- Se `site_url` não for informado, use apenas "Link na bio" para cliente.

## Verificação

Confirme que `saida` existe e que `ffprobe` retorna 4–5s.
```

- [ ] **Step 2: Registrar a skill**

```json
openbot.create_skill({ "sourcePath": "C:\\Users\\vinim\\Downloads\\open code yami edit\\skills\\yami-promo-cta" })
```

- [ ] **Step 3: Commit**

```bash
git add skills/yami-promo-cta/SKILL.md
git commit -m "feat(yami-video): add promo CTA skill"
```

---

### Task 5: Skill `yami-promo-export`

**Files:**
- Create: `skills/yami-promo-export/SKILL.md`

- [ ] **Step 1: Escrever o SKILL.md completo**

```markdown
---
name: yami-promo-export
description: Junta hook, demo e CTA de um vídeo promocional da Yami, aplica legendas e música livre de royalties e exporta MP4 vertical 1080x1920 H.264. Use como etapa final antes de anexar o vídeo no chat. Saída: docs/assets/yami-video/out/yami-promo-final.mp4.
---

# Yami Promo Export

Você faz apenas a junção e a exportação final.

## Parâmetros de entrada

- `entradas`: lista com `hook.mp4`, `demo.mp4`, `cta.mp4` em `docs/assets/yami-video/out/`.
- `saida`: `docs/assets/yami-video/out/yami-promo-final.mp4` (padrão).
- `musica`: opcional; se ausente, exporte sem música.

## Procedimento

1. Confirme que os três arquivos de entrada existem. Se faltar algum, reporte o nome e pare.
2. Crie um arquivo de concatenação `concat.txt` com uma linha `file '<caminho>'` por entrada,
   na ordem hook → demo → CTA.
3. Concatene com FFmpeg:
   `ffmpeg -f concat -safe 0 -i concat.txt -c copy -movflags +faststart <temporario>.mp4`
4. Aplique legendas queima-fixa apenas se as entradas não as tiverem (use `drawtext` com fonte do sistema).
5. Reencode para garantir compatibilidade:
   `ffmpeg -i <temporario>.mp4 -c:v libx264 -pix_fmt yuv420p -r 30 -c:a aac -movflags +faststart <saida>`
6. Valide: `ffprobe -v error -show_entries format=duration,size -of default=nw=1 <saida>`.
   Duração deve ser <= 60s. Se passar, corte para 60s e avise.

## Regras

- Nunca publique em redes sociais.
- Nunca use música com direito autoral.
- Preserve os arquivos intermediários para reprocessamento.

## Entrega

Anexe o arquivo final no chat com `openbot.attach_files_to_response` e informe duração e tamanho.
```

- [ ] **Step 2: Registrar a skill**

```json
openbot.create_skill({ "sourcePath": "C:\\Users\\vinim\\Downloads\\open code yami edit\\skills\\yami-promo-export" })
```

- [ ] **Step 3: Commit**

```bash
git add skills/yami-promo-export/SKILL.md
git commit -m "feat(yami-video): add promo export skill"
```

---

### Task 6: Criar o agente orquestrador e instalar as skills

**Files:** nenhum (operação via OpenBot)

- [ ] **Step 1: Criar o agente**

```json
openbot.create_agent({
  "name": "Yami Vídeos",
  "title": "Vídeos promocionais da Yami",
  "description": "Recebe pedidos de vídeos promocionais verticais da Yami para Shorts/Reels/TikTok e orquestra as skills yami-promo-hook, yami-promo-demo, yami-promo-cta e yami-promo-export. Não publica em redes sociais e não inventa capturas de produto.",
  "initialMessage": "Você é o Yami Vídeos. Sua primeira tarefa: ler o spec em docs/superpowers/specs/2026-11-22-yami-video-bot-design.md e confirmar que entendeu o fluxo hook -> demo -> CTA -> export antes de receber pedidos."
})
```
Expected: retorno com `agentId`.

- [ ] **Step 2: Instalar as quatro skills no agente**

Para cada skill, chame:
```json
openbot.install_local_skill({ "skillId": "<id retornado no create_skill>", "agentId": "<agentId>" })
```
Expected: quatro instalações com sucesso.

- [ ] **Step 3: Verificar**

```json
openbot.read_agent({ "agentId": "<agentId>" })
```
Expected: a lista de skills contém `yami-promo-hook`, `yami-promo-demo`, `yami-promo-cta`, `yami-promo-export`, além das reusadas `ai-video-generation`, `animate`, `remotion-best-practices`.

- [ ] **Step 4: Commit**

Não há arquivos de código nesta tarefa. Registre o `agentId` em `docs/assets/yami-video/README.md` sob um título "Agente" e faça commit:

```bash
git add docs/assets/yami-video/README.md
git commit -m "chore(yami-video): register orchestrator agent id"
```

---

### Task 7: Teste de aceite — vídeo de 15s

**Files:** nenhum (execução pelo agente)

- [ ] **Step 1: Enviar o pedido de teste ao agente**

```json
openbot.send_message({
  "recipientAgentIds": ["<agentId>"],
  "text": "Teste de aceite: gere um vídeo de 15s, público cliente, para Shorts. Roteiro: hook 3s, demo 8s, CTA 4s. Use capturas reais se existirem; se faltarem, avise e use marcadores. Anexe o MP4 final e informe duração e tamanho.",
  "expectsReply": true
})
```

- [ ] **Step 2: Conferir o resultado ao receber a resposta**

Verifique no retorno do agente:
- arquivo `yami-promo-final.mp4` anexado,
- duração entre 14 e 16s,
- resolução 1080x1920,
- aviso sobre capturas faltantes, se houver.

- [ ] **Step 3: Reprovar se falhar**

Se qualquer item faltar, devolva ao agente com o item exato e peça correção. Só marque esta tarefa como concluída após o vídeo válido.

---

### Task 8: Documentação final

**Files:**
- Modify: `docs/superpowers/specs/2026-11-22-yami-video-bot-design.md` (seção "Próximo passo")

- [ ] **Step 1: Atualizar o spec com o estado implementado**

Troque a seção final por:

```markdown
## Estado

Implementado em 2026-11-22. Agente orquestrador: `Yami Vídeos`.
Skills: yami-promo-hook, yami-promo-demo, yami-promo-cta, yami-promo-export.
Teste de aceite: vídeo de 15s, público cliente, aprovado em <data/hora>.
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-11-22-yami-video-bot-design.md
git commit -m "docs(yami-video): mark spec as implemented"
```

---

## Self-Review

- **Spec coverage:** público/cliente-parceiro (Tasks 2–4), canal vertical (Tasks 2–5), assets mistos (Task 1 + Task 3), fallback IA→local (Task 2), sem narração (Tasks 2–5), limite 60s (Task 5), teste de 15s (Task 7), agente OpenBot (Task 6). Sem lacunas.
- **Placeholder scan:** nenhum TBD/TODO; todo código de skill está completo; os únicos valores variáveis são `<agentId>` e `<id retornado>`, que são retornos reais das ferramentas, não texto a inventar.
- **Type consistency:** todos os skills usam `publico` com valores `cliente|parceiro` e o mesmo diretório `docs/assets/yami-video/out/`; os nomes de arquivo `hook.mp4`, `demo.mp4`, `cta.mp4` e `yami-promo-final.mp4` são idênticos em todas as tarefas.
