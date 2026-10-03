import { defaultCycleProfile, defaultSettings, loadLocalAppState, LOCAL_GUEST_ID, saveLocalAppState, type UserAppState } from "./storage";
import { supabase } from "./supabase";

export async function loadSyncedAppState(userId: string): Promise<UserAppState> {
  if (userId === LOCAL_GUEST_ID) return loadLocalAppState(userId);
  if (!supabase) throw new Error("Supabase is not configured.");

  const localState = loadLocalAppState(userId);
  const { data, error } = await supabase
    .from("user_app_state")
    .select("cycle_profile, tasks, app_settings, chat_messages")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    await saveSyncedAppState(userId, localState);
    return localState;
  }

  const state: UserAppState = {
    cycleProfile: { ...defaultCycleProfile, ...(data.cycle_profile ?? {}) },
    tasks: data.tasks ?? [],
    appSettings: {
      role: data.app_settings?.role === "partner" ? "partner" : defaultSettings.role,
      ldrEnabled: Boolean(data.app_settings?.ldrEnabled),
    },
    chatMessages: data.chat_messages ?? [],
  };

  saveLocalAppState(userId, state);
  return state;
}

export async function saveSyncedAppState(userId: string, state: UserAppState): Promise<void> {
  saveLocalAppState(userId, state);
  if (userId === LOCAL_GUEST_ID) return;
  if (!supabase) throw new Error("Supabase is not configured.");

  const { error } = await supabase.from("user_app_state").upsert({
    user_id: userId,
    cycle_profile: state.cycleProfile,
    tasks: state.tasks,
    app_settings: state.appSettings,
    chat_messages: state.chatMessages,
    updated_at: new Date().toISOString(),
  });

  if (error) throw error;
}