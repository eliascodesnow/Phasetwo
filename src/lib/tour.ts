export type TourRole = "self" | "partner";

/** Keeps the tour short. Enforced by a test. */
export const MAX_TOUR_STEPS = 7;

export type TourRowIcon = "calendar" | "planner" | "history" | "report" | "settings";

export interface TourRow {
  icon: TourRowIcon;
  label: string;
  text: string;
}

export interface TourStep {
  id: string;
  title: string;
  /** One or two short sentences about how the highlighted button or area works. */
  body: string;
  /** Short extra lines under the body. */
  tips?: string[];
  /** One row per button, for a step that points at a group of buttons. */
  rows?: TourRow[];
  /**
   * The `data-tour` value of the element this step points at. If that element is not on screen,
   * the step is shown as a centred card instead.
   */
  target: string;
  /** Who sees the step. */
  audience: TourRole;
}

export const TOUR_STEPS: TourStep[] = [
  // People tracking their own cycle
  {
    id: "log-period",
    title: "Start here: log your period",
    body: "Tap Period started on the first day of bleeding. It records today and updates your predicted next period.",
    tips: [
      "Missed a day? Open Calendar, tap that date, then tap Record period start.",
      "Entered the wrong date? Edit or remove it in History.",
    ],
    target: "record-period",
    audience: "self",
  },
  {
    id: "chart",
    title: "Your cycle at a glance",
    body: "The coloured bands are your four phases, the curve is typical energy, and the Today marker shows where you are now.",
    tips: ["It starts from a default 28-day cycle and gets more personal with every period you log."],
    target: "cycle-chart",
    audience: "self",
  },
  {
    id: "check-in",
    title: "Daily check-in",
    body: "Rate your pain from 0 to 10, add bleeding and symptoms, then tap Save. Pick another date to fill in a day you missed.",
    tips: ["Check-ins are private to your account, or to this device if you are not signed in."],
    target: "check-in",
    audience: "self",
  },
  {
    id: "tabs",
    title: "Move around",
    body: "These buttons switch between the main screens.",
    rows: [
      { icon: "calendar", label: "Calendar", text: "Period days and estimates. Tap a past date, then Record period start." },
      { icon: "planner", label: "Planner", text: "Tasks matched to the phase that suits them." },
      { icon: "history", label: "History", text: "Edit or delete period starts and check-ins." },
      { icon: "report", label: "Report", text: "A summary to print or share with your doctor. Find it at the bottom of History." },
    ],
    target: "nav",
    audience: "self",
  },
  {
    id: "bella",
    title: "Ask Bella",
    body: "Tap this bubble to ask a menstrual-health question or prepare for an appointment.",
    tips: ["Bella shares information, not a diagnosis. Your notes are never sent to her."],
    target: "ask-bella",
    audience: "self",
  },
  {
    id: "settings",
    title: "Settings and reminders",
    body: "Turn on Period reminders to get a notification 2 days and 1 day before your period.",
    tips: [
      "Invite a partner to see your cycle dates, change the theme, or replay this tour here.",
      "Reminders appear when PhaseTwo is installed or open on this device.",
    ],
    target: "tab-settings",
    audience: "self",
  },

  // People viewing an invited partner's cycle
  {
    id: "partner-cycle",
    title: "Your partner's cycle",
    body: "This shows their current phase and estimated next period.",
    tips: ["Only cycle dates and length are shared with you. Their symptom logs and notes stay private."],
    target: "cycle-chart",
    audience: "partner",
  },
  {
    id: "partner-sync",
    title: "Remote sync",
    body: "See both your local times and ideas for supporting your partner today.",
    tips: ["These are suggestions, not predictions of how they feel. Ask what would feel good."],
    target: "ldr",
    audience: "partner",
  },
  {
    id: "partner-advice",
    title: "Partner advice",
    body: "Tap this button to chat about more ways to support your partner through this phase.",
    target: "partner-advice",
    audience: "partner",
  },
  {
    id: "partner-tabs",
    title: "Move around",
    body: "These buttons switch between the main screens.",
    rows: [
      { icon: "calendar", label: "Calendar", text: "Your partner's estimated period days." },
      { icon: "planner", label: "Planner", text: "Plan your own tasks around the phase that suits them." },
    ],
    target: "nav",
    audience: "partner",
  },
  {
    id: "partner-settings",
    title: "Settings and reminders",
    body: "Turn on Period reminders to be told 2 days and 1 day before your partner's predicted period.",
    tips: ["You can also change the theme, disconnect partner sync, or replay this tour here."],
    target: "tab-settings",
    audience: "partner",
  },
];

/** The steps a given user should see. */
export function tourStepsFor(role: TourRole): TourStep[] {
  return TOUR_STEPS.filter((step) => step.audience === role);
}
