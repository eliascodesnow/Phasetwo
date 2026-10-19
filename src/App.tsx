import { useEffect, useRef, useState, type FormEvent } from "react";
import { CalendarDays, Cloud, FileText, HeartPulse, Home, LogOut, Leaf, LogIn, Settings, ShieldCheck } from "lucide-react";
import type { AppSettings, ChatMessage, CycleProfile, Task } from "./types";
import { defaultCycleProfile, defaultSettings } from "./lib/storage";
import { CycleHeader } from "./components/CycleHeader";
import { TaskPlanner } from "./components/TaskPlanner";
import { LDRModule } from "./components/LDRModule";
import { SymptomLogger, type SymptomLoggerSaveRef } from "./components/SymptomLogger";
import { EndometriosisAwareness } from "./components/EndometriosisAwareness";
import { PeriodCalendar } from "./components/PeriodCalendar";
import { HistoryView } from "./components/HistoryView";
import { ReportView } from "./components/ReportView";
import { SettingsView } from "./components/SettingsView";
import { PartnerAdviceLauncher } from "./components/PartnerAdviceLauncher";
import { AskBellaLauncher } from "./components/AskBellaLauncher";
import { AuthGate } from "./components/AuthGate";
import { supabase } from "./lib/supabase";
import { clearLocalUserData, LOCAL_GUEST_ID, loadLocalAppState, saveLocalAppState, type UserAppState } from "./lib/storage";
import { loadSyncedAppState, saveSyncedAppState } from "./lib/userData";
import { recordPeriodStart } from "./lib/cycleUtils";
import { sendDueReminder } from "./lib/notifications";
import type { SymptomLog } from "./lib/symptoms";
import { WeeklyStreakCard } from "./components/WeeklyStreakCard";
import { CommunityView } from "./components/CommunityView";

const SELF_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;
const COMMUNITY_ENABLED = import.meta.env.VITE_COMMUNITY_ENABLED === "true";
type WorkspaceView = "today" | "calendar" | "planner" | "community" | "history" | "report" | "settings" | "login";

const WORKSPACE_TABS: Array<{ key: WorkspaceView; label: string; icon: typeof Home }> = [
  { key: "today", label: "Today", icon: Home },
  { key: "calendar", label: "Calendar", icon: CalendarDays },
  { key: "planner", label: "Planner", icon: ListTodo },
  ...(COMMUNITY_ENABLED ? [{ key: "community" as const, label: "Community", icon: UsersRound }] : []),
  { key: "history", label: "History", icon: FileText },
  { key: "settings", label: "Settings", icon: Settings },
];

export default function App() {
  return (
    <>
      <AuthGate>{(user, weeklyLoginStreak) => <WorkspaceApp key={user?.id ?? LOCAL_GUEST_ID} userId={user?.id ?? LOCAL_GUEST_ID} isAuthenticated={Boolean(user)} weeklyLoginStreak={weeklyLoginStreak} />}</AuthGate>
      <Analytics />
    </>
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
  const [loginError, setLoginError] = useState("");
  const [loginMessage, setLoginMessage] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("dark");
  const [moreOpen, setMoreOpen] = useState(false);
  const [focusCheckin, setFocusCheckin] = useState(false);
  const [detailsName, setDetailsName] = useState("");
  const [detailsAge, setDetailsAge] = useState("");
  const [detailsError, setDetailsError] = useState("");
  const deletingAccount = useRef(false);
  const symptomSaveAction = useRef<SymptomLoggerSaveRef["current"]>(null);

  useEffect(() => {
    const mode = settings.themeMode ?? "system";
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const applyTheme = () => {
      const theme = mode === "system" ? (media.matches ? "light" : "dark") : mode;
      document.documentElement.dataset.theme = theme;
      setResolvedTheme(theme);
    };
    applyTheme();
    if (mode === "system") {
      media.addEventListener("change", applyTheme);
      return () => media.removeEventListener("change", applyTheme);
    }
  }, [settings.themeMode]);

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
        setProfile(state.cycleProfile);
        setTasks(state.tasks);
        setSettings(state.appSettings);
        setMessages(state.chatMessages);
      })
      .catch((error: unknown) => {
        if (ignore) return;
        const localState = loadLocalAppState(userId);
        setProfile(localState.cycleProfile);
        setTasks(localState.tasks);
        setSettings(localState.appSettings);
        setMessages(localState.chatMessages);
        setSyncError(error instanceof Error ? error.message : "Unable to load synced data.");
      })
      .finally(() => {
        if (!ignore) setAppReady(true);
      });

    return () => {
      ignore = true;
    };
  }, [userId]);

  useEffect(() => {
    if (!appReady || !supabase || !isAuthenticated) return;

    let ignore = false;
    async function refreshSharedCycle() {
      const { data, error } = await supabase!.rpc("get_my_shared_cycle_profile");
      if (ignore) return;
      if (error || !data || typeof data !== "object") {
        setSharedCycleProfile(null);
        setSettings((current) => current.role === "partner" ? { ...current, role: "self" } : current);
        if (error && settings.role === "partner") setSyncError("Partner sync is temporarily unavailable. Your account data is unchanged.");
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
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) {
      setLoginError(error.message);
    } else {
      setLoginMessage("Check your email for a sign-in link.");
    }
    setLoginBusy(false);
  }

  async function signOut() {
    if (appReady) {
      try {
        await saveSyncedAppState(userId, { cycleProfile: profile, tasks, appSettings: settings, chatMessages: messages });
      } catch (error) {
        setSyncError(error instanceof Error ? error.message : "Unable to sync before sign out.");
      }
    }
    await supabase?.auth.signOut();
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
    if (error || !data || typeof data !== "object") {
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

  const showLdr = settings.role === "partner" && settings.ldrEnabled;
  const displayedProfile = showLdr && sharedCycleProfile ? sharedCycleProfile : profile;

  if (!appReady) {
    return <div role="status" className="flex min-h-screen flex-col items-center justify-center gap-3 text-sm text-zinc-500"><Leaf className="h-6 w-6 animate-pulse text-sage" strokeWidth={1.5} />Loading your workspace…</div>;
  }

  return (
    <div className="min-h-screen bg-base">
      <header className="border-b border-zinc-200 bg-white/80 backdrop-saturate-150 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3 sm:px-8">
          <div className="flex items-center gap-2 py-1">
            <Leaf className="w-4.5 h-4.5 text-sage" strokeWidth={1.75} />
            <span className="font-display text-base font-semibold tracking-tight text-zinc-900">
              PhaseTwo
            </span>
          </div>
          {activeView !== "login" && <nav aria-label="Main navigation" className="order-3 flex w-full items-center gap-1 overflow-x-auto sm:order-2 sm:w-auto">
            {WORKSPACE_TABS.map(({ key, label, icon: Icon }) => (
              <button key={key} type="button" aria-current={activeView === key ? "page" : undefined} onClick={() => { if (key === "home") setEditingLogDate(undefined); setActiveView(key); }} className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors ${activeView === key ? "bg-sage-light text-sage-dark" : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"}`}>
                <Icon className="h-4 w-4" strokeWidth={1.8} />{label}
              </button>
            ))}
          </nav>}
          {!isAuthenticated && supabase && activeView === "login" ? <button type="button" onClick={() => setActiveView("home")} className="order-2 inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100"><LogIn className="h-4 w-4 rotate-180" />Back to tracker</button> : !isAuthenticated && supabase ? <button type="button" onClick={() => { setLoginError(""); setLoginMessage(""); setActiveView("login"); }} aria-label="Sign in to your account" title="Sign in to your account" className="order-2 inline-flex items-center gap-2 rounded-full border border-sage bg-sage-light px-3 py-2 text-xs font-semibold text-sage-dark transition-colors hover:bg-sage/10 sm:order-3"><LogIn className="h-3.5 w-3.5" />Sign in</button> : isAuthenticated && <button
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

      {activeView === "login" && !isAuthenticated && supabase && <div className="flex min-h-14 items-center justify-between border-b border-zinc-200 px-4"><span className="font-display font-bold text-zinc-900">PhaseTwo</span><button type="button" onClick={() => setActiveView("today")} className="inline-flex min-h-11 items-center gap-2 text-sm text-zinc-600"><LogIn className="h-4 w-4 rotate-180" />Back to tracker</button></div>}

      <main className="max-w-6xl mx-auto space-y-7 px-4 py-6 pb-24 sm:px-8 sm:py-8">
        {!isAuthenticated && supabase && activeView === "login" && <section className="mx-auto max-w-lg rounded-[28px] border border-zinc-200 bg-white p-6 shadow-card sm:p-8">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-sage-light text-sage-dark">
              <ShieldCheck className="h-5 w-5" strokeWidth={2} />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Welcome back</p>
              <h2 className="font-display text-2xl font-semibold text-zinc-900">Sign in</h2>
            </div>
          </div>
          <p className="mt-4 text-sm leading-6 text-zinc-600">Use your account to sync cycle data across devices and keep your weekly streak going.</p>
          <div className="mt-5 space-y-3">
            <button type="button" onClick={() => void handleGoogleSignIn()} disabled={loginBusy} className="inline-flex min-h-12 w-full items-center justify-center gap-3 rounded-2xl border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60">
              <Cloud className="h-4 w-4" strokeWidth={2} />
              Continue with Google
            </button>
            <form className="space-y-3" onSubmit={(event) => void handleEmailSignIn(event)}>
              <label className="block text-sm font-medium text-zinc-700">Email
                <input name="email" type="email" autoComplete="email" required className="mt-1.5 min-h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none transition focus:border-sage-dark focus:ring-2 focus:ring-sage/20" />
              </label>
              {loginError && <p role="alert" className="text-sm text-rose-700">{loginError}</p>}
              {loginMessage && <p role="status" className="text-sm text-sage-dark">{loginMessage}</p>}
              <button type="submit" disabled={loginBusy} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-sage-dark px-4 text-sm font-medium text-white transition-colors hover:bg-sage-darker disabled:cursor-not-allowed disabled:opacity-60">
                <LogIn className="h-4 w-4" strokeWidth={2} />
                Send magic link
              </button>
            </form>
          </div>
        </section>}

        {activeView === "today" && <>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div><p className="text-sm font-medium text-sage-dark">{new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(new Date())}</p><h1 className="mt-1 font-display text-2xl font-bold text-zinc-900">Today</h1>{settings.displayName && <p className="mt-1 text-sm text-zinc-600">Hello, {settings.displayName}</p>}</div>
            {settings.role === "self" && <button type="button" onClick={() => setProfile((current) => recordPeriodStart(current, new Date().toISOString().slice(0, 10)))} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-sage/40 px-4 text-sm font-semibold text-sage-dark transition-colors hover:bg-sage-light"><HeartPulse className="h-4 w-4" />Period started</button>}
          </div>
          <CycleHeader profile={displayedProfile} />
          {settings.role === "self" && isAuthenticated && <WeeklyStreakCard weeks={weeklyLoginStreak} />}
          {settings.role === "self" && <div className="mx-auto flex justify-center">
            <button type="button" onClick={() => setProfile((current) => recordPeriodStart(current, new Date().toISOString().slice(0, 10)))} className="inline-flex min-h-12 items-center gap-2 rounded-full bg-[#b96070] px-7 py-3 text-sm font-semibold text-white shadow-card transition-colors hover:bg-[#a95263]">
              <HeartPulse className="h-4 w-4" />Record period
            </button>
          </div>}
          <PeriodCalendar profile={displayedProfile} logs={settings.role === "self" ? symptomLogs : []} showRecordButton={settings.role === "self"} onRecordPeriodStart={(date) => setProfile((current) => recordPeriodStart(current, date))} />
          {settings.role === "self" && <SymptomLogger profile={profile} userId={userId} initialLogDate={editingLogDate} onHistoryChange={setSymptomLogs} saveActionRef={symptomSaveAction} />}
          <div className="grid grid-cols-1 gap-6 items-start lg:grid-cols-2">
            <TaskPlanner profile={displayedProfile} tasks={tasks} onChange={setTasks} />
            {showLdr && <LDRModule profile={displayedProfile} selfTimezone={SELF_TIMEZONE} />}
          </div>
          {showLdr && <LDRModule profile={displayedProfile} selfTimezone={SELF_TIMEZONE} />}
          {settings.role === "self" && <EndometriosisAwareness logs={symptomLogs} profile={profile} />}
        </>}

        {activeView === "calendar" && <section className="space-y-5"><div><p className="text-sm font-medium text-sage-dark">Your records, not a forecast</p><h1 className="mt-1 font-display text-2xl font-bold text-zinc-900">Calendar</h1><p className="mt-1 text-sm text-zinc-500">Recorded period dates and symptom entries are distinct from estimates.</p></div><PeriodCalendar profile={displayedProfile} logs={settings.role === "self" ? symptomLogs : []} showRecordButton={settings.role === "self"} onRecordPeriodStart={(date) => setProfile((current) => recordPeriodStart(current, date))} onEditLog={(date) => { setEditingLogDate(date); setActiveView("today"); }} /></section>}

        {activeView === "planner" && <section className="space-y-5"><div><p className="text-sm font-medium text-sage-dark">Plans that can flex</p><h1 className="mt-1 font-display text-2xl font-bold text-zinc-900">Planner</h1><p className="mt-1 max-w-2xl text-sm leading-6 text-zinc-500">Cycle-phase suggestions describe typical patterns, not a promise about your energy. Adjust plans to how you feel.</p></div><TaskPlanner profile={displayedProfile} tasks={tasks} onChange={setTasks} /></section>}

        {COMMUNITY_ENABLED && activeView === "community" && <CommunityView isAuthenticated={isAuthenticated} onSignIn={() => { setLoginError(""); setLoginMessage(""); setActiveView("login"); }} />}

        {activeView === "history" && <HistoryView profile={displayedProfile} logs={settings.role === "self" ? symptomLogs : []} onProfileChange={setProfile} onEditLog={(date) => { setEditingLogDate(date); setActiveView("today"); }} onSave={saveWorkspace} saving={saving} savedAt={savedAt} />}
        {activeView === "report" && <ReportView profile={displayedProfile} logs={settings.role === "self" ? symptomLogs : []} displayName={settings.displayName} age={settings.age} />}
        {activeView === "settings" && <SettingsView settings={settings} onSettingsChange={setSettings} isAuthenticated={isAuthenticated} isLinkedPartner={Boolean(sharedCycleProfile)} onLeavePartnerSync={leavePartnerSync} onPartnerLinked={refreshPartnerLink} profile={profile} onProfileChange={setProfile} onDeleteAccount={deleteAccount} onSave={saveWorkspace} saving={saving} savedAt={savedAt} />}

      </main>

      <footer className="max-w-6xl mx-auto px-6 sm:px-10 py-8 text-xs text-zinc-400">
        {isAuthenticated ? "Your cycle, plans, and symptom history stay in your account." : "Your cycle, plans, and symptom history stay on this device."} Partner sync is invitation-only; Bella conversations stay in this session.
        {syncError && <span role="status" className="ml-2 text-red-700">Sync issue: {syncError}</span>}
      </footer>

      {activeView !== "login" && <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-30 border-t border-zinc-200 bg-white/95 backdrop-blur sm:hidden">
        <ul className="pb-safe mx-auto grid max-w-md grid-cols-4">
          {WORKSPACE_TABS.map(({ key, label, icon: Icon }) => (
            <li key={key}>
              <button type="button" aria-current={activeView === key ? "page" : undefined} onClick={() => { if (key === "home") setEditingLogDate(undefined); setActiveView(key); window.scrollTo({ top: 0 }); }} className={`flex min-h-14 w-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors ${activeView === key ? "text-sage-dark" : "text-zinc-500"}`}>
                <span className={`flex h-7 w-12 items-center justify-center rounded-full transition-colors ${activeView === key ? "bg-sage-light" : ""}`}><Icon className="h-5 w-5" strokeWidth={1.8} /></span>
                {label}
              </button>
            </li>
          ))}
        </ul>
      </nav>}

      {settings.role === "self" && <AskBellaLauncher />}
      {showLdr && <PartnerAdviceLauncher profile={displayedProfile} messages={messages} onMessagesChange={setMessages} />}

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

      {activeView !== "login" && <nav aria-label="Mobile navigation" className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200 bg-base px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        <div className={`mx-auto grid max-w-lg ${COMMUNITY_ENABLED ? "grid-cols-5" : "grid-cols-4"}`}>
          {[
            { key: "today" as const, label: "Today", icon: Home },
            { key: "calendar" as const, label: "Calendar", icon: CalendarDays },
            { key: "log" as const, label: "Log", icon: HeartPulse },
            ...(COMMUNITY_ENABLED ? [{ key: "community" as const, label: "Community", icon: UsersRound }] : [{ key: "planner" as const, label: "Planner", icon: ListTodo }]),
          ].map(({ key, label, icon: Icon }) => (
            <button key={key} type="button" aria-current={activeView === key ? "page" : undefined} onClick={() => { setMoreOpen(false); if (key === "log") { setEditingLogDate(undefined); setFocusCheckin(true); setActiveView("today"); } else setActiveView(key); }} className={`flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-medium ${activeView === key || (key === "log" && focusCheckin) ? "text-sage-dark" : "text-zinc-500"}`}>
              <Icon className="h-5 w-5" strokeWidth={1.8} />{label}
            </button>
          ))}
          <button type="button" aria-expanded={moreOpen} aria-haspopup="menu" onClick={() => setMoreOpen((value) => !value)} className={`flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-medium ${moreOpen || ["history", "report", "settings"].includes(activeView) ? "text-sage-dark" : "text-zinc-500"}`}><MoreHorizontal className="h-5 w-5" />More</button>
        </div>
      </nav>}
      {moreOpen && <div role="menu" aria-label="More destinations" className="fixed bottom-[4.5rem] right-3 z-50 w-52 rounded-lg border border-zinc-200 bg-white p-2 shadow-xl lg:hidden">
        {[...(COMMUNITY_ENABLED ? [{ key: "planner" as const, label: "Planner", icon: ListTodo }] : []), { key: "history" as const, label: "History", icon: FileText }, { key: "report" as const, label: "Health report", icon: HeartPulse }, { key: "settings" as const, label: "Settings", icon: Settings }].map(({ key, label, icon: Icon }) => <button key={key} role="menuitem" type="button" onClick={() => { setActiveView(key); setMoreOpen(false); }} className="flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-left text-sm text-zinc-700 hover:bg-zinc-100"><Icon className="h-4 w-4" />{label}</button>)}
      </div>}
    </div>
  );
}
