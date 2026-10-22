# Cloudflare Turnstile (email sign-in)

The email magic-link form uses Cloudflare Turnstile. Google sign-in is not affected.

## Setup
1. Cloudflare dashboard > Turnstile > add a widget. Hostnames: `phasetwo.space`, `phasetwo-omega.vercel.app`, `localhost`. Mode: Managed.
2. Copy the **site key** into the Vercel env var `VITE_TURNSTILE_SITE_KEY` (Production, Preview) and redeploy. It is public, so it is safe in the bundle.
3. Supabase > Authentication > Attack Protection: enable CAPTCHA, provider Turnstile, paste the **secret key**. The secret key lives only in Supabase.

## Behaviour
- No site key set: no widget, no token sent. Only works while CAPTCHA is off in Supabase.
- Site key set but CAPTCHA off in Supabase: harmless, the token is ignored.
- Site key not set but CAPTCHA on in Supabase: sign-in fails with "captcha verification process failed".
- Tokens are single-use, so the widget resets after every attempt.
- Script is loaded on demand when the sign-in form opens (not in `index.html`).
