import { useEffect, useRef, useState } from "react";
import { CalendarDays, FileText, HeartPulse, Home, LogOut, Leaf, Settings } from "lucide-react";
import type { AppSettings, ChatMessage, CycleProfile, Task } from "./types";
import { defaultCycleProfile, defaultSettings } from "./lib/storage";
import { readShareCodeFromUrl, clearShareParam } from "./lib/shareState";
import { CycleHeader } from "./components/CycleHeader";
import { TaskPlanner } from "./components/TaskPlanner";
import { LDRModule } from "./components/LDRModule";
import { SymptomLogger } from "./components/SymptomLogger";
import { EndometriosisAwareness } from "./components/EndometriosisAwareness";
import { PeriodCalendar } from "./components/PeriodCalendar";
import { HistoryView } from "./components/HistoryView";
import { ReportView } from "./components/ReportView";
import { SettingsView } from "./components/SettingsView";
import { PartnerAdviceLauncher } from "./components/PartnerAdviceLauncher";
import { AuthGate } from "./components/AuthGate";
import { supabase } from "./lib/supabase";
import { clearLocalUserData, loadLocalAppState, type UserAppState } from "./lib/storage";
import { loadSyncedAppState, saveSyncedAppState } from "./lib/userData";
import { recordPeriodStart } from "./lib/cycleUtils";
import type { SymptomLog } from "./lib/symptoms";

const ENV_API_KEY = (import.meta.env.VITE_OPENROUTER_API_KEY as string | undefined) ?? "";
const SELF_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;
type WorkspaceView = "home" | "history" | "report" | "settings";

const WORKSPACE_TABS: Array<{ key: WorkspaceView; label: string; icon: typeof Home }> = [
  { key: "home", label: "Home", icon: Home },
  { key: "history", label: "History", icon: CalendarDays },
  { key: "report", label: "Report", icon: FileText },
  { key: "settings", label: "Settings", icon: Settings },
];

export default function App() {
  return <AuthGate>{(user) => <WorkspaceApp key={user.id} userId={user.id} />}</AuthGate>;
}

function WorkspaceApp({ userId }: { userId: string }) {
  const [profile, setProfile] = useState<CycleProfile>(defaultCycleProfile);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [symptomLogs, setSymptomLogs] = useState<SymptomLog[]>([]);
  const [activeView, setActiveView] = useState<WorkspaceView>("home");
  const [localKey, setLocalKey] = useState("");
  const [appReady, setAppReady] = useState(false);
  const [syncError, setSyncError] = useState("");
  const deletingAccount = useRef(false);

  useEffect(() => {
    let ignore = false;
    setAppReady(false);

    void loadSyncedAppState(userId)
      .then((state) => {
        if (ignore) return;
        setProfile(state.cycleProfile);
        setTasks(state.tasks);
        setSettings(state.appSettings);
        setLocalKey(state.appSettings.openRouterApiKey);
        setMessages(state.chatMessages);
      })
      .catch((error: unknown) => {
        if (ignore) return;
        const localState = loadLocalAppState(userId);
        setProfile(localState.cycleProfile);
        setTasks(localState.tasks);
        setSettings(localState.appSettings);
        setLocalKey(localState.appSettings.openRouterApiKey);
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

  // On load, if a share code is in the URL, offer to import it as "her" profile.
  useEffect(() => {
    if (!appReady || deletingAccount.current) return;
    const shared = readShareCodeFromUrl();
    if (shared) {
      const accept = window.confirm(
        `This link shares ${shared.ownerLabel || "a"} cycle synced for Day tracking. Import it?`
      );
      if (accept) {
        setProfile((p) => ({ ...p, ...shared }));
        setSettings((s) => ({ ...s, role: "partner", ldrEnabled: true }));
      }
      clearShareParam();
    }
  }, [appReady]);

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
        .then(() => setSyncError(""))
        .catch((error: unknown) => {
          setSyncError(error instanceof Error ? error.message : "Unable to sync your data.");
        });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [appReady, userId, profile, tasks, settings, messages]);

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

  const effectiveApiKey = settings.openRouterApiKey || ENV_API_KEY;
  const showLdr = settings.role === "partner" && settings.ldrEnabled;

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
          <nav aria-label="Main navigation" className="order-3 flex w-full items-center gap-1 overflow-x-auto sm:order-2 sm:w-auto">
            {WORKSPACE_TABS.map(({ key, label, icon: Icon }) => (
              <button key={key} type="button" aria-current={activeView === key ? "page" : undefined} onClick={() => setActiveView(key)} className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors ${activeView === key ? "bg-sage-light text-sage-dark" : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"}`}>
                <Icon className="h-4 w-4" strokeWidth={1.8} />{label}
              </button>
            ))}
          </nav>
          <button
            type="button"
            onClick={() => void signOut()}
            aria-label="Sign out"
            title="Sign out"
            className="order-2 inline-flex h-9 w-9 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 transition-colors sm:order-3"
          >
            <LogOut className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto space-y-7 px-4 py-6 pb-24 sm:px-8 sm:py-8">
        {activeView === "home" && <>
          <CycleHeader profile={profile} />
          <div className="mx-auto flex justify-center">
            <button type="button" onClick={() => setProfile((current) => recordPeriodStart(current, new Date().toISOString().slice(0, 10)))} className="inline-flex min-h-12 items-center gap-2 rounded-full bg-[#b96070] px-7 py-3 text-sm font-semibold text-white shadow-card transition-colors hover:bg-[#a95263]">
              <HeartPulse className="h-4 w-4" />Record period
            </button>
          </div>
          <PeriodCalendar profile={profile} logs={settings.role === "self" ? symptomLogs : []} onRecordPeriodStart={(date) => setProfile((current) => recordPeriodStart(current, date))} />
          {settings.role === "self" && <SymptomLogger profile={profile} userId={userId} onHistoryChange={setSymptomLogs} />}
          <div className="grid grid-cols-1 gap-6 items-start lg:grid-cols-2">
            <TaskPlanner profile={profile} tasks={tasks} onChange={setTasks} />
            {showLdr && <LDRModule profile={profile} selfTimezone={SELF_TIMEZONE} />}
          </div>
        </>}

        {activeView === "history" && <HistoryView profile={profile} logs={settings.role === "self" ? symptomLogs : []} />}
        {activeView === "report" && <ReportView profile={profile} logs={settings.role === "self" ? symptomLogs : []} />}
        {activeView === "settings" && <SettingsView settings={settings} onSettingsChange={setSettings} profile={profile} onProfileChange={setProfile} localKey={localKey} onLocalKeyChange={setLocalKey} hasEnvKey={Boolean(ENV_API_KEY)} onDeleteAccount={deleteAccount} />}

        {activeView === "home" && <EndometriosisAwareness logs={settings.role === "self" ? symptomLogs : []} profile={profile} />}
      </main>

      <footer className="max-w-6xl mx-auto px-6 sm:px-10 py-8 text-xs text-zinc-400">
        Your cycle, plans, and chat history sync to your account. API keys stay on this device.
        {syncError && <span role="status" className="ml-2 text-red-700">Sync issue: {syncError}</span>}
      </footer>

      {showLdr && <PartnerAdviceLauncher profile={profile} apiKey={effectiveApiKey} onRequestApiKey={() => setActiveView("settings")} messages={messages} onMessagesChange={setMessages} />}
    </div>
  );
}
