# Loja de apps do YAMI OS

## Como funcionava

O envio de um app era um anexo numa solicitação (`feature_requests`), não um item da loja por si só.

1. `POST /api/uploads/app` exigia sessão (cookie ou token de aparelho) e licença paga. O navegador enviava o arquivo para um Vercel Blob privado. O servidor só conferia extensão (`.AppImage` ou `.tar.zst`), tamanho até 500 MB e o formato do SHA-256 declarado pelo cliente.
2. `POST /api/conta/requests` gravava título, descrição, categoria e os metadados do arquivo (`file_name`, `file_size`, `file_sha256`, `file_blob_pathname`, `app_version`, `app_icon`). O status nascia `pendente`. No Postgres e no SQLite esse insert antigo não gravava os campos de arquivo; só a store em memória gravava. O insert agora persiste esses campos.
3. O administrador, em `POST /api/admin/requests/:id` com `publish: true`, mudava o status. `lib/github-apps.ts` baixava o Blob, recalculava o SHA-256 e o tamanho, e só então enviava o arquivo para a release `v0.8.0` de `vinicon14/yamios-releases`, atualizando o asset `yami-apps.json`.
4. `GET /api/apps` respondia 401 sem sessão e 403 sem licença paga. A lista era só solicitações `publicada` com URL do asset. O campo `platform` saía sempre `linux`.
5. O cliente do YAMI OS (fora deste repositório; descrito em `docs/superpowers/specs/2026-11-22-apps-e-instalacao-design.md` no `yamios-releases`) baixa `downloadUrl` e confere o SHA-256 antes de instalar. Este site não executa o arquivo.

## Como ficou

Qualquer conta autenticada que não esteja bloqueada envia o app. As checagens automáticas rodam na hora. Se passarem, o app fica **privado**: o autor vê em Meus apps e instala nos próprios aparelhos por `GET /api/apps`. Os outros não veem.

Para ir para todo mundo, o autor pede publicação (`privado` → `em_revisao` → `publico`). O administrador aprova ou rejeita com motivo. Rejeição devolve o app para o autor (ou mantém a versão pública anterior, se já existir).

**Atualização de um app que já é público:** o autor passa a ver e a poder instalar a versão nova na hora. O restante da loja continua na última versão aprovada até uma nova revisão. Esse é o padrão adotado.

O catálogo de instalação devolve uma entrada por app:

- autor: a versão mais nova dele, com `publicVersion` quando o público ainda está numa anterior;
- qualquer outra conta: só a versão pública.

`verifySha256BeforeInstall` vem `true`. Cada item traz `sha256` de 64 caracteres. O cliente precisa recusar a instalação se o arquivo baixado não bater com esse hash. O instalador do YAMI OS já faz essa conferência; este repositório não contém o código do Electron.

### Checagens automáticas

- Manifesto: nome, descrição, categoria, versão `x.y.z`, ícone sem HTML.
- Plataforma `linux` (arquivo `.AppImage` ou `.tar.zst`, até 500 MB) ou `windows` (URL https pública, até 3 GB).
- SHA-256 do arquivo enviado é calculado no servidor. Se o cliente mandou outro, o envio é recusado. Windows só com link externo guarda o hash declarado (`sha256Source: "declarado"`); o cliente ainda confere ao baixar.
- Tipo pelo nome e pela assinatura dos primeiros bytes (ELF, zstd, MZ, MSI ou ZIP) quando há arquivo.
- O slug do nome pertence a uma pessoa. Outra conta não reutiliza. Só o dono publica versão maior.
- Cota diária por conta, gravada no banco (`upload_quota`: usuário, dia UTC, quantidade e bytes). Cada autorização de upload e cada `POST /api/apps` consomem 1 envio e somam o tamanho do arquivo, na mesma linha, numa escrita só. O padrão é 10 envios e 2 GiB (2147483648 bytes). Um app Linux que sobe o arquivo e depois é publicado conta duas vezes; Windows só com URL externa conta uma vez, no envio. Esses tetos ainda precisam ser confirmados pelo dono.

Linux privado é baixado por um link assinado de 30 minutos (`/api/apps/download`), que só entrega o Blob. Windows usa a URL externa e o botão **Baixar para Windows** (`actionLabel`). App Linux segue com **Instalar**.

A coluna `app_platform` entra por `ADD COLUMN` (Postgres com `IF NOT EXISTS`; SQLite só se o `PRAGMA table_info` não achar a coluna). As tabelas `store_apps`, `store_app_versions`, `store_app_reports`, `upload_quota` e `signup_ip_quota` são `CREATE TABLE IF NOT EXISTS`. Nada disso recria `feature_requests` nem as outras tabelas já existentes.

### Segurança que continua sem fila humana para o autor

- A listagem mostra o publicador (id e nome, sem e-mail).
- Selo `novo` nos primeiros 14 dias e `não verificado` depois, até um administrador marcar o app como verificado.
- Qualquer outra conta denuncia um app público. O administrador retira (`retirado`), devolve ao autor como privado, ou bane. Banir bloqueia a conta, encerra sessões e aparelhos e retira os apps. O botão Bloquear do painel de usuários faz o mesmo.
- O painel admin aprova, rejeita com motivo, retira e bane.

### Solicitações antigas

Na primeira leitura da loja:

- `pendente`, `aprovada` ou `em_desenvolvimento` com arquivo viram app privado do autor;
- `publicada` com URL continua pública;
- `rejeitada` e `retirada` não voltam.

O botão antigo Publicada, se a solicitação já virou app, aprova esse app em vez de publicar um segundo caminho.

## Variáveis de ambiente

Nenhuma variável nova é obrigatória. Sem elas valem os padrões abaixo. Os tetos de cota ainda precisam ser confirmados pelo dono antes de irem para produção.

| Variável | Padrão | Uso |
|---|---|---|
| `UPLOAD_QUOTA_DAILY_MAX` | `10` | Envios por usuário no dia UTC. Cada token de upload e cada `POST /api/apps` contam 1. |
| `UPLOAD_QUOTA_DAILY_BYTES` | `2147483648` | Bytes por usuário no dia UTC (2 GiB). Soma o tamanho declarado no token e o tamanho aceito no envio. |
| `SIGNUP_IP_DAILY_MAX` | `5` | Contas criadas por IP no dia UTC, na tabela `signup_ip_quota`. O padrão deixa uma rede compartilhada abrir algumas contas e impede criar uma conta nova para cada envio. O limitador em memória de 5 tentativas a cada 15 minutos continua, só nesta instância. |
| `GITHUB_TOKEN` ou `GITHUB_RELEASE_TOKEN` |  | Publicar e retirar o asset e o `yami-apps.json` na release `v0.8.0` quando o app fica público. Sem o token, a aprovação pública falha e o app continua em revisão. O uso privado do autor não precisa dele. |
| `BLOB_READ_WRITE_TOKEN` |  | Blob privado da Vercel, já usado no upload. |
| `SESSION_SECRET` ou `AUTH_SECRET` |  | Assina o link de download do app que ainda não está no GitHub. |
| `ADMIN_EMAILS` |  | Quem aprova, retira e bane. |

## Riscos que ficam

- Um arquivo Windows só com URL pode ter até 3 GiB, acima do teto diário padrão de 2 GiB. Com o padrão, esse envio responde `cota_diaria_excedida` até o dono subir `UPLOAD_QUOTA_DAILY_BYTES`.
- A cota de upload é cobrada pelo tamanho declarado, e o token do Blob fica limitado a esse tamanho. Se a publicação falha depois da cobrança, o envio do dia não volta.
- O cadastro ainda tem um freio de rajada em memória (5 tentativas a cada 15 minutos, por instância). O teto que vale entre instâncias é o diário no banco.
- O link assinado de 30 minutos baixa o arquivo de quem o tiver. Ele só é entregue ao autor no catálogo.
- Windows só com URL externa não tem o hash recalculado aqui. Quem baixa, inclusive o YAMI OS, tem de conferir o SHA-256. A revisão humana continua sendo a porta da loja pública.
- Se a remoção do asset no GitHub falhar, a loja deixa de listar o app, mas a URL antiga do GitHub pode continuar válida até alguém apagar o asset.
- Apps da comunidade não são executados nem sandboxados por este site.
- Desbanir a conta não republica os apps. O administrador pode devolver um app ao autor como privado.
- O slug de um app retirado continua do dono.
