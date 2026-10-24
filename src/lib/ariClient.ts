import {
  ARI_MAX_OTHER_LENGTH,
  ARI_OTHER_KEY,
  ARI_PHASE_GUIDE,
  ARI_RELATIONSHIPS,
  cleanOtherLabel,
  type AriPhase,
} from "../../supabase/functions/_shared/ariPrompt";

export { ARI_MAX_OTHER_LENGTH, ARI_OTHER_KEY, ARI_PHASE_GUIDE, ARI_RELATIONSHIPS };
export type { AriPhase };

export const ARI_NAME = "Ari";
export const ARI_PRODUCT_NAME = "Ari Knows";
const STORAGE_KEY = "phasetwo.ari.relationship";

export interface AriRelationshipChoice { key: string; other?: string }

export function isValidChoice(choice: AriRelationshipChoice | null | undefined): choice is AriRelationshipChoice {
  if (!choice) return false;
  const found = ARI_RELATIONSHIPS.find((item) => item.key === choice.key);
  if (!found) return false;
  return found.key !== ARI_OTHER_KEY || cleanOtherLabel(choice.other).length > 0;
}

export function choiceLabel(choice: AriRelationshipChoice): string {
  if (choice.key === ARI_OTHER_KEY) return cleanOtherLabel(choice.other);
  return ARI_RELATIONSHIPS.find((item) => item.key === choice.key)?.label ?? "";
}

export function loadChoice(): AriRelationshipChoice | null {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null") as AriRelationshipChoice | null;
    if (!isValidChoice(parsed)) return null;
    return parsed.key === ARI_OTHER_KEY ? { key: parsed.key, other: cleanOtherLabel(parsed.other) } : { key: parsed.key };
  } catch {
    return null;
  }
}

export function saveChoice(choice: AriRelationshipChoice | null): void {
  try {
    if (choice && isValidChoice(choice)) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(choice));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // storage can be unavailable; the choice just will not persist
  }
}

export function ariFriendlyError(status?: number): string {
  if (status === 401) return "Please sign in again to chat with Ari.";
  if (status === 403) return "Ari needs an accepted invite to see the cycle dates your person shared.";
  if (status === 429) return "You’ve reached today’s Ari message limit. Please come back tomorrow.";
  return "Ari is temporarily unavailable. Please try again shortly.";
}

/** Static phase education, shown instantly and used offline. */
export function ariPhaseLesson(phase: AriPhase): string {
  const guide = ARI_PHASE_GUIDE[phase];
  return [
    `What’s happening: ${guide.body}`,
    `Often felt: ${guide.common}`,
    `Moods some people report: ${guide.moods}`,
    `How to help: ${guide.help}`,
  ].join("\n\n");
}

export const ARI_SUGGESTED_PROMPTS = [
  "What should I expect this week?",
  "What can I do to help today?",
  "How do I check in without being annoying?",
  "They seem irritable. What do I do?",
];
