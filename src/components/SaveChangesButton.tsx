import { Check, Save } from "lucide-react";

export function SaveChangesButton({ onSave, saving, savedAt }: { onSave: () => Promise<void>; saving: boolean; savedAt: Date | null }) {
  return (
    <div className="flex items-center justify-end gap-3 border-t border-zinc-200 pt-3">
      {savedAt && <span role="status" className="text-xs text-zinc-400">Saved</span>}
      <button type="button" onClick={() => void onSave()} disabled={saving} className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800 disabled:opacity-50">
        {saving ? <Save className="h-3.5 w-3.5 animate-pulse" /> : savedAt ? <Check className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
        {saving ? "Saving..." : "Save changes"}
      </button>
    </div>
  );
}
