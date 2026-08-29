import { GoogleGenAI } from "@google/genai";
import type { ChatMessage, CycleProfile, PhaseInfo, UserRole } from "../types";

const MODEL = "gemini-2.5-flash";

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
  apiKey: string;
  systemPrompt: string;
  history: ChatMessage[];
  message: string;
}

export async function sendChatMessage({
  apiKey,
  systemPrompt,
  history,
  message,
}: SendMessageParams): Promise<string> {
  if (!apiKey) {
    throw new Error("MISSING_API_KEY");
  }

  const ai = new GoogleGenAI({ apiKey });

  const contents = [
    ...history.map((m) => ({
      role: m.role,
      parts: [{ text: m.text }],
    })),
    { role: "user" as const, parts: [{ text: message }] },
  ];

  const response = await ai.models.generateContent({
    model: MODEL,
    contents,
    config: {
      systemInstruction: systemPrompt,
      temperature: 0.7,
      maxOutputTokens: 512,
    },
  });

  const text = response.text;
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
