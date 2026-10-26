import { supabase } from "./supabase";

/** Bump when the Terms of Service or Privacy Policy change in a way people must re-accept. Keep in sync with public/privacy.html and public/terms.html. */
export const LEGAL_VERSION = "2026-10-24";
export const PRIVACY_URL = "/privacy";
export const TERMS_URL = "/terms";

const STORAGE_KEY = "phasetwo:legal-acceptance";

export type LegalAcceptance = { version: string; acceptedAt: string; syncedUsers: string[] };
type LegalStore = Pick<Storage, "getItem" | "setItem">;
type ConsentClient = {
  from: (table: string) => { upsert: (row: Record<string, unknown>, options?: Record<string, unknown>) => PromiseLike<{ error: unknown }> };
};

const COOKIE_NAME = "pt_legal";

/** A long-lived cookie backs up localStorage, which some browsers clear after a week without a visit. */
function readCookieVersion(): { version: string; acceptedAt: string } | null {
  try {
    if (typeof document === "undefined") return null;
    const match = document.cookie.split("; ").find((part) => part.startsWith(`${COOKIE_NAME}=`));
    if (!match) return null;
    const [version, acceptedAt] = decodeURIComponent(match.slice(COOKIE_NAME.length + 1)).split("|");
    return version && acceptedAt ? { version, acceptedAt } : null;
  } catch {
    return null;
  }
}

function writeCookie(acceptance: LegalAcceptance): void {
  try {
    if (typeof document === "undefined") return;
    const secure = location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${COOKIE_NAME}=${encodeURIComponent(`${acceptance.version}|${acceptance.acceptedAt}`)}; Max-Age=31536000; Path=/; SameSite=Lax${secure}`;
  } catch {
    // Cookies can be blocked; localStorage and the account record still apply.
  }
}

/** Asks the browser not to evict this site's storage (best effort). */
export function requestPersistentStorage(): void {
  try {
    void navigator.storage?.persist?.();
  } catch {
    // Not supported.
  }
}

function browserStore(): LegalStore | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** The stored acceptance of any version (used to tell "first time" from "terms were updated"). */
export function readStoredAcceptance(store: LegalStore | null = browserStore()): LegalAcceptance | null {
  try {
    const raw = store?.getItem(STORAGE_KEY);
    if (!raw) {
      const cookie = store === browserStore() ? readCookieVersion() : null;
      if (!cookie) return null;
      const restored: LegalAcceptance = { ...cookie, syncedUsers: [] };
      try { store?.setItem(STORAGE_KEY, JSON.stringify(restored)); } catch { /* storage blocked */ }
      return restored;
    }
    const parsed = JSON.parse(raw) as Partial<LegalAcceptance>;
    if (typeof parsed.version !== "string" || typeof parsed.acceptedAt !== "string") return null;
    return {
      version: parsed.version,
      acceptedAt: parsed.acceptedAt,
      syncedUsers: Array.isArray(parsed.syncedUsers) ? parsed.syncedUsers.filter((id): id is string => typeof id === "string") : [],
    };
  } catch {
    return null;
  }
}

export function isCurrentAcceptance(acceptance: LegalAcceptance | null): boolean {
  return acceptance?.version === LEGAL_VERSION;
}

export function storeAcceptance(store: LegalStore | null = browserStore(), now = new Date()): LegalAcceptance {
  const acceptance: LegalAcceptance = { version: LEGAL_VERSION, acceptedAt: now.toISOString(), syncedUsers: [] };
  try {
    store?.setItem(STORAGE_KEY, JSON.stringify(acceptance));
  } catch {
    // Storage can be blocked; the agreement still holds for this session.
  }
  writeCookie(acceptance);
  requestPersistentStorage();
  return acceptance;
}

/**
 * Saves the agreement to the signed-in user's account (user_consents) once per account and version.
 * Best effort: failures never block the app and are retried on the next sign-in.
 */
export async function syncLegalAcceptance(
  userId: string,
  store: LegalStore | null = browserStore(),
  client: ConsentClient | null = supabase as unknown as ConsentClient | null,
): Promise<boolean> {
  const acceptance = readStoredAcceptance(store);
  if (!client || !acceptance || !isCurrentAcceptance(acceptance) || acceptance.syncedUsers.includes(userId)) return false;
  try {
    const { error } = await client.from("user_consents").upsert(
      { user_id: userId, health_data_consent_at: acceptance.acceptedAt, policy_version: acceptance.version },
      { onConflict: "user_id" },
    );
    if (error) return false;
    store?.setItem(STORAGE_KEY, JSON.stringify({ ...acceptance, syncedUsers: [...acceptance.syncedUsers, userId] }));
    return true;
  } catch {
    return false;
  }
}

/** For a signed-in person whose browser lost its local record: the agreement already saved to their account. */
export async function accountAcceptance(client: { auth: { getSession: () => PromiseLike<{ data: { session: { user: { id: string } } | null } }> }; from: (table: string) => any } | null = supabase as never): Promise<LegalAcceptance | null> {
  try {
    if (!client) return null;
    const { data: { session } } = await client.auth.getSession();
    if (!session) return null;
    const { data } = await client.from("user_consents").select("health_data_consent_at, policy_version").eq("user_id", session.user.id).maybeSingle();
    if (!data || data.policy_version !== LEGAL_VERSION || !data.health_data_consent_at) return null;
    return { version: data.policy_version, acceptedAt: data.health_data_consent_at, syncedUsers: [session.user.id] };
  } catch {
    return null;
  }
}
