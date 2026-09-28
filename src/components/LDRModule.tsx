import { useState } from "react";
import { Clock, Link2, Film, Check, Copy } from "lucide-react";
import type { CycleProfile, Phase } from "../types";
import { currentCycleDay, formatDateInZone, formatTimeInZone, phaseForDay } from "../lib/cycleUtils";
import { buildShareUrl } from "../lib/shareState";

const LOW_ENERGY_DATES = [
  "Teleparty / low-talking movie night",
  "Audio-only story reading",
  "Deliver a warm meal",
];

const HIGH_ENERGY_DATES = [
  "Multiplayer gaming",
  "Virtual museum tour",
  "Co-planning a trip",
];

const WATCH_TOGETHER_SITES = [
  { name: "ScopeMovies", url: "https://scopemovies.com" },
  { name: "Hyperbeam", url: "https://hyperbeam.com" },
];

function isLowEnergyPhase(phase: Phase): boolean {
  return phase === "menstrual" || phase === "luteal";
}

export function LDRModule({
  profile,
  selfTimezone,
}: {
  profile: CycleProfile;
  selfTimezone: string;
}) {
  const [copied, setCopied] = useState(false);

  const day = currentCycleDay(profile);
  const phase = phaseForDay(day, profile.cycleLength);
  const ideas = isLowEnergyPhase(phase.key) ? LOW_ENERGY_DATES : HIGH_ENERGY_DATES;

  async function copyShareLink() {
    const url = buildShareUrl(profile);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt("Copy this share link:", url);
    }
  }

  return (
    <section className="bg-white border border-zinc-200 rounded-xl shadow-card p-6 sm:p-8">
      <h3 className="font-display text-lg font-semibold text-zinc-900">Remote sync</h3>

      {/* Unified timezone + phase bar */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-zinc-100 bg-zinc-50 p-3.5">
          <p className="text-[11px] font-medium text-zinc-400 uppercase tracking-wide">You</p>
          <div className="flex items-center gap-1.5 mt-1">
            <Clock className="w-3.5 h-3.5 text-zinc-400" strokeWidth={1.75} />
            <p className="text-sm font-medium text-zinc-800 tabular">{formatTimeInZone(selfTimezone)}</p>
          </div>
          <p className="text-xs text-zinc-400 mt-0.5">{formatDateInZone(selfTimezone)}</p>
        </div>
        <div className="rounded-lg border border-zinc-100 bg-sage-light p-3.5">
          <p className="text-[11px] font-medium text-sage-dark uppercase tracking-wide">
            {profile.ownerLabel || "Her"}
          </p>
          <div className="flex items-center gap-1.5 mt-1">
            <Clock className="w-3.5 h-3.5 text-sage-dark" strokeWidth={1.75} />
            <p className="text-sm font-medium text-sage-dark tabular">
              {formatTimeInZone(profile.timezone)}
            </p>
          </div>
          <p className="text-xs text-sage-dark/70 mt-0.5">
            {formatDateInZone(profile.timezone)} · Day {day}, {phase.label}
          </p>
        </div>
      </div>

      {/* Virtual date ideas, phase-aligned */}
      <div className="mt-6">
        <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">
          Virtual date ideas · matched to {phase.label.toLowerCase()} energy
        </p>
        <ul className="mt-2 space-y-1.5">
          {ideas.map((idea) => (
            <li
              key={idea}
              className="text-sm text-zinc-700 bg-zinc-50 border border-zinc-100 rounded-lg px-3.5 py-2.5"
            >
              {idea}
            </li>
          ))}
        </ul>
      </div>

      {/* Watch-together links */}
      <div className="mt-5">
        <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide flex items-center gap-1.5">
          <Film className="w-3.5 h-3.5" strokeWidth={1.75} />
          Watch together
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {WATCH_TOGETHER_SITES.map((s) => (
            <a
              key={s.url}
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium text-zinc-600 border border-zinc-200 rounded-full px-3 py-1.5 hover:border-sage hover:text-sage transition-colors"
            >
              {s.name} ↗
            </a>
          ))}
        </div>
      </div>

      {/* Share sync link */}
      <div className="mt-6 border-t border-zinc-100 pt-5">
        <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide flex items-center gap-1.5">
          <Link2 className="w-3.5 h-3.5" strokeWidth={1.75} />
          Share this cycle
        </p>
        <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
          Generates a read-only link with cycle dates and timezone only — no notes, tasks, or chat
          history included.
        </p>
        <button
          type="button"
          onClick={copyShareLink}
          className="mt-2.5 inline-flex items-center gap-1.5 text-xs font-medium bg-slate text-white px-3.5 py-2 rounded-lg hover:bg-zinc-800 transition-colors"
        >
          {copied ? <Check className="w-3.5 h-3.5" strokeWidth={2} /> : <Copy className="w-3.5 h-3.5" strokeWidth={1.75} />}
          {copied ? "Link copied" : "Copy share link"}
        </button>
      </div>
    </section>
  );
}
