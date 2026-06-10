# RTX AI Speech Improver

Voice/text speech improver: the user explains something out loud (or types it), the AI
continuously evaluates the explanation against a configurable checklist of good-speech
elements and answers only with structured JSON (no audio back). The checklist is shown
as a vertical red/yellow/green flag list next to the chat, with the recommended next
item highlighted.

- `app/` — the web app (Vite + React + TypeScript, Cloudflare Worker backend, also runs locally with Node).
- `plan_ai/` — plans and documentation (architecture, streaming API, Cloudflare setup).

See `app/README.md` for run, build, and deploy instructions.
