import { AriReply } from "./AriReply";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { LoaderCircle, RotateCcw, Send, Sparkles, Trash2, X } from "lucide-react";
import type { ChatMessage, CycleProfile } from "../types";
import { currentCycleDay, phaseForDay } from "../lib/cycleUtils";
import { supabase } from "../lib/supabase";
import { errorStatus } from "../lib/bellaClient";
import { useScrollLock } from "../lib/scrollLock";
import {
  ARI_MAX_OTHER_LENGTH,
  ARI_NAME,
  ARI_OTHER_KEY,
  ARI_PRODUCT_NAME,
  ARI_RELATIONSHIPS,
  ARI_SUGGESTED_PROMPTS,
  ariFriendlyError,
  ariPhaseLesson,
  choiceLabel,
  isValidChoice,
  loadChoice,
  saveChoice,
  type AriPhase,
  type AriRelationshipChoice,
} from "../lib/ariClient";

const MAX_MESSAGE = 800;

export function AriKnowsLauncher({
  profile,
  messages,
  onMessagesChange,
  isAuthenticated = true,
}: {
  profile: CycleProfile;
  messages: ChatMessage[];
  onMessagesChange: (messages: ChatMessage[]) => void;
  isAuthenticated?: boolean;
}) {
  const [open, setOpen] = useState(false);
  useScrollLock(open);
  const [choice, setChoice] = useState<AriRelationshipChoice | null>(() => loadChoice());
  const [picking, setPicking] = useState(() => loadChoice() === null);
  const [pendingKey, setPendingKey] = useState<string>("");
  const [otherText, setOtherText] = useState("");
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [failed, setFailed] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const day = currentCycleDay(profile);
  const phase = phaseForDay(day, profile.cycleLength);
  const phaseKey = phase.key as AriPhase;
  const person = profile.ownerLabel && !/^(you|me)$/i.test(profile.ownerLabel) ? profile.ownerLabel : "them";
  const lesson = useMemo(() => ariPhaseLesson(phaseKey), [phaseKey]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, pending, picking]);

  useEffect(() => {
    if (open && !picking) inputRef.current?.focus();
  }, [open, picking]);

  function confirmChoice(next: AriRelationshipChoice) {
    if (!isValidChoice(next)) return;
    saveChoice(next);
    setChoice(next);
    setPicking(false);
    setPendingKey("");
    setOtherText("");
  }

  async function send(text: string) {
    const message = text.trim();
    if (!message || pending || !choice) return;
    if (message.length > MAX_MESSAGE) {
      setError(`Please keep your message under ${MAX_MESSAGE} characters.`);
      return;
    }
    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: "user", text: message, createdAt: Date.now() };
    const history = messages.slice(-8).map((item) => ({ role: item.role === "model" ? "assistant" : "user", content: item.text.slice(0, 900) }));
    const next = [...messages, userMessage];
    onMessagesChange(next);
    setDraft("");
    setError("");
    setFailed("");

    if (!isAuthenticated || !supabase) {
      setError("Sign in to chat with Ari. Today’s guide above works offline.");
      setFailed(message);
      return;
    }

    setPending(true);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke<{ text?: string }>("ari-chat", {
        body: { message, history, relationship: choice },
      });
      if (invokeError) throw Object.assign(new Error("ARI_ERROR"), { status: errorStatus(invokeError) });
      if (!data?.text?.trim()) throw new Error("ARI_EMPTY_RESPONSE");
      onMessagesChange([...next, { id: crypto.randomUUID(), role: "model", text: data.text.trim(), createdAt: Date.now() }]);
    } catch (requestError) {
      const status = requestError && typeof requestError === "object" && "status" in requestError ? Number(requestError.status) : undefined;
      setError(ariFriendlyError(status));
      setFailed(status === 429 || status === 401 ? "" : message);
    } finally {
      setPending(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void send(draft);
  }

  const otherSelected = pendingKey === ARI_OTHER_KEY;

  return (
    <div className="fixed z-40 print:hidden" style={{ left: "max(1rem, env(safe-area-inset-left, 0px))", bottom: "max(1rem, env(safe-area-inset-bottom, 0px))" }}>
      {open && <button type="button" aria-label="Close Ari Knows" onClick={() => setOpen(false)} className="fixed inset-0 z-40 cursor-default bg-slate-950/40 backdrop-blur-[2px]" />}
      {open && (
        <section role="dialog" aria-modal="true" aria-labelledby="ari-title" className="fixed bottom-[calc(env(safe-area-inset-bottom,0px)+5rem)] left-3 z-50 flex h-[min(720px,calc(100dvh-7.5rem))] w-[min(440px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-xl border border-zinc-200 bg-surface shadow-2xl">
          <header className="flex items-center justify-between border-b border-zinc-200 bg-zinc-100 px-4 py-3.5">
            <div className="min-w-0">
              <h2 id="ari-title" className="font-display text-base font-semibold text-ink">{ARI_PRODUCT_NAME}</h2>
              <p className="text-xs text-mute">
                {choice && !picking ? <>Supporting {person} as their {choiceLabel(choice).toLowerCase()}</> : "Support for the people who care about them"}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {choice && !picking && <button type="button" onClick={() => { setPendingKey(choice.key); setOtherText(choice.other ?? ""); setPicking(true); }} aria-label="Change your relationship" title="Change your relationship" className="flex h-9 w-9 items-center justify-center rounded-md text-mute hover:bg-zinc-200"><RotateCcw className="h-4 w-4" /></button>}
              {messages.length > 0 && <button type="button" onClick={() => { onMessagesChange([]); setError(""); setFailed(""); }} aria-label="Clear conversation" title="Clear conversation" className="flex h-9 w-9 items-center justify-center rounded-md text-mute hover:bg-zinc-200"><Trash2 className="h-4 w-4" /></button>}
              <button type="button" onClick={() => setOpen(false)} aria-label="Close Ari Knows" className="flex h-9 w-9 items-center justify-center rounded-md text-mute hover:bg-zinc-200"><X className="h-4 w-4" /></button>
            </div>
          </header>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-4" aria-live="polite">
            {picking ? (
              <div className="space-y-3">
                <p className="text-sm leading-relaxed text-ink">Hi, I’m {ARI_NAME}. Who are you to {person}? I’ll tailor my advice to your relationship.</p>
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Your relationship">
                  {ARI_RELATIONSHIPS.map((item) => (
                    <button key={item.key} type="button" role="radio" aria-checked={pendingKey === item.key} onClick={() => { setPendingKey(item.key); if (item.key !== ARI_OTHER_KEY) confirmChoice({ key: item.key }); }} className={`min-h-9 rounded-full border px-3.5 text-sm transition-colors ${pendingKey === item.key ? "border-sky-500 bg-sky-500 text-white" : "border-zinc-200 bg-surface text-ink text-ink hover:bg-zinc-100"}`}>{item.label}</button>
                  ))}
                </div>
                {otherSelected && (
                  <form onSubmit={(event) => { event.preventDefault(); confirmChoice({ key: ARI_OTHER_KEY, other: otherText }); }} className="flex gap-2">
                    <input autoFocus value={otherText} onChange={(event) => setOtherText(event.target.value)} maxLength={ARI_MAX_OTHER_LENGTH} placeholder="e.g. Aunt, cousin, teammate, mentor" aria-label="Describe your relationship" className="min-h-10 min-w-0 flex-1 rounded-lg border border-zinc-200 bg-surface text-ink px-3 text-sm placeholder:text-mute focus:border-sky-500 focus:outline-none" />
                    <button type="submit" disabled={!otherText.trim()} className="min-h-10 rounded-lg bg-sky-500 px-4 text-sm font-medium text-white hover:bg-sky-600 disabled:opacity-50">Done</button>
                  </form>
                )}
                {choice && <button type="button" onClick={() => { setPicking(false); setPendingKey(""); }} className="text-xs font-medium text-sky-600 underline">Keep as {choiceLabel(choice)}</button>}
              </div>
            ) : (
              <>
                <section className="rounded-lg border border-zinc-200 bg-surface p-3.5">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-sky-600"><Sparkles className="h-3.5 w-3.5" />Today · Day {day} · {phase.label} phase (estimate)</p>
                  <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink">{lesson}</p>
                </section>
                {messages.length === 0 && (
                  <div className="flex flex-wrap gap-2">
                    {ARI_SUGGESTED_PROMPTS.map((prompt) => <button key={prompt} type="button" disabled={pending} onClick={() => void send(prompt)} className="rounded-lg border border-zinc-200 bg-surface text-ink px-3 py-2 text-left text-xs leading-relaxed text-ink hover:bg-zinc-100 disabled:opacity-50">{prompt}</button>)}
                  </div>
                )}
                {messages.map((message) => (
                  <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[92%] rounded-xl px-4 py-3 text-[15px] leading-relaxed ${message.role === "user" ? "bg-sky-600 text-white" : "border border-zinc-200 bg-surface text-ink text-ink"}`}>{message.role === "user" ? <p className="whitespace-pre-wrap">{message.text}</p> : <AriReply text={message.text} />}</div>
                  </div>
                ))}
                {pending && <div className="flex items-center gap-2 text-sm text-mute"><LoaderCircle className="h-4 w-4 animate-spin text-sky-500" />Ari is typing…</div>}
                {error && (
                  <div role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                    {error}
                    {failed && <button type="button" onClick={() => void send(failed)} className="ml-2 font-semibold underline">Retry</button>}
                  </div>
                )}
              </>
            )}
          </div>

          {!picking && (
            <div className="border-t border-zinc-200 bg-surface px-4 py-3">
              <form onSubmit={submit} className="flex items-end gap-2">
                <input ref={inputRef} value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={MAX_MESSAGE} placeholder={`Ask how to support ${person}…`} className="min-h-11 min-w-0 flex-1 rounded-lg border border-zinc-200 bg-surface px-3 text-sm text-ink placeholder:text-mute focus:border-sky-500 focus:outline-none" />
                <button type="submit" disabled={pending || !draft.trim()} aria-label="Send message" title="Send message" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-400 to-indigo-500 text-white transition-opacity hover:opacity-90 disabled:opacity-50"><Send className="h-4 w-4" /></button>
              </form>
            </div>
          )}
        </section>
      )}
      <button type="button" data-tour="partner-advice" aria-expanded={open} aria-haspopup="dialog" aria-label={ARI_PRODUCT_NAME} title={ARI_PRODUCT_NAME} onClick={() => setOpen((current) => !current)} className="inline-flex h-14 w-14 items-center justify-center gap-2 rounded-full bg-gradient-to-br from-sky-300 via-sky-400 to-indigo-400 text-sm font-semibold text-white shadow-lg ring-1 ring-black/5 transition-transform hover:-translate-y-0.5 hover:shadow-xl sm:h-12 sm:w-auto sm:px-5">
        <Sparkles className="h-6 w-6 sm:h-4 sm:w-4" strokeWidth={2} />
        <span className="hidden sm:inline">{ARI_PRODUCT_NAME}</span>
      </button>
    </div>
  );
}
