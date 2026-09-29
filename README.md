# PhaseTwo

Cycle tracking, phase-adaptive task planning, and a partner advice bot. Sign in to
keep your profile and app data synced securely across devices.

Your cycle, tasks, settings, chat history, and symptom logs are stored in your
Supabase account and protected by row-level security. The OpenRouter key entered
in Settings stays in the current browser. Chat messages are sent to the AI service
when you use the assistant.

## Running it locally

You'll need [Node.js](https://nodejs.org) (v18 or newer) installed. Then, in this
folder:

```bash
npm install
npm run dev
```

Open the URL it prints (usually `http://localhost:5173`).

## Setting up sign-in and sync

1. In Supabase, enable Google and email/password under **Authentication > Providers**.
   Add your Google OAuth client ID and secret to the Google provider.
2. In **Authentication > URL Configuration**, set your deployed site URL and add
   the local and production app URLs to the allowed redirect URLs (for example,
   `http://localhost:5173` and `https://your-app.example`). Google should use the
   Supabase callback URL shown in the Google provider settings.
3. Apply `supabase/migrations/0003_auth_sync.sql` to your project using the SQL
   editor or your Supabase migration workflow.
4. Copy `.env.local.example` to `.env.local` and set `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_PUBLISHABLE_KEY` from your Supabase project API settings.
5. Restart the dev server. Sign in with Google or email; first-time users must
   create a profile before reaching the app.

Only the Supabase anon/publishable key belongs in the frontend environment. Never
put a service-role key or Google client secret in `.env.local` variables prefixed
with `VITE_`.

## Setting up the AI assistant

The advice bot needs an OpenRouter API key:

1. Get one at [openrouter.ai/keys](https://openrouter.ai/keys).
2. Easiest: open the app, click **Settings**, and paste the key into the
   **OpenRouter API key** field. It's saved in your browser only.
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
that link on another device offers to import it. This is separate from account
sync and shares only those cycle details in the link itself.

## Building for production

```bash
npm run build
npm run preview
```

`npm run build` outputs static files to `dist/` that you can host anywhere
(Vercel, Netlify, GitHub Pages, etc.). Configure the Supabase environment values
and production redirect URL in the hosting provider before deploying.
