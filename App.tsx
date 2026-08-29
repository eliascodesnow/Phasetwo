import { useEffect, useState } from "react";
import { Settings, Leaf } from "lucide-react";
import type { AppSettings, ChatMessage, CycleProfile, Task } from "./types";
import { storage, defaultCycleProfile, defaultSettings } from "./lib/storage";
import { readShareCodeFromUrl, clearShareParam } from "./lib/shareState";
import { CycleHeader } from "./components/CycleHeader";
import { TaskPlanner } from "./components/TaskPlanner";
import { AIAssistant } from "./components/AIAssistant";
import { LDRModule } from "./components/LDRModule";
import { SettingsDrawer } from "./components/SettingsDrawer";

const ENV_API_KEY = (import.meta.env.VITE_GEMINI_API_KEY as string | undefined) ?? "";
const SELF_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

export default function App() {
  const [profile, setProfile] = useState<CycleProfile>(storage.loadCycle());
  const [tasks, setTasks] = useState<Task[]>(storage.loadTasks());
  const [settings, setSettings] = useState<AppSettings>(storage.loadSettings());
  const [messages, setMessages] = useState<ChatMessage[]>(storage.loadChat());
  const [settingsOpen, setSettingsOpen] = useState(false);

  // On load, if a share code is in the URL, offer to import it as "her" profile.
  useEffect(() => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => storage.saveCycle(profile), [profile]);
  useEffect(() => storage.saveTasks(tasks), [tasks]);
  useEffect(() => storage.saveSettings(settings), [settings]);
  useEffect(() => storage.saveChat(messages), [messages]);

  const effectiveApiKey = settings.geminiApiKey || ENV_API_KEY;
  const showLdr = settings.role === "partner" && settings.ldrEnabled;

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
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-5 sm:px-8 py-8 space-y-6">
        <CycleHeader profile={profile} />

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
        All data stays in this browser. Only chat messages are sent, directly to Google's Gemini API.
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
