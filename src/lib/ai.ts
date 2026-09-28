import { createClient } from "@supabase/supabase-js";
import type { ChatMessage, CycleProfile, PhaseInfo, UserRole } from "../types";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL ?? "",
  import.meta.env.VITE_SUPABASE_ANON_KEY ?? ""
);

export function buildSystemPrompt(
  profile: CycleProfile,
  phase: PhaseInfo,
  cycleDay: number,
  role: UserRole
): string {
  const subject = role === "partner" ? profile.ownerLabel || "your partner" : "the user";
  const audience =
    role === "partner"
      ? `You are advising the user on how to support ${subject}, who is on Day ${cycleDay} of her cycle — ${phase.label} phase.`
      : `You are advising the user directly about their own Day ${cycleDay}, ${phase.label} phase.`;

  return [
    "You are the PhaseTwo Partner Advice Bot: a grounded, practical, empathetic assistant.",
    audience,
    `Current context: Day ${cycleDay} of a ${profile.cycleLength}-day cycle — ${phase.label} phase (${phase.energy} energy).`,
    `Biological summary: ${phase.summary}`,
    "Give specific, actionable suggestions — support gestures, meal ideas, or emotional check-ins — tuned to this phase.",
    "Keep responses concise (3-6 sentences or a short list). Never make medical claims or diagnoses. Avoid generic platitudes.",
    "If asked something unrelated to the relationship, cycle, or care, answer briefly and steer back to being useful for this context.",
  ].join("\n");
}

export interface SendMessageParams {
  systemPrompt: string;
  history: ChatMessage[];
  message: string;
  requiresPlus?: boolean;
}

export async function sendChatMessage({
  systemPrompt,
  history,
  message,
  requiresPlus = false,
}: SendMessageParams): Promise<string> {
  const { data, error } = await supabase.functions.invoke<{ text?: string; error?: string }>("ai-chat", {
    body: {
      systemPrompt,
      history,
      message,
      requiresPlus,
    },
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
