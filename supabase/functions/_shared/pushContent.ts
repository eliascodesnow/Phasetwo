// PUSH notification content and scheduling rules.
//
// Push is for short nudges that are still safe to read on a lock screen: period reminders, a PMS
// heads-up, and an occasional gentle idea for the day that fits the current phase. Anything longer,
// educational, or sensitive (fertility, mood, health warnings) lives in the app instead:
// see src/lib/notificationContent.ts. Keep the two files separate on purpose.
//
// This file is plain TypeScript (no Deno globals, no URL imports) so it can be unit tested with Vitest.

export type PushKind = "period-2d" | "period-1d" | "period-due" | "pms-heads-up" | "phase-idea";

export interface PushProfile {
  lastPeriodStart?: string;
  periodStartDates?: string[];
  cycleLength?: number;
  timezone?: string;
}

export interface PushPrefs {
  /** "Period reminders": 2 days and 1 day before the predicted period. */
  periodReminders?: boolean;
  /** "Cycle tips": the extra nudges below. Off unless the person turns it on. */
  phaseTips?: boolean;
  role?: string;
}

export interface PushMessage {
  kind: PushKind;
  /**
   * Written to reminder_log.days_before. 2 and 1 are the period reminders; 5 is the PMS heads-up;
   * 0 is "period due today"; IDEA_CODE_BASE and up identify a phase idea (see IDEAS), with
   * period_start set to the day it was sent. Together with period_start this keeps each message to
   * once per cycle (or once per day for ideas).
   */
  daysBefore: number;
  /** reminder_log.period_start: the predicted period start (for 0, the cycle's own start). */
  periodStart: string;
  title: string;
  body: string;
  tag: string;
  url: string;
}

const MS_PER_DAY = 86_400_000;

/** Days before the predicted period that the PMS heads-up goes out. */
export const PMS_HEADS_UP_DAYS = 5;

/** Shortest cycle for which the PMS heads-up still makes sense (it would otherwise land on day 1). */
const MIN_CYCLE_FOR_PMS_HEADS_UP = 21;

export function dayDiff(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / MS_PER_DAY);
}

export function addDays(key: string, days: number): string {
  return new Date(Date.parse(`${key}T12:00:00Z`) + days * MS_PER_DAY).toISOString().slice(0, 10);
}

/** Today's calendar date (yyyy-mm-dd) in the person's own timezone. */
export function todayIn(timezone: string, now: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
    const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
    return `${get("year")}-${get("month")}-${get("day")}`;
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

export interface NextPeriod {
  /** Predicted start of the next period, yyyy-mm-dd. */
  date: string;
  daysAway: number;
  /** 1-indexed day of the current cycle. */
  cycleDay: number;
  cycleLength: number;
}

/** Mirrors the app: the cycle day wraps at the cycle length; the next start is the day after the cycle ends. */
export function nextPeriod(profile: PushProfile, today: string): NextPeriod | null {
  const starts = profile.periodStartDates ?? [];
  const last = profile.lastPeriodStart ?? starts[starts.length - 1];
  if (!starts.length || !last) return null;
  const cycleLength = profile.cycleLength || 28;
  const cycleDay = ((dayDiff(last, today) % cycleLength) + cycleLength) % cycleLength + 1;
  const daysAway = cycleLength - cycleDay + 1;
  return { date: addDays(today, daysAway), daysAway, cycleDay, cycleLength };
}

function formatWhen(date: string): string {
  return new Intl.DateTimeFormat("en", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
}

/**
 * The one push (if any) this person should get today. At most one per day: the trigger days
 * (5, 2 and 1 days before, and the due day) never coincide for a normal cycle length.
 */
export function selectPush(profile: PushProfile, today: string, prefs: PushPrefs): PushMessage | null {
  if (prefs.role === "partner") return null;
  const next = nextPeriod(profile, today);
  if (!next) return null;
  const url = "/";

  if (prefs.periodReminders && (next.daysAway === 2 || next.daysAway === 1)) {
    return {
      kind: next.daysAway === 1 ? "period-1d" : "period-2d",
      daysBefore: next.daysAway,
      periodStart: next.date,
      title: next.daysAway === 1 ? "Your period is expected tomorrow" : "Your period is expected in 2 days",
      body: `Around ${formatWhen(next.date)}.`,
      tag: `phasetwo-period-reminder-${next.daysAway}`,
      url,
    };
  }

  if (!prefs.phaseTips) return null;

  if (next.daysAway === PMS_HEADS_UP_DAYS && next.cycleLength >= MIN_CYCLE_FOR_PMS_HEADS_UP) {
    return {
      kind: "pms-heads-up",
      daysBefore: PMS_HEADS_UP_DAYS,
      periodStart: next.date,
      title: "Your period is about 5 days away",
      // Neutral wording on purpose: this can be read on a lock screen.
      body: "Some people feel more tired or bloated around now. A quick log helps you spot your own pattern.",
      tag: "phasetwo-pms-heads-up",
      url,
    };
  }

  if (next.cycleDay === 1) {
    return {
      kind: "period-due",
      daysBefore: 0,
      periodStart: today,
      title: "Your period may start today",
      body: "If cramps show up, heat, fluids and a regular meal can help. Log your start date when it begins.",
      tag: "phasetwo-period-due",
      url,
    };
  }

  return null;
}

// ---- Phase ideas ---------------------------------------------------------------------------------
//
// Occasional, gentle ideas for the day that fit where the person is in their cycle. They are chosen
// at random but tightly rate-limited so they never feel like spam. Wording rules:
//  - lock-screen safe: never names the phase, the period, fertility, mood or symptoms;
//  - suggestions, not predictions: nothing says how someone will feel;
//  - a mix of soft and lively, because energy varies from person to person;
//  - no assumptions about work, study or hobbies. Each idea carries tags so the hobbies survey can
//    later filter them to a person's own interests.

export type IdeaPhase = "menstrual" | "follicular" | "ovulatory" | "luteal";
export type IdeaTag = "cozy" | "creative" | "social" | "movement" | "outdoors" | "food" | "music" | "mindful";

export interface PhaseIdea {
  /** Stable. Stored in reminder_log.days_before, so never reuse or renumber. */
  code: number;
  phase: IdeaPhase;
  text: string;
  tags: IdeaTag[];
}

/** First reminder_log.days_before value used for phase ideas (0, 1, 2 and 5 are other messages). */
export const IDEA_CODE_BASE = 100;
/** Chance that an eligible day sends an idea. Combined with the limits below, roughly one every 4 days at most. */
export const IDEA_CHANCE = 0.4;
export const IDEA_MAX_PER_WEEK = 2;
export const IDEA_MIN_GAP_DAYS = 3;
/** An idea isn't repeated within this many days while the phase still has unused ones. */
export const IDEA_REPEAT_WINDOW_DAYS = 30;

export const IDEAS: PhaseIdea[] = [
  // Menstrual: slow, warm, comforting.
  { code: 101, phase: "menstrual", text: "Make a cozy corner with a blanket, a warm drink and a comfort show you love.", tags: ["cozy"] },
  { code: 102, phase: "menstrual", text: "A warm bath with your favorite scent, then your softest socks. Easy and lovely.", tags: ["cozy", "mindful"] },
  { code: 103, phase: "menstrual", text: "Put on a slow, gentle playlist and let the day start softly.", tags: ["music", "mindful"] },
  { code: 104, phase: "menstrual", text: "Make something warm and comforting to eat. A bowl of beans or lentils with a squeeze of lemon is cozy and nourishing.", tags: ["food", "cozy"] },
  { code: 105, phase: "menstrual", text: "Doodle, color, or flip through old photos. No goal, just enjoy it.", tags: ["creative"] },
  { code: 106, phase: "menstrual", text: "A slow stretch or a short stroll if you feel like it. Resting counts too.", tags: ["movement", "mindful"] },
  { code: 107, phase: "menstrual", text: "Send a friend a silly voice note. Connection can be low effort.", tags: ["social"] },
  { code: 108, phase: "menstrual", text: "Write down three small things that felt good this week.", tags: ["mindful", "creative"] },

  // Follicular: fresh, curious, trying things.
  { code: 111, phase: "follicular", text: "Try a new cafe, a new route home, or a new recipe. Little fresh things can be fun.", tags: ["food", "outdoors"] },
  { code: 112, phase: "follicular", text: "Rearrange a shelf or a corner of your room and make it feel brand new.", tags: ["creative", "cozy"] },
  { code: 113, phase: "follicular", text: "Make a new playlist and take it for a walk.", tags: ["music", "movement"] },
  { code: 114, phase: "follicular", text: "Start a small creative project: sketching, a collage, a vision board, or a craft you've been curious about.", tags: ["creative"] },
  { code: 115, phase: "follicular", text: "Invite a friend for a picnic or a bubble tea run.", tags: ["social", "food", "outdoors"] },
  { code: 116, phase: "follicular", text: "Dance around your room for one song. Then see if you want another.", tags: ["movement", "music"] },
  { code: 117, phase: "follicular", text: "Plan a mini outing: a market, a museum, or a sunset spot.", tags: ["outdoors", "social"] },
  { code: 118, phase: "follicular", text: "Give yourself twenty minutes with something you've been curious about, just for fun.", tags: ["creative", "mindful"] },

  // Ovulatory: sociable, bright, playful.
  { code: 121, phase: "ovulatory", text: "Meet a friend for coffee or dessert, or call someone you miss.", tags: ["social", "food"] },
  { code: 122, phase: "ovulatory", text: "Wear something that makes you feel great and take a few photos for fun.", tags: ["creative", "social"] },
  { code: 123, phase: "ovulatory", text: "Try a dance class, a bike ride, or a long walk if your body feels like moving.", tags: ["movement", "outdoors"] },
  { code: 124, phase: "ovulatory", text: "Sing along loudly to your favorite songs. The shower counts as a stage.", tags: ["music"] },
  { code: 125, phase: "ovulatory", text: "Host a tiny get-together with snacks, music and a board game.", tags: ["social", "food"] },
  { code: 126, phase: "ovulatory", text: "Go on a photo walk and capture three things that make you smile.", tags: ["outdoors", "creative"] },
  { code: 127, phase: "ovulatory", text: "Do something playful and a little bold, like a new hairstyle or a spontaneous plan.", tags: ["creative", "social"] },
  { code: 128, phase: "ovulatory", text: "Take your lunch or your drink outside and soak up some sun.", tags: ["outdoors", "mindful"] },

  // Luteal: winding down, nesting, treating yourself.
  { code: 131, phase: "luteal", text: "Bake something warm and share it, or enjoy it all yourself.", tags: ["food", "cozy"] },
  { code: 132, phase: "luteal", text: "Tidy one small space, light a candle, and enjoy the calm.", tags: ["cozy", "mindful"] },
  { code: 133, phase: "luteal", text: "Have a slow self-care evening with a face mask and a podcast.", tags: ["cozy", "mindful"] },
  { code: 134, phase: "luteal", text: "Re-watch a favorite film or start a cozy new series.", tags: ["cozy"] },
  { code: 135, phase: "luteal", text: "Take a gentle walk at golden hour, or do some easy yoga.", tags: ["movement", "outdoors"] },
  { code: 136, phase: "luteal", text: "Write yourself a short 'be kind to me' list for the next few days.", tags: ["mindful", "creative"] },
  { code: 137, phase: "luteal", text: "Craft night: knitting, painting, scrapbooking, or anything with your hands.", tags: ["creative", "cozy"] },
  { code: 138, phase: "luteal", text: "Choose an early night. Fresh sheets and a good book make it feel like a treat.", tags: ["cozy"] },
];

const IDEA_TITLES = ["A little idea for today", "Something nice to try", "Treat yourself a little", "A gentle idea for you"];

/** Same proportional phase boundaries the app uses (see phaseForDay in src/lib/cycleUtils.ts). */
const BASE_PHASES: Array<[IdeaPhase, number, number]> = [["menstrual", 1, 5], ["follicular", 6, 13], ["ovulatory", 14, 15], ["luteal", 16, 28]];

export function phaseOfDay(day: number, cycleLength: number): IdeaPhase {
  const scale = cycleLength / 28;
  for (const [phase, from, to] of BASE_PHASES) {
    const start = Math.round((from - 1) * scale) + 1;
    const end = phase === "luteal" ? cycleLength : Math.round(to * scale);
    if (day >= start && day <= end) return phase;
  }
  return "luteal";
}

/** Deterministic pseudo-random number in [0, 1) from a string (FNV-1a). Same seed, same answer. */
export function unitHash(seed: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) / 0x100000000;
}

export interface IdeaHistoryItem {
  code: number;
  /** The day it was sent, yyyy-mm-dd. */
  sentOn: string;
}

/**
 * Maybe an idea for today. Randomness is seeded by person and day, so a retry of the same run makes
 * the same decision. Never more than IDEA_MAX_PER_WEEK in 7 days, never closer than
 * IDEA_MIN_GAP_DAYS apart, and never on the first day of a period (that has its own message).
 */
export function selectPhaseIdea(profile: PushProfile, today: string, userId: string, history: IdeaHistoryItem[]): PushMessage | null {
  const next = nextPeriod(profile, today);
  if (!next || next.cycleDay === 1) return null;

  const ages = history.map((item) => dayDiff(item.sentOn, today)).filter((age) => age >= 0);
  if (ages.some((age) => age < IDEA_MIN_GAP_DAYS)) return null;
  if (ages.filter((age) => age < 7).length >= IDEA_MAX_PER_WEEK) return null;
  if (unitHash(`${userId}:${today}:send`) >= IDEA_CHANCE) return null;

  const pool = IDEAS.filter((idea) => idea.phase === phaseOfDay(next.cycleDay, next.cycleLength));
  const recent = new Set(history.filter((item) => dayDiff(item.sentOn, today) < IDEA_REPEAT_WINDOW_DAYS).map((item) => item.code));
  const fresh = pool.filter((idea) => !recent.has(idea.code));
  const choices = fresh.length ? fresh : pool;
  const idea = choices[Math.floor(unitHash(`${userId}:${today}:pick`) * choices.length)];
  const title = IDEA_TITLES[Math.floor(unitHash(`${userId}:${today}:title`) * IDEA_TITLES.length)];

  return { kind: "phase-idea", daysBefore: idea.code, periodStart: today, title, body: idea.text, tag: "phasetwo-idea", url: "/" };
}

/** Everything that could be pushed today, in priority order: the period messages first, then at most one idea. */
export function selectDailyPush(profile: PushProfile, today: string, prefs: PushPrefs, userId: string, history: IdeaHistoryItem[]): PushMessage | null {
  const message = selectPush(profile, today, prefs);
  if (message) return message;
  if (!prefs.phaseTips || prefs.role === "partner") return null;
  return selectPhaseIdea(profile, today, userId, history);
}
