# Cloudflare Setup

Die App deployt als Cloudflare Worker mit statischen Assets und einer eigenen D1-Datenbank
(kein Cloudflare Pages, nichts mit Projekt 1 geteilt).

## D1-Datenbank

Bereits angelegt: `rtx_ai_speech_improver_db`
(`database_id = cf16d76a-38b2-4456-8949-4d85502d4d66`, steht in `app/wrangler.toml`).
Migrationen laufen beim Deploy automatisch (`npm run deploy:cloudflare` ruft
`db:migrate:remote` auf).

Die DB speichert die aggregierten Eval-Kosten (`eval_costs`: pro Art Anzahl + geschätzte
Kosten). Endpunkte: `GET /api/improver/costs` (Summe), `DELETE /api/improver/costs` (Reset).

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

Setzen per Skript (liest `app/.env.local`, wie in Projekt 1):

```bash
cd app
npm run secrets:push
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
npm run build
npm run deploy:cloudflare   # d1 migrations + wrangler deploy
npx wrangler secret put OPENAI_API_KEY
```

## Lokal

```bash
cd app
npm install
npm run dev           # Node-Dev-Server (tsx src/localServer.ts) auf http://127.0.0.1:5173
```

`OPENAI_API_KEY` in `app/.env.local` setzen (siehe `.env.example`).
Lokal nutzt der Node-Dev-Server eine eigene SQLite-Datei (`app/local-data/improver.sqlite`,
gitignored) statt D1 — kein Setup nötig.
Alternativ `npm run dev:worker` für wrangler dev (benötigt vorher `npm run build` und
`npm run db:migrate:local`).
