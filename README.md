# Gestao de passagens e diarias

Aplicacao React + Vite com backend Node.js no mesmo repositorio. O backend serve a API em `/api` e tambem entrega o frontend compilado em `dist/`.

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

Login inicial:

```text
admin / 123456
```

## Banco de dados

O backend tenta conectar ao Firebase Firestore usando `js/firebase-config.js`.
Se o Firestore estiver acessivel e com regras permitindo leitura/gravacao, as
colecoes usadas sao:

```text
solicitacoes_passagens_diarias
alteracoes_solicitacoes
admins
sessions
```

Se a conexao com o Firebase falhar, o backend usa `data/db.json` como fallback
local. Para impedir esse fallback em producao, configure:

```text
FIREBASE_LOCAL_FALLBACK=false
```

Tambem e possivel sobrescrever a configuracao por variaveis de ambiente:

```text
FIREBASE_API_KEY
FIREBASE_PROJECT_ID
FIREBASE_AUTH_DOMAIN
FIREBASE_APP_ID
```

## Desenvolvimento

Para mexer no frontend com recarregamento automatico, rode dois terminais:

```bash
npm run dev:api
```

```bash
npm run dev
```

O Vite abre o frontend e redireciona as chamadas `/api` para `http://localhost:3002`.

## Rodar com Docker

```bash
docker compose up --build
```

Acesse:

```text
http://localhost:3002
```

Os dados ficam persistidos no volume `nugb-gereb-data`.

## Deploy usando o link do GitHub

Em plataformas como Render, Railway ou similares, conecte o repositorio pelo link do GitHub e use:

```text
Build command: npm install && npm run build
Start command: npm start
```

Configure a porta pelo ambiente da plataforma, se ela fornecer a variavel `PORT`. O servidor usa `PORT` automaticamente e, se ela nao existir, usa `3002`.

## Link pelo GitHub Pages

Este repositorio ja inclui o workflow `.github/workflows/pages.yml` para gerar
um link pelo GitHub Pages a cada push na branch `main`.

No GitHub, abra:

```text
Settings > Pages > Build and deployment > Source > GitHub Actions
```

Depois rode o workflow `Deploy GitHub Pages` ou faca um novo push para `main`.
O link ficara parecido com:

```text
https://guilhermegalvaosilva.github.io/Gesto-de-passagens-e-dirias/
```

Observacao: GitHub Pages publica apenas o frontend. Neste projeto, quando o app
abre em `github.io` sem uma variavel `VITE_API_BASE` configurada, ele usa o
Firebase Firestore direto no navegador. Por isso o link do Pages funciona mesmo
sem um backend Node publicado.

Se preferir usar um backend publicado em Render/Railway, crie no GitHub a
variavel `VITE_API_BASE` apontando para a API publicada, por exemplo:

```text
https://seu-backend.onrender.com/api
```
