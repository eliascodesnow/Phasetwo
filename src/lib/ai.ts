import type { ChatMessage, CycleProfile, PhaseInfo, UserRole } from "../types";
import { supabase } from "./supabase";

/** The structured context the server turns into the assistant's system prompt (the client never sends a prompt). */
export interface AdviceContext {
  role: UserRole;
  cycleDay: number;
  cycleLength: number;
  phase: PhaseInfo["key"];
  ownerLabel: string;
}

export function buildAdviceContext(profile: CycleProfile, phase: PhaseInfo, cycleDay: number, role: UserRole): AdviceContext {
  return { role, cycleDay, cycleLength: profile.cycleLength, phase: phase.key, ownerLabel: role === "partner" ? profile.ownerLabel ?? "" : "" };
}

export interface SendMessageParams {
  context: AdviceContext;
  history: ChatMessage[];
  message: string;
}

export async function sendChatMessage({ context, history, message }: SendMessageParams): Promise<string> {
  if (!supabase) {
    throw new Error("AI service is not configured. Add your Supabase environment variables.");
  }

  const { data, error } = await supabase.functions.invoke<{ text?: string; error?: string }>("ai-chat", {
    body: { context, history: history.map(({ role, text }) => ({ role, text })), message },
  });

  if (error) {
    const status = typeof error === "object" && error && "status" in error ? Number(error.status) : undefined;
    const messageText = typeof error === "string" ? error : error?.message ?? "SERVER_ERROR";

    if (status === 429 || /RATE_LIMITED|limit/i.test(messageText)) {
      throw new Error("You've hit today's limit");
    }

    if (status === 402 || /SUBSCRIPTION_REQUIRED/i.test(messageText)) {
      throw new Error("SUBSCRIPTION_REQUIRED");
    }

    if (status === 401 || /UNAUTHENTICATED/i.test(messageText)) {
      throw new Error("UNAUTHENTICATED");
    }

    if (status === 502 || /EMPTY_RESPONSE/i.test(messageText)) {
      throw new Error("EMPTY_RESPONSE");
    }

    throw new Error(messageText || "SERVER_ERROR");
  }

  const text = data?.text;
  if (!text) {
    throw new Error("EMPTY_RESPONSE");
  }

  return text;
}

/** Quick-prompt templates for the Distance Care Package trigger. */
export function carePackagePrompt(profile: CycleProfile, phase: PhaseInfo): string {
  const city = profile.city ? ` in ${profile.city}` : " in her city";
  return `Suggest a surprise food delivery order suited for ${
    profile.ownerLabel || "her"
  }'s current ${phase.label} phase cravings${city}. Keep it to 3 concrete options with a one-line reason each.`;
}
