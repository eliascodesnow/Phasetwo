import { X } from "lucide-react";
import type { AppSettings, CycleProfile, UserRole } from "../types";
import { MEDICAL_DISCLAIMER } from "../lib/endoContent";

const TIMEZONES = Intl.supportedValuesOf ? Intl.supportedValuesOf("timeZone") : [];

export function SettingsDrawer({
  open,
  onClose,
  settings,
  onSettingsChange,
  profile,
  onProfileChange,
}: {
  open: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSettingsChange: (s: AppSettings) => void;
  profile: CycleProfile;
  onProfileChange: (p: CycleProfile) => void;
}) {
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

          <div className="border-t border-zinc-100 pt-5">
            <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2">Health data and care</p>
            <p className="text-xs leading-relaxed text-zinc-600">
              Symptom history is stored in your account when remote storage is configured, or in this browser otherwise. It is not used for advertising. You can delete symptom history from the check-in screen. Your notes are not included in cycle-share links.
            </p>
            <p className="mt-3 text-xs leading-relaxed text-zinc-500">{MEDICAL_DISCLAIMER}</p>
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

        </div>
      </div>
    </div>
  );
}
