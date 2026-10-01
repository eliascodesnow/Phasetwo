# PhaseTwo

Cycle tracking, symptom logging, appointment preparation, and invitation-only
partner cycle sync. Sign in to keep your own app data in your Supabase account.

Cycle settings and plans are account-scoped. Symptom logs are private to the
tracking account. Ask Bella conversations remain in the current browser session
and are sent to the PhaseTwo Supabase Edge Function only when a message is sent.
When a question needs personal context, Bella receives only recent structured
symptom entries and deterministic pattern counts, never symptom notes or account
identifiers.

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
3. Apply the following SQL migrations in numeric order using the Supabase CLI
   migration workflow or the Supabase SQL Editor. These scripts start at
   `0002`; this workspace does not include a `0001` migration. The existing
   core tables referenced by `0002` (including `cycle_profiles`, `tasks`,
   `chat_messages`, and `subscriptions`) must already exist.
   - `0002_symptoms_endo.sql`: Adds endometriosis family-history data to cycle
     profiles; creates or upgrades symptom logs, nudge events, health-consent,
     and daily AI-usage tables; adds validation constraints and lookup indexes;
     enables per-user row-level security; adds the symptom-log updated-at
     trigger; ensures RLS is enabled on core account tables; and creates the
     authenticated `delete_my_account()` function to remove the signed-in
     user's data and account.
   - `0003_auth_sync.sql`: Creates account profiles for onboarding and
     `user_app_state` for synchronized cycle settings, tasks, app settings, and
     chat state. It enables RLS, limits each account to its own rows, and grants
     authenticated users the required select/insert/update access.
   - `0004_symptom_impact_awareness.sql`: Adds symptom impact areas and the
     outside-period indicator, and expands the allowed impact values used by
     symptom logging.
   - `0005_bella_partner_invites.sql`: Creates invitation records with
     14-day expiry and uniqueness rules; restricts invitation-table access to
     the service role; adds the per-user Bella daily-limit RPC; and adds
     authenticated RPCs for retrieving a redacted shared cycle profile and
     leaving a cycle share.
   - `0006_authenticated_health_data_grants.sql`: Grants authenticated users
     the table privileges needed to read, create, update, and delete their own
     symptom logs, and to read or save their own health-consent record. RLS
     policies continue to enforce per-user access; anonymous access is revoked.
     The migration also asks PostgREST to reload its schema cache.

   For an existing project, check its migration history first and apply only
   migrations that have not already been recorded. Review and back up existing
   data before applying schema changes; `0002` makes several existing symptom
   log fields required. `0005` must be applied for the shared-cycle RPC, and
   `0006` supplies the authenticated table grants required by the client.

4. Copy `.env.local.example` to `.env.local` and set `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_PUBLISHABLE_KEY` from your Supabase project API settings.
5. Deploy the `bella-chat` and `partner-invites` Supabase Edge Functions.
6. Restart the dev server and sign in with Google or email.

Only the Supabase anon/publishable key belongs in the frontend environment. Never
put a service-role key or Google client secret in `.env.local` variables prefixed
with `VITE_`. OpenRouter credentials must only be Supabase Edge Function secrets.

## Setting up Ask Bella

Configure these secrets for the Supabase project (locally with the Supabase CLI,
and again in the deployment platform's Supabase function secrets):

```text
OPENROUTER_API_KEY=
OPENROUTER_MODEL=
BELLA_DAILY_MESSAGE_LIMIT=10
```

For local Edge Function testing, copy `supabase/functions/.env.example` to
`supabase/functions/.env` and fill in the OpenRouter values; run
`supabase functions serve bella-chat --env-file supabase/functions/.env`.
That local secret file is git-ignored. The frontend `.env.local` should contain
only the `VITE_` Supabase public configuration.

Create an API key at [openrouter.ai/keys](https://openrouter.ai/keys), then set
the secrets without adding them to any `VITE_` variable or checked-in file:

```bash
supabase secrets set OPENROUTER_API_KEY=your-secret-key OPENROUTER_MODEL=your-openrouter-model
supabase secrets set BELLA_DAILY_MESSAGE_LIMIT=10
supabase functions deploy bella-chat
supabase functions deploy partner-invites
```

Choose a model supported by OpenRouter's chat completions API; PhaseTwo does not
select or hard-code a model. The daily message limit defaults to 10 if omitted.
The legacy partner-advice function also uses server secrets and, if enabled,
requires `OPENROUTER_FALLBACK_MODEL`, `FREE_DAILY_LIMIT`, and `PLUS_DAILY_LIMIT`.

Bella is an educational assistant, not a clinician. It cannot diagnose or rule
out endometriosis or another condition, prescribe medication, or recommend
changes to prescribed treatment. Its deterministic pattern review describes
only recorded data; persistent, severe, worsening, or disruptive symptoms may
be worth discussing with a qualified healthcare professional.

If Ask Bella is unavailable, its offline reference recognizes topics such as
endometriosis, period pain, heavy bleeding, symptoms, cycle tracking, diagnosis,
medication, and appointment preparation. Offline responses are general health
education, do not use personal tracking data, and link to authoritative sources.

## Partner invitations

Each person signs in with their own PhaseTwo account. In **Settings**, the cycle
owner enters the partner's account email, creates an invitation, and privately
sends the generated link to that address. The recipient must be signed in with
that exact, email-verified account to accept. Links expire after 14 days and can
be revoked. Acceptance provides read-only cycle dates and length only; symptom
logs, notes, tasks, chat, and other account data are not shared. The partner may
disconnect at any time.

Do not share an invitation link publicly: it is a bearer token bound to the
invited email address.

## Building for production

```bash
npm run build
npm run preview
```

`npm run build` outputs static files to `dist/` that you can host anywhere
(Vercel, Netlify, GitHub Pages, etc.). Configure the Supabase environment values
and production redirect URL in the hosting provider before deploying.
