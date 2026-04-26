import * as React from "react";

import { GalleryImage } from "@/components/Gallery";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// PhotoStrip — horizontal polaroid-ish row.
//
// Two completely separate motion paths:
//
//   • Desktop (mouse): JS rAF loop drives `transform: translate3d(...)` on the
//     inner track. Hover scrubs to a target offset, no hover = bounce between
//     edges. Untouched here — works fine, don't break it.
//
//   • Touch / coarse-pointer: viewport is a normal `overflow-x-auto` element
//     with `touch-pan-x`. Native finger swipe IS the only thing that changes
//     scrollLeft — JS never writes to it. Idle motion is a pure CSS keyframe
//     animation on the inner track that translates back-and-forth between
//     0 and `--ps-end` (which is the negative of the un-scrolled overflow).
//     User touch flips inline `animationPlayState` to "paused" so swipe is
//     unmolested; a 2.5s timer flips it back to "running" after touchend.
// ---------------------------------------------------------------------------

export type PhotoStripItem = {
  src: string;
  alt: string;
  caption?: string;
};

export type PhotoStripProps = {
  images: PhotoStripItem[];
  /** Base auto-drift speed in px/s (always to the left). */
  baseSpeed?: number;
  /** Max additional speed contributed by mouse position, px/s. */
  maxBoost?: number;
  className?: string;
};

// Stable per-card visual jitter — rotation in deg, vertical nudge in px,
// width tweak in px. Keyed by image src so re-renders don't reshuffle.
type Jitter = { rot: number; ty: number; w: number };

function hashString(input: string): number {
  // djb2-ish; deterministic across renders, no need for crypto.
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h + input.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function pickJitter(seed: string, indexInList: number): Jitter {
  const h = hashString(`${seed}#${indexInList}`);
  // -3deg .. +3deg
  const rot = ((h % 601) / 100 - 3);
  // -6px .. +6px
  const ty = (((h >> 4) % 13) - 6);
  // -8px .. +8px width drift around base
  const w = (((h >> 8) % 17) - 8);
  return { rot, ty, w };
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

function isTouchDevice(): boolean {
  if (typeof window === "undefined") return false;
  const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  return coarse || "ontouchstart" in window;
}

// Module-scope keyframes injection. Defined once per page-load even if many
// PhotoStrips mount; the `data-` attribute guards against duplicate insertion.
// The keyframe goes 0 → --ps-end → 0 so a single `animation-iteration: infinite`
// gives a smooth back-and-forth without extra direction tracking.
const KEYFRAMES_STYLE_ID = "ps-drift-keyframes";
const KEYFRAMES_CSS = `
@keyframes ps-drift {
  0%   { transform: translate3d(0, 0, 0); }
  50%  { transform: translate3d(var(--ps-end, 0px), 0, 0); }
  100% { transform: translate3d(0, 0, 0); }
}
`;

function ensureKeyframesInjected() {
  if (typeof document === "undefined") return;
  if (document.getElementById(KEYFRAMES_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = KEYFRAMES_STYLE_ID;
  style.textContent = KEYFRAMES_CSS;
  document.head.appendChild(style);
}

export function PhotoStrip({
  images,
  baseSpeed = 16,
  maxBoost = 90,
  className,
}: PhotoStripProps) {
  const viewportRef = React.useRef<HTMLDivElement | null>(null);
  const trackRef = React.useRef<HTMLDivElement | null>(null);

  // Desktop-only refs. The desktop branch is identical to the previous
  // implementation; touch mode no longer touches any of these.
  const offsetRef = React.useRef(0); // current translateX (positive = scrolled left)
  const targetOffsetRef = React.useRef(0); // where we lerp toward
  const directionRef = React.useRef(1); // 1 = drifting left (offset++), -1 = right
  const lastTsRef = React.useRef<number | null>(null);
  const rafRef = React.useRef<number | null>(null);
  const trackWidthRef = React.useRef(0); // total scroll-able width of the track
  const viewportWidthRef = React.useRef(0); // visible viewport width
  const engagedRef = React.useRef(false); // mouse over the strip → mouse-driven mode
  const fitsRef = React.useRef(false); // strip fits the viewport entirely → no drift

  // Touch-mode pause state. Single boolean ref + a resume timer; no rAF
  // babysitting because the animation lives entirely in CSS.
  const touchResumeTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const [fits, setFits] = React.useState(false); // mirrors fitsRef for layout class hints

  // Two orthogonal flags:
  //   - touchMode: native scroll is allowed; idle motion is a CSS animation.
  //   - reducedMotion: motion is fully suppressed; just a static strip.
  const [touchMode, setTouchMode] = React.useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return isTouchDevice();
  });
  const [reducedMotion, setReducedMotion] = React.useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return prefersReducedMotion();
  });

  // Inject the @keyframes block once. Cheap idempotent check inside.
  React.useEffect(() => {
    ensureKeyframesInjected();
  }, []);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const mqMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const mqPointer = window.matchMedia("(pointer: coarse)");
    const updateMotion = () => setReducedMotion(mqMotion.matches);
    const updatePointer = () =>
      setTouchMode(mqPointer.matches || "ontouchstart" in window);
    mqMotion.addEventListener?.("change", updateMotion);
    mqPointer.addEventListener?.("change", updatePointer);
    return () => {
      mqMotion.removeEventListener?.("change", updateMotion);
      mqPointer.removeEventListener?.("change", updatePointer);
    };
  }, []);

  // Measure track + viewport widths.
  //
  // Desktop drift uses these via refs. Touch mode uses them to set the
  // `--ps-end` CSS variable on the track — that's the negative offset the
  // CSS animation translates to at 50%, equal to the strip's overflow width.
  //
  // The animation `--ps-end` is only relevant when content overflows; if it
  // fits, we clear it and the keyframe sits at 0 anyway.
  const measure = React.useCallback(() => {
    const track = trackRef.current;
    const viewport = viewportRef.current;
    if (!track || !viewport) return;
    trackWidthRef.current = track.scrollWidth;
    viewportWidthRef.current = viewport.clientWidth;
    const overflow = Math.max(0, trackWidthRef.current - viewportWidthRef.current);
    const nowFits = overflow <= 1;
    fitsRef.current = nowFits;
    setFits((prev) => (prev === nowFits ? prev : nowFits));

    if (nowFits) {
      offsetRef.current = 0;
      targetOffsetRef.current = 0;
      track.style.transform = "translate3d(0,0,0)";
      track.style.setProperty("--ps-end", "0px");
    } else {
      // Negative because keyframe translates leftwards. Bracket with `-` not
      // `calc(-1 * ...)` — same result, simpler string for the engine.
      track.style.setProperty("--ps-end", `${-overflow}px`);
    }
  }, []);

  React.useEffect(() => {
    measure();
    if (typeof window === "undefined") return;
    const ro = new ResizeObserver(() => measure());
    if (trackRef.current) ro.observe(trackRef.current);
    if (viewportRef.current) ro.observe(viewportRef.current);
    window.addEventListener("load", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("load", measure);
    };
  }, [measure, images]);

  // Clean up any pending touch-resume timer on unmount.
  React.useEffect(() => {
    return () => {
      if (touchResumeTimerRef.current != null) {
        clearTimeout(touchResumeTimerRef.current);
        touchResumeTimerRef.current = null;
      }
    };
  }, []);

  // Helpers to flip the inline animationPlayState. Touching style directly
  // instead of via state — re-rendering on every touch would be silly.
  const pauseTouchAnim = React.useCallback(() => {
    const t = trackRef.current;
    if (!t) return;
    t.style.animationPlayState = "paused";
  }, []);
  const resumeTouchAnim = React.useCallback(() => {
    const t = trackRef.current;
    if (!t) return;
    t.style.animationPlayState = "running";
  }, []);

  // Native capture-phase pointerdown — pauses the CSS animation BEFORE
  // React's synthetic event cycle commits. On iOS the touchstart→React
  // delay is enough for the still-running animation to translate the
  // track a few pixels mid-tap; the browser then registers the gesture
  // as movement and swallows the synthetic `click`. Capture-phase native
  // listener fires before any React handler, guaranteeing the animation
  // is paused by the time the browser hit-tests the finger position.
  //
  // Tap-fallback: also remember the pointerdown coords. On pointerup,
  // if the finger moved <10px AND the target is a card image/button,
  // synthesize a click — belt-and-suspenders for iOS quirks where
  // native click suppression still wins on transform'd targets.
  React.useEffect(() => {
    if (!touchMode) return;
    const v = viewportRef.current;
    if (typeof window === "undefined" || !v) return;

    let downX = 0;
    let downY = 0;
    let downTarget: EventTarget | null = null;

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType !== "touch" && e.pointerType !== "pen") return;
      // Cancel any pending resume so a stacked tap can't queue a stale unset.
      if (touchResumeTimerRef.current != null) {
        clearTimeout(touchResumeTimerRef.current);
        touchResumeTimerRef.current = null;
      }
      pauseTouchAnim();
      downX = e.clientX;
      downY = e.clientY;
      downTarget = e.target;
    };

    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerType !== "touch" && e.pointerType !== "pen") return;
      const dx = e.clientX - downX;
      const dy = e.clientY - downY;
      // Tap heuristic: <10px of movement on either axis.
      const isTap = Math.hypot(dx, dy) < 10;
      if (isTap && downTarget instanceof HTMLElement) {
        const btn = downTarget.closest("button");
        if (btn && v.contains(btn)) {
          // Defer one frame so the browser's own click event (if any) fires
          // first; we only act if it was suppressed (idempotent — clicking
          // an already-handled button is fine, GalleryImage's open() is
          // gated by an idRef and double-fire is harmless).
          requestAnimationFrame(() => btn.click());
        }
      }
      // Schedule resume after tap-or-swipe — same 2.5s rest either way.
      if (touchResumeTimerRef.current != null) {
        clearTimeout(touchResumeTimerRef.current);
      }
      touchResumeTimerRef.current = setTimeout(() => {
        touchResumeTimerRef.current = null;
        resumeTouchAnim();
      }, 2500);
    };

    v.addEventListener("pointerdown", onPointerDown, {
      capture: true,
      passive: true,
    });
    v.addEventListener("pointerup", onPointerUp, {
      capture: true,
      passive: true,
    });
    return () => {
      v.removeEventListener("pointerdown", onPointerDown, { capture: true });
      v.removeEventListener("pointerup", onPointerUp, { capture: true });
    };
  }, [touchMode, pauseTouchAnim, resumeTouchAnim]);

  // Desktop drift loop — identical to the previous implementation, minus the
  // touch branch (which moved out to CSS). Skipped under reduced motion or
  // when we're in touch mode.
  React.useEffect(() => {
    if (reducedMotion) return;
    if (touchMode) return;

    const step = (ts: number) => {
      const last = lastTsRef.current;
      lastTsRef.current = ts;
      const dt = last == null ? 0 : Math.min(0.05, (ts - last) / 1000);

      const max = Math.max(0, trackWidthRef.current - viewportWidthRef.current);

      if (fitsRef.current || max <= 0) {
        // Whole strip fits the desktop viewport — pin at 0, no motion.
        offsetRef.current = 0;
        const track = trackRef.current;
        if (track) track.style.transform = "translate3d(0,0,0)";
      } else if (engagedRef.current) {
        // Mouse-driven scrub: lerp current offset toward target offset.
        const tgt = targetOffsetRef.current;
        offsetRef.current += (tgt - offsetRef.current) * Math.min(1, 12 * dt);
        const track = trackRef.current;
        if (track)
          track.style.transform = `translate3d(${-offsetRef.current}px, 0, 0)`;
      } else {
        // Desktop auto-drift, bouncing between edges via translate.
        offsetRef.current += baseSpeed * dt * directionRef.current;
        if (offsetRef.current >= max) {
          offsetRef.current = max;
          directionRef.current = -1;
        } else if (offsetRef.current <= 0) {
          offsetRef.current = 0;
          directionRef.current = 1;
        }
        const track = trackRef.current;
        if (track)
          track.style.transform = `translate3d(${-offsetRef.current}px, 0, 0)`;
      }

      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastTsRef.current = null;
    };
  }, [touchMode, reducedMotion, baseSpeed]);

  // Mouse-driven scrubbing. Desktop only — touch mode never reaches here.
  const onPointerMove = React.useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (touchMode || reducedMotion) return;
      if (e.pointerType !== "mouse") return;
      if (fitsRef.current) return;
      const el = viewportRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = (e.clientX - rect.left) / Math.max(1, rect.width);
      const clamped = Math.max(0, Math.min(1, x));
      const max = Math.max(0, trackWidthRef.current - viewportWidthRef.current);
      targetOffsetRef.current = clamped * max;
      void maxBoost;
    },
    [touchMode, reducedMotion, maxBoost],
  );

  // Hover / focus → mouse-driven mode (desktop only). On leave → resume drift.
  const setEngaged = React.useCallback((engaged: boolean) => {
    engagedRef.current = engaged;
    if (!engaged) {
      const max = Math.max(0, trackWidthRef.current - viewportWidthRef.current);
      const current = offsetRef.current;
      directionRef.current = current > max / 2 ? -1 : 1;
    }
  }, []);

  // Render each image exactly once; the strip bounces between edges instead of looping.
  const items = React.useMemo(
    () => images.map((it, i) => ({ ...it, _k: `${i}-${it.src}` })),
    [images],
  );

  // Style for the track. Desktop: drives `transform` from rAF, leaves
  // `animation` empty. Touch + animated: applies the CSS keyframe; the
  // `--ps-end` variable is set imperatively inside `measure()`. Touch + fits:
  // no animation. Reduced motion: no animation, ever.
  const trackStyle = React.useMemo<React.CSSProperties>(() => {
    if (touchMode && !reducedMotion && !fits) {
      // Duration scales loosely with content width. Even with no measurement
      // yet (first paint before measure() runs), 40s is a calm default. The
      // browser interpolates against `--ps-end` which gets set right after.
      return {
        animation: "ps-drift 40s linear infinite",
        // willChange hints the compositor; only meaningful while animating.
        willChange: "transform",
      };
    }
    if (!touchMode && !reducedMotion) {
      return { willChange: "transform" };
    }
    return {};
  }, [touchMode, reducedMotion, fits]);

  return (
    <div
      ref={viewportRef}
      onPointerMove={onPointerMove}
      onMouseEnter={() => {
        if (touchMode) return;
        setEngaged(true);
      }}
      onMouseLeave={() => {
        if (touchMode) return;
        setEngaged(false);
      }}
      // Touch pause/resume + tap fallback are wired via native capture-phase
      // pointerdown/up listeners (see useEffect above). The native path
      // beats React's synthetic events to the punch so the animation is
      // paused before the browser hit-tests the tap. We deliberately do NOT
      // call preventDefault / stopPropagation anywhere — native overflow-x
      // scroll + touch-pan-x are doing the heavy lifting.
      onTouchCancel={() => {
        if (!touchMode) return;
        if (touchResumeTimerRef.current != null) {
          clearTimeout(touchResumeTimerRef.current);
          touchResumeTimerRef.current = null;
        }
        resumeTouchAnim();
      }}
      onFocusCapture={() => {
        if (touchMode) return;
        setEngaged(true);
      }}
      onBlurCapture={(e) => {
        if (touchMode) return;
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setEngaged(false);
        }
      }}
      className={cn(
        "relative w-full select-none",
        // overflow-y visible so shadows + hover-scale don't clip top/bottom.
        // Touch: native horizontal scroll IS the swipe channel; finger swipes
        // the viewport, the inner track meanwhile auto-drifts via CSS keyframes
        // (paused while user is touching).
        // Desktop: we transform the inner track via JS, viewport just clips.
        touchMode
          ? "overflow-x-auto overflow-y-visible touch-pan-x [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [overscroll-behavior-x:contain] snap-x snap-proximity"
          : "overflow-x-hidden overflow-y-visible",
        className,
      )}
    >
      <div
        ref={trackRef}
        className={cn(
          "flex flex-nowrap items-center",
          "pt-8 pb-12",
          fits ? "justify-center" : "justify-start",
        )}
        style={trackStyle}
      >
        {items.map((item, i) => {
          const j = pickJitter(item.src, i);
          // Rotate twice as wide on touch (no drift hides micro-jitters there).
          const baseW = 200; // px, the spec's "slightly varied" base
          const width = baseW + j.w;
          return (
            <div
              key={item._k}
              // Negative margin for the overlapping/stacked feel. `relative` +
              // `hover:z-20` lifts a hovered card above its neighbours so the
              // scaled state doesn't get clipped during animation.
              // `snap-center` makes user finger-swipe land neatly on each card.
              className="relative shrink-0 -mr-3 first:ml-2 last:mr-2 hover:z-20 focus-within:z-20 snap-center"
              style={{
                transform: `rotate(${j.rot}deg) translateY(${j.ty}px)`,
                width: `${width}px`,
              }}
            >
              {/* Polaroid frame. */}
              <div
                className={cn(
                  "bg-white p-2 pb-6 rounded-sm origin-center",
                  "shadow-[0_8px_24px_rgba(0,0,0,0.18)]",
                  // transition-shadow only — `transition-all` would interpolate
                  // transform too, and a transient transform animation
                  // mid-tap on iOS is interpreted as movement and swallows
                  // the click. Hover effects still work on desktop.
                  "transition-shadow duration-200 ease-out",
                  "hover:scale-[1.08] hover:-translate-y-1 hover:shadow-[0_18px_40px_rgba(0,0,0,0.28)] hover:transition-[transform,box-shadow]",
                  "focus-within:scale-[1.08] focus-within:-translate-y-1 focus-within:shadow-[0_18px_40px_rgba(0,0,0,0.28)]",
                )}
              >
                <div className="overflow-hidden bg-neutral-100">
                  <GalleryImage
                    src={item.src}
                    alt={item.alt}
                    caption={item.caption}
                    imgClassName="aspect-square object-cover"
                    // Cards past the first viewport are off-screen → lazy.
                    loading="lazy"
                  />
                </div>
                {item.caption ? (
                  <div className="mt-2 text-center italic font-serif text-[13px] leading-tight text-neutral-700 line-clamp-2">
                    {item.caption}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default PhotoStrip;
