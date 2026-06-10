# Speech Improver App

Node + TypeScript web app: the user explains something by voice or text, the AI
continuously evaluates the explanation against a configurable checklist and answers
only with structured JSON (live red/yellow/green flags + tips, no audio back).

## Run Locally

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5173`. Set `OPENAI_API_KEY` in `.env.local` (see `.env.example`)
for real evaluations.

## Test

```bash
npm test
```

Real provider tests only run when `OPENAI_API_KEY` is set; everything else runs offline.

## Build

```bash
npm run build
```

## Build For A Mounted Path

For the Cloudflare mounted path:

```bash
VITE_BASE_PATH=/apps/speechimprover/ npm run build
```

For a root deployment:

```bash
VITE_BASE_PATH=/ npm run build
```

## Cloudflare Worker From GitHub

This app deploys as a Cloudflare Worker with static assets and its own D1 database.

```text
Production branch: master
Root directory: app
Build command: npm run build
Deploy command: npm run deploy:cloudflare
```

Before the first deploy, create the D1 database in Cloudflare and replace
`replace-with-cloudflare-d1-database-id` in `wrangler.toml`:

```bash
npx wrangler d1 create rtx_ai_speech_improver_db
```

Locally no database setup is needed — the Node dev server uses its own SQLite file
under `local-data/` automatically.

The Worker runtime variable is already set in `wrangler.toml`:

```text
APP_BASE_PATH=/apps/speechimprover/
```

The only secret is `OPENAI_API_KEY` (Worker secret, not a Vite browser variable).
The D1 database stores aggregated evaluation costs (`GET /api/improver/costs`,
`DELETE /api/improver/costs` to reset).

See `../plan_ai/` for the plan, the streaming API contract, and the Cloudflare setup.
