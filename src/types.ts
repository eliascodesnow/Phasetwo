export type Phase = "menstrual" | "follicular" | "ovulatory" | "luteal";

export type UserRole = "self" | "partner";

export interface CycleProfile {
  /** ISO date (yyyy-mm-dd) of the most recent period start */
  lastPeriodStart: string;
  cycleLength: number; // default 28
  periodLength: number; // default 5, used for menstrual window
  /** Display name for the person whose cycle this is — "You" or her name */
  ownerLabel: string;
  /** Owner's IANA timezone, used by the LDR header */
  timezone: string;
  /** City, used for care-package prompts */
  city: string;
}

export interface SelfProfile {
  timezone: string;
}

export type TaskStatus = "todo" | "in_progress" | "done";

export interface Task {
  id: string;
  title: string;
  recommendedPhases: Phase[];
  status: TaskStatus;
  createdAt: number;
}

export interface ChatMessage {
  id: string;
  role: "user" | "model";
  text: string;
  createdAt: number;
}

export interface PhaseInfo {
  key: Phase;
  label: string;
  dayRange: [number, number];
  energy: "low" | "rising" | "peak" | "winding down";
  summary: string;
}

export interface AppSettings {
  role: UserRole;
  geminiApiKey: string; // stored locally only
  ldrEnabled: boolean;
}
