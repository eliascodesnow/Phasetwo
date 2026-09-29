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
  openRouterApiKey: "",
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
    const legacySettings = read<AppSettings & { geminiApiKey?: string }>(KEYS.settings, defaultSettings);
    const migratedSettings: AppSettings = {
      ...defaultSettings,
      ...legacySettings,
      openRouterApiKey: legacySettings.openRouterApiKey ?? legacySettings.geminiApiKey ?? "",
    };

    if (legacySettings.geminiApiKey && !legacySettings.openRouterApiKey) {
      write(KEYS.settings, migratedSettings);
    }

    return migratedSettings;
  },
  saveSettings: (v: AppSettings) => write(KEYS.settings, v),

  loadChat: () => read<ChatMessage[]>(KEYS.chat, []),
  saveChat: (v: ChatMessage[]) => write(KEYS.chat, v),
};

const USER_STATE_PREFIX = "phasetwo:user-state:";
const LEGACY_IMPORT_KEY = "phasetwo:legacy-state-imported";

export function loadLocalAppState(userId: string): UserAppState {
  const accountState = read<UserAppState | null>(`${USER_STATE_PREFIX}${userId}`, null);
  if (accountState) {
    return {
      cycleProfile: { ...defaultCycleProfile, ...accountState.cycleProfile },
      tasks: accountState.tasks ?? [],
      appSettings: { ...defaultSettings, ...accountState.appSettings },
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
    appSettings: storage.loadSettings(),
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
