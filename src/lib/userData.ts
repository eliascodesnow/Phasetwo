import { defaultCycleProfile, defaultSettings, loadLocalAppState, saveLocalAppState, type UserAppState } from "./storage";
import { supabase } from "./supabase";

export async function loadSyncedAppState(userId: string): Promise<UserAppState> {
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
      ...defaultSettings,
      ...(data.app_settings ?? {}),
      openRouterApiKey: localState.appSettings.openRouterApiKey,
    },
    chatMessages: data.chat_messages ?? [],
  };

  saveLocalAppState(userId, state);
  return state;
}

export async function saveSyncedAppState(userId: string, state: UserAppState): Promise<void> {
  saveLocalAppState(userId, state);
  if (!supabase) throw new Error("Supabase is not configured.");

  const { error } = await supabase.from("user_app_state").upsert({
    user_id: userId,
    cycle_profile: state.cycleProfile,
    tasks: state.tasks,
    app_settings: { ...state.appSettings, openRouterApiKey: "" },
    chat_messages: state.chatMessages,
    updated_at: new Date().toISOString(),
  });

  if (error) throw error;
}