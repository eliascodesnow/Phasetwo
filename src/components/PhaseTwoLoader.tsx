import { useEffect, useRef } from "react";
import {
  BACK, CX, CY, FACE, FACE_END, FACE_START, LAG, LEAF, R, SMILE, STALK, SWING, TOTAL,
  clamp, ease, lerp, progress, toPath,
} from "../lib/loaderGeometry";

const TAGLINE = "PLAN YOUR CYCLE ADEQUATELY";
const EYE_X = [520, 740];

type Props = {
  /** "page" fills the screen (app start). "inline" is a smaller block for sections that load. "mark" is the animation alone. */
  variant?: "page" | "inline" | "mark";
  /** Accessible name announced to screen readers. */
  label?: string;
  className?: string;
};

/**
 * PhaseTwo's default loading animation: the leaf travels into a smiling face and traces its path back, in a loop.
 * Everything is drawn in SVG and driven by one requestAnimationFrame loop, so it works offline and needs no assets.
 */
export function PhaseTwoLoader({ variant = "page", label = "Loading PhaseTwo", className = "" }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const bodyRef = useRef<SVGPathElement>(null);
  const stalkRef = useRef<SVGPathElement>(null);
  const rotRef = useRef<SVGGElement>(null);
  const allRef = useRef<SVGGElement>(null);
  const eyeRefs = useRef<Array<SVGCircleElement | null>>([]);
  const rippleRef = useRef<SVGCircleElement>(null);
  const letterRefs = useRef<Array<HTMLSpanElement | null>>([]);

  useEffect(() => {
    const body = bodyRef.current, stalk = stalkRef.current, rot = rotRef.current, all = allRef.current, ripple = rippleRef.current;
    if (!body || !stalk || !rot || !all || !ripple) return;
    let loopIndex = 0;

    // f: body progress, fm: mouth progress, ms: milliseconds into the face hold (-1 when not holding)
    const draw = (f: number, fm: number, ms: number) => {
      body.setAttribute("d", toPath(lerp(LEAF, FACE, f)));
      stalk.setAttribute("d", toPath(lerp(STALK, SMILE, fm)));
      rot.setAttribute("transform", `rotate(${Math.sin(Math.PI * f) * SWING} ${CX} ${CY})`);

      let scale = 1;
      if (ms >= 0) {
        scale += 0.05 * Math.sin(Math.PI * clamp(ms / 450));
        if (ms > 450) scale += 0.012 * Math.sin((ms - 450) / 350) * clamp((ms - 450) / 300);
      }
      all.setAttribute("transform", `translate(${CX} ${CY}) scale(${scale}) translate(${-CX} ${-CY})`);

      const open = clamp((f - 0.72) / 0.26);
      let dx = 0;
      let blink = [1, 1];
      if (ms >= 0) {
        if (ms > 600 && ms < 1500) dx = 14 * Math.sin(((ms - 600) / 900) * 2 * Math.PI);
        const b = 1 - 0.92 * Math.max(0, 1 - Math.abs(ms - 1750) / 100);
        blink = loopIndex % 2 ? [1, b] : [b, b];
      }
      eyeRefs.current.forEach((eye, i) => eye?.setAttribute("transform", `translate(${EYE_X[i] + dx} 560) scale(${open} ${open * blink[i]})`));

      if (ms >= 0 && ms < 800) {
        const k = ms / 800;
        ripple.setAttribute("r", String(R * (1 + 0.35 * (1 - Math.pow(1 - k, 3)))));
        ripple.setAttribute("opacity", String(0.3 * (1 - k)));
      } else ripple.setAttribute("opacity", "0");

      letterRefs.current.forEach((el, i) => {
        if (!el) return;
        const o = clamp((f - 0.6) * 4 - i * 0.02);
        el.style.opacity = String(o);
        el.style.transform = `translateY(${(1 - o) * 12}px)`;
      });
    };

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      draw(1, 1, 0);
      return;
    }

    const start = performance.now();
    let raf = 0;
    const frame = (now: number) => {
      const elapsed = now - start;
      const t = elapsed % TOTAL;
      loopIndex = Math.floor(elapsed / TOTAL);
      const holding = t >= FACE_START && t < FACE_END;
      draw(progress(t, 0, LAG), progress(t, LAG, 0), holding ? t - FACE_START : -1);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const size = variant === "page" ? "w-[min(56vmin,280px)]" : variant === "inline" ? "w-36" : "mx-auto w-36 sm:w-44";
  const text = variant === "page" ? "text-[11px] sm:text-xs" : "text-[9px]";
  const layout = variant === "page"
    ? "flex min-h-screen flex-col items-center justify-center gap-4 bg-base px-4"
    : variant === "inline" ? "flex flex-col items-center justify-center gap-3 py-10" : "";

  return (
    <div role="status" aria-label={label} className={`${layout} ${className}`.trim()} style={{ color: "var(--accent-readable, #645d45)" }}>
      <svg ref={svgRef} viewBox="0 0 1240 1240" aria-hidden="true" className={`${size} h-auto overflow-visible`}>
        <g ref={allRef}>
          <circle ref={rippleRef} cx={CX} cy={CY} r={R} fill="none" stroke="currentColor" strokeWidth={14} opacity={0} />
          <g ref={rotRef} fill="none" stroke="currentColor" strokeWidth={70} strokeLinecap="round" strokeLinejoin="round">
            <path ref={bodyRef} />
            <path ref={stalkRef} />
          </g>
          {EYE_X.map((_, i) => <circle key={i} ref={(el) => { eyeRefs.current[i] = el; }} r={34} fill="currentColor" />)}
        </g>
      </svg>
      <div aria-hidden="true" className={`${text} text-center font-semibold`} style={{ letterSpacing: "0.32em", paddingLeft: "0.32em" }}>
        {[...TAGLINE].map((ch, i) => (
          <span key={i} ref={(el) => { letterRefs.current[i] = el; }} className="inline-block whitespace-pre" style={{ opacity: 0 }}>{ch}</span>
        ))}
      </div>
    </div>
  );
}
