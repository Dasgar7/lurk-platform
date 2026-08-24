# Lurk

**AI-powered vibe coding.** Describe an idea in plain language — optionally attach images or files — and Lurk generates a complete, working web app, website, or browser game with a live preview.

![Lurk](https://img.shields.io/badge/Lurk-AI%20Builder-39FF6A?style=flat-square&labelColor=0A0A0A)

## Features

- **Single input** — text + optional image/video/file attachments
- **Visible build pipeline** — Analyzing → Sketching → Writing → Testing (never a blank screen)
- **Live preview** in a sandboxed iframe
- **Chat / Preview** toggle for iteration
- **Websites, apps & games** — static HTML/CSS/JS, interactive tools, canvas games
- **Iterative editing** — follow-ups modify the existing project
- **Local persistence** — last project saved in `localStorage`
- **Download** the generated HTML
- **OpenRouter multi-model fallback** (Claude → GPT-4o → Gemini → Llama)
- **Works without an API key** in demo/fallback mode

## Stack

- Next.js 15 (App Router) + TypeScript
- Tailwind CSS v4
- OpenRouter API
- Deploy-ready for Vercel

## Quick start

```bash
git clone https://github.com/Dasgar7/lurk-platform.git
cd lurk-platform
npm install
cp .env.example .env.local
# add your OPENROUTER_API_KEY
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENROUTER_API_KEY` | Recommended | Enables real LLM generation. Without it, Lurk still runs with smart HTML fallbacks. |
| `NEXT_PUBLIC_SITE_URL` | Optional | Used for OpenRouter referrer headers |

## Deploy on Vercel

1. Push this repo to GitHub (already done if you cloned from the template).
2. Import the project in [Vercel](https://vercel.com/new).
3. Add `OPENROUTER_API_KEY` in Project → Settings → Environment Variables.
4. Deploy.

Or use the CLI:

```bash
npx vercel
```

## How it works

1. User submits a prompt (and optional attachments).
2. UI enters a persistent building state and cycles through stages.
3. Concept mockup SVGs appear while the model works.
4. `/api/generate` calls OpenRouter with a strict system prompt that returns JSON `{ name, description, icon, html }`.
5. The full HTML document is rendered in a sandboxed `iframe` via `srcDoc`.
6. Follow-up messages include the previous HTML so the model edits in place.

## Project structure

```
src/
  app/
    page.tsx          # Main UI (chat + preview + input)
    layout.tsx
    globals.css       # Dark theme + neon accents
    api/generate/
      route.ts        # OpenRouter + multi-model fallback
```

## License

MIT
