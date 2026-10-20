import { useEffect } from "react";

let locks = 0;
let savedY = 0;

function lockPage(): void {
  const { body, documentElement } = document;
  savedY = window.scrollY;
  const scrollbar = window.innerWidth - documentElement.clientWidth;
  body.style.position = "fixed";
  body.style.top = `-${savedY}px`;
  body.style.left = "0";
  body.style.right = "0";
  body.style.width = "100%";
  body.style.overflow = "hidden";
  if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;
  documentElement.style.overscrollBehavior = "none";
}

function unlockPage(): void {
  const { body, documentElement } = document;
  for (const property of ["position", "top", "left", "right", "width", "overflow", "paddingRight"] as const) body.style[property] = "";
  documentElement.style.overscrollBehavior = "";
  window.scrollTo(0, savedY);
}

/** Freezes the page behind a dialog so scrolling or swiping never moves it. Safe to nest. */
export function useScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    if (locks === 0) lockPage();
    locks += 1;
    return () => {
      locks -= 1;
      if (locks === 0) unlockPage();
    };
  }, [active]);
}

/**
 * Blocks wheel, swipe and key scrolling of the page except inside `allowed`, while still letting code
 * scroll the page (the tour scrolls highlighted items into view, which a fixed body would prevent).
 */
export function useBlockUserScroll(active: boolean, allowed: () => Element | null): void {
  useEffect(() => {
    if (!active) return;
    const inside = (target: EventTarget | null) => {
      const area = allowed();
      return Boolean(area && target instanceof Node && area.contains(target));
    };
    const block = (event: Event) => { if (!inside(event.target)) event.preventDefault(); };
    const blockKeys = (event: KeyboardEvent) => {
      if (!["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(target.tagName))) return;
      event.preventDefault();
    };
    document.addEventListener("wheel", block, { passive: false });
    document.addEventListener("touchmove", block, { passive: false });
    document.addEventListener("keydown", blockKeys);
    return () => {
      document.removeEventListener("wheel", block);
      document.removeEventListener("touchmove", block);
      document.removeEventListener("keydown", blockKeys);
    };
  }, [active, allowed]);
}
