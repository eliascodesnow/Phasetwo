# Cloudflare Turnstile (email sign-in)

The email magic-link form uses Cloudflare Turnstile (widget action `signin`). Google sign-in is not affected.

## How it fits together
- Browser: the widget in `src/components/TurnstileWidget.tsx` produces a single-use token, sent as `captchaToken` to `supabase.auth.signInWithOtp`.
- Verification: Supabase Auth calls Cloudflare siteverify itself, using the secret key stored in the Supabase dashboard. There is no PhaseTwo backend and no secret in this repo.
- The site key is public and built in (`src/lib/turnstile.ts`); set `VITE_TURNSTILE_SITE_KEY` to override it.

## Setup checklist
1. Cloudflare widget hostnames include: `phasetwo.space`, `phasetwo-omega.vercel.app`, `localhost`, plus any Vercel preview hostname you test on.
2. Supabase > Authentication > Attack Protection: enable CAPTCHA, provider Turnstile, paste the widget's **secret key**.
3. Deploy (merge to `main`).

## Behaviour
- Tokens are single-use; the widget resets after every attempt.
- If Supabase CAPTCHA is on and no token is sent, sign-in fails with "captcha verification process failed".
- The script loads on demand when the sign-in form opens (not in `index.html`).
