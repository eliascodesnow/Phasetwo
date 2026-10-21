import { lazy, type ComponentType, type LazyExoticComponent } from "react";

const RELOAD_FLAG = "phasetwo:chunk-reload";

function flag(action: "get" | "set" | "clear"): boolean {
  try {
    if (action === "set") sessionStorage.setItem(RELOAD_FLAG, "1");
    else if (action === "clear") sessionStorage.removeItem(RELOAD_FLAG);
    else return sessionStorage.getItem(RELOAD_FLAG) === "1";
  } catch {
    // Storage blocked: behave as if the flag was never set.
  }
  return false;
}

/**
 * Loads a code-split module. After a new deploy an open tab can still ask for a file that no longer
 * exists; reloading once fetches the new build. A second failure is thrown so the error boundary shows.
 */
export function loadWithReload<T>(load: () => Promise<T>): Promise<T> {
  return load().then(
    (module) => { flag("clear"); return module; },
    (error: unknown) => {
      if (typeof window !== "undefined" && !flag("get")) {
        flag("set");
        window.location.reload();
        return new Promise<T>(() => undefined);
      }
      throw error;
    },
  );
}

export function lazyWithReload<T extends ComponentType<any>>(load: () => Promise<{ default: T }>): LazyExoticComponent<T> {
  return lazy(() => loadWithReload(load));
}
