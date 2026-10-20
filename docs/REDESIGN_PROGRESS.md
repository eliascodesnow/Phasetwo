# PhaseTwo Redesign Progress

## Audit and baseline
- Status: complete.
- Active entry: `index.html` loads `src/main.tsx`, which mounts `src/App.tsx`. The old top-level duplicate component and helper files (root `App.tsx`, `main.tsx`, `AIAssistant.tsx`, etc.) were unused and have been removed; all app code lives under `src/`.
- Initial baseline: `npm test -- --reporter=verbose` passed (6 files, 36 tests); `npm run build` passed TypeScript and Vite. Existing Vite warning: main JS chunk exceeds 500 kB. No lint script is defined.
- Existing systems verified: guest/account-scoped storage, cycle math, symptom logs and consent, planner, Bella, partner cycle sharing, account deletion RPC, and migrations `0002`-`0007`.
- Existing symptom schema supports pain, locations, symptoms, bleeding (`none`, `light`, `medium`, `heavy`), impact, impact areas, outside-period flag, and private notes. It has no mood or spotting field.
- Migration `0007_partner_invite_code_and_acceptance.sql` is already in use. Never edit `0002`-`0007`; community starts at `0008`.

## Design refinement
- Status: complete for the current app scope.
- Centralized system/light/dark design tokens and persisted theme setting; responsive desktop/mobile navigation with Today, Calendar, Planner, History, Report, and Settings surfaces.
- Check-in essentials, optional supported fields, save/error states, calendar day details and keyboard navigation, cycle-history uncertainty, and flexible planner wording refined.
- Browser-tested mobile/tablet/desktop widths in both themes; no horizontal overflow at sampled viewports, calendar navigation and 44px mobile targets verified.
- Tests after these changes: 37 passed; production build/type check passed with the existing chunk warning.

## Skippable personal details
- Status: implemented and browser-verified.
- Before guest sign-in, users can enter a display name and numeric age (1-120), continue, or skip. No birth date is collected.
- Name uses the existing private `cycleProfile.ownerLabel` and appears in Today/report. Age is stored in private `app_settings` JSON and appears only in generated report exports when provided; it is not sent to Bella or shared with partners.
- Details completion/skip is saved immediately to guest storage. Report no longer treats the default profile date as an observed period start.
- Added local-storage regression coverage for age/name persistence and invalid age normalization. Browser verified submit -> immediate local persistence -> report output.

## Community
- Status: backend drafts only, no UI, and not live. `supabase/migrations/0008_community_core.sql`, `0009_community_account_deletion.sql` and `supabase/tests/0008_community_rls.test.sql` are in the repo, but the live PhaseTwo database only has migrations `0002`-`0007` applied (checked 20 Oct 2026). Nothing in `src/` references community. Do not apply `0008`/`0009` until the safety checklist below is done.
- No community UI, moderation or local Supabase test harness exists yet. Keep community disabled until backend authorization, privacy, safety, account-deletion, age confirmation, and multi-role SQL tests are complete.
- Must provide public community-specific pseudonymous IDs, never expose auth IDs, keep community data separate from cycle/Bella/partner data, and preserve the feature flag default-off.

## Current verification
- Latest complete suite before details: 37 tests passed. The new personal-details regression was subsequently run: 38 tests passed.
- Latest production build after the personal-details feature: passed TypeScript and Vite; existing main-chunk warning remains.
- Browser confirmed details dialog, name/age in report, immediate local persistence, and honest empty recorded-start wording.
- No Supabase migration was applied; there is no confirmed local Supabase instance/SQL test harness and no production credentials were accessed.
