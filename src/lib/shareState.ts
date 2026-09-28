import type { CycleProfile } from "../types";

/**
 * Remote Sync & Care Mode shares only the fields needed to render the LDR header
 * for the other person: cycle start date, length, owner label, timezone, city.
 * Nothing else in the app (tasks, chat history, notes) ever leaves the browser.
 */
type ShareableFields = Pick<
  CycleProfile,
  "lastPeriodStart" | "cycleLength" | "periodLength" | "ownerLabel" | "timezone" | "city"
>;

const PARAM = "sync";

export function encodeShareCode(profile: CycleProfile): string {
  const payload: ShareableFields = {
    lastPeriodStart: profile.lastPeriodStart,
    cycleLength: profile.cycleLength,
    periodLength: profile.periodLength,
    ownerLabel: profile.ownerLabel,
    timezone: profile.timezone,
    city: profile.city,
  };
  const json = JSON.stringify(payload);
  // Base64url encode so it's safe in a query string.
  const b64 = btoa(unescape(encodeURIComponent(json)));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeShareCode(code: string): ShareableFields | null {
  try {
    const b64 = code.replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(escape(atob(b64)));
    const parsed = JSON.parse(json);
    if (!parsed.lastPeriodStart || !parsed.cycleLength) return null;
    return parsed as ShareableFields;
  } catch {
    return null;
  }
}

export function buildShareUrl(profile: CycleProfile): string {
  const code = encodeShareCode(profile);
  const url = new URL(window.location.href);
  url.searchParams.set(PARAM, code);
  return url.toString();
}

export function readShareCodeFromUrl(): ShareableFields | null {
  const params = new URLSearchParams(window.location.search);
  const code = params.get(PARAM);
  if (!code) return null;
  return decodeShareCode(code);
}

export function clearShareParam(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete(PARAM);
  window.history.replaceState({}, "", url.toString());
}
