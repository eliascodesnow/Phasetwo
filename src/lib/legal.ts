import { supabase } from "./supabase";

/** Bump when the Terms of Service or Privacy Policy change in a way people must re-accept. Keep in sync with public/privacy.html and public/terms.html. */
export const LEGAL_VERSION = "2026-10-20";
export const PRIVACY_URL = "/privacy";
export const TERMS_URL = "/terms";

const STORAGE_KEY = "phasetwo:legal-acceptance";

export type LegalAcceptance = { version: string; acceptedAt: string; syncedUsers: string[] };
type LegalStore = Pick<Storage, "getItem" | "setItem">;
type ConsentClient = {
  from: (table: string) => { upsert: (row: Record<string, unknown>, options?: Record<string, unknown>) => PromiseLike<{ error: unknown }> };
};

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
    if (!raw) return null;
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
