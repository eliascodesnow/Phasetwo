import { useEffect, useRef } from "react";

export const SWIPE_MIN_DISTANCE = 60;
export const SWIPE_DIRECTION_RATIO = 1.5;
export const SWIPE_MAX_DURATION_MS = 700;

export interface SwipeGesture {
  dx: number;
  dy: number;
  durationMs: number;
}

/** Which tab a finished gesture lands on, or null when it is not a deliberate horizontal swipe. */
export function swipeTarget<T>(order: readonly T[], current: T, gesture: SwipeGesture): T | null {
  const { dx, dy, durationMs } = gesture;
  const index = order.indexOf(current);
  if (index === -1) return null;
  if (durationMs > SWIPE_MAX_DURATION_MS) return null;
  if (Math.abs(dx) < SWIPE_MIN_DISTANCE) return null;
  if (Math.abs(dx) < Math.abs(dy) * SWIPE_DIRECTION_RATIO) return null;
  // Swiping left moves forward (Today -> Calendar -> ... -> Settings); swiping right goes back.
  const next = dx < 0 ? index + 1 : index - 1;
  return order[next] ?? null;
}

const INTERACTIVE = "input, textarea, select, [contenteditable='true'], [role='slider'], [data-no-swipe]";

function scrollsHorizontally(element: Element): boolean {
  if (!(element instanceof HTMLElement)) return false;
  if (element.scrollWidth <= element.clientWidth + 1) return false;
  const overflowX = getComputedStyle(element).overflowX;
  return overflowX === "auto" || overflowX === "scroll";
}

/** True when a touch began somewhere a horizontal drag already means something else. */
export function swipeStartsInBlockedArea(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest(INTERACTIVE)) return true;
  for (let element: Element | null = target; element && element !== document.body; element = element.parentElement) {
    if (scrollsHorizontally(element)) return true;
  }
  return false;
}

function dialogIsOpen(): boolean {
  return Boolean(document.querySelector("[aria-modal='true']"));
}

function hasTextSelection(): boolean {
  const selection = window.getSelection();
  return Boolean(selection && !selection.isCollapsed && selection.toString().length > 0);
}

/**
 * Horizontal swipe between workspace tabs. Listens on the document with passive handlers, so vertical
 * scrolling is untouched. Does nothing while `enabled` is false, a dialog is open, or the touch started on
 * a form control or a horizontally scrolling area.
 */
export function useSwipeNavigation<T>(options: { enabled: boolean; order: readonly T[]; current: T; onNavigate: (next: T) => void }): void {
  const latest = useRef(options);
  latest.current = options;

  useEffect(() => {
    if (!options.enabled) return;
    let start: { x: number; y: number; time: number } | null = null;

    const onStart = (event: TouchEvent) => {
      if (event.touches.length !== 1 || dialogIsOpen() || swipeStartsInBlockedArea(event.target)) {
        start = null;
        return;
      }
      const touch = event.touches[0];
      start = { x: touch.clientX, y: touch.clientY, time: Date.now() };
    };
    const onEnd = (event: TouchEvent) => {
      const begun = start;
      start = null;
      if (!begun || event.changedTouches.length !== 1 || dialogIsOpen() || hasTextSelection()) return;
      const touch = event.changedTouches[0];
      const { order, current, onNavigate } = latest.current;
      const next = swipeTarget(order, current, { dx: touch.clientX - begun.x, dy: touch.clientY - begun.y, durationMs: Date.now() - begun.time });
      if (next !== null) onNavigate(next);
    };
    const onCancel = () => { start = null; };

    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchend", onEnd, { passive: true });
    document.addEventListener("touchcancel", onCancel, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", onCancel);
    };
  }, [options.enabled]);
}
