import { useEffect, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { readWeeklyLoginStreak, recordWeeklyLogin } from "../lib/storage";

export function AuthGate({ children }: { children: (user: User | null, weeklyStreak: number) => ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(!supabase);
  const [weeklyStreak, setWeeklyStreak] = useState(0);

  useEffect(() => {
    const inviteToken = new URLSearchParams(window.location.search).get("cycleInvite");
    if (inviteToken && /^[0-9a-f-]{36}$/i.test(inviteToken)) {
      try {
        window.sessionStorage.setItem("phasetwo:cycle-invite", inviteToken);
        const cleanUrl = new URL(window.location.href);
        cleanUrl.searchParams.delete("cycleInvite");
        window.history.replaceState({}, "", cleanUrl);
      } catch {
        // Keep the invitation URL available if browser storage is restricted.
      }
    }

    if (!supabase) return;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user ?? null;
      setUser(nextUser);
      if (nextUser) {
        setWeeklyStreak(recordWeeklyLogin(nextUser.id).current);
      } else {
        setWeeklyStreak(0);
      }
    });

    void supabase.auth.getSession().then(({ data }) => {
      const nextUser = data.session?.user ?? null;
      setUser(nextUser);
      if (nextUser) {
        setWeeklyStreak(readWeeklyLoginStreak(nextUser.id).current);
      }
      setAuthReady(true);
    }).catch(() => setAuthReady(true));

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      setWeeklyStreak(0);
      return;
    }
    setWeeklyStreak(readWeeklyLoginStreak(user.id).current);
  }, [user?.id]);

  if (!authReady) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-zinc-500">Loading PhaseTwo...</div>;
  }

  return <>{children(user, weeklyStreak)}</>;
}