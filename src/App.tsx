import { useEffect, useState } from "react";
import { LogOut, Settings, Leaf } from "lucide-react";
import type { AppSettings, ChatMessage, CycleProfile, Task } from "./types";
import { defaultCycleProfile, defaultSettings } from "./lib/storage";
import { readShareCodeFromUrl, clearShareParam } from "./lib/shareState";
import { CycleHeader } from "./components/CycleHeader";
import { TaskPlanner } from "./components/TaskPlanner";
import { AIAssistant } from "./components/AIAssistant";
import { LDRModule } from "./components/LDRModule";
import { SettingsDrawer } from "./components/SettingsDrawer";
import { SymptomLogger } from "./components/SymptomLogger";
import { AuthGate } from "./components/AuthGate";
import { supabase } from "./lib/supabase";
import { loadLocalAppState, type UserAppState } from "./lib/storage";
import { loadSyncedAppState, saveSyncedAppState } from "./lib/userData";

const ENV_API_KEY = (import.meta.env.VITE_OPENROUTER_API_KEY as string | undefined) ?? "";
const SELF_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

export default function App() {
  return <AuthGate>{(user) => <WorkspaceApp key={user.id} userId={user.id} />}</AuthGate>;
}

function WorkspaceApp({ userId }: { userId: string }) {
  const [profile, setProfile] = useState<CycleProfile>(defaultCycleProfile);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [appReady, setAppReady] = useState(false);
  const [syncError, setSyncError] = useState("");

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

  // On load, if a share code is in the URL, offer to import it as "her" profile.
  useEffect(() => {
    if (!appReady) return;
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

  const effectiveApiKey = settings.openRouterApiKey || ENV_API_KEY;
  const showLdr = settings.role === "partner" && settings.ldrEnabled;

  if (!appReady) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-zinc-500">Loading your workspace...</div>;
  }

  return (
    <div className="min-h-screen bg-base">
      <header className="border-b border-zinc-200 bg-white/80 backdrop-saturate-150 sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-5 sm:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Leaf className="w-4.5 h-4.5 text-sage" strokeWidth={1.75} />
            <span className="font-display text-base font-semibold tracking-tight text-zinc-900">
              PhaseTwo
            </span>
          </div>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-800 transition-colors"
          >
            <Settings className="w-4 h-4" strokeWidth={1.75} />
            <span className="hidden sm:inline">Settings</span>
          </button>
          <button
            type="button"
            onClick={() => void signOut()}
            aria-label="Sign out"
            title="Sign out"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 transition-colors"
          >
            <LogOut className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-5 sm:px-8 py-8 space-y-6">
        <CycleHeader profile={profile} />

        {settings.role === "self" && <SymptomLogger profile={profile} userId={userId} />}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <TaskPlanner profile={profile} tasks={tasks} onChange={setTasks} />
          <AIAssistant
            profile={profile}
            role={settings.role}
            apiKey={effectiveApiKey}
            onRequestApiKey={() => setSettingsOpen(true)}
            messages={messages}
            onChange={setMessages}
            ldrEnabled={showLdr}
          />
        </div>

        {showLdr && <LDRModule profile={profile} selfTimezone={SELF_TIMEZONE} />}
      </main>

      <footer className="max-w-5xl mx-auto px-5 sm:px-8 py-8 text-xs text-zinc-400">
        Your cycle, plans, and chat history sync to your account. API keys stay on this device.
        {syncError && <span role="status" className="ml-2 text-red-700">Sync issue: {syncError}</span>}
      </footer>

      <SettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onSettingsChange={setSettings}
        profile={profile}
        onProfileChange={setProfile}
        hasEnvKey={Boolean(ENV_API_KEY)}
      />
    </div>
  );
}
