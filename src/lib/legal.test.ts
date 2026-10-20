import { describe, expect, it, vi } from "vitest";
import privacyHtml from "../../public/privacy.html?raw";
import termsHtml from "../../public/terms.html?raw";
import { isCurrentAcceptance, LEGAL_VERSION, readStoredAcceptance, storeAcceptance, syncLegalAcceptance } from "./legal";

function memoryStore() {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
}

describe("legal acceptance", () => {
  it("starts empty, then records the current version", () => {
    const store = memoryStore();
    expect(readStoredAcceptance(store)).toBeNull();
    const saved = storeAcceptance(store, new Date("2026-10-20T10:00:00Z"));
    expect(saved).toMatchObject({ version: LEGAL_VERSION, acceptedAt: "2026-10-20T10:00:00.000Z" });
    expect(isCurrentAcceptance(readStoredAcceptance(store))).toBe(true);
  });

  it("asks again when the stored version is older", () => {
    const store = memoryStore();
    store.setItem("phasetwo:legal-acceptance", JSON.stringify({ version: "2025-01-01", acceptedAt: "2025-01-01T00:00:00Z" }));
    const stored = readStoredAcceptance(store);
    expect(stored).not.toBeNull();
    expect(isCurrentAcceptance(stored)).toBe(false);
  });

  it("ignores corrupt storage", () => {
    const store = memoryStore();
    store.setItem("phasetwo:legal-acceptance", "{nope");
    expect(readStoredAcceptance(store)).toBeNull();
  });
});

describe("syncLegalAcceptance", () => {
  function fakeClient(error: unknown = null) {
    const upsert = vi.fn().mockResolvedValue({ error });
    return { client: { from: vi.fn(() => ({ upsert })) }, upsert };
  }

  it("saves the acceptance time and version to the account once", async () => {
    const store = memoryStore();
    storeAcceptance(store, new Date("2026-10-20T10:00:00Z"));
    const { client, upsert } = fakeClient();
    expect(await syncLegalAcceptance("user-1", store, client)).toBe(true);
    expect(upsert).toHaveBeenCalledWith(
      { user_id: "user-1", health_data_consent_at: "2026-10-20T10:00:00.000Z", policy_version: LEGAL_VERSION },
      { onConflict: "user_id" },
    );
    expect(await syncLegalAcceptance("user-1", store, client)).toBe(false);
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it("retries later when saving fails, and does nothing without an acceptance", async () => {
    const store = memoryStore();
    const failing = fakeClient({ message: "boom" });
    expect(await syncLegalAcceptance("user-1", store, failing.client)).toBe(false);
    storeAcceptance(store);
    expect(await syncLegalAcceptance("user-1", store, failing.client)).toBe(false);
    const ok = fakeClient();
    expect(await syncLegalAcceptance("user-1", store, ok.client)).toBe(true);
  });
});

describe("static legal pages", () => {
  it("carry the same version as the app and the key promises", () => {
    for (const html of [privacyHtml, termsHtml]) {
      expect(html).toContain(`data-legal-version="${LEGAL_VERSION}"`);
      expect(html).toContain("<title>");
      expect(html).not.toContain("<script");
    }
    expect(privacyHtml).toContain("What we do not collect");
    expect(privacyHtml).toContain("Google API Services User Data Policy");
    expect(termsHtml).toContain("18 years old");
  });
});
