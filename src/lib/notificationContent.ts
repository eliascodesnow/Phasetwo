// IN-APP notices: the longer, educational layer shown on the Today screen.
//
// Content comes from the "complete menstrual cycle guide" reference. Its own rule is followed
// throughout: say what *may* happen, label dates as estimates, and never present a calendar
// guess as a fact about someone's body or mood.
//
// Push notifications are a different, deliberately smaller channel with their own file:
// supabase/functions/_shared/pushContent.ts. Anything sensitive (fertility, mood, health warnings)
// belongs here and not on a lock screen.
import type { CycleProfile, Phase } from "../types";
import { currentCycleDay, currentPhase, dateKey } from "./cycleUtils";
import type { SymptomLog } from "./symptoms";

export type NoticeKind = "attention" | "phase" | "tip";

export interface NoticeSource {
  label: string;
  url: string;
}

export interface InAppNotice {
  /** Stable and scoped (per cycle or per day), so each notice is shown and dismissed once. */
  id: string;
  kind: NoticeKind;
  /** Lower shows first. */
  priority: number;
  phase?: Phase;
  title: string;
  body: string;
  tips?: string[];
  /** A "when to get help" line, shown separately so it is not lost among the tips. */
  caution?: string;
  source?: NoticeSource;
}

export interface InAppContext {
  profile: CycleProfile;
  role: "self" | "partner";
  /** Symptom history. Only used to spot patterns worth a gentle heads-up; never leaves the device. */
  logs?: SymptomLog[];
  asOf?: Date;
}

const NHS: NoticeSource = { label: "NHS", url: "https://www.nhs.uk/conditions/periods/fertility-in-the-menstrual-cycle/" };
const ACOG_PMS: NoticeSource = { label: "ACOG", url: "https://www.acog.org/womens-health/faqs/Premenstrual-Syndrome" };
const OWH: NoticeSource = { label: "Office on Women's Health", url: "https://womenshealth.gov/pregnancy/menstrual-cycle" };

/** How close to the predicted period the "PMS window" notice replaces the general luteal one. */
export const PMS_WINDOW_DAYS = 5;

interface PhaseCopy {
  title: string;
  body: string;
  tips: string[];
  caution?: string;
  source: NoticeSource;
  /** `{name}` is replaced with the person's name, or "Your partner". */
  partnerBody: string;
}

type PhaseCopyKey = Phase | "pms";

const PHASE_COPY: Record<PhaseCopyKey, PhaseCopy> = {
  menstrual: {
    title: "Menstrual phase (estimated)",
    body: "Bleeding usually lasts about 2–7 days. Cramps, tiredness and headaches are common, but plenty of people feel fine. How you feel is a better guide than the calendar.",
    tips: [
      "A warm bath or heating pad can ease cramps.",
      "Light or moderate exercise is fine if you feel up to it. There is no medical reason to avoid running, swimming or strength training.",
      "Add iron-rich foods like beans, lentils, leafy greens or fortified cereal, and pair plant sources with vitamin C.",
    ],
    caution: "See a clinician if period pain regularly stops you doing normal activities, bleeding often lasts over 7 days, or you change a pad or tampon every 1–2 hours.",
    source: OWH,
    partnerBody: "{name} is likely in the menstrual phase (an estimate). Cramps, tiredness and headaches are common, though not everyone has them. Ask what would help rather than assuming. Heat, a meal or some quiet can go a long way.",
  },
  follicular: {
    title: "Follicular phase (estimated)",
    body: "Many people feel more energetic as period symptoms settle, though it isn't guaranteed. Estrogen rises while the body prepares to release an egg.",
    tips: [
      "If your focus is good, it's a fine time for demanding study, coding or planning. Go by how you actually feel.",
      "Keep sleep regular even when energy is high.",
      "No special follicular diet is needed. Balanced meals with protein, whole grains, fruit and vegetables cover it.",
    ],
    caution: "If your energy stays low all month, other causes are worth checking rather than blaming your hormones.",
    source: OWH,
    partnerBody: "{name} may be feeling more energetic as period symptoms ease (an estimate, and not everyone does). A good time for plans if they're up for it. Let them set the pace.",
  },
  ovulatory: {
    title: "Estimated ovulation window",
    body: "Ovulation usually happens about 12–16 days before the next period, and the fertile window lasts several days around it. This is a calendar estimate. It can't confirm that ovulation happened.",
    tips: [
      "You may notice clearer, stretchier discharge or a mild one-sided twinge. Some people notice nothing, and that's normal too.",
      "Pregnancy is possible from sex in the days before ovulation, not only on the day. To avoid pregnancy, use reliable contraception rather than an app's prediction.",
      "Some people feel more sociable around now. Keep your usual routine and training if that suits you.",
    ],
    caution: "Severe or lasting pelvic pain, fever or fainting isn't just ovulation. Get it checked, and seek urgent care for sudden severe pain.",
    source: NHS,
    partnerBody: "This is around the middle of {name}'s cycle (estimated). Some people feel more sociable here and others notice no change. Let them lead.",
  },
  luteal: {
    title: "Luteal phase (estimated)",
    body: "Progesterone rises after ovulation, then falls if there is no pregnancy. Some people notice bloating, breast tenderness or poorer sleep. Others feel the same all month.",
    tips: [
      "If cravings show up, steady meals and planned snacks work better than strict restriction.",
      "Regular movement across the whole month helps more than training hard in only one phase.",
      "Break big tasks into smaller blocks if concentration dips, and carry on as usual if it doesn't.",
    ],
    source: OWH,
    partnerBody: "{name} is likely in the second half of the cycle (an estimate). Some people notice bloating, tiredness or a lower mood before a period, and many notice nothing. Practical help and fewer demands can be kind. Ask first.",
  },
  pms: {
    title: "PMS window (estimated)",
    body: "Premenstrual symptoms are physical or emotional changes that come before a period and ease once it starts. Not everyone gets them.",
    tips: [
      "Log how you feel each day. Two cycles of daily notes help a clinician tell PMS from something else.",
      "If caffeine worsens anxiety or sleep, try cutting back later in the day, and keep a regular bedtime.",
      "Don't assume magnesium, vitamin B6 or other supplements will fix PMS. High doses can cause harm, so check with a clinician or pharmacist.",
    ],
    caution: "If mood symptoms feel severe, or you have thoughts of suicide or self-harm, seek mental-health support promptly. This can be PMDD, a severe form of PMS, and effective treatment exists.",
    source: ACOG_PMS,
    partnerBody: "A period is expected soon for {name} (an estimate). Some people feel more tired or on edge beforehand and it usually eases once bleeding starts. Check in, and don't assume how they feel.",
  },
};

/** One short fact per day when nothing more important is waiting. */
export const TIPS: Array<{ title: string; body: string; source?: NoticeSource }> = [
  {
    title: "Day 1 is the first day of bleeding",
    body: "The cycle runs until the day before your next period. A typical adult cycle is roughly 21–35 days, and phase lengths vary from person to person.",
    source: NHS,
  },
  {
    title: "Predictions are estimates",
    body: "A calendar can't tell you that you are ovulating today. Illness, stress, irregular cycles and hormonal contraception all change the picture, and some contraceptives stop ovulation altogether.",
    source: NHS,
  },
  {
    title: "Your own pattern beats the average",
    body: "Hormones can influence symptoms, but they don't dictate your mood or productivity. Notes from your own cycles are more useful than generic phase advice.",
  },
  {
    title: "A period doesn't prevent pregnancy",
    body: "Sperm can survive for several days and early ovulation is possible, especially with shorter cycles. Use contraception if you don't want to get pregnant.",
    source: NHS,
  },
  {
    title: "Exercise during your period is fine",
    body: "There is no medical requirement to avoid running, strength training or swimming while bleeding. Comfort and energy decide what works for you.",
    source: OWH,
  },
  {
    title: "No special diet for each phase",
    body: "Balanced meals, enough fluids and regular sleep cover every phase. Be cautious with \"hormone-balancing\" supplements: high doses of some, including iron and B6, can cause harm.",
    source: ACOG_PMS,
  },
  {
    title: "Pair plant iron with vitamin C",
    body: "Beans, lentils and leafy greens give more iron when eaten with a vitamin C source such as citrus, tomatoes or peppers. Don't take iron supplements without a reason.",
  },
  {
    title: "Body temperature confirms ovulation afterwards",
    body: "Basal body temperature usually rises slightly after ovulation. That helps you see a pattern looking back. It can't predict ovulation in advance.",
    source: NHS,
  },
  {
    title: "A mid-cycle twinge can be normal",
    body: "Some people feel mild, short-lived pain on one side of the lower abdomen around ovulation. Severe or lasting pain isn't just ovulation and deserves a check.",
    source: NHS,
  },
];

function partnerName(profile: CycleProfile): string {
  const name = profile.ownerLabel?.trim();
  return !name || name === "You" ? "Your partner" : name;
}

function localDate(asOf: Date, offsetDays = 0): Date {
  return new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate() + offsetDays);
}

/** Calendar days between two yyyy-mm-dd keys (noon-anchored, so safe across DST). */
function keyDays(from: string, to: string): number {
  return Math.round((new Date(`${to.slice(0, 10)}T12:00:00`).getTime() - new Date(`${from.slice(0, 10)}T12:00:00`).getTime()) / 86_400_000);
}

function phaseNotice(ctx: InAppContext, cycleStart: string, today: Date): InAppNotice {
  const { profile, role } = ctx;
  const cycleLength = profile.cycleLength || 28;
  const day = currentCycleDay(profile, today);
  const phase = currentPhase(profile, today).key;
  const daysUntil = cycleLength - day + 1;
  const inPmsWindow = phase === "luteal" && daysUntil <= PMS_WINDOW_DAYS && cycleLength >= 21;
  const key: PhaseCopyKey = inPmsWindow ? "pms" : phase;
  const copy = PHASE_COPY[key];
  const base = { id: `phase:${key}:${cycleStart}`, kind: "phase" as const, priority: 20, phase, title: copy.title, source: copy.source };

  if (role === "partner") {
    return { ...base, body: copy.partnerBody.replace("{name}", partnerName(profile)) };
  }
  const body = key === "pms" ? `Your period is expected in about ${daysUntil} ${daysUntil === 1 ? "day" : "days"}. ${copy.body}` : copy.body;
  return { ...base, body, tips: copy.tips, caution: copy.caution };
}

/**
 * Signals worth a gentle heads-up, built only from what the person has recorded. These never go to
 * push: they are about someone's health and need the room to explain themselves.
 */
function attentionNotices(ctx: InAppContext, cycleStart: string, today: Date): InAppNotice[] {
  const { profile, logs = [] } = ctx;
  const notices: InAppNotice[] = [];
  const starts = [...(profile.periodStartDates ?? [])].sort();

  const recentCycles = starts.slice(1).map((start, index) => keyDays(starts[index], start)).slice(-3);
  if (recentCycles.filter((days) => days < 21 || days > 35).length >= 2) {
    notices.push({
      id: `attention:irregular:${cycleStart}`,
      kind: "attention",
      priority: 10,
      title: "Your recent cycles look uneven",
      body: "Two of your last few cycles fell outside the typical adult range of about 21–35 days. Variation is common and has many causes. If this is new for you, or comes with big changes in bleeding, it's worth mentioning to a clinician. Your logs make that conversation easier.",
      source: OWH,
    });
  }

  const spans = starts.slice(-3).flatMap((start) => {
    const end = profile.periodEnds?.[start];
    return end && end >= start ? [keyDays(start, end) + 1] : [];
  });
  if (spans.filter((days) => days > 7).length >= 2) {
    notices.push({
      id: `attention:long-period:${cycleStart}`,
      kind: "attention",
      priority: 10,
      title: "Your periods have run longer than 7 days",
      body: "You've recorded more than one period lasting over a week. Bleeding that repeatedly goes past 7 days is worth a medical check, especially if you also feel unusually tired or dizzy.",
      source: OWH,
    });
  }

  const weekAgo = dateKey(localDate(today, -6));
  const heavyDays = new Set(logs.filter((log) => log.bleeding === "heavy" && log.log_date.slice(0, 10) >= weekAgo).map((log) => log.log_date.slice(0, 10)));
  if (heavyDays.size >= 3) {
    notices.push({
      id: `attention:heavy:${cycleStart}`,
      kind: "attention",
      priority: 10,
      title: "You've logged several heavy days",
      body: "Heavy bleeding can wear down your iron over time. See a clinician if you need to change a pad or tampon every 1–2 hours, or if you feel tired or dizzy much of the time.",
      caution: "Very heavy bleeding with fainting, chest pain or shortness of breath needs urgent medical care.",
      source: OWH,
    });
  }

  return notices;
}

function tipNotice(today: Date): InAppNotice {
  const dayNumber = Math.floor(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) / 86_400_000);
  const index = ((dayNumber % TIPS.length) + TIPS.length) % TIPS.length;
  const tip = TIPS[index];
  return { id: `tip:${index}:${dateKey(today)}`, kind: "tip", priority: 90, title: tip.title, body: tip.body, source: tip.source };
}

/** Every notice that applies today, most important first. */
export function inAppNotices(ctx: InAppContext): InAppNotice[] {
  const today = localDate(ctx.asOf ?? new Date());
  const cycleStart = dateKey(localDate(today, -(currentCycleDay(ctx.profile, today) - 1)));
  const notices: InAppNotice[] = [phaseNotice(ctx, cycleStart, today)];
  if (ctx.role === "self") {
    notices.push(...attentionNotices(ctx, cycleStart, today), tipNotice(today));
  }
  return notices.sort((a, b) => a.priority - b.priority);
}

/** The single notice to show right now, skipping any already dismissed. */
export function nextInAppNotice(ctx: InAppContext, seen: ReadonlySet<string>): InAppNotice | null {
  return inAppNotices(ctx).find((notice) => !seen.has(notice.id)) ?? null;
}

// ---- Dismissed notices (this device only) -------------------------------------------------------

const SEEN_LIMIT = 60;
const seenKey = (userId: string) => `phasetwo:inapp-notices:${userId}`;

export function readSeenNotices(userId: string): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(seenKey(userId)) ?? "[]");
    return new Set(Array.isArray(raw) ? raw.filter((id): id is string => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

/** Remembers a dismissed notice, keeping only the most recent ones so storage stays small. */
export function markNoticeSeen(userId: string, id: string): Set<string> {
  const seen = readSeenNotices(userId);
  seen.delete(id);
  seen.add(id);
  const kept = [...seen].slice(-SEEN_LIMIT);
  try { localStorage.setItem(seenKey(userId), JSON.stringify(kept)); } catch { /* storage unavailable */ }
  return new Set(kept);
}
