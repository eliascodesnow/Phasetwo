import { useEffect, useRef, useState, type FormEvent } from "react";
import { CalendarDays, FileText, HeartPulse, Home, LogOut, Leaf, ListTodo, LogIn, Settings, ShieldCheck, Sun, Moon, MoreHorizontal, UsersRound } from "lucide-react";
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
  return <AuthGate>{(user, weeklyLoginStreak) => <WorkspaceApp key={user?.id ?? LOCAL_GUEST_ID} userId={user?.id ?? LOCAL_GUEST_ID} isAuthenticated={Boolean(user)} weeklyLoginStreak={weeklyLoginStreak} />}</AuthGate>;
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
    return <div className="flex min-h-screen items-center justify-center text-sm text-zinc-500">Loading your workspace...</div>;
  }

  return (
    <div className="min-h-screen bg-base text-zinc-800 lg:pl-64">
      {activeView !== "login" && <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-zinc-200 bg-white px-5 py-7 lg:flex">
        <div className="flex items-center gap-3 px-2">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sage-light text-sage-dark"><Leaf className="h-5 w-5" strokeWidth={1.8} /></span>
          <span><span className="block font-display text-lg font-bold text-zinc-900">PhaseTwo</span><span className="block text-xs text-zinc-500">Cycle care, your way</span></span>
        </div>
        <nav aria-label="Main navigation" className="mt-10 space-y-1">
          {WORKSPACE_TABS.map(({ key, label, icon: Icon }) => (
            <button key={key} type="button" aria-current={activeView === key ? "page" : undefined} onClick={() => { setMoreOpen(false); if (key === "today") setEditingLogDate(undefined); setActiveView(key); }} className={`flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium transition-colors ${activeView === key ? "bg-sage-light text-sage-dark" : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"}`}>
              <Icon className="h-5 w-5" strokeWidth={1.8} />{label}
            </button>
          ))}
          <button type="button" onClick={() => { setActiveView("report"); setMoreOpen(false); }} className={`flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium transition-colors ${activeView === "report" ? "bg-sage-light text-sage-dark" : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"}`}>
            <HeartPulse className="h-5 w-5" strokeWidth={1.8} />Health report
          </button>
        </nav>
        <div className="mt-auto border-t border-zinc-200 pt-4">
          <button type="button" onClick={() => setSettings((current) => ({ ...current, themeMode: resolvedTheme === "dark" ? "light" : "dark" }))} className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-sm text-zinc-600 hover:bg-zinc-100" aria-label={`Switch to ${resolvedTheme === "dark" ? "light" : "dark"} theme`}>
            {resolvedTheme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}{resolvedTheme === "dark" ? "Light appearance" : "Dark appearance"}
          </button>
          {!isAuthenticated && supabase ? <button type="button" onClick={() => { setLoginError(""); setLoginMessage(""); setActiveView("login"); }} className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-sage-dark hover:bg-sage-light"><LogIn className="h-4 w-4" />Sign in</button> : isAuthenticated && <button type="button" onClick={() => void signOut()} className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-sm text-zinc-500 hover:bg-zinc-100"><LogOut className="h-4 w-4" />Sign out</button>}
        </div>
      </aside>}

      {activeView !== "login" && <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/90 backdrop-saturate-150 lg:hidden">
        <div className="flex min-h-14 items-center justify-between px-4">
          <div className="flex items-center gap-2"><Leaf className="h-5 w-5 text-sage" strokeWidth={1.8} /><span className="font-display text-base font-bold text-zinc-900">PhaseTwo</span></div>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setSettings((current) => ({ ...current, themeMode: resolvedTheme === "dark" ? "light" : "dark" }))} className="flex h-11 w-11 items-center justify-center rounded-lg text-zinc-600 hover:bg-zinc-100" aria-label={`Switch to ${resolvedTheme === "dark" ? "light" : "dark"} theme`}>{resolvedTheme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}</button>
            {!isAuthenticated && supabase && <button type="button" onClick={() => { setLoginError(""); setLoginMessage(""); setActiveView("login"); }} aria-label="Sign in" className="flex h-11 w-11 items-center justify-center rounded-lg text-zinc-600 hover:bg-zinc-100"><LogIn className="h-5 w-5" /></button>}
          </div>
        </div>
      </header>}

      {activeView === "login" && !isAuthenticated && supabase && <div className="flex min-h-14 items-center justify-between border-b border-zinc-200 px-4"><span className="font-display font-bold text-zinc-900">PhaseTwo</span><button type="button" onClick={() => setActiveView("today")} className="inline-flex min-h-11 items-center gap-2 text-sm text-zinc-600"><LogIn className="h-4 w-4 rotate-180" />Back to tracker</button></div>}

      <main className="mx-auto max-w-[1440px] space-y-7 px-4 py-6 pb-28 sm:px-7 sm:py-8 lg:px-10 lg:pb-10">
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
            <button type="button" onClick={() => void handleGoogleSignIn()} disabled={loginBusy} className="inline-flex min-h-12 w-full items-center justify-center gap-3 rounded-2xl border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50 disabled:opacity-60"><svg aria-hidden="true" viewBox="0 0 48 48" className="h-4 w-4"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.2l5.7-5.7C34.9 3.8 29.9 1.5 24 1.5 12.4 1.5 3 10.9 3 22.5S12.4 43.5 24 43.5c11.1 0 20.5-8.1 20.5-20.5 0-1.4-.1-2.7-.4-4z"/><path fill="#FF3D00" d="M6.5 14.6l6.9 5.1C15.4 16 19.3 13.5 24 13.5c3.1 0 5.9 1.2 8 3.2l5.7-5.7C34.9 3.8 29.9 1.5 24 1.5c-7.2 0-13.5 3.9-17 9.6z"/><path fill="#4CAF50" d="M24 43.5c5.7 0 10.6-1.9 14.1-5.2l-6.5-5.5c-2 1.4-4.6 2.2-7.6 2.2-5.3 0-9.7-3.4-11.3-8l-6.7 5.1C6.1 38.7 14.1 43.5 24 43.5z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-1 2.9-3.6 5.1-6.9 6l6.5 5.5c3.9-3.6 6.6-8.9 6.6-15.5 0-1.4-.1-2.7-.4-4z"/></svg>Continue with Google</button>
            <form className="space-y-3" onSubmit={(event) => void handleEmailSignIn(event)}>
              <label className="block text-sm font-medium text-zinc-700">Email<input name="email" type="email" autoComplete="email" required className="mt-1.5 min-h-10 w-full rounded-xl border border-zinc-200 px-3 text-sm outline-none transition focus:border-sage" /></label>
              {loginError && <p role="alert" className="text-sm text-rose-700">{loginError}</p>}
              {loginMessage && <p role="status" className="text-sm text-sage-dark">{loginMessage}</p>}
              <button type="submit" disabled={loginBusy} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-sage-dark px-4 text-sm font-medium text-white transition hover:bg-sage disabled:opacity-60">{loginBusy ? "Sending link..." : "Send a sign-in link"}</button>
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
          {settings.role === "self" && <div id="symptom-check-in" tabIndex={-1} className="scroll-mt-24 outline-none">
            <SymptomLogger profile={profile} userId={userId} initialLogDate={editingLogDate} onHistoryChange={setSymptomLogs} saveActionRef={symptomSaveAction} />
          </div>}
          <div className="grid gap-4 border-y border-zinc-200 py-5 sm:grid-cols-2">
            <button type="button" onClick={() => setActiveView("calendar")} className="flex min-h-16 items-center justify-between gap-4 text-left hover:text-sage-dark"><span><span className="block font-display text-base font-semibold text-zinc-900">Cycle calendar</span><span className="mt-1 block text-sm text-zinc-500">Review recorded dates and estimates</span></span><CalendarDays className="h-5 w-5 flex-none text-sage" /></button>
            <button type="button" onClick={() => setActiveView("planner")} className="flex min-h-16 items-center justify-between gap-4 border-t border-zinc-200 pt-4 text-left hover:text-sage-dark sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0"><span><span className="block font-display text-base font-semibold text-zinc-900">Your planner</span><span className="mt-1 block text-sm text-zinc-500">Keep plans flexible around how you feel</span></span><ListTodo className="h-5 w-5 flex-none text-sage" /></button>
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

      <footer className="mx-auto max-w-[1440px] px-6 py-5 pb-28 text-xs text-zinc-400 lg:pb-6 lg:pl-10">
        {isAuthenticated ? "Your cycle, plans, and symptom history stay in your account." : "Your cycle, plans, and symptom history stay on this device."} Partner sync is invitation-only; Bella conversations stay in this session.
        {syncError && <span role="status" className="ml-2 text-red-700">Sync issue: {syncError}</span>}
      </footer>

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
