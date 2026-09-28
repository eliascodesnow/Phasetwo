import { useState } from "react";
import { X, ShieldCheck } from "lucide-react";
import type { AppSettings, CycleProfile, UserRole } from "../types";

const TIMEZONES = Intl.supportedValuesOf ? Intl.supportedValuesOf("timeZone") : [];

export function SettingsDrawer({
  open,
  onClose,
  settings,
  onSettingsChange,
  profile,
  onProfileChange,
  hasEnvKey,
}: {
  open: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSettingsChange: (s: AppSettings) => void;
  profile: CycleProfile;
  onProfileChange: (p: CycleProfile) => void;
  hasEnvKey: boolean;
}) {
  const [localKey, setLocalKey] = useState(settings.geminiApiKey);

  if (!open) return null;

  function setRole(role: UserRole) {
    onSettingsChange({ ...settings, role, ldrEnabled: role === "partner" ? true : settings.ldrEnabled });
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-zinc-900/20" onClick={onClose} />
      <div className="relative w-full max-w-sm h-full bg-white border-l border-zinc-200 shadow-xl overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-5 border-b border-zinc-100">
          <h3 className="font-display text-base font-semibold text-zinc-900">Settings</h3>
          <button type="button" onClick={onClose} aria-label="Close settings" className="text-zinc-400 hover:text-zinc-600">
            <X className="w-4.5 h-4.5" strokeWidth={1.75} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-7">
          {/* Role */}
          <div>
            <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2">Your role</p>
            <div className="grid grid-cols-1 gap-2">
              <button
                type="button"
                onClick={() => setRole("self")}
                className={`text-left text-sm rounded-lg border px-3.5 py-2.5 transition-colors ${
                  settings.role === "self" ? "border-sage bg-sage-light text-sage-dark" : "border-zinc-200 text-zinc-600"
                }`}
              >
                <span className="font-medium">I track my own cycle</span>
                <p className="text-xs text-zinc-400 mt-0.5">Self-tracking, phase-adaptive tasks, advice for you.</p>
              </button>
              <button
                type="button"
                onClick={() => setRole("partner")}
                className={`text-left text-sm rounded-lg border px-3.5 py-2.5 transition-colors ${
                  settings.role === "partner" ? "border-sage bg-sage-light text-sage-dark" : "border-zinc-200 text-zinc-600"
                }`}
              >
                <span className="font-medium">I'm tracking my partner's cycle</span>
                <p className="text-xs text-zinc-400 mt-0.5">Remote sync, timezone bar, and care-package prompts.</p>
              </button>
            </div>
          </div>

          {/* Cycle profile */}
          <div>
            <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2">
              {settings.role === "partner" ? "Her cycle details" : "Cycle details"}
            </p>
            <div className="space-y-2.5">
              {settings.role === "partner" && (
                <label className="block">
                  <span className="text-xs text-zinc-500">Name</span>
                  <input
                    value={profile.ownerLabel}
                    onChange={(e) => onProfileChange({ ...profile, ownerLabel: e.target.value })}
                    placeholder="Her name"
                    className="mt-1 w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:border-sage"
                  />
                </label>
              )}
              <label className="block">
                <span className="text-xs text-zinc-500">Last period start date</span>
                <input
                  type="date"
                  value={profile.lastPeriodStart}
                  onChange={(e) => onProfileChange({ ...profile, lastPeriodStart: e.target.value })}
                  className="mt-1 w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:border-sage"
                />
              </label>
              <label className="block">
                <span className="text-xs text-zinc-500">Cycle length (days)</span>
                <input
                  type="number"
                  min={20}
                  max={45}
                  value={profile.cycleLength}
                  onChange={(e) =>
                    onProfileChange({ ...profile, cycleLength: Number(e.target.value) || 28 })
                  }
                  className="mt-1 w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:border-sage"
                />
              </label>
              {settings.role === "partner" && (
                <>
                  <label className="block">
                    <span className="text-xs text-zinc-500">Her timezone</span>
                    <select
                      value={profile.timezone}
                      onChange={(e) => onProfileChange({ ...profile, timezone: e.target.value })}
                      className="mt-1 w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:border-sage bg-white"
                    >
                      {TIMEZONES.length === 0 && <option value={profile.timezone}>{profile.timezone}</option>}
                      {TIMEZONES.map((tz: string) => (
                        <option key={tz} value={tz}>
                          {tz}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs text-zinc-500">Her city (for care-package suggestions)</span>
                    <input
                      value={profile.city}
                      onChange={(e) => onProfileChange({ ...profile, city: e.target.value })}
                      placeholder="e.g. Nairobi"
                      className="mt-1 w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:border-sage"
                    />
                  </label>
                </>
              )}
            </div>
          </div>

          {/* API key */}
          <div>
            <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2">Gemini API key</p>
            {hasEnvKey ? (
              <div className="flex items-center gap-2 text-xs text-sage-dark bg-sage-light border border-sage/20 rounded-lg px-3 py-2.5">
                <ShieldCheck className="w-4 h-4 flex-shrink-0" strokeWidth={1.75} />
                Using the key from your local .env.local file. You can override it below.
              </div>
            ) : (
              <p className="text-xs text-zinc-400 mb-2">
                Stored only in this browser's local storage — never sent anywhere but Google's API.
              </p>
            )}
            <input
              type="password"
              value={localKey}
              onChange={(e) => setLocalKey(e.target.value)}
              onBlur={() => onSettingsChange({ ...settings, geminiApiKey: localKey })}
              placeholder="Paste your Gemini API key"
              className="mt-2 w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:border-sage"
            />
            <a
              href="https://aistudio.google.com/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1.5 inline-block text-xs text-sage hover:underline"
            >
              Get a free key from Google AI Studio ↗
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
