import { lazy, Suspense, type ComponentType, type LazyExoticComponent, useEffect, useRef, useState, type FormEvent } from "react";
import { CalendarDays, FileText, HeartPulse, Home, ListTodo, LogOut, Leaf, LogIn, Settings, ShieldCheck } from "lucide-react";
import type { AppSettings, ChatMessage, CycleProfile, Task } from "./types";
import { defaultCycleProfile, defaultSettings } from "./lib/storage";
import { CycleHeader } from "./components/CycleHeader";
import { SymptomLogger, type SymptomLoggerSaveRef } from "./components/SymptomLogger";
import { AuthGate } from "./components/AuthGate";
import { LegalConsentGate } from "./components/LegalConsentGate";
import { PRIVACY_URL, syncLegalAcceptance, TERMS_URL } from "./lib/legal";
import { supabase } from "./lib/supabase";
import { clearLocalUserData, LOCAL_GUEST_ID, loadLocalAppState, saveLocalAppState, type UserAppState } from "./lib/storage";
import { loadSyncedAppState, saveSyncedAppState } from "./lib/userData";
import { recordPeriodStart } from "./lib/cycleUtils";
import { useScrollLock } from "./lib/scrollLock";
import { useSwipeNavigation } from "./lib/swipeNav";
import { pendingPartnerCode } from "./lib/partnerInvite";
import { releasePushSubscription, sendDueReminder } from "./lib/notifications";
import type { SymptomLog } from "./lib/symptoms";
import { WeeklyStreakCard } from "./components/WeeklyStreakCard";

// Loaded on demand: the tour is shown once per person, so it should not weigh down the main bundle.
const AppTour = lazy(() => import("./components/AppTour").then((module) => ({ default: module.AppTour })));
import { GoogleG } from "./components/GoogleG";
import { TurnstileWidget } from "./components/TurnstileWidget";
import { turnstileEnabled } from "./lib/turnstile";
import { PeriodQuickLog } from "./components/PeriodQuickLog";
import { PhaseTwoLoader } from "./components/PhaseTwoLoader";

// Screens and floating helpers load when first needed, so the first visit downloads far less on mobile data.
function lazyNamed<M extends Record<string, unknown>, K extends keyof M>(load: () => Promise<M>, key: K): LazyExoticComponent<M[K] extends ComponentType<any> ? M[K] : never> {
  return lazy(() => load().then((module) => ({ default: module[key] as never })));
}
const TaskPlanner = lazyNamed(() => import("./components/TaskPlanner"), "TaskPlanner");
const LDRModule = lazyNamed(() => import("./components/LDRModule"), "LDRModule");
const EndometriosisAwareness = lazyNamed(() => import("./components/EndometriosisAwareness"), "EndometriosisAwareness");
const PeriodCalendar = lazyNamed(() => import("./components/PeriodCalendar"), "PeriodCalendar");
const HistoryView = lazyNamed(() => import("./components/HistoryView"), "HistoryView");
const SettingsView = lazyNamed(() => import("./components/SettingsView"), "SettingsView");
const PartnerAdviceLauncher = lazyNamed(() => import("./components/PartnerAdviceLauncher"), "PartnerAdviceLauncher");
const AskBellaLauncher = lazyNamed(() => import("./components/AskBellaLauncher"), "AskBellaLauncher");
const Analytics = lazy(() => import("@vercel/analytics/react").then((module) => ({ default: module.Analytics })));

const SELF_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;
type WorkspaceView = "today" | "calendar" | "planner" | "history" | "report" | "settings" | "login";

const WORKSPACE_TABS: Array<{ key: WorkspaceView; label: string; icon: typeof Home }> = [
  { key: "today", label: "Today", icon: Home },
  { key: "calendar", label: "Calendar", icon: CalendarDays },
  { key: "planner", label: "Planner", icon: ListTodo },
  { key: "history", label: "History", icon: FileText },
  { key: "settings", label: "Settings", icon: Settings },
];
const WORKSPACE_TAB_KEYS = WORKSPACE_TABS.map((tab) => tab.key);

function LegalAcceptanceSync({ userId }: { userId: string | null }) {
  useEffect(() => {
    if (userId) void syncLegalAcceptance(userId);
  }, [userId]);
  return null;
}

export default function App() {
  return (
    <LegalConsentGate>
      <AuthGate>{(user, weeklyLoginStreak) => (
        <>
          <LegalAcceptanceSync userId={user?.id ?? null} />
          <WorkspaceApp key={user?.id ?? LOCAL_GUEST_ID} userId={user?.id ?? LOCAL_GUEST_ID} isAuthenticated={Boolean(user)} weeklyLoginStreak={weeklyLoginStreak} />
        </>
      )}</AuthGate>
      <Suspense fallback={null}><Analytics /></Suspense>
    </LegalConsentGate>
  );
}

function WorkspaceApp({ userId, isAuthenticated, weeklyLoginStreak }: { userId: string; isAuthenticated: boolean; weeklyLoginStreak: number }) {
  const [profile, setProfile] = useState<CycleProfile>(defaultCycleProfile);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [sharedCycleProfile, setSharedCycleProfile] = useState<CycleProfile | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [symptomLogs, setSymptomLogs] = useState<SymptomLog[]>([]);
  const [activeView, setActiveView] = useState<WorkspaceView>("today");
  const [editingLogDate, setEditingLogDate] = useState<string | undefined>();
  const [appReady, setAppReady] = useState(false);
  const [syncError, setSyncError] = useState("");
  const [incomingPartnerCode, setIncomingPartnerCode] = useState<string | null>(null);
  const [loginError, setLoginError] = useState("");
  const [loginMessage, setLoginMessage] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaResetKey, setCaptchaResetKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("light");
  const [tourOpen, setTourOpen] = useState(false);
  const tourStartView = useRef<WorkspaceView>("today");
  const tourAutoHandled = useRef(false);
  const [focusCheckin, setFocusCheckin] = useState(false);
  const [detailsName, setDetailsName] = useState("");
  const [detailsAge, setDetailsAge] = useState("");
  const [detailsError, setDetailsError] = useState("");
  const deletingAccount = useRef(false);
  // True while the last attempt to load the account's synced data failed. Nothing may be written to the
  // server in that state, otherwise empty or stale local data would replace the real cloud copy.
  const syncLoadFailed = useRef(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const symptomSaveAction = useRef<SymptomLoggerSaveRef["current"]>(null);
  useScrollLock(appReady && !isAuthenticated && !settings.personalDetailsPromptSeen);

  useEffect(() => {
    const mode = settings.themeMode ?? "light";
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const applyTheme = () => {
      const theme = mode === "system" ? (media.matches ? "light" : "dark") : mode;
      document.documentElement.dataset.theme = theme;
      // Colours the phone's status bar area to match the page (black in dark mode).
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#000000" : "#f8f4f6");
      setResolvedTheme(theme);
    };
    applyTheme();
    if (mode === "system") {
      media.addEventListener("change", applyTheme);
      return () => media.removeEventListener("change", applyTheme);
    }
  }, [settings.themeMode]);

  useEffect(() => {
    if (!appReady) return;
    const code = pendingPartnerCode.peek();
    if (!code) return;
    if (isAuthenticated) {
      // Open "Enter a partner code" with the emailed code prefilled; the person still confirms it.
      pendingPartnerCode.clear();
      setIncomingPartnerCode(code);
      setActiveView("settings");
    } else if (supabase) {
      setLoginMessage("Sign in to accept your partner’s invitation. Your code will be ready afterwards.");
      setActiveView("login");
    }
  }, [appReady, isAuthenticated]);

  // Open the tour once for anyone who has not seen it: signed-in users right away, guests after the
  // optional details prompt is out of the way. A pending partner invitation takes priority.
  useEffect(() => {
    if (!appReady || tourAutoHandled.current || activeView === "login" || incomingPartnerCode) return;
    if (settings.tourCompleted) { tourAutoHandled.current = true; return; }
    if (isAuthenticated || settings.personalDetailsPromptSeen) {
      tourAutoHandled.current = true;
      tourStartView.current = "today";
      setTourOpen(true);
    }
  }, [appReady, activeView, incomingPartnerCode, isAuthenticated, settings.tourCompleted, settings.personalDetailsPromptSeen]);

  function startTour() {
    tourStartView.current = activeView;
    setTourOpen(true);
  }

  function closeTour() {
    setTourOpen(false);
    setSettings((current) => current.tourCompleted ? current : { ...current, tourCompleted: true });
    setActiveView(tourStartView.current);
    window.scrollTo({ top: 0 });
  }

  const reminderProfile = settings.role === "partner" && sharedCycleProfile ? sharedCycleProfile : profile;
  useEffect(() => {
    if (!appReady || !settings.periodReminders) return;
    const check = () => { void sendDueReminder(reminderProfile); };
    check();
    const timer = window.setInterval(check, 60 * 60 * 1000);
    document.addEventListener("visibilitychange", check);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", check); };
  }, [appReady, settings.periodReminders, reminderProfile]);

  useEffect(() => {
    if (!focusCheckin || activeView !== "today") return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById("symptom-check-in")?.scrollIntoView({ behavior: "smooth", block: "start" });
      document.getElementById("symptom-check-in")?.focus({ preventScroll: true });
      setFocusCheckin(false);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeView, focusCheckin]);

  useEffect(() => {
    let ignore = false;
    setAppReady(false);

    void loadSyncedAppState(userId)
      .then((state) => {
        if (ignore) return;
        syncLoadFailed.current = false;
        setProfile(state.cycleProfile);
        setTasks(state.tasks);
        setSettings(state.appSettings);
        setMessages(state.chatMessages);
      })
      .catch((error: unknown) => {
        if (ignore) return;
        syncLoadFailed.current = userId !== LOCAL_GUEST_ID;
        const localState = loadLocalAppState(userId);
        setProfile(localState.cycleProfile);
        setTasks(localState.tasks);
        setSettings(localState.appSettings);
        setMessages(localState.chatMessages);
        setSyncError("We couldn't load your synced data, so changes are kept on this device only. Retrying…");
      })
      .finally(() => {
        if (!ignore) setAppReady(true);
      });

    return () => {
      ignore = true;
    };
  }, [userId, loadAttempt]);

  useEffect(() => {
    if (!appReady || !syncLoadFailed.current) return;
    const timer = window.setTimeout(() => setLoadAttempt((attempt) => attempt + 1), 15_000);
    return () => window.clearTimeout(timer);
  }, [appReady, loadAttempt]);

  useEffect(() => {
    if (!appReady || !supabase || !isAuthenticated) return;

    let ignore = false;
    async function refreshSharedCycle() {
      const { data, error } = await supabase!.rpc("get_my_shared_cycle_profile");
      if (ignore) return;
      if (error) {
        // A network or server error says nothing about the link: keep the role and show the last known data.
        if (settings.role === "partner") setSyncError("Partner sync is temporarily unavailable. Your account data is unchanged.");
        return;
      }
      if (!data || typeof data !== "object") {
        setSharedCycleProfile(null);
        setSettings((current) => current.role === "partner" ? { ...current, role: "self" } : current);
        return;
      }
      const remote = data as Partial<CycleProfile>;
      if (typeof remote.lastPeriodStart !== "string" || typeof remote.cycleLength !== "number") {
        setSharedCycleProfile(null);
        setSettings((current) => ({ ...current, role: "self" }));
        return;
      }
      setSharedCycleProfile({ ...defaultCycleProfile, ...remote, city: "" });
    }

    void refreshSharedCycle();
    const interval = window.setInterval(() => void refreshSharedCycle(), 30_000);
    window.addEventListener("focus", refreshSharedCycle);
    return () => {
      ignore = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshSharedCycle);
    };
  }, [appReady, isAuthenticated, settings.role]);

  useEffect(() => {
    if (!appReady) return;
    const state: UserAppState = {
      cycleProfile: profile,
      tasks,
      appSettings: settings,
      chatMessages: messages,
    };
    const timer = window.setTimeout(() => {
      if (deletingAccount.current) return;
      if (syncLoadFailed.current) {
        saveLocalAppState(userId, state);
        return;
      }
      void saveSyncedAppState(userId, state)
        .then(() => {
          setSyncError("");
          setSavedAt(new Date());
        })
        .catch((error: unknown) => {
          setSyncError(error instanceof Error ? error.message : "Unable to sync your data.");
        });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [appReady, userId, profile, tasks, settings, messages]);

  async function saveWorkspace() {
    setSaving(true);
    setSyncError("");
    if (syncLoadFailed.current) {
      setSyncError("Your synced data hasn't loaded yet, so saving to your account is paused. Your changes are kept on this device.");
      setSaving(false);
      return;
    }
    try {
      const symptomSaved = settings.role !== "self" || await symptomSaveAction.current?.() !== false;
      await saveSyncedAppState(userId, { cycleProfile: profile, tasks, appSettings: settings, chatMessages: messages });
      if (symptomSaved) setSavedAt(new Date());
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "Unable to save your changes.");
    } finally {
      setSaving(false);
    }
  }

  async function handleGoogleSignIn() {
    if (!supabase) return;
    setLoginBusy(true);
    setLoginError("");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (error) {
      setLoginError(error.message);
      setLoginBusy(false);
    }
  }

  async function handleEmailSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    const email = (new FormData(event.currentTarget).get("email") as string | null)?.trim();
    if (!email) return;
    setLoginBusy(true);
    setLoginError("");
    setLoginMessage("");
    if (turnstileEnabled && !captchaToken) {
      setLoginError("One moment, the security check is still running.");
      setLoginBusy(false);
      return;
    }
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin, ...(captchaToken ? { captchaToken } : {}) },
    });
    if (error) {
      setLoginError(error.message);
    } else {
      setLoginMessage("Check your email.");
    }
    // A Turnstile token works once, so get a new one for the next attempt.
    setCaptchaToken(null);
    setCaptchaResetKey((key) => key + 1);
    setLoginBusy(false);
  }

  async function signOut() {
    let synced = appReady && !syncLoadFailed.current;
    if (appReady && !syncLoadFailed.current) {
      try {
        await saveSyncedAppState(userId, { cycleProfile: profile, tasks, appSettings: settings, chatMessages: messages });
      } catch (error) {
        synced = false;
        setSyncError(error instanceof Error ? error.message : "Unable to sync before sign out.");
      }
    }
    // Stop this device's reminders for the account (needs the session, so before signing out).
    try { await releasePushSubscription(); } catch { /* best effort */ }
    await supabase?.auth.signOut();
    // Remove the account's health data from this browser, but only once it is safely on the server.
    if (synced && userId !== LOCAL_GUEST_ID) {
      try { clearLocalUserData(userId); } catch { /* storage unavailable */ }
    }
  }

  async function deleteAccount() {
    if (!supabase) throw new Error("Account deletion is unavailable because Supabase is not configured.");
    deletingAccount.current = true;
    const { error } = await supabase.rpc("delete_my_account");
    if (error) {
      deletingAccount.current = false;
      throw error;
    }
    try {
      clearLocalUserData(userId);
    } finally {
      await supabase.auth.signOut({ scope: "local" });
    }
  }

  async function leavePartnerSync() {
    if (!supabase) return;
    const { error } = await supabase.rpc("leave_cycle_share");
    if (error) throw error;
    setSharedCycleProfile(null);
    setSettings((current) => ({ ...current, role: "self" }));
  }

  async function refreshPartnerLink() {
    if (!supabase) return;
    const { data, error } = await supabase.rpc("get_my_shared_cycle_profile");
    if (error) return;
    if (!data || typeof data !== "object") {
      setSharedCycleProfile(null);
      setSettings((current) => ({ ...current, role: "self" }));
      return;
    }
    const remote = data as Partial<CycleProfile>;
    if (typeof remote.lastPeriodStart !== "string" || typeof remote.cycleLength !== "number") {
      setSharedCycleProfile(null);
      setSettings((current) => ({ ...current, role: "self" }));
      return;
    }
    setSharedCycleProfile({ ...defaultCycleProfile, ...remote, city: "" });
    setSettings((current) => ({ ...current, role: "partner", ldrEnabled: true }));
  }

  const goToTab = (key: WorkspaceView) => {
    if (key === "today") setEditingLogDate(undefined);
    setActiveView(key);
  };

  useSwipeNavigation({
    enabled: appReady && !tourOpen && activeView !== "login" && activeView !== "report",
    order: WORKSPACE_TAB_KEYS,
    current: activeView,
    onNavigate: (key) => { goToTab(key); window.scrollTo({ top: 0 }); },
  });

  // The nav scrolls sideways on small screens, so keep the current tab visible after a swipe.
  useEffect(() => {
    document.querySelector<HTMLElement>("[data-tour='nav'] [aria-current='page']")?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [activeView]);

  const showLdr = settings.role === "partner" && settings.ldrEnabled;
  const displayedProfile = showLdr && sharedCycleProfile ? sharedCycleProfile : profile;

  if (!appReady) {
    return <PhaseTwoLoader label="Loading your workspace" />;
  }

  return (
    <div className="min-h-screen bg-base">
      {!(activeView === "login" && !isAuthenticated && supabase) && <header className="border-b border-zinc-200 bg-white/95 backdrop-blur backdrop-saturate-150 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3 sm:px-8">
          <div className="flex items-center gap-2 py-1">
            <PhaseTwoLoader variant="mark" decorative showLabel={false} markClassName="h-8 w-8" className="shrink-0" />
            <span className="font-display text-base font-semibold tracking-tight text-zinc-900">
              PhaseTwo
            </span>
          </div>
          {activeView !== "login" && <nav aria-label="Main navigation" data-tour="nav" className="order-3 flex w-full items-center gap-1 overflow-x-auto sm:order-2 sm:w-auto">
            {WORKSPACE_TABS.map(({ key, label, icon: Icon }) => (
              <button key={key} type="button" data-tour={`tab-${key}`} aria-current={activeView === key ? "page" : undefined} onClick={() => goToTab(key)} className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors ${activeView === key ? "bg-sage-light text-sage-dark" : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"}`}>
                <Icon className="h-4 w-4" strokeWidth={1.8} />{label}
              </button>
            ))}
          </nav>}
          {!isAuthenticated && supabase && activeView === "login" ? <button type="button" onClick={() => setActiveView("today")} className="order-2 inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100"><LogIn className="h-4 w-4 rotate-180" />Back to tracker</button> : !isAuthenticated && supabase ? <button type="button" onClick={() => { setLoginError(""); setLoginMessage(""); setActiveView("login"); }} aria-label="Sign in to your account" title="Sign in to your account" className="order-2 inline-flex items-center gap-2 rounded-full border border-sage bg-sage-light px-3 py-2 text-xs font-semibold text-sage-dark transition-colors hover:bg-sage/10 sm:order-3"><LogIn className="h-3.5 w-3.5" />Sign in</button> : isAuthenticated && <button
            type="button"
            onClick={() => void signOut()}
            aria-label="Sign out"
            title="Sign out"
            className="order-2 inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-600 transition-colors hover:bg-zinc-50 sm:order-3"
          >
            <LogOut className="h-3.5 w-3.5" strokeWidth={1.75} />
            Sign out
          </button>}
        </div>
      </header>}

      {activeView === "login" && !isAuthenticated && supabase && <div className="flex min-h-14 items-center justify-between border-b border-zinc-200 px-4"><span className="font-display font-bold text-zinc-900">PhaseTwo</span><button type="button" onClick={() => setActiveView("today")} className="inline-flex min-h-11 items-center gap-2 text-sm text-zinc-600"><LogIn className="h-4 w-4 rotate-180" />Back</button></div>}

      <main className="max-w-6xl mx-auto space-y-7 px-4 py-6 pb-10 sm:px-8 sm:py-8">
        <Suspense fallback={<PhaseTwoLoader variant="inline" label="Loading" />}>
        {!isAuthenticated && supabase && activeView === "login" && <section className="mx-auto mt-6 max-w-sm">
          <h1 className="font-display text-3xl font-bold text-zinc-900">Sign in</h1>
          <button type="button" onClick={() => void handleGoogleSignIn()} disabled={loginBusy} className="mt-8 inline-flex min-h-12 w-full items-center justify-center gap-3 rounded-full border border-zinc-300 bg-white px-4 text-[15px] font-semibold text-zinc-800 transition-[background-color,transform] hover:bg-zinc-50 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60">
            <GoogleG className="h-5 w-5" />
            Sign in with Google
          </button>
          <div className="my-6 flex items-center gap-3 text-xs text-zinc-400"><span className="h-px flex-1 bg-zinc-200" />or<span className="h-px flex-1 bg-zinc-200" /></div>
          <form className="space-y-3" onSubmit={(event) => void handleEmailSignIn(event)}>
            <label className="block text-sm font-medium text-zinc-700">Email
              <input name="email" type="email" autoComplete="email" required className="mt-1.5 min-h-12 w-full rounded-2xl border border-zinc-300 bg-white px-4 text-base text-zinc-900 outline-none transition focus:border-sage-dark focus:ring-2 focus:ring-sage/20" />
            </label>
            <TurnstileWidget action="signin" onToken={setCaptchaToken} onError={setLoginError} resetKey={captchaResetKey} />
            {loginError && <p role="alert" className="text-sm text-rose-700">{loginError}</p>}
            {loginMessage && <p role="status" className="text-sm font-medium text-sage-dark">{loginMessage}</p>}
            <button type="submit" disabled={loginBusy || (turnstileEnabled && !captchaToken)} className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-sage-dark px-4 text-[15px] font-semibold text-white transition-[background-color,transform] hover:bg-sage-darker active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60">
              Email me a link
            </button>
          </form>
        </section>}

        {activeView === "today" && <>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div><p className="text-sm font-medium text-sage-dark">{new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(new Date())}</p><h1 className="mt-1 font-display text-2xl font-bold text-zinc-900">Today</h1>{settings.displayName && <p className="mt-1 text-sm text-zinc-600">Hello, {settings.displayName}</p>}</div>
                      </div>
          <CycleHeader profile={displayedProfile} />
          {settings.role === "self" && isAuthenticated && <WeeklyStreakCard weeks={weeklyLoginStreak} />}
          {settings.role === "self" && <PeriodQuickLog profile={profile} onChange={setProfile} />}
          <PeriodCalendar profile={displayedProfile} logs={settings.role === "self" ? symptomLogs : []} showRecordButton={settings.role === "self"} onRecordPeriodStart={(date) => setProfile((current) => recordPeriodStart(current, date))} onProfileChange={setProfile} onEditLog={(date) => { setEditingLogDate(date); setFocusCheckin(true); }} />
          {settings.role === "self" && <SymptomLogger profile={profile} userId={userId} initialLogDate={editingLogDate} onHistoryChange={setSymptomLogs} saveActionRef={symptomSaveAction} />}
          {showLdr && <LDRModule profile={displayedProfile} selfTimezone={SELF_TIMEZONE} />}
          {settings.role === "self" && <EndometriosisAwareness logs={symptomLogs} profile={profile} />}
        </>}

        {activeView === "calendar" && <section className="space-y-5"><div><p className="text-sm font-medium text-sage-dark">Recorded and predicted</p><h1 className="mt-1 font-display text-2xl font-bold text-zinc-900">Calendar</h1><p className="mt-1 text-sm text-zinc-500">Tap a day to log it.</p></div><PeriodCalendar profile={displayedProfile} logs={settings.role === "self" ? symptomLogs : []} showRecordButton={settings.role === "self"} onRecordPeriodStart={(date) => setProfile((current) => recordPeriodStart(current, date))} onProfileChange={setProfile} onEditLog={(date) => { setEditingLogDate(date); setActiveView("today"); }} /></section>}

        {activeView === "planner" && <section className="space-y-5"><div><p className="text-sm font-medium text-sage-dark">Plans that can flex</p><h1 className="mt-1 font-display text-2xl font-bold text-zinc-900">Planner</h1><p className="mt-1 max-w-2xl text-sm leading-6 text-zinc-500">Cycle-phase suggestions describe typical patterns, not a promise about your energy. Adjust plans to how you feel.</p></div><TaskPlanner profile={displayedProfile} tasks={tasks} onChange={setTasks} /></section>}

        {activeView === "history" && <HistoryView displayName={settings.displayName} age={settings.age} profile={displayedProfile} logs={settings.role === "self" ? symptomLogs : []} onProfileChange={setProfile} onEditLog={(date) => { setEditingLogDate(date); setActiveView("today"); }} onSave={saveWorkspace} saving={saving} savedAt={savedAt} />}
        {activeView === "settings" && <SettingsView settings={settings} onSettingsChange={setSettings} isAuthenticated={isAuthenticated} isLinkedPartner={Boolean(sharedCycleProfile)} onLeavePartnerSync={leavePartnerSync} onPartnerLinked={refreshPartnerLink} initialPartnerCode={incomingPartnerCode} onInitialPartnerCodeUsed={() => setIncomingPartnerCode(null)} profile={profile} onProfileChange={setProfile} onDeleteAccount={deleteAccount} onSave={saveWorkspace} saving={saving} savedAt={savedAt} onStartTour={startTour} />}

      </Suspense>
      </main>

      <footer className="max-w-6xl mx-auto px-6 sm:px-10 py-8 text-xs text-zinc-400">
        {isAuthenticated ? "Your cycle, plans, and symptom history stay in your account." : "Your cycle, plans, and symptom history stay on this device."} Partner sync is invitation-only; Bella conversations stay in this session.
        <span className="ml-2 whitespace-nowrap"><a href={PRIVACY_URL} className="underline underline-offset-2 hover:text-zinc-600">Privacy Policy</a> · <a href={TERMS_URL} className="underline underline-offset-2 hover:text-zinc-600">Terms of Service</a></span>
        {syncError && <span role="status" className="ml-2 text-red-700">Sync issue: {syncError}</span>}
      </footer>

      {tourOpen && <Suspense fallback={null}><AppTour role={settings.role} onNavigate={(view) => { setActiveView(view); window.scrollTo({ top: 0 }); }} onClose={closeTour} /></Suspense>}

      {settings.role === "self" && <Suspense fallback={null}><AskBellaLauncher isAuthenticated={isAuthenticated} onSignIn={() => { setLoginError(""); setLoginMessage(""); setActiveView("login"); }} /></Suspense>}
      {showLdr && <Suspense fallback={null}><PartnerAdviceLauncher profile={displayedProfile} messages={messages} onMessagesChange={setMessages} /></Suspense>}

      {!isAuthenticated && !settings.personalDetailsPromptSeen && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-zinc-950/70 p-4 backdrop-blur-sm">
        <section role="dialog" aria-modal="true" aria-labelledby="personal-details-title" className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl sm:p-7">
          <p className="text-sm font-semibold text-sage-dark">Before you begin</p>
          <h2 id="personal-details-title" className="mt-2 font-display text-2xl font-bold text-zinc-900">Make this space yours</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-600">Add a name for your private display and an age for your health report. Both are optional, and you can skip this.</p>
          <form className="mt-5 space-y-4" onSubmit={(event) => {
            event.preventDefault();
            const parsedAge = detailsAge.trim() ? Number(detailsAge) : undefined;
            if (parsedAge !== undefined && (!Number.isInteger(parsedAge) || parsedAge < 1 || parsedAge > 120)) {
              setDetailsError("Enter an age from 1 to 120, or leave it blank.");
              return;
            }
            const name = detailsName.trim().slice(0, 80);
            const nextProfile = profile;
            const nextSettings = { ...settings, displayName: name || undefined, age: parsedAge, personalDetailsPromptSeen: true };
            setSettings(nextSettings);
            saveLocalAppState(userId, { cycleProfile: nextProfile, tasks, appSettings: nextSettings, chatMessages: messages });
            setDetailsError("");
          }}>
            <label className="block text-sm font-medium text-zinc-700">Name <span className="font-normal text-zinc-500">(optional)</span>
              <input autoFocus value={detailsName} onChange={(event) => setDetailsName(event.target.value)} maxLength={80} autoComplete="given-name" className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900" placeholder="What should we call you?" />
            </label>
            <label className="block text-sm font-medium text-zinc-700">Age <span className="font-normal text-zinc-500">(optional, not a birth date)</span>
              <input value={detailsAge} onChange={(event) => setDetailsAge(event.target.value)} type="number" min={1} max={120} step={1} inputMode="numeric" className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900" placeholder="Age in years" />
            </label>
            {detailsError && <p role="alert" className="text-sm text-rose-700">{detailsError}</p>}
            <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => { const nextSettings = { ...settings, personalDetailsPromptSeen: true }; setSettings(nextSettings); saveLocalAppState(userId, { cycleProfile: profile, tasks, appSettings: nextSettings, chatMessages: messages }); setDetailsError(""); }} className="min-h-11 rounded-lg border border-zinc-200 px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-50">Skip</button>
              <button type="submit" className="min-h-11 rounded-lg bg-sage px-4 text-sm font-semibold text-white hover:bg-sage-dark">Continue</button>
            </div>
          </form>
        </section>
      </div>}

    </div>
  );
}
