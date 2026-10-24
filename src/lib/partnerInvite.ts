export type PartnerInviteErrorCode =
  | "invalid_email"
  | "cannot_invite_self"
  | "already_linked"
  | "email_not_configured"
  | "invite_failed"
  | "email_failed"
  | "unauthorized"
  | "invalid_or_expired_code"
  | "cannot_accept_own_invite"
  | "already_linked_partner"
  | "not_authenticated"
  | "rate_limited"
  | "invite_conflict"
  | "too_many_attempts";

export function formatInviteCode(value: string): string {
  const normalized = value.replace(/[^A-Za-z0-9]/g, "").slice(0, 8).toUpperCase();
  if (normalized.length <= 4) return normalized;
  return `${normalized.slice(0, 4)}-${normalized.slice(4)}`;
}

export function mapPartnerInviteError(code: string | null | undefined): string {
  switch (code) {
    case "invalid_email":
      return "Enter a valid email address.";
    case "cannot_invite_self":
      return "You cannot invite your own account.";
    case "already_linked":
      return "This account already has an active partner.";
    case "email_not_configured":
      return "Email delivery is not configured for this project.";
    case "invite_failed":
      return "We could not create the invitation. Please try again.";
    case "email_failed":
      return "The invitation could not be emailed. Please try again.";
    case "unauthorized":
      return "Please sign in again and try the invitation.";
    case "invalid_or_expired_code":
      return "That invite code is invalid or has expired.";
    case "cannot_accept_own_invite":
      return "You cannot accept your own invitation.";
    case "already_linked_partner":
      return "This account is already linked to a partner.";
    case "not_authenticated":
      return "Please sign in before accepting a partner code.";
    case "rate_limited":
      return "You have sent several invitations recently. Please try again later.";
    case "invite_conflict":
      return "An invitation was just created. Refresh and try again.";
    case "too_many_attempts":
      return "Too many incorrect codes. Please wait an hour and try again.";
    default:
      return "We couldn’t create that invitation. Please try again.";
  }
}

const KNOWN_ACCEPT_ERRORS = new Set<string>([
  "invalid_or_expired_code",
  "cannot_accept_own_invite",
  "already_linked",
  "already_linked_partner",
  "not_authenticated",
  "too_many_attempts",
]);

/** Friendly message for a failed accept_cycle_invitation call (the RPC raises the code as its message). */
export function mapPartnerAcceptError(code: string | null | undefined): string {
  return code && KNOWN_ACCEPT_ERRORS.has(code)
    ? mapPartnerInviteError(code)
    : "That invite code could not be accepted. Please try again.";
}

const PENDING_CODE_KEY = "phasetwo:pending-partner-code";
const PENDING_CODE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

type CodeStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** Returns a formatted ABCD-EFGH code from a URL parameter, or null if it is not a valid code. */
export function parsePartnerCodeParam(value: string | null | undefined): string | null {
  const normalized = (value ?? "").replace(/[\s-]/g, "").toUpperCase();
  return /^[A-Z0-9]{8}$/.test(normalized) ? formatInviteCode(normalized) : null;
}

export function stashPendingPartnerCode(code: string, storage: CodeStorage | null, now = Date.now()): void {
  try {
    storage?.setItem(PENDING_CODE_KEY, JSON.stringify({ code, savedAt: now }));
  } catch {
    // Storage can be unavailable (private mode); the user can still type the code.
  }
}

export function readPendingPartnerCode(storage: CodeStorage | null, now = Date.now()): string | null {
  try {
    const raw = storage?.getItem(PENDING_CODE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { code?: unknown; savedAt?: unknown };
    const code = typeof parsed.code === "string" ? parsePartnerCodeParam(parsed.code) : null;
    if (!code || typeof parsed.savedAt !== "number" || now - parsed.savedAt > PENDING_CODE_TTL_MS) {
      storage?.removeItem(PENDING_CODE_KEY);
      return null;
    }
    return code;
  } catch {
    return null;
  }
}

export function clearPendingPartnerCode(storage: CodeStorage | null): void {
  try {
    storage?.removeItem(PENDING_CODE_KEY);
  } catch {
    // ignore
  }
}

function browserStorage(): CodeStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** Called once on load: moves ?partnerCode=… from the URL into storage so it survives sign-in. */
export function capturePartnerCodeFromUrl(): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has("partnerCode")) return;
  const code = parsePartnerCodeParam(url.searchParams.get("partnerCode"));
  if (code) stashPendingPartnerCode(code, browserStorage());
  url.searchParams.delete("partnerCode");
  window.history.replaceState({}, "", url);
}

export const pendingPartnerCode = {
  peek: () => readPendingPartnerCode(browserStorage()),
  clear: () => clearPendingPartnerCode(browserStorage()),
};
