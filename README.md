# Speech Improver

**Live App: [aispeech.lernspass.net](https://aispeech.lernspass.net/)**

Learn to explain things well — while you speak.

You explain something (out loud or by typing), and an AI coach listens and checks your
explanation live against a checklist of what a good explanation needs:

1. **Pick up the listener** — a short intro: where are we, what is this about?
2. **Name the topic clearly** — which car, which project, which problem exactly?
3. **Hit the point** — not too vague, not over-detailed
4. **Name the core problem**
5. **Say why** — why are you telling this, why does it matter?
6. **Give an example or proof**

## How to use it

- Press **🎤 Sprechen** and start explaining — or just type in the text box.
- While you talk or write, the vertical checklist next to the chat updates live:
  🔴 missing · 🟡 partially there · 🟢 covered — with the recommended **next** item highlighted.
- The coach tells you in short messages what is still missing and what is already good.
- **Neu starten** resets everything for a new explanation.
- Under **Einstellungen** you can edit the checklist items, the coaching prompt and the
  language (German by default, English and French available).

## Run it locally

You need Node.js 20+ and an OpenAI API key.

```bash
git clone https://github.com/ahmedrehman/rtx_ai_speach_improver.git
cd rtx_ai_speach_improver/app
npm install
```

Create `app/.env.local` with your key:

```text
OPENAI_API_KEY=sk-...
```

Then start the app:

```bash
npm run dev
```

Open <http://127.0.0.1:5173> — that's it.
