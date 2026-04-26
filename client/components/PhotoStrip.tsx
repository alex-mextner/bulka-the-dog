import * as React from "react";

import { GalleryImage } from "@/components/Gallery";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// PhotoStrip — horizontal polaroid-ish row.
//
// Two completely separate motion paths, both driven by the same rAF loop:
//
//   • Desktop (mouse): the loop writes `transform: translate3d(...)` on the
//     inner track. Hover scrubs to a target offset, no hover = bounce
//     between the two edges. Viewport is `overflow-x-hidden`.
//
//   • Touch / coarse-pointer: viewport is `overflow-x-auto` + `touch-pan-x`.
//     Native finger swipe IS the only thing that changes scrollLeft when the
//     user is touching. When idle, the rAF loop writes `viewport.scrollLeft`
//     directly to auto-drift between edges. A `userTouchingRef` flag gates
//     the loop — while a finger is down, the loop yields entirely and the
//     native scroll engine has uncontested ownership of scrollLeft. On
//     touchend, we re-sync our float accumulator to whatever scrollLeft the
//     user left behind, then start a 2.5s rest timer; after that, drift
//     resumes from there. Native `<button onClick>` on each card handles
//     taps with zero synthesis on our part — we never touch click events.
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
  // ?touch=1 forces touch mode in any browser — useful when debugging the
  // mobile path on a desktop or in playwright (which has no coarse pointer).
  if (window.location?.search?.includes("touch=1")) return true;
  const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  return coarse || "ontouchstart" in window;
}

export function PhotoStrip({
  images,
  baseSpeed = 16,
  maxBoost = 90,
  className,
}: PhotoStripProps) {
  const viewportRef = React.useRef<HTMLDivElement | null>(null);
  const trackRef = React.useRef<HTMLDivElement | null>(null);

  // Shared loop state. Touch and desktop both use offset/direction/lastTs/raf;
  // they just write to different targets (scrollLeft vs transform) inside step().
  const offsetRef = React.useRef(0); // current scroll position (px from left edge)
  const targetOffsetRef = React.useRef(0); // desktop hover target
  const directionRef = React.useRef(1); // 1 = drift towards right edge, -1 = back
  const lastTsRef = React.useRef<number | null>(null);
  const rafRef = React.useRef<number | null>(null);
  const trackWidthRef = React.useRef(0);
  const viewportWidthRef = React.useRef(0);
  const engagedRef = React.useRef(false); // mouse over the strip → mouse-driven mode
  const fitsRef = React.useRef(false); // strip fits the viewport entirely → no drift

  // Touch-mode state. While userTouchingRef is true, the rAF loop yields
  // entirely so the browser's native scroll engine owns scrollLeft.
  const userTouchingRef = React.useRef(false);
  const touchResumeTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const [fits, setFits] = React.useState(false); // mirrors fitsRef for layout class hints

  // Two orthogonal flags:
  //   - touchMode: viewport uses native overflow-x-auto + touch-pan-x; rAF
  //                writes scrollLeft instead of transform.
  //   - reducedMotion: motion is fully suppressed; just a static strip.
  const [touchMode, setTouchMode] = React.useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return isTouchDevice();
  });
  const [reducedMotion, setReducedMotion] = React.useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return prefersReducedMotion();
  });

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    // Re-sync from real browser at mount. On SSG, the useState initializer
    // ran in Node where `window` is undefined and returned `false`; React's
    // hydration then locks that in, so without this resync the strip would
    // forever stay in desktop mode on real touch devices. (This was THE
    // reason swipe + drift + tap all looked broken on iPhone.)
    setTouchMode(isTouchDevice());
    setReducedMotion(prefersReducedMotion());

    const mqMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const mqPointer = window.matchMedia("(pointer: coarse)");
    const updateMotion = () => setReducedMotion(prefersReducedMotion());
    const updatePointer = () => setTouchMode(isTouchDevice());
    mqMotion.addEventListener?.("change", updateMotion);
    mqPointer.addEventListener?.("change", updatePointer);
    return () => {
      mqMotion.removeEventListener?.("change", updateMotion);
      mqPointer.removeEventListener?.("change", updatePointer);
    };
  }, []);

  // Measure track + viewport widths. Both branches need this to know the
  // bouncing range (max = scrollWidth - clientWidth on touch, same value
  // expressed as track-translate range on desktop).
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
      if (!touchMode) {
        track.style.transform = "translate3d(0,0,0)";
      } else {
        viewport.scrollLeft = 0;
      }
    }
  }, [touchMode]);

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

  // The unified rAF loop. Reads `touchMode` via closure capture; the effect
  // restarts whenever touchMode flips (e.g. matchMedia change), so the closure
  // is always fresh.
  React.useEffect(() => {
    if (reducedMotion) return;

    const step = (ts: number) => {
      const last = lastTsRef.current;
      lastTsRef.current = ts;
      const dt = last == null ? 0 : Math.min(0.05, (ts - last) / 1000);

      const max = Math.max(0, trackWidthRef.current - viewportWidthRef.current);

      if (fitsRef.current || max <= 0) {
        // Whole strip fits; pin at 0.
        offsetRef.current = 0;
        if (touchMode) {
          const v = viewportRef.current;
          if (v && v.scrollLeft !== 0) v.scrollLeft = 0;
        } else {
          const track = trackRef.current;
          if (track) track.style.transform = "translate3d(0,0,0)";
        }
      } else if (touchMode) {
        // Touch path: while a finger is down, the user owns scrollLeft. We
        // yield: don't read or write it, don't advance the offset clock —
        // the next idle frame will re-sync from whatever the user landed on.
        if (userTouchingRef.current) {
          // Don't accumulate dt while touching, so resume picks up cleanly.
        } else {
          offsetRef.current += baseSpeed * dt * directionRef.current;
          if (offsetRef.current >= max) {
            offsetRef.current = max;
            directionRef.current = -1;
          } else if (offsetRef.current <= 0) {
            offsetRef.current = 0;
            directionRef.current = 1;
          }
          const v = viewportRef.current;
          if (v) v.scrollLeft = offsetRef.current;
        }
      } else if (engagedRef.current) {
        // Desktop mouse-driven scrub: lerp current offset toward target offset.
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

  // Touch begin/end on the viewport. We listen via React for touch events —
  // they bubble fine on iOS for overflow-x-auto containers (unlike pointer
  // events, which sometimes get swallowed mid-pan). The user's `<button>`
  // children get their native `click` event with zero interference from us.
  const handleTouchStart = React.useCallback(() => {
    if (!touchMode) return;
    userTouchingRef.current = true;
    if (touchResumeTimerRef.current != null) {
      clearTimeout(touchResumeTimerRef.current);
      touchResumeTimerRef.current = null;
    }
  }, [touchMode]);

  const handleTouchEnd = React.useCallback(() => {
    if (!touchMode) return;
    // Re-sync the float accumulator to wherever the user landed, including
    // any momentum still settling (`scrollLeft` updates over a few frames
    // after touchend on iOS — we capture the post-momentum value lazily by
    // resyncing inside the resume timer too).
    const v = viewportRef.current;
    if (v) {
      offsetRef.current = v.scrollLeft;
      const max = Math.max(0, trackWidthRef.current - viewportWidthRef.current);
      directionRef.current = offsetRef.current > max / 2 ? -1 : 1;
    }
    if (touchResumeTimerRef.current != null) {
      clearTimeout(touchResumeTimerRef.current);
    }
    touchResumeTimerRef.current = setTimeout(() => {
      touchResumeTimerRef.current = null;
      userTouchingRef.current = false;
      // Final resync after iOS momentum has settled.
      const vp = viewportRef.current;
      if (vp) offsetRef.current = vp.scrollLeft;
    }, 2500);
  }, [touchMode]);

  // Render each image exactly once; the strip bounces between edges instead of looping.
  const items = React.useMemo(
    () => images.map((it, i) => ({ ...it, _k: `${i}-${it.src}` })),
    [images],
  );

  // Track style. Desktop: rAF writes transform via direct DOM. Touch: we don't
  // touch transform on the track at all — the viewport's scrollLeft is the
  // drift channel. Reduced motion: nothing.
  const trackStyle = React.useMemo<React.CSSProperties>(() => {
    if (!touchMode && !reducedMotion) {
      return { willChange: "transform" };
    }
    return {};
  }, [touchMode, reducedMotion]);

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
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
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
        // Touch: native horizontal scroll IS both the swipe channel AND the
        // drift channel (rAF writes scrollLeft when idle).
        // Desktop: we transform the inner track via JS, viewport just clips.
        touchMode
          ? "overflow-x-auto overflow-y-visible touch-pan-x [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [overscroll-behavior-x:contain]"
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
          const baseW = 200;
          const width = baseW + j.w;
          return (
            <div
              key={item._k}
              // Negative margin for the overlapping/stacked feel. `relative` +
              // `hover:z-20` lifts a hovered card above its neighbours so the
              // scaled state doesn't get clipped during animation.
              className="relative shrink-0 -mr-3 first:ml-2 last:mr-2 hover:z-20 focus-within:z-20"
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
