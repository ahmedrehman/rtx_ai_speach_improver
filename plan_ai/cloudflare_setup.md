# Cloudflare Setup

Die App deployt als Cloudflare Worker mit statischen Assets (kein Cloudflare Pages, kein D1).

## Worker Builds mit GitHub

Repository:

```text
https://github.com/ahmedrehman/rtx_ai_speach_improver
```

Build settings:

```text
Production branch: master
Root directory: app
Build command: npm run build
Deploy command: npm run deploy:cloudflare
```

## Secrets und Variablen

Einziges Secret (Worker-Secret, nicht Vite-Variable):

```text
OPENAI_API_KEY
```

Runtime-Variable ist bereits in `app/wrangler.toml` gesetzt:

```text
APP_BASE_PATH = "/apps/speechimprover/"
```

## Basis-Pfad (Root oder Subfolder)

Der Production-Build defaultet auf `/apps/speechimprover/`.

Für ein Root-Deployment:

```bash
VITE_BASE_PATH=/ npm run build
```

und in `wrangler.toml` `APP_BASE_PATH = "/"` setzen. `VITE_BASE_PATH` (Build) und
`APP_BASE_PATH` (Worker-Runtime) müssen zusammenpassen.

## Manuelles Deploy

```bash
cd app
npm install
npm run deploy        # build + wrangler deploy
npx wrangler secret put OPENAI_API_KEY
```

## Lokal

```bash
cd app
npm install
npm run dev           # Node-Dev-Server (tsx src/localServer.ts) auf http://127.0.0.1:5173
```

`OPENAI_API_KEY` in `app/.env.local` setzen (siehe `.env.example`).
Alternativ `npm run dev:worker` für wrangler dev (benötigt vorher `npm run build`).
