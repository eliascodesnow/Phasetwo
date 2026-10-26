# Ari Knows (partner support)

Ari is the assistant for partners, family and friends of someone who tracks their cycle in PhaseTwo. Bella is the self-facing health companion; Ari is deliberately narrower.

- **What it does:** explains the current phase (what is happening, what is often felt, moods some people report, how to help) and answers "how do I support them?" questions. Everything is framed as possibility, not prediction.
- **Relationship:** the partner picks who they are (boyfriend, husband, parent, friend, colleague, caregiver, or free text under "Something else"). The choice is stored in the browser and sent with each message; the server validates it against a fixed list and sanitises free text.
- **Where:** floating button, bottom left (Bella is bottom right). Shown whenever `settings.role === "partner"`. Blue theme.
- **Code:** `src/components/AriKnowsLauncher.tsx`, `src/lib/ariClient.ts`, edge function `supabase/functions/ari-chat`, prompt and phase content in `supabase/functions/_shared/ariPrompt.ts` (tests alongside).
- **Server-side prompt:** the client sends only the message, short history and relationship. Cycle day and phase are computed on the server from `get_my_shared_cycle_profile()`, so Ari sees only what the owner shared (no symptom logs, age or health flags).
- **Speed:** replies capped at 380 tokens, 15 s timeout, prompt tells the model to answer immediately. The phase guide on screen is static, so it works offline.
- **Rules:** no links or sources in prompt or replies (links are also stripped from output), neutral wording, no phase stereotyping.
- **Limit:** `ARI_DAILY_LIMIT` (default 30) through the atomic `consume_bella_daily_limit` counter (shared with Bella), so no migration. CORS uses the shared allow-list in `_shared/cors.ts` (`ALLOWED_ORIGINS`).
- **Deploy:** `supabase functions deploy ari-chat --no-verify-jwt`. The old `ai-chat` function was removed from the repo because it trusted a client-supplied prompt; undeploy it with `supabase functions delete ai-chat`.
