import { useState } from "react";
import { HeartHandshake, MessageCircle, X } from "lucide-react";
import type { ChatMessage, CycleProfile, Phase } from "../types";
import { currentCycleDay, phaseForDay } from "../lib/cycleUtils";
import { AIAssistant } from "./AIAssistant";

const MOODS = [
  { key: "quiet", label: "Wants quiet or space" },
  { key: "comfort", label: "Feels low or uncomfortable" },
  { key: "overwhelmed", label: "Feels stressed or overwhelmed" },
  { key: "upbeat", label: "Feels upbeat and social" },
  { key: "unsure", label: "I am not sure yet" },
] as const;

type Mood = (typeof MOODS)[number]["key"];

const SUPPORT: Record<Phase, Record<Mood, string>> = {
  menstrual: {
    quiet: "Offer a low-pressure check-in, then give them the quiet they asked for. Leave comfort items or a meal if welcome.",
    comfort: "Ask what kind of comfort they want. Offer a warm drink, heat pack, or help with a practical task if welcome.",
    overwhelmed: "Take one small task off their plate and keep plans flexible. Ask before changing anything on their behalf.",
    upbeat: "Follow their lead on plans and energy. A shared activity can be lovely if they want it.",
    unsure: "Ask what would feel supportive today; symptoms and preferences vary from person to person and cycle to cycle.",
  },
  follicular: {
    quiet: "Respect their need for downtime even if this phase is often described as higher energy. Offer calm company without pressure.",
    comfort: "Ask whether they want listening, company, or practical help. Let their answer lead.",
    overwhelmed: "Help break a task into a manageable next step, and check whether they want help or a listening ear.",
    upbeat: "If they are interested, plan something collaborative or try a new activity together. Keep the choice theirs.",
    unsure: "Start with an open question about the kind of support they would enjoy; phase patterns are not predictions.",
  },
  ovulatory: {
    quiet: "Make space for a quieter day and avoid assuming they want to socialize. A short, gentle check-in may be enough.",
    comfort: "Check what comfort means to them and offer practical support without prescribing what they should feel.",
    overwhelmed: "Offer to simplify plans or handle one task. Ask what would actually help before stepping in.",
    upbeat: "Suggest a social or shared activity if they would enjoy it, with an easy way to change plans.",
    unsure: "Ask what they are in the mood for today. People do not experience cycle phases in one universal way.",
  },
  luteal: {
    quiet: "Offer a quieter plan and respect their space. Let them know you are available without expecting an immediate response.",
    comfort: "Ask what would make today easier. Offer comfort or practical help, and follow their preferences.",
    overwhelmed: "Reduce friction where you can: take on a chore, keep plans flexible, and ask before making decisions for them.",
    upbeat: "Enjoy the energy they are expressing now; do not assume this phase must mean low mood or low energy.",
    unsure: "A gentle, open check-in is best. Mood can change for many reasons and cycle phases do not determine it.",
  },
};

export function PartnerAdviceLauncher({
  profile,
  messages,
  onMessagesChange,
}: {
  profile: CycleProfile;
  messages: ChatMessage[];
  onMessagesChange: (messages: ChatMessage[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [mood, setMood] = useState<Mood>("unsure");
  const day = currentCycleDay(profile);
  const phase = phaseForDay(day, profile.cycleLength);

  return (
    <div className="fixed bottom-4 left-4 z-40 print:hidden">
      {open && <div className="fixed inset-0 z-40 bg-zinc-950/20" onClick={() => setOpen(false)} />}
      {open && <section role="dialog" aria-modal="true" aria-labelledby="partner-advice-title" className="absolute bottom-14 left-0 z-50 flex max-h-[min(78vh,760px)] w-[min(420px,calc(100vw-2rem))] flex-col overflow-y-auto rounded-xl border border-zinc-200 bg-[#fbf7f5] p-3 shadow-xl sm:p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2"><HeartHandshake className="h-4 w-4 text-sage" /><h2 id="partner-advice-title" className="font-display text-base font-semibold text-zinc-900">Partner advice</h2></div>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close partner advice" className="flex h-9 w-9 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100"><X className="h-4 w-4" /></button>
        </div>
        <section className="mb-3 rounded-lg border border-sage/25 bg-white p-3">
          <p className="text-xs font-medium text-sage-dark">Day {day} · {phase.label} phase</p>
          <label className="mt-2 block text-xs font-medium text-zinc-600">What have they shared about how they feel?
            <select value={mood} onChange={(event) => setMood(event.target.value as Mood)} className="mt-1.5 min-h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-800 focus:border-sage focus:outline-none">
              {MOODS.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
            </select>
          </label>
          <p className="mt-2 text-sm leading-relaxed text-zinc-700">{SUPPORT[phase.key][mood]}</p>
          <p className="mt-2 text-[11px] text-zinc-400">Cycle phases are context, not a prediction of mood. Ask and follow what they tell you.</p>
        </section>
        <AIAssistant profile={profile} role="partner" messages={messages} onChange={onMessagesChange} ldrEnabled={false} />
      </section>}
      <button type="button" aria-expanded={open} onClick={() => setOpen((current) => !current)} className="inline-flex min-h-12 items-center gap-2 rounded-full bg-[#b96070] px-4 py-3 text-sm font-semibold text-white shadow-lg transition-colors hover:bg-[#a95263]">
        <MessageCircle className="h-4 w-4" />Partner advice
      </button>
    </div>
  );
}