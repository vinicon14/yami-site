# YAMI — site e backend

Site próprio da **YAMI — seu agente de IA** (aplicativo Windows):
apresentação, compra por R$ 20,00 no Mercado Pago (Pix e cartão, pagamento
único), licença, download com link que expira em 24 horas, conta e painel
remoto.

O i-Tools (https://i-tools.shop) apenas destaca a YAMI e aponta para este
site. Compra, login, download e painel ficam **somente aqui**, com um único
backend.

## Arquitetura

- **Next.js (App Router)** — este repositório. Site e API:
  `/api/checkout`, `/api/mp/webhook`, `/api/download`, `/api/auth/*`,
  `/api/pairing/*`, `/api/relay/*`.
- **Banco** — Postgres se `DATABASE_URL` existir; SQLite em desenvolvimento
  local; memória na Vercel sem `DATABASE_URL` (não use isso com venda real).
- **Mercado Pago Checkout Pro** — cada preferência leva
  `notification_url=https://<domínio>/api/mp/webhook`. O webhook **não
  confia no corpo**: busca `GET /v1/payments/{id}` com o access token e só
  libera se `status=approved`, `external_reference` for o pedido e o valor
  for R$ 20,00. O processamento é idempotente. Se `MP_WEBHOOK_SECRET`
  existir, a assinatura `x-signature` também é exigida (opcional).
- **Painel remoto** — a pessoa abre este site em outro PC, entra na conta
  e usa a YAMI de casa por um relé de saída. Veja `docs/RELAY.md` e
  `desktop-client/`.
- **Instalador** — URL privada em `YAMI_INSTALLER_URL`. O servidor baixa e
  entrega; o navegador nunca vê o endereço direto.

## Desenvolvimento

```bash
cp .env.example .env.local
# preencha só o que for usar; nunca commite .env.local
npm install
npm test
npm run dev
```

Abra http://localhost:3000. Com `MP_MODE=production` e o token no
ambiente, o checkout cria uma preferência real. Não use isso para pagar de
teste na sua própria conta a menos que queira uma cobrança de verdade.

## Variáveis

Tudo está documentado em `.env.example`. Em produção são obrigatórios:
`MP_ACCESS_TOKEN`, `MP_MODE=production`, `PRICE_BRL=20`,
`SESSION_SECRET`, `DOWNLOAD_TOKEN_SECRET`, `SITE_URL` (ou
`NEXT_PUBLIC_SITE_URL`), e `DATABASE_URL` antes de vender de fato.
`YAMI_INSTALLER_URL` é necessário para o arquivo sair no download.

## O que falta para ir ao ar (este repositório não faz sozinho)

1. Revisar e, se quiser, mesclar o que estiver em PR no i-Tools.
2. Hospedagem: a Vercel no plano gratuito, domínio `*.vercel.app`, está
   prevista. Um domínio próprio é decisão sua e não é comprado daqui.
3. **Postgres** com faixa gratuita (Neon ou o Supabase que você já usa),
   sem cartão se possível. Sem isso, pedidos não sobrevivem a um restart.
4. **Instalador** hospedado de forma privada, em `YAMI_INSTALLER_URL`.
5. **Relé** do painel: ver opções e custos em `docs/RELAY.md`. Escolha
   uma; nenhuma conta é criada daqui.
6. Textos de `/termos` e `/privacidade` estão marcados como rascunho.
7. Capturas reais da YAMI no lugar dos espaços reservados.
8. (Opcional) Cadastrar o webhook no painel do Mercado Pago e colocar
   `MP_WEBHOOK_SECRET`. Não é necessário: a `notification_url` vai em
   cada preferência, e a confirmação é a consulta autenticada do pagamento.

URL do webhook, quando o site estiver no ar:

```
https://<domínio>/api/mp/webhook
```

## Testes

```bash
npm test
npm run build
```

Cobre assinatura (quando há segredo), expiração do link de download,
pareamento, senha/sessão, e o fluxo do webhook: consulta do pagamento,
recusa de valor ou status errado, e idempotência.

## O que este repositório não faz

- Não mescla PRs, não compra domínio, não cria contas em terceiros, não
  dispara pagamento de verdade nos testes. Uma preferência de Checkout Pro
  (sem pagar) pode ser criada só para confirmar que a `notification_url`
  é aceita.


## Publicar um instalador

Os arquivos (instalador Windows, Windows portátil e APK) ficam num Blob privado da Vercel. O site só entrega um link assinado, de curta validade, depois de validar o token de download. A URL permanente nunca aparece na página.

```bash
# No computador que tem os arquivos, com BLOB_READ_WRITE_TOKEN no ambiente:
npm run publish-release -- \
  --setup /caminho/YAMI-0.62.0-forage-v4-setup-x64.exe \
  --portable /caminho/YAMI-0.62.0-forage-v4-portable-x64.exe \
  --apk /caminho/YAMI-1.4.6.apk \
  --version 0.62.0
```

O manifesto (versão, nome, tamanho, SHA256, data) é gravado no Blob e, se `DATABASE_URL` existir, no Postgres. Trocar um arquivo não exige mudança de código. Sem APK, a página mostra "APK em breve".

Faixa gratuita do Blob (Hobby): 1 GB de armazenamento e 10 GB de transferência por mês — o conjunto atual cabe no armazenamento; a transferência acaba se houver muitos downloads completos no mês (o Hobby não cobra além, só pausa).
