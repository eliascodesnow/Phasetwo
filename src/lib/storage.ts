import type { AppSettings, CycleProfile, Task, ChatMessage } from "../types";

const KEYS = {
  cycle: "phasetwo:cycle",
  tasks: "phasetwo:tasks",
  settings: "phasetwo:settings",
  chat: "phasetwo:chat",
} as const;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or unavailable (private browsing) — fail silently, in-memory state still works.
  }
}

export const defaultCycleProfile: CycleProfile = {
  lastPeriodStart: new Date().toISOString().slice(0, 10),
  cycleLength: 28,
  periodLength: 5,
  ownerLabel: "You",
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  city: "",
};

export const defaultSettings: AppSettings = {
  role: "self",
  ldrEnabled: false,
};

export interface UserAppState {
  cycleProfile: CycleProfile;
  tasks: Task[];
  appSettings: AppSettings;
  chatMessages: ChatMessage[];
}

export const storage = {
  loadCycle: () => ({ ...read<CycleProfile>(KEYS.cycle, defaultCycleProfile) }),
  saveCycle: (v: CycleProfile) => write(KEYS.cycle, v),

  loadTasks: () => read<Task[]>(KEYS.tasks, []),
  saveTasks: (v: Task[]) => write(KEYS.tasks, v),

  loadSettings: () => {
    const saved = read<Partial<AppSettings>>(KEYS.settings, defaultSettings);
    return {
      role: saved.role === "partner" ? "partner" as const : "self" as const,
      ldrEnabled: Boolean(saved.ldrEnabled),
    };
  },
  saveSettings: (v: AppSettings) => write(KEYS.settings, v),

  loadChat: () => read<ChatMessage[]>(KEYS.chat, []),
  saveChat: (v: ChatMessage[]) => write(KEYS.chat, v),
};

const USER_STATE_PREFIX = "phasetwo:user-state:";
const LEGACY_IMPORT_KEY = "phasetwo:legacy-state-imported";
export const LOCAL_GUEST_ID = "local-guest";

export function loadLocalAppState(userId: string): UserAppState {
  const accountState = read<UserAppState | null>(`${USER_STATE_PREFIX}${userId}`, null);
  if (accountState) {
    return {
      cycleProfile: { ...defaultCycleProfile, ...accountState.cycleProfile },
      tasks: accountState.tasks ?? [],
      appSettings: {
        role: accountState.appSettings?.role === "partner" ? "partner" : "self",
        ldrEnabled: Boolean(accountState.appSettings?.ldrEnabled),
      },
      chatMessages: accountState.chatMessages ?? [],
    };
  }

  let canImportLegacy = false;
  try {
    canImportLegacy = !localStorage.getItem(LEGACY_IMPORT_KEY);
  } catch {
    canImportLegacy = false;
  }

  if (!canImportLegacy) {
    return {
      cycleProfile: { ...defaultCycleProfile },
      tasks: [],
      appSettings: { ...defaultSettings },
      chatMessages: [],
    };
  }

  return {
    cycleProfile: storage.loadCycle(),
    tasks: storage.loadTasks(),
      appSettings: {
        role: storage.loadSettings().role,
        ldrEnabled: storage.loadSettings().ldrEnabled,
      },
    chatMessages: storage.loadChat(),
  };
}

export function saveLocalAppState(userId: string, state: UserAppState): void {
  write(`${USER_STATE_PREFIX}${userId}`, state);
  try {
    if (!localStorage.getItem(LEGACY_IMPORT_KEY)) localStorage.setItem(LEGACY_IMPORT_KEY, userId);
  } catch {
    // Local persistence can be unavailable in restricted browser contexts.
  }
}

export function clearLocalUserData(userId: string): void {
  try {
    localStorage.removeItem(`${USER_STATE_PREFIX}${userId}`);
    localStorage.removeItem(`phasetwo:symptom-logs:${userId}`);
    localStorage.removeItem(`phasetwo:weekly-login:${userId}`);
    const rawConsents = localStorage.getItem("phasetwo:user-consents");
    if (rawConsents) {
      const consents = JSON.parse(rawConsents) as Record<string, unknown>;
      delete consents[userId];
      localStorage.setItem("phasetwo:user-consents", JSON.stringify(consents));
    }
  } catch {
    throw new Error("Your account was deleted, but some browser-stored data could not be cleared. Clear this site's data in your browser settings.");
  }
}

function weekStart(date: Date): number {
  const monday = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  return monday.getTime();
}

function weekKey(date: Date): string {
  return new Date(weekStart(date)).toISOString().slice(0, 10);
}

type WeeklyLoginStreak = { current: number; lastLogin: string | null; active: boolean; daysUntilReset: number };

export function readWeeklyLoginStreak(userId: string, asOf: Date = new Date()): WeeklyLoginStreak {
  const state = read<{ current: number; lastLogin: string | null; lastLoginWeek?: string }>(`phasetwo:weekly-login:${userId}`, { current: 0, lastLogin: null });
  if (!state.lastLogin) return { current: 0, lastLogin: null, active: false, daysUntilReset: 7 };

  const lastWeek = state.lastLoginWeek ?? weekKey(new Date(`${state.lastLogin}T12:00:00`));
  const weeksSinceLogin = Math.round((weekStart(asOf) - weekStart(new Date(`${lastWeek}T12:00:00`))) / (7 * 24 * 60 * 60 * 1000));
  const active = weeksSinceLogin >= 0 && weeksSinceLogin <= 1;
  return { current: active ? state.current : 0, lastLogin: state.lastLogin, active, daysUntilReset: 7 };
}

export function recordWeeklyLogin(userId: string, asOf: Date = new Date()): WeeklyLoginStreak {
  const key = `phasetwo:weekly-login:${userId}`;
  const todayKey = `${asOf.getFullYear()}-${String(asOf.getMonth() + 1).padStart(2, "0")}-${String(asOf.getDate()).padStart(2, "0")}`;
  const thisWeek = weekKey(asOf);
  const previous = read<{ current: number; lastLogin: string | null; lastLoginWeek?: string }>(key, { current: 0, lastLogin: null });

  if (!previous.lastLogin) {
    const next = { current: 1, lastLogin: todayKey, lastLoginWeek: thisWeek };
    write(key, next);
    return { ...next, active: true, daysUntilReset: 7 };
  }

  const lastWeek = previous.lastLoginWeek ?? weekKey(new Date(`${previous.lastLogin}T12:00:00`));
  const weeksSinceLogin = Math.round((weekStart(asOf) - weekStart(new Date(`${lastWeek}T12:00:00`))) / (7 * 24 * 60 * 60 * 1000));
  const current = weeksSinceLogin === 0
    ? previous.current
    : weeksSinceLogin === 1
      ? previous.current + 1
      : 1;
  const next = { current, lastLogin: todayKey, lastLoginWeek: thisWeek };

  write(key, next);
  return { ...next, active: true, daysUntilReset: 7 };
}
