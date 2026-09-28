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
  geminiApiKey: "",
  ldrEnabled: false,
};

export const storage = {
  loadCycle: () => read<CycleProfile>(KEYS.cycle, defaultCycleProfile),
  saveCycle: (v: CycleProfile) => write(KEYS.cycle, v),

  loadTasks: () => read<Task[]>(KEYS.tasks, []),
  saveTasks: (v: Task[]) => write(KEYS.tasks, v),

  loadSettings: () => read<AppSettings>(KEYS.settings, defaultSettings),
  saveSettings: (v: AppSettings) => write(KEYS.settings, v),

  loadChat: () => read<ChatMessage[]>(KEYS.chat, []),
  saveChat: (v: ChatMessage[]) => write(KEYS.chat, v),
};
