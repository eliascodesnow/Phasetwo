# PhaseTwo

Cycle tracking, phase-adaptive task planning, and a partner advice bot — private by
default, with an optional remote-sync mode for long-distance couples.

Everything lives in your browser (`localStorage`). Nothing about your cycle, tasks,
or notes is ever sent anywhere. The only network calls this app makes are to
Google's Gemini API, and only when you send a chat message.

## Running it locally

You'll need [Node.js](https://nodejs.org) (v18 or newer) installed. Then, in this
folder:

```bash
npm install
npm run dev
```

Open the URL it prints (usually `http://localhost:5173`).

## Setting up the AI assistant

The advice bot needs a free Gemini API key:

1. Get one at [aistudio.google.com/apikey](https://aistudio.google.com/apikey).
2. Easiest: open the app, click **Settings**, and paste the key into the
   **Gemini API key** field. It's saved in your browser only.
3. Optional (for your own default, e.g. if you're setting this up for someone
   else): copy `.env.local.example` to `.env.local` and paste the key there.
   Anyone using the app can still override it from Settings.

## Two ways to use it

Open **Settings** and choose your role:

- **I track my own cycle** — the app tracks your cycle and gives you advice.
- **I'm tracking my partner's cycle** — adds the timezone bar, phase-matched
  virtual date ideas, watch-together links, and one-click care-package
  suggestions in the chat.

## Sharing a cycle (Remote Sync)

From the Remote Sync panel, **Copy share link** generates a URL containing only
the cycle start date, length, name, timezone, and city — nothing else. Opening
that link on another device offers to import it. There's no server involved;
the data lives entirely in the link itself.

## Building for production

```bash
npm run build
npm run preview
```

`npm run build` outputs static files to `dist/` that you can host anywhere
(Vercel, Netlify, GitHub Pages, etc.) — no backend required.
