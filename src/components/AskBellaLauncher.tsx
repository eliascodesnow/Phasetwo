import { useEffect, useRef, useState, type FormEvent } from "react";
import { Download, LoaderCircle, MessageCircle, RotateCcw, Send, Trash2, X } from "lucide-react";
import { supabase } from "../lib/supabase";
import { MEDICAL_DISCLAIMER } from "../lib/endoContent";
import { BELLA_OFFLINE_REFERENCES, findBellaOfflineReference } from "../lib/bellaOffline";

type BellaSource = { title: string; organization: string; url: string };
type BellaMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  sources?: BellaSource[];
  appointmentSummary?: boolean;
  offlineReference?: boolean;
};

const SUGGESTED_PROMPTS = [
  "What is endometriosis?",
  "Help me understand my recent cycles",
  "What symptoms should I discuss with a doctor?",
  "Prepare a summary for my next appointment",
];

function friendlyError(status?: number): string {
  if (status === 401) return "Please sign in again to use Bella.";
  if (status === 429) return "You’ve reached today’s Bella message limit. Please come back tomorrow.";
  return "Bella is temporarily unavailable. Please try again shortly.";
}

export function AskBellaLauncher() {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<BellaMessage[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [failedMessage, setFailedMessage] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, pending]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  async function sendMessage(text: string) {
    const message = text.trim();
    if (!message || pending) return;
    if (message.length > 1_600) {
      setError("Please keep your message under 1,600 characters.");
      return;
    }
    const userMessage: BellaMessage = { id: crypto.randomUUID(), role: "user", text: message };
    const precedingMessages = messages.slice(-8);
    setMessages((current) => [...current, userMessage]);
    setDraft("");
    setError("");
    setFailedMessage("");

    if (!supabase) {
      setError("Bella is unavailable because secure sign-in is not configured.");
      setFailedMessage(message);
      const reference = findBellaOfflineReference(message);
      if (reference) addOfflineResponse(reference);
      return;
    }

    setPending(true);
    let allowOfflineFallback = true;

    try {
      const { data, error: invokeError } = await supabase.functions.invoke<{
        text?: string;
        sources?: BellaSource[];
      }>("bella-chat", {
        body: {
          message,
          history: precedingMessages.map(({ role, text: content }) => ({ role, content: content.slice(0, 1_200) })),
          conversationId: "session",
        },
      });
      if (invokeError) {
        const status = "status" in invokeError ? Number(invokeError.status) : undefined;
        allowOfflineFallback = status !== 401 && status !== 429;
        throw Object.assign(new Error(friendlyError(status)), { safeMessage: friendlyError(status) });
      }
      if (!data?.text?.trim()) throw new Error("BELLA_EMPTY_RESPONSE");
      const answer: BellaMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        text: data.text.trim(),
        sources: Array.isArray(data.sources) ? data.sources.filter((source) => source && /^https:\/\//.test(source.url)) : [],
        appointmentSummary: /appointment|summary|doctor/i.test(message),
      };
      setMessages((current) => [...current, answer]);
    } catch (requestError) {
      const safeMessage = requestError && typeof requestError === "object" && "safeMessage" in requestError
        ? String(requestError.safeMessage)
        : friendlyError();
      setError(safeMessage);
      setFailedMessage(message);
      if (allowOfflineFallback) {
        const reference = findBellaOfflineReference(message);
        if (reference) addOfflineResponse(reference);
      }
    } finally {
      setPending(false);
    }
  }

  function addOfflineResponse(reference: (typeof BELLA_OFFLINE_REFERENCES)[number]) {
    setMessages((current) => [...current, {
      id: crypto.randomUUID(),
      role: "assistant",
      text: reference.text,
      sources: [reference.source],
      offlineReference: true,
    }]);
  }

  function showOfflineReference(referenceId: string) {
    const reference = BELLA_OFFLINE_REFERENCES.find((item) => item.id === referenceId);
    if (!reference) return;
    addOfflineResponse(reference);
    setError("");
    setFailedMessage("");
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage(draft);
  }

  function downloadSummary(message: BellaMessage) {
    const disclaimer = "This summary reflects information recorded in PhaseTwo. It is not a medical diagnosis.";
    const content = message.text.includes(disclaimer) ? message.text : `${message.text}\n\n${disclaimer}`;
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "phasetwo-appointment-summary.txt";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="fixed bottom-4 right-4 z-40 print:hidden sm:bottom-6 sm:right-6">
      {open && <button type="button" aria-label="Close Ask Bella" onClick={() => setOpen(false)} className="fixed inset-0 z-40 cursor-default bg-zinc-950/20 sm:bg-transparent" />}
      {open && (
        <section role="dialog" aria-modal="true" aria-labelledby="ask-bella-title" className="fixed bottom-20 right-3 z-50 flex h-[min(720px,calc(100dvh-6.5rem))] w-[min(440px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-xl border border-zinc-200 bg-[#fcfbf9] shadow-2xl sm:bottom-24 sm:right-6">
          <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-3.5">
            <div className="min-w-0">
              <div className="min-w-0">
                <h2 id="ask-bella-title" className="font-display text-base font-semibold text-zinc-900">Ask Bella</h2>
                <p className="text-xs text-zinc-500">Your menstrual health companion</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button type="button" onClick={() => { setMessages([]); setError(""); setFailedMessage(""); }} aria-label="Clear conversation" title="Clear conversation" className="flex h-9 w-9 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"><Trash2 className="h-4 w-4" /></button>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close Ask Bella" className="flex h-9 w-9 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"><X className="h-4 w-4" /></button>
            </div>
          </header>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite">
            {messages.length === 0 && (
              <div className="space-y-4">
                <p className="text-sm leading-relaxed text-zinc-700">Hi, I’m Bella. I can share menstrual-health education, help make sense of patterns you’ve recorded, and help you prepare for a healthcare appointment.</p>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTED_PROMPTS.map((prompt) => <button key={prompt} type="button" onClick={() => void sendMessage(prompt)} disabled={pending} className="rounded-lg border border-sage/30 bg-white px-3 py-2 text-left text-xs leading-relaxed text-sage-dark hover:bg-sage-light disabled:opacity-50">{prompt}</button>)}
                </div>
              </div>
            )}
            {messages.map((message) => (
              <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[90%] rounded-lg px-3.5 py-2.5 text-sm leading-relaxed ${message.role === "user" ? "bg-slate text-white" : "border border-zinc-200 bg-white text-zinc-800"}`}>
                  {message.offlineReference && <p className="mb-1 text-[10px] font-semibold uppercase text-zinc-500">Offline reference</p>}
                  <p className="whitespace-pre-wrap">{message.text}</p>
                  {message.appointmentSummary && message.role === "assistant" && <button type="button" onClick={() => downloadSummary(message)} className="mt-3 inline-flex min-h-9 items-center gap-2 border-t border-zinc-100 pt-2 text-xs font-medium text-sage-dark hover:text-sage"><Download className="h-3.5 w-3.5" />Download reviewed summary</button>}
                  {!!message.sources?.length && <div className="mt-3 border-t border-zinc-100 pt-2"><p className="text-[11px] font-semibold text-zinc-500">Sources</p><ul className="mt-1 space-y-1">{message.sources.map((source) => <li key={source.url}><a href={source.url} target="_blank" rel="noopener noreferrer" className="text-xs text-sage-dark underline decoration-sage/40 underline-offset-2 hover:text-sage">{source.organization}: {source.title}</a></li>)}</ul></div>}
                </div>
              </div>
            ))}
            {pending && <div className="flex items-center gap-2 text-sm text-zinc-500"><LoaderCircle className="h-4 w-4 animate-spin text-sage" />Bella is thinking…</div>}
            {error && <div role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}{failedMessage && <button type="button" onClick={() => void sendMessage(failedMessage)} disabled={pending} className="ml-2 inline-flex items-center gap-1 font-medium underline underline-offset-2 disabled:opacity-50"><RotateCcw className="h-3 w-3" />Retry</button>}<p className="mt-2 border-t border-rose-200 pt-2 text-xs font-medium">Offline reference topics</p><div className="mt-1 flex flex-wrap gap-1.5">{BELLA_OFFLINE_REFERENCES.map((reference) => <button key={reference.id} type="button" onClick={() => showOfflineReference(reference.id)} className="rounded border border-rose-200 bg-white px-2 py-1 text-xs text-zinc-700 hover:bg-rose-50">{reference.title}</button>)}</div></div>}
          </div>

          <div className="border-t border-zinc-200 bg-white px-4 py-3">
            <p className="mb-2 text-[11px] leading-relaxed text-zinc-500">{MEDICAL_DISCLAIMER}</p>
            <form onSubmit={submit} className="flex items-end gap-2">
              <input ref={inputRef} value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={1_600} placeholder="Ask about menstrual health…" className="min-h-11 min-w-0 flex-1 rounded-lg border border-zinc-200 px-3 text-sm placeholder:text-zinc-400 focus:border-sage focus:outline-none" />
              <button type="submit" disabled={pending || !draft.trim()} aria-label="Send message" title="Send message" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-slate text-white transition-colors hover:bg-zinc-800 disabled:opacity-40"><Send className="h-4 w-4" /></button>
            </form>
          </div>
        </section>
      )}
      <button type="button" aria-expanded={open} aria-label="Ask Bella" onClick={() => setOpen((current) => !current)} className="inline-flex min-h-12 items-center gap-2 rounded-full border border-[#416353]/20 bg-white px-4 py-1.5 text-sm font-semibold text-zinc-900 shadow-lg transition-transform hover:-translate-y-0.5 hover:shadow-xl">
        Ask Bella
        <MessageCircle className="h-4 w-4 text-sage" />
      </button>
    </div>
  );
}
