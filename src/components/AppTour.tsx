import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, FileText, HeartPulse, ListTodo, Settings } from "lucide-react";
import { tourStepsFor, type TourRole, type TourRowIcon } from "../lib/tour";
import { placeCard, sameBox, spotlightBox, spotlightClipPath, type Box, type Viewport } from "../lib/tourLayout";

const ROW_ICONS: Record<TourRowIcon, typeof Settings> = {
  calendar: CalendarDays,
  planner: ListTodo,
  history: FileText,
  report: HeartPulse,
  settings: Settings,
};

const CARD_MAX_WIDTH = 380;
const SPOTLIGHT_PADDING = 6;
const SPOTLIGHT_RADIUS = 12;
const ARROW_SIZE = 14;

function readViewport(): Viewport {
  return { width: window.innerWidth, height: window.innerHeight };
}

/** Fixed and sticky elements (the tab bar, the Ask Bella bubble) are always on screen, so never scroll for them. */
function isPinned(element: HTMLElement): boolean {
  for (let node: HTMLElement | null = element; node && node !== document.body; node = node.parentElement) {
    const position = getComputedStyle(node).position;
    if (position === "fixed" || position === "sticky") return true;
  }
  return false;
}

/** Scrolls the page so the element sits clear of the sticky header with room for the card beside it. */
function bringIntoView(element: HTMLElement) {
  if (isPinned(element)) {
    // The phone tab bar scrolls sideways, so make sure the highlighted tab is actually on screen.
    element.scrollIntoView({ block: "nearest", inline: "center", behavior: "auto" });
    return;
  }
  const rect = element.getBoundingClientRect();
  const viewportHeight = window.innerHeight;
  const header = document.querySelector("header");
  const clearOfHeader = (header ? header.getBoundingClientRect().bottom : 0) + 12;
  const wanted = rect.height > viewportHeight * 0.45 ? clearOfHeader : Math.max(clearOfHeader, viewportHeight * 0.3 - rect.height / 2);
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollBy({ top: rect.top - wanted, behavior: reduceMotion ? "auto" : "smooth" });
}

/**
 * A short guided tour. Each step highlights one real button or area, points an arrow at it, and explains
 * how it works. `onClose` runs when the tour is finished or skipped.
 */
export function AppTour({
  role,
  onNavigate,
  onClose,
}: {
  role: TourRole;
  /** The tour only ever needs the Today screen, where every highlighted element lives. */
  onNavigate: (view: "today") => void;
  onClose: () => void;
}) {
  const steps = useMemo(() => tourStepsFor(role), [role]);
  const [index, setIndex] = useState(0);
  const [target, setTarget] = useState<Box | null>(null);
  const [viewport, setViewport] = useState<Viewport>(readViewport);
  const [cardHeight, setCardHeight] = useState(300);
  const rootRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  // Read during the first render, before the card moves focus to its own button.
  const returnFocusRef = useRef<HTMLElement | null>(document.activeElement instanceof HTMLElement ? document.activeElement : null);
  const step = steps[index];
  const isFirst = index === 0;
  const isLast = index === steps.length - 1;

  useEffect(() => {
    onNavigate("today");
    // Runs once on open: later steps stay on Today.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Follow the highlighted element as the page scrolls or resizes. Measuring runs only when something
  // can have moved (scroll, resize, the on-screen keyboard or address bar) plus a short settle window
  // after each step for smooth scrolling and late layout, instead of every frame for as long as the
  // tour is open. That keeps it light on phone batteries.
  useEffect(() => {
    let frame = 0;
    let aligned = false;
    let settleUntil = performance.now() + 1500;
    const measure = () => {
      const element = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
      const rect = element?.getBoundingClientRect();
      if (element && rect && rect.width > 0 && rect.height > 0) {
        if (!aligned) {
          aligned = true;
          bringIntoView(element);
        }
        const next: Box = { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
        setTarget((previous) => (sameBox(previous, next) ? previous : next));
      } else {
        setTarget((previous) => (previous ? null : previous));
      }
      const size = readViewport();
      setViewport((previous) => (previous.width === size.width && previous.height === size.height ? previous : size));
    };
    const run = () => {
      frame = 0;
      measure();
      if (performance.now() < settleUntil) frame = window.requestAnimationFrame(run);
    };
    const request = () => {
      settleUntil = Math.max(settleUntil, performance.now() + 120);
      if (!frame) frame = window.requestAnimationFrame(run);
    };
    run();
    window.addEventListener("scroll", request, { passive: true, capture: true });
    window.addEventListener("resize", request);
    window.addEventListener("orientationchange", request);
    window.visualViewport?.addEventListener("resize", request);
    window.visualViewport?.addEventListener("scroll", request);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", request, { capture: true });
      window.removeEventListener("resize", request);
      window.removeEventListener("orientationchange", request);
      window.visualViewport?.removeEventListener("resize", request);
      window.visualViewport?.removeEventListener("scroll", request);
    };
  }, [step.target]);

  // Measure the card so it can be placed without leaving the screen.
  useLayoutEffect(() => {
    const height = cardRef.current?.offsetHeight;
    if (height && height !== cardHeight) setCardHeight(height);
  });

  useEffect(() => {
    primaryRef.current?.focus({ preventScroll: true });
  }, [index]);

  // Give focus back to whatever had it before the tour opened (for example the "Take the tour" button).
  useEffect(() => () => returnFocusRef.current?.focus({ preventScroll: true }), []);

  // Keyboard: arrows move, Escape skips, Tab stays inside the card.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      } else if (event.key === "ArrowRight") {
        setIndex((current) => Math.min(steps.length - 1, current + 1));
      } else if (event.key === "ArrowLeft") {
        setIndex((current) => Math.max(0, current - 1));
      } else if (event.key === "Tab" && cardRef.current) {
        const focusable = Array.from<HTMLButtonElement>(cardRef.current.querySelectorAll<HTMLButtonElement>("button:not([disabled])")).filter((button) => button.offsetParent !== null);
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        } else if (!cardRef.current.contains(document.activeElement)) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, steps.length]);

  // The page behind the tour should not scroll under the user's finger; the card itself still can.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const block = (event: Event) => {
      if (!cardRef.current?.contains(event.target as Node)) event.preventDefault();
    };
    root.addEventListener("wheel", block, { passive: false });
    root.addEventListener("touchmove", block, { passive: false });
    return () => {
      root.removeEventListener("wheel", block);
      root.removeEventListener("touchmove", block);
    };
  }, []);

  const placement = placeCard(target, { width: CARD_MAX_WIDTH, height: cardHeight }, viewport, { margin: 12, gap: 18 });
  const hole = target ? spotlightBox(target, viewport, SPOTLIGHT_PADDING) : null;
  const hasHole = Boolean(hole && hole.width > 0 && hole.height > 0);
  const arrowOnTop = placement.side === "below";
  const arrowOnBottom = placement.side === "above";

  return (
    <div ref={rootRef} className="fixed inset-0 z-[70]" style={{ touchAction: "none" }}>
      {/* A light, soft wash that leaves the highlighted element undimmed. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background: "var(--tour-wash)",
          clipPath: hasHole && hole ? spotlightClipPath(hole, SPOTLIGHT_RADIUS) : undefined,
        }}
      />
      {hasHole && hole && (
        <div
          aria-hidden="true"
          className="tour-ring pointer-events-none fixed"
          style={{
            left: hole.x,
            top: hole.y,
            width: hole.width,
            height: hole.height,
            borderRadius: SPOTLIGHT_RADIUS,
            boxShadow: "0 0 0 3px var(--accent-button), 0 0 0 7px rgb(166 77 104 / 0.22), 0 10px 30px rgb(0 0 0 / 0.16)",
          }}
        />
      )}

      <section
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-tour-title"
        className="tour-card fixed overflow-y-auto rounded-2xl border p-4 sm:p-5"
        style={{
          left: placement.left,
          top: placement.top,
          width: placement.width,
          maxHeight: viewport.height - 24,
          background: "linear-gradient(160deg, var(--color-surface) 0%, var(--accent-soft) 140%)",
          borderColor: "var(--zinc-200)",
          boxShadow: "0 18px 44px -14px rgb(40 24 34 / 0.35)",
        }}
      >
        {placement.arrowX !== null && (arrowOnTop || arrowOnBottom) && (
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              left: placement.arrowX - ARROW_SIZE / 2,
              top: arrowOnTop ? -ARROW_SIZE / 2 - 1 : undefined,
              bottom: arrowOnBottom ? -ARROW_SIZE / 2 - 1 : undefined,
              width: ARROW_SIZE,
              height: ARROW_SIZE,
              transform: "rotate(45deg)",
              background: arrowOnTop ? "var(--color-surface)" : "var(--accent-soft)",
              borderStyle: "solid",
              borderColor: "var(--zinc-200)",
              borderWidth: arrowOnTop ? "1px 0 0 1px" : "0 1px 1px 0",
              borderRadius: 3,
            }}
          />
        )}

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 tabular">
            Step {index + 1} of {steps.length}
          </p>
          {!isLast && (
            <button type="button" onClick={onClose} className="-mr-2 min-h-11 rounded-md px-3 text-sm font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800">
              Skip tour
            </button>
          )}
        </div>

        <h2 id="app-tour-title" className="mt-1 font-display text-lg font-semibold leading-snug text-zinc-900 sm:text-xl">
          {step.title}
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-zinc-600">{step.body}</p>

        {step.rows && (
          <ul className="mt-3 space-y-2.5">
            {step.rows.map((row) => {
              const Icon = ROW_ICONS[row.icon];
              return (
                <li key={row.label} className="flex items-start gap-2.5 text-sm leading-snug">
                  <span className="mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-full bg-sage-light text-sage-dark" aria-hidden="true">
                    <Icon className="h-3.5 w-3.5" strokeWidth={2} />
                  </span>
                  <span className="min-w-0 text-zinc-600">
                    <span className="font-semibold text-zinc-900">{row.label}</span>
                    {" · "}
                    {row.text}
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        {step.tips && (
          <ul className="mt-3 space-y-1.5 text-[13px] leading-snug text-zinc-600">
            {step.tips.map((tip) => (
              <li key={tip} className="flex gap-2">
                <span className="mt-[7px] h-1.5 w-1.5 flex-none rounded-full bg-sage" aria-hidden="true" />
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setIndex((current) => Math.max(0, current - 1))}
            disabled={isFirst}
            className="min-h-11 rounded-lg border border-zinc-200 px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:invisible"
          >
            Back
          </button>
          <div className="flex items-center gap-1.5" aria-hidden="true">
            {steps.map((item, position) => (
              <span
                key={item.id}
                className="h-1.5 rounded-full"
                style={{ width: position === index ? 18 : 6, backgroundColor: position === index ? "var(--accent-button)" : "var(--zinc-300)", transition: "width 180ms ease" }}
              />
            ))}
          </div>
          <button
            ref={primaryRef}
            type="button"
            onClick={() => (isLast ? onClose() : setIndex((current) => current + 1))}
            className="min-h-11 rounded-lg bg-sage px-5 text-sm font-semibold text-white hover:bg-sage-dark"
          >
            {isLast ? "Done" : "Next"}
          </button>
        </div>
      </section>
    </div>
  );
}
