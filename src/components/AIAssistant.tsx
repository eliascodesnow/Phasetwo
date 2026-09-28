import { useEffect, useRef, useState } from "react";
import { Send, MessageCircle, KeyRound, PackageOpen } from "lucide-react";
import type { ChatMessage, CycleProfile, UserRole } from "../types";
import { buildSystemPrompt, carePackagePrompt, sendChatMessage } from "../lib/gemini";
import { currentCycleDay, phaseForDay } from "../lib/cycleUtils";

export function AIAssistant({
  profile,
  role,
  apiKey,
  onRequestApiKey,
  messages,
  onChange,
  ldrEnabled,
}: {
  profile: CycleProfile;
  role: UserRole;
  apiKey: string;
  onRequestApiKey: () => void;
  messages: ChatMessage[];
  onChange: (messages: ChatMessage[]) => void;
  ldrEnabled: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const day = currentCycleDay(profile);
  const phase = phaseForDay(day, profile.cycleLength);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, pending]);

  async function send(text: string) {
    const t = text.trim();
    if (!t || pending) return;

    if (!apiKey) {
      setError("Add your Gemini API key in Settings to start chatting.");
      return;
    }

    setError(null);
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: "user", text: t, createdAt: Date.now() };
    const nextMessages = [...messages, userMsg];
    onChange(nextMessages);
    setDraft("");
    setPending(true);

    try {
      const systemPrompt = buildSystemPrompt(profile, phase, day, role);
      const reply = await sendChatMessage({
        apiKey,
        systemPrompt,
        history: messages,
        message: t,
      });
      const modelMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "model",
        text: reply,
        createdAt: Date.now(),
      };
      onChange([...nextMessages, modelMsg]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setError(
        msg === "MISSING_API_KEY"
          ? "Add your Gemini API key in Settings to start chatting."
          : "Couldn't reach the assistant. Check your API key and connection, then try again."
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="bg-white border border-zinc-200 rounded-xl shadow-card p-6 sm:p-8 flex flex-col h-full">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <MessageCircle className="w-4 h-4 text-sage" strokeWidth={1.75} />
          <h3 className="font-display text-lg font-semibold text-zinc-900">Partner advice</h3>
        </div>
        {!apiKey && (
          <button
            type="button"
            onClick={onRequestApiKey}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-700"
          >
            <KeyRound className="w-3.5 h-3.5" strokeWidth={1.75} />
            Add API key
          </button>
        )}
      </div>
      <p className="text-xs text-zinc-400 mt-1">
        Grounded in Day {day} · {phase.label} phase{role === "partner" ? ` · ${profile.ownerLabel}` : ""}
      </p>

      <div ref={scrollRef} className="mt-4 flex-1 min-h-[220px] max-h-[420px] overflow-y-auto space-y-3 pr-1">
        {messages.length === 0 && (
          <p className="text-sm text-zinc-400 py-8 text-center">
            Ask for support ideas, meal suggestions, or how to check in — tuned to the current phase.
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-lg px-3.5 py-2.5 text-sm leading-relaxed ${
                m.role === "user"
                  ? "bg-slate text-white"
                  : "bg-zinc-50 text-zinc-800 border border-zinc-100"
              }`}
            >
              {m.text}
            </div>
          </div>
        ))}
        {pending && (
          <div className="flex justify-start">
            <div className="bg-zinc-50 border border-zinc-100 rounded-lg px-3.5 py-2.5 text-sm text-zinc-400">
              Thinking…
            </div>
          </div>
        )}
      </div>

      {error && <p className="mt-2 text-xs text-phase-menstrual-text">{error}</p>}

      {ldrEnabled && role === "partner" && (
        <button
          type="button"
          onClick={() => send(carePackagePrompt(profile, phase))}
          disabled={pending}
          className="mt-3 inline-flex items-center gap-1.5 self-start text-xs font-medium text-sage border border-sage/30 bg-sage-light px-3 py-1.5 rounded-full hover:bg-sage/10 transition-colors disabled:opacity-50"
        >
          <PackageOpen className="w-3.5 h-3.5" strokeWidth={1.75} />
          Suggest a care package
        </button>
      )}

      <div className="mt-3 flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send(draft)}
          placeholder="Ask for a suggestion…"
          className="flex-1 border border-zinc-200 rounded-lg px-3.5 py-2.5 text-sm placeholder:text-zinc-400 focus:border-sage transition-colors"
        />
        <button
          type="button"
          onClick={() => send(draft)}
          disabled={pending}
          aria-label="Send"
          className="inline-flex items-center justify-center bg-slate text-white w-10 h-10 rounded-lg hover:bg-zinc-800 transition-colors disabled:opacity-50"
        >
          <Send className="w-4 h-4" strokeWidth={2} />
        </button>
      </div>
    </section>
  );
}
