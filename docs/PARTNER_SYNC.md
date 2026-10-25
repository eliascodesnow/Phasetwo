# Partner sync: how the partner's phase is read

## Data path
1. The owner's app autosaves `cycleProfile` to `user_app_state.cycle_profile` (500 ms debounce).
2. The partner's app calls the `get_my_shared_cycle_profile()` RPC on load, on focus and every 30 s.
   It returns only cycle dates and settings: `lastPeriodStart`, `periodStartDates`, `periodEnds`,
   `cycleLength`, `periodLength`, `ownerLabel`, `timezone`. No symptom logs, notes, age or health flags.
3. The partner's client turns that into a read-only `CycleProfile` and computes the day and phase with
   `currentCycleDay()` / `phaseForDay()` in `src/lib/cycleUtils.ts`.
4. Ari (`supabase/functions/ari-chat`) reads the same RPC and computes the day on the server, in the
   **owner's** timezone, using the same proportional phase boundaries (`phaseOfDay`).

## What was wrong
- The partner's screen computed "today" on the **partner's device date**, while Ari used the **owner's
  timezone**. When the two people were in different time zones, the header, planner, remote-sync card and
  Ari's launcher could show a different cycle day or phase than the owner and than Ari's replies, on the
  days a phase boundary fell between the two dates.
- The RPC did not return `periodEnds`, so the partner's calendar and period window ignored recorded end dates.

## Fix
- `CycleProfile.viewInOwnerTimezone` (client-only, never saved): set on the shared copy in `App.tsx`.
  `currentCycleDay()` then reads today's date in `profile.timezone` via the new `dateKeyInZone()`.
  Every partner-side surface (CycleHeader, TaskPlanner, LDRModule, AriKnowsLauncher) is fixed at once.
- Migration `supabase/migrations/0012_shared_profile_period_ends.sql` adds `periodEnds` to the RPC.
  **Run it on the PhaseTwo Supabase project** (the workscapceforelias@gmail.com account) before relying on end dates.
- Tests: `src/lib/cycleUtils.test.ts` ("partner view reads the owner's timezone").

## Checking it by hand
1. Owner logs a period start; wait for autosave.
2. On the partner account, Settings > partner sync is linked; Today shows "Day N, <phase>".
3. Compare with the owner's Today screen and with the `cycleDay`/`phase` in an Ari reply. All three must match.
4. Test across zones by setting the partner device to a timezone 10+ hours away from the owner's.

## Known limit
If the owner never opens the app after logging, the server only has what was last autosaved. Autosave is
skipped while the owner's initial sync load has failed (`syncLoadFailed`).
