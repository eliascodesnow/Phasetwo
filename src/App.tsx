import { useEffect, useRef, useState, type FormEvent } from "react";
import { Analytics } from "@vercel/analytics/react";
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
import { clearLocalUserData, LOCAL_GUEST_ID, loadLocalAppState, type UserAppState } from "./lib/storage";
import { loadSyncedAppState, saveSyncedAppState } from "./lib/userData";
import { recordPeriodStart } from "./lib/cycleUtils";
import type { SymptomLog } from "./lib/symptoms";
import { WeeklyStreakCard } from "./components/WeeklyStreakCard";

const SELF_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;
type WorkspaceView = "home" | "history" | "report" | "settings" | "login";

const WORKSPACE_TABS: Array<{ key: WorkspaceView; label: string; icon: typeof Home }> = [
  { key: "home", label: "Home", icon: Home },
  { key: "history", label: "History", icon: CalendarDays },
  { key: "report", label: "Report", icon: FileText },
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
  const [activeView, setActiveView] = useState<WorkspaceView>("home");
  const [editingLogDate, setEditingLogDate] = useState<string | undefined>();
  const [appReady, setAppReady] = useState(false);
  const [syncError, setSyncError] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginMessage, setLoginMessage] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const deletingAccount = useRef(false);
  const symptomSaveAction = useRef<SymptomLoggerSaveRef["current"]>(null);

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
              <button key={key} type="button" aria-current={activeView === key ? "page" : undefined} onClick={() => { if (key === "home") setEditingLogDate(undefined); setActiveView(key); }} className={`inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors ${activeView === key ? "bg-zinc-100 text-zinc-900" : "text-zinc-600 hover:bg-zinc-50"}`}>
                <Icon className="h-4 w-4" strokeWidth={1.8} />{label}
              </button>
            ))}
          </nav>}
          {!isAuthenticated && supabase && activeView === "login" ? <button type="button" onClick={() => setActiveView("home")} className="order-2 inline-flex items-center gap-2 rounded-md px-3 py-2 text-xs font-semibold text-zinc-600 transition-colors hover:bg-zinc-50 sm:order-2">
            Back to app
          </button> : isAuthenticated && <button
            type="button"
            onClick={() => void signOut()}
            aria-label="Sign out"
            title="Sign out"
            className="order-2 inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-600 transition-colors hover:bg-zinc-50 sm:order-2"
          >
            <LogOut className="h-3.5 w-3.5" strokeWidth={1.75} />
            Sign out
          </button>}
        </div>
      </header>

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

        {activeView === "home" && <>
          <CycleHeader profile={displayedProfile} />
          {settings.role === "self" && isAuthenticated && <WeeklyStreakCard weeks={weeklyLoginStreak} />}
          {settings.role === "self" && <div className="mx-auto flex justify-center">
            <button type="button" onClick={() => setProfile((current) => recordPeriodStart(current, new Date().toISOString().slice(0, 10)))} className="inline-flex min-h-12 items-center gap-2 rounded-full bg-sage-dark px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-sage-darker">
              <HeartPulse className="h-4 w-4" />Record period
            </button>
          </div>}
          <PeriodCalendar profile={displayedProfile} logs={settings.role === "self" ? symptomLogs : []} showRecordButton={settings.role === "self"} onRecordPeriodStart={(date) => setProfile((current) => ({ ...current, lastPeriodStart: date }))} />
          {settings.role === "self" && <SymptomLogger profile={profile} userId={userId} initialLogDate={editingLogDate} onHistoryChange={setSymptomLogs} saveActionRef={symptomSaveAction} />}
          <div className="grid grid-cols-1 gap-6 items-start lg:grid-cols-2">
            <TaskPlanner profile={displayedProfile} tasks={tasks} onChange={setTasks} />
            {showLdr && <LDRModule profile={displayedProfile} selfTimezone={SELF_TIMEZONE} />}
          </div>
        </>}

        {activeView === "history" && <HistoryView profile={displayedProfile} logs={settings.role === "self" ? symptomLogs : []} onProfileChange={setProfile} onEditLog={(date) => { setEditingLogDate(date); setActiveView("home"); }} onSave={saveWorkspace} saving={saving} savedAt={savedAt} />}
        {activeView === "report" && <ReportView profile={displayedProfile} logs={settings.role === "self" ? symptomLogs : []} />}
        {activeView === "settings" && <SettingsView settings={settings} onSettingsChange={setSettings} isAuthenticated={isAuthenticated} isLinkedPartner={Boolean(sharedCycleProfile)} onLeavePartnerSync={leavePartnerSync} onPartnerLinked={refreshPartnerLink} profile={profile} onProfileChange={setProfile} onDeleteAccount={deleteAccount} onSave={saveWorkspace} saving={saving} savedAt={savedAt} />}

        {activeView === "home" && settings.role === "self" && <EndometriosisAwareness logs={symptomLogs} profile={profile} />}
      </main>

      <footer className="max-w-6xl mx-auto px-6 sm:px-10 py-8 text-xs text-zinc-400">
        {isAuthenticated ? "Your cycle, plans, and symptom history stay in your account." : "Your cycle, plans, and symptom history stay on this device."} Partner sync is invitation-only; Bella can help with shared advice when enabled.
        {syncError && <span role="status" className="ml-2 text-red-700">Sync issue: {syncError}</span>}
      </footer>

      {settings.role === "self" && <AskBellaLauncher />}
      {showLdr && <PartnerAdviceLauncher profile={displayedProfile} messages={messages} onMessagesChange={setMessages} />}
    </div>
  );
}
