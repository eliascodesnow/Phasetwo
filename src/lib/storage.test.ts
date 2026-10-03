import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultCycleProfile, loadLocalAppState, readWeeklyLoginStreak, recordWeeklyLogin, saveLocalAppState } from "./storage";

beforeEach(() => {
  const store = new Map<string, string>();

  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
      clear: () => store.clear(),
    },
  });
});

describe("account-scoped app state", () => {
  it("imports existing browser data once and keeps later accounts separate", () => {
    localStorage.setItem(
      "phasetwo:cycle",
      JSON.stringify({ ...defaultCycleProfile, ownerLabel: "Existing local profile" })
    );

    const firstAccount = loadLocalAppState("account-one");
    expect(firstAccount.cycleProfile.ownerLabel).toBe("Existing local profile");
    expect(localStorage.getItem("phasetwo:legacy-state-imported")).toBeNull();

    saveLocalAppState("account-one", firstAccount);
    expect(localStorage.getItem("phasetwo:legacy-state-imported")).toBe("account-one");

    const secondAccount = loadLocalAppState("account-two");
    expect(secondAccount.cycleProfile.ownerLabel).toBe(defaultCycleProfile.ownerLabel);
  });

  it("loads each account's own saved snapshot", () => {
    const firstAccount = loadLocalAppState("account-one");
    const secondAccount = loadLocalAppState("account-two");
    firstAccount.cycleProfile.ownerLabel = "First account";
    secondAccount.cycleProfile.ownerLabel = "Second account";

    saveLocalAppState("account-one", firstAccount);
    saveLocalAppState("account-two", secondAccount);

    expect(loadLocalAppState("account-one").cycleProfile.ownerLabel).toBe("First account");
    expect(loadLocalAppState("account-two").cycleProfile.ownerLabel).toBe("Second account");
  });
});

describe("weekly login streak", () => {
  it("counts at most one login per week and increments on the next week", () => {
    const firstLogin = new Date("2026-08-03T12:00:00");
    expect(recordWeeklyLogin("weekly-user", firstLogin).current).toBe(1);
    expect(recordWeeklyLogin("weekly-user", new Date("2026-08-06T12:00:00")).current).toBe(1);
    expect(recordWeeklyLogin("weekly-user", new Date("2026-08-10T12:00:00")).current).toBe(2);
  });

  it("resets after a missed calendar week", () => {
    recordWeeklyLogin("weekly-user", new Date("2026-08-03T12:00:00"));
    recordWeeklyLogin("weekly-user", new Date("2026-08-10T12:00:00"));

    expect(recordWeeklyLogin("weekly-user", new Date("2026-08-24T12:00:00")).current).toBe(1);
  });

  it("keeps the previous week's streak active until the current week ends", () => {
    recordWeeklyLogin("weekly-user", new Date("2026-08-03T12:00:00"));

    expect(readWeeklyLoginStreak("weekly-user", new Date("2026-08-09T12:00:00")).current).toBe(1);
    expect(readWeeklyLoginStreak("weekly-user", new Date("2026-08-17T12:00:00")).current).toBe(0);
  });
});