export type TourView = "today" | "calendar" | "planner" | "history" | "report" | "settings";
export type TourRole = "self" | "partner";
export type TourIcon =
  | "welcome" | "chart" | "period" | "checkin" | "calendar" | "planner" | "history"
  | "report" | "bella" | "patterns" | "partner" | "settings" | "done";

export interface TourStep {
  id: string;
  title: string;
  body: string;
  /** Short bullet points shown under the body. */
  points?: string[];
  /** The screen shown behind the tour while this step is open. */
  view: TourView;
  icon: TourIcon;
  /** Who sees the step. Defaults to everyone. */
  audience?: TourRole;
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: "welcome",
    title: "Welcome to PhaseTwo",
    body: "PhaseTwo helps you understand your cycle, log how you feel, and prepare for appointments. This tour takes about a minute. You can skip it at any time and replay it from Settings.",
    view: "today",
    icon: "welcome",
  },
  {
    id: "chart",
    title: "Your cycle at a glance",
    body: "The chart on Today shows where you are in your cycle. The coloured bands are the four phases, the curve is typical energy, and the Today marker shows your current day.",
    points: [
      "Your estimated next period date and a countdown sit at the top right.",
      "Until you log a real period start, the chart uses a default 28-day cycle, so treat it as an estimate.",
      "Phases are a loose reference. Everyone's cycle is different.",
    ],
    view: "today",
    icon: "chart",
    audience: "self",
  },
  {
    id: "log-period",
    title: "How to log your period",
    body: "Log the first day of bleeding. Every start you record makes your predictions more personal.",
    points: [
      "Fastest: tap Record period on Today to log a start for today.",
      "Missed a day? Tap the date on the calendar (today or earlier), then tap Record period start.",
      "Made a mistake? Edit or remove a period start in History, or change your most recent date in Settings.",
      "Your cycle length is averaged from your last six recorded cycles.",
    ],
    view: "today",
    icon: "period",
    audience: "self",
  },
  {
    id: "check-in",
    title: "Daily check-in",
    body: "Under the calendar, record how you feel: pain from 0 to 10, bleeding, other symptoms, optional pain locations and notes. Pick a date to fill in a day you missed.",
    points: [
      "Save your check-in to add it to your history.",
      "Check-ins are private to your account, or to this device if you are not signed in.",
    ],
    view: "today",
    icon: "checkin",
    audience: "self",
  },
  {
    id: "calendar",
    title: "Calendar",
    body: "See recorded period days, estimated upcoming days, and the days you logged pain. Tap any day to see its details.",
    points: ["Estimated days are a guide based on your past cycles, not a forecast."],
    view: "calendar",
    icon: "calendar",
    audience: "self",
  },
  {
    id: "planner",
    title: "Planner",
    body: "Add tasks and see which cycle phase usually suits each one best. Suggestions are flexible, so move things whenever you like.",
    view: "planner",
    icon: "planner",
  },
  {
    id: "history",
    title: "History",
    body: "Your period starts and daily check-ins in one place. Tap a check-in to edit it, or edit or remove a period start.",
    view: "history",
    icon: "history",
    audience: "self",
  },
  {
    id: "report",
    title: "Health report",
    body: "A summary of your recorded cycle and symptom history that you can print or download and share with your doctor. Review it before sharing.",
    points: ["On your phone, find it under More, then Health report."],
    view: "report",
    icon: "report",
    audience: "self",
  },
  {
    id: "bella",
    title: "Ask Bella",
    body: "The Ask Bella button at the bottom right answers menstrual health questions. It offers information, not a diagnosis.",
    points: [
      "When a question needs personal context, Bella sees only recent structured symptom entries and pattern counts.",
      "Your notes and account details are never sent to Bella.",
    ],
    view: "today",
    icon: "bella",
    audience: "self",
  },
  {
    id: "patterns",
    title: "Patterns worth discussing",
    body: "At the bottom of Today, PhaseTwo highlights patterns in your logs, such as pain that is getting worse over several cycles, and helps you prepare an appointment summary to download.",
    points: ["This is awareness to take to a clinician, not a diagnosis."],
    view: "today",
    icon: "patterns",
    audience: "self",
  },
  {
    id: "partner-cycle",
    title: "Your partner's cycle",
    body: "Today shows your partner's cycle: the current phase and the estimated next period.",
    points: [
      "Only cycle dates and length are shared with you.",
      "Their symptom logs, notes and account data stay private.",
    ],
    view: "today",
    icon: "partner",
    audience: "partner",
  },
  {
    id: "partner-support",
    title: "Remote sync and partner advice",
    body: "Remote sync shows ideas for supporting your partner today. The Partner advice button opens a chat for more suggestions.",
    points: ["These are suggestions, not predictions of how your partner feels. Ask what would feel good."],
    view: "today",
    icon: "partner",
    audience: "partner",
  },
  {
    id: "partner-sync",
    title: "Partner sync",
    body: "In Settings, invite your partner by account email and share the single-use code. It expires after 14 days. Once they enter it, they can see your cycle dates and length.",
    points: [
      "Your symptom logs, notes and account data stay private.",
      "You need to be signed in to send an invitation.",
    ],
    view: "settings",
    icon: "partner",
    audience: "self",
  },
  {
    id: "settings",
    title: "Reminders and settings",
    body: "Turn on Period reminders to get a notification 2 days and 1 day before your predicted period. You can also change the theme here, and your cycle length and period duration if you track your own cycle.",
    points: [
      "Reminders appear when PhaseTwo is installed or open on this device.",
      "Replay this tour from Settings whenever you like.",
    ],
    view: "settings",
    icon: "settings",
  },
  {
    id: "done",
    title: "You're all set",
    body: "Start by recording your most recent period: tap Record period on Today.",
    view: "today",
    icon: "done",
  },
];

/** The steps a given user should see: shared steps plus the ones for their role. */
export function tourStepsFor(role: TourRole): TourStep[] {
  return TOUR_STEPS.filter((step) => !step.audience || step.audience === role);
}
