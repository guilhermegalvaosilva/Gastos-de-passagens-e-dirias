# Gestao de passagens e diarias

Aplicacao React + Vite com backend Node.js. O backend entrega o frontend e a API
no mesmo link publico.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/guilhermegalvaosilva/Gesto-de-passagens-e-dirias)

## Rodar localmente

```bash
npm install
npm run build
npm start
```

Acesse:

```text
http://localhost:3002
```

Para acessar de outra maquina na mesma rede, use o IP da maquina onde o
backend esta rodando:

```text
http://IP-DA-MAQUINA:3002
```

No Windows, voce pode descobrir esse IP com:

```powershell
ipconfig
```

Procure pelo `IPv4` da sua rede Wi-Fi ou Ethernet. Se nao abrir em outra
maquina, libere a porta `3002` no Firewall do Windows.

Login inicial:

```text
admin / 123456
```

## Banco de dados

O backend conecta ao Supabase usando variaveis de ambiente no servidor:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```

Para rodar localmente, copie `.env.example` para `.env` e preencha os valores
do seu projeto.

Antes de iniciar, rode o SQL de `supabase.schema.sql` no SQL Editor do Supabase.
Tabelas usadas:

```text
solicitacoes
alteracoes
admins
sessions
```

Em producao, o `render.yaml` usa:

```text
SUPABASE_LOCAL_FALLBACK=false
```

Assim o deploy so fica ativo quando o Supabase estiver acessivel.

## Deploy pelo GitHub

1. Suba o projeto para o GitHub.
2. Abra o botao "Deploy to Render" acima.
3. Confirme a criacao do Web Service.
4. Aguarde o build terminar.

O Render gera um link unico com frontend e backend, por exemplo:

```text
https://gestao-passagens-diarias.onrender.com
```

Comandos usados pelo deploy:

```text
Build command: npm ci && npm run build
Start command: npm start
Health check: /api/health
```

## GitHub Pages com API

O GitHub Pages hospeda apenas o frontend estatico. Ele nao executa o backend
Node.js nem cria rotas de API. Para o link do GitHub Pages funcionar com login,
cadastros e painel admin, publique o backend em outro servico, como Render, e
aponte o frontend para ele.

No GitHub, configure uma variavel do repositorio:

```text
Settings > Secrets and variables > Actions > Variables > New repository variable
```

Use:

```text
Name: VITE_API_BASE
Value: https://SEU-BACKEND.onrender.com/api
```

Se o GitHub nao aceitar underline no nome da variavel, use:

```text
Name: VITEAPIBASE
Value: https://SEU-BACKEND.onrender.com/api
```

Depois rode novamente o workflow `Deploy GitHub Pages` ou faca um novo push na
branch `main`.

O link do GitHub Pages ficara parecido com:

```text
https://guilhermegalvaosilva.github.io/Gastos-de-passagens-e-diarias/
```

E a API sera chamada no backend publicado:

```text
https://SEU-BACKEND.onrender.com/api
```

## Desenvolvimento

Para editar o frontend com recarregamento automatico, rode dois terminais:

```bash
npm run dev:api
```

```bash
npm run dev
```

O Vite redireciona `/api` para `http://localhost:3002`.
Como o Vite escuta em `0.0.0.0`, outra maquina na mesma rede pode abrir:

```text
http://IP-DA-MAQUINA:5173
```

Se o backend estiver em outra maquina ou porta durante o desenvolvimento,
configure o alvo da API antes de iniciar o Vite:

```powershell
$env:VITE_API_TARGET="http://IP-DO-BACKEND:3002"; npm run dev
```

## Docker

Com Docker Compose:

```bash
docker compose up --build
```

Depois acesse na propria maquina:

```text
http://localhost:3002
```

Ou, em outra maquina na mesma rede:

```text
http://IP-DA-MAQUINA:3002
```

### Docker usando o projeto direto do GitHub

Tambem da para rodar em uma maquina que nao tenha o codigo baixado. O Docker
Compose baixa o projeto direto do GitHub, constroi a imagem e sobe frontend e
backend juntos.

Crie um arquivo `.env` na mesma pasta onde voce vai rodar o comando:

```text
SUPABASE_URL=https://SEU-PROJETO.supabase.co
SUPABASE_SERVICE_ROLE_KEY=SUA_SERVICE_ROLE_KEY
SUPABASE_LOCAL_FALLBACK=false
DEFAULT_ADMIN_LOGIN=admin
DEFAULT_ADMIN_PASSWORD=123456
```

Depois rode:

```bash
docker compose -f docker-compose.github.yml up --build
```

O projeto sera baixado deste repositorio:

```text
https://github.com/guilhermegalvaosilva/Gastos-de-passagens-e-diarias
```

Acesse:

```text
http://localhost:3002
```

Ou, em outra maquina na mesma rede:

```text
http://IP-DA-MAQUINA:3002
```
