import { beforeEach, describe, expect, it } from "vitest";
import { defaultSettings, loadLocalAppState, saveLocalAppState, storage } from "./storage";

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

describe("app tour completion", () => {
  it("is off by default so first-time people see the tour", () => {
    expect(storage.loadSettings().tourCompleted).toBe(false);
    expect(loadLocalAppState("new-account").appSettings.tourCompleted).toBeFalsy();
  });

  it("is remembered per account once the tour is finished or skipped", () => {
    const state = loadLocalAppState("account-one");
    saveLocalAppState("account-one", { ...state, appSettings: { ...defaultSettings, tourCompleted: true } });

    expect(loadLocalAppState("account-one").appSettings.tourCompleted).toBe(true);
    expect(loadLocalAppState("account-two").appSettings.tourCompleted).toBeFalsy();
  });
});
