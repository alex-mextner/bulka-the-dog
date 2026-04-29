import * as React from "react";

import { GalleryImage } from "@/components/Gallery";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// PhotoStrip — horizontal polaroid-ish row.
//
// SINGLE motion model for everyone (desktop + touch): the inner track has
// `transform: translate3d(-offset, 0, 0)` driven by an rAF loop. The viewport
// is ALWAYS `overflow-x-hidden` — we never use the browser's native scroll
// engine. This is deliberate: native overflow-x-auto on iOS leaks horizontal
// pan up to the page when the strip's edges are reached and bounces the
// whole document. With overflow-hidden + custom touch handlers below, page
// scroll stays untouched.
//
// Desktop (mouse): hover scrubs to a target offset; otherwise auto-drifts.
// Touch: native touchstart/move/end handlers manipulate `offset` directly.
// On the first touchmove we lock direction: if the gesture is horizontal we
// preventDefault and own it, if it's vertical we ignore so the page can
// scroll. Tap is detected as a touchend with no direction-lock — we then
// synthesize a click on the closest <button> to open the lightbox.
//
// Auto-drift only runs while the user isn't touching (and 2.5s after they
// release). The rAF loop is fully cancelled on touchstart and re-armed by
// the resume timer; no programmatic writes happen mid-gesture.
// ---------------------------------------------------------------------------

export type PhotoStripItem = {
  src: string;
  /** Small thumbnail shown in the strip; lightbox uses `src`. */
  thumbSrc?: string;
  alt: string;
  caption?: string;
};

export type PhotoStripProps = {
  images: PhotoStripItem[];
  /** Base auto-drift speed in px/s. */
  baseSpeed?: number;
  /** Max additional speed contributed by mouse position, px/s. */
  maxBoost?: number;
  className?: string;
};

type Jitter = { rot: number; ty: number; w: number };

function hashString(input: string): number {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h + input.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function pickJitter(seed: string, indexInList: number): Jitter {
  const h = hashString(`${seed}#${indexInList}`);
  const rot = ((h % 601) / 100 - 3);
  const ty = (((h >> 4) % 13) - 6);
  const w = (((h >> 8) % 17) - 8);
  return { rot, ty, w };
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

function isTouchDevice(): boolean {
  if (typeof window === "undefined") return false;
  if (window.location?.search?.includes("touch=1")) return true;
  const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  return coarse || "ontouchstart" in window;
}

// Pixels of finger travel before we commit to either H-pan or V-page-scroll.
const DIRECTION_LOCK_SLOP = 10;
// Velocity sampling window for kinetic inertia (ms). Standard practice in
// kinetic-scroll libraries (iScroll / hammer.js / native iOS): take only
// the most recent ~100ms of touch samples — older samples drag the
// velocity estimate toward zero on long slow drags and lose responsiveness
// for quick flicks.
const VELOCITY_WINDOW_MS = 100;
// Exponential friction coefficient (1/s). v(t) = v0 * exp(-FRICTION * t).
// At 3.0/s a 1500 px/s flick decays to baseSpeed (~16 px/s) in ~1.5s,
// which feels right for a small carousel — long enough to be visible,
// short enough not to feel laggy.
const FRICTION = 3.0;
// Spring-back stiffness for the boundary rubber-band release. Exponential
// ease with k=14 reaches the target in ~250ms, comparable to UIScrollView's
// default deceleration spring on iOS.
const SPRING_BACK_K = 14;

// Apple-style rubber-band displacement: as the user drags past a boundary,
// the actual displacement asymptotes to `dimension`. f(d, w) = d*w/(d+w).
// At d = w, displacement = w/2; at d = 5w, displacement = 5w/6. The further
// you pull, the more it resists — exactly the feeling of a stretched band.
function rubberBandAmount(distance: number, dimension: number): number {
  if (dimension <= 0) return 0;
  return (distance * dimension) / (distance + dimension);
}

export function PhotoStrip({
  images,
  baseSpeed = 16,
  maxBoost = 90,
  className,
}: PhotoStripProps) {
  const viewportRef = React.useRef<HTMLDivElement | null>(null);
  const trackRef = React.useRef<HTMLDivElement | null>(null);

  // Shared loop state.
  const offsetRef = React.useRef(0); // current track translate (px, positive)
  const targetOffsetRef = React.useRef(0); // desktop hover target
  const directionRef = React.useRef(1);
  const lastTsRef = React.useRef<number | null>(null);
  const rafRef = React.useRef<number | null>(null);
  const trackWidthRef = React.useRef(0);
  const viewportWidthRef = React.useRef(0);
  const engagedRef = React.useRef(false); // mouse over the strip
  const fitsRef = React.useRef(false);

  // Touch state. The rAF loop is fully cancelled while a finger is down,
  // and re-armed in the inertia phase on touchend (no fixed timer).
  const userTouchingRef = React.useRef(false);
  const touchStartXRef = React.useRef(0);
  const touchStartYRef = React.useRef(0);
  const touchStartOffsetRef = React.useRef(0);
  const touchTargetRef = React.useRef<EventTarget | null>(null);
  const touchDirRef = React.useRef<"h" | "v" | null>(null);
  // Sliding-window of recent touchmove samples for velocity estimation.
  // Each entry: {t: ms, x: clientX of finger}. Trimmed to VELOCITY_WINDOW_MS
  // on every push so it never grows beyond a handful of points.
  const touchSamplesRef = React.useRef<{ t: number; x: number }[]>([]);
  // Inertia velocity in OFFSET coordinates (px/s, signed). Positive = offset
  // is increasing = track moving left = content scrolling rightwards.
  // Used by step() during the inertia phase.
  const inertiaVelocityRef = React.useRef(0);
  // Loop phase. step() switches behaviour:
  //   - "drift" (default): constant baseSpeed bouncer, the autoplay state.
  //   - "inertia": post-touchend kinetic decay; smoothly hands off to "drift"
  //                when |velocity| falls to baseSpeed, preserving sign so
  //                the drift continues in the direction of the swipe.
  //   - "spring": rubber-band release — user dragged past 0 or max, on
  //               release we spring back to the boundary, then drift.
  //   - "engaged": desktop hover-driven scrub.
  const phaseRef = React.useRef<"drift" | "inertia" | "spring" | "engaged">(
    "drift",
  );
  // Target offset for the spring phase (always 0 or max).
  const springTargetRef = React.useRef(0);

  const [fits, setFits] = React.useState(false);

  // CRITICAL: useState init MUST return the SSG-side value (false) on
  // both server and client. React 18 hydration calls the init function
  // again on the client; if it returns a different value than the
  // server-rendered DOM, React warns + keeps the SSG markup AND treats
  // the state as the new value. Subsequent setTouchMode(true) calls
  // from useEffect become no-ops (Object.is sees same value) and the
  // DOM never updates — touch handlers never attach. The mount-effect
  // below is the single source of truth for the "is this a touch
  // device" decision.
  const [touchMode, setTouchMode] = React.useState<boolean>(false);
  const [reducedMotion, setReducedMotion] = React.useState<boolean>(false);

  // Re-sync from the real browser at mount. SSG ran the useState initializers
  // in Node where window is undefined and returned false; without this the
  // strip would forever stay in desktop mode on iPhones.
  React.useEffect(() => {
    if (typeof window === "undefined") return;
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
    } else {
      // Clamp current offset into the new range (resize narrower etc.).
      offsetRef.current = Math.max(0, Math.min(overflow, offsetRef.current));
      track.style.transform = `translate3d(${-offsetRef.current}px, 0, 0)`;
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

  const stepRef = React.useRef<((ts: number) => void) | null>(null);

  // Unified rAF loop. ALWAYS writes transform on the track (no scrollLeft).
  // Stopped while the user is touching; re-armed by the resume timer.
  React.useEffect(() => {
    if (reducedMotion) return;

    const step = (ts: number) => {
      const last = lastTsRef.current;
      lastTsRef.current = ts;
      const dt = last == null ? 0 : Math.min(0.05, (ts - last) / 1000);

      const max = Math.max(0, trackWidthRef.current - viewportWidthRef.current);
      const track = trackRef.current;

      if (fitsRef.current || max <= 0) {
        offsetRef.current = 0;
        if (track) track.style.transform = "translate3d(0,0,0)";
      } else if (!touchMode && engagedRef.current) {
        // Desktop mouse scrub.
        const tgt = targetOffsetRef.current;
        offsetRef.current += (tgt - offsetRef.current) * Math.min(1, 12 * dt);
        if (track)
          track.style.transform = `translate3d(${-offsetRef.current}px, 0, 0)`;
      } else if (touchMode && phaseRef.current === "spring") {
        // Spring back to the nearest boundary after a rubber-banded drag.
        // Exponential ease toward target — visually indistinguishable from
        // a critically-damped spring at this scale, and cheaper.
        const target = springTargetRef.current;
        offsetRef.current +=
          (target - offsetRef.current) * Math.min(1, SPRING_BACK_K * dt);
        if (Math.abs(offsetRef.current - target) < 0.5) {
          offsetRef.current = target;
          // direction was set on touchend (away from the boundary).
          phaseRef.current = "drift";
        }
        if (track)
          track.style.transform = `translate3d(${-offsetRef.current}px, 0, 0)`;
      } else if (touchMode && phaseRef.current === "inertia") {
        // Kinetic decay. Exponential friction is the standard approach
        // (iOS Safari, hammer.js, iScroll all use a variant): velocity
        // multiplied by exp(-FRICTION * dt) per frame, so the curve is
        // independent of frame rate. We hand off to plain drift when
        // |velocity| drops to baseSpeed, preserving sign so the autoplay
        // continues in the direction of the swipe (no jerky reversal).
        let v = inertiaVelocityRef.current;
        v *= Math.exp(-FRICTION * dt);
        offsetRef.current += v * dt;
        if (offsetRef.current >= max) {
          offsetRef.current = max;
          directionRef.current = -1;
          inertiaVelocityRef.current = 0;
          phaseRef.current = "drift";
        } else if (offsetRef.current <= 0) {
          offsetRef.current = 0;
          directionRef.current = 1;
          inertiaVelocityRef.current = 0;
          phaseRef.current = "drift";
        } else if (Math.abs(v) <= baseSpeed) {
          // Smooth handoff: drift takes over at exactly baseSpeed in the
          // same direction the inertia was heading.
          directionRef.current = v > 0 ? 1 : v < 0 ? -1 : directionRef.current;
          inertiaVelocityRef.current = 0;
          phaseRef.current = "drift";
        } else {
          inertiaVelocityRef.current = v;
        }
        if (track)
          track.style.transform = `translate3d(${-offsetRef.current}px, 0, 0)`;
      } else {
        // Auto-drift (constant baseSpeed bouncer).
        offsetRef.current += baseSpeed * dt * directionRef.current;
        if (offsetRef.current >= max) {
          offsetRef.current = max;
          directionRef.current = -1;
        } else if (offsetRef.current <= 0) {
          offsetRef.current = 0;
          directionRef.current = 1;
        }
        if (track)
          track.style.transform = `translate3d(${-offsetRef.current}px, 0, 0)`;
      }

      if (touchMode && userTouchingRef.current) {
        rafRef.current = null;
        return;
      }
      rafRef.current = requestAnimationFrame(step);
    };

    stepRef.current = step;
    rafRef.current = requestAnimationFrame(step);
    return () => {
      stepRef.current = null;
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastTsRef.current = null;
    };
  }, [touchMode, reducedMotion, baseSpeed]);

  // Custom touch handlers attached natively so we can preventDefault on
  // touchmove. React's default React touch listeners are passive on
  // some setups, which makes preventDefault a no-op and lets the page
  // scroll horizontally instead of (or in addition to) the strip.
  React.useEffect(() => {
    if (!touchMode) return;
    const v = viewportRef.current;
    if (!v) return;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        // Multi-touch (pinch). Block iOS's default page-zoom action right at
        // gesture inception — Safari decides "this is page pinch-zoom" at
        // touchstart-time, before any touchmove fires. The Gallery button
        // listener will pick up the pinch and drive the transition overlay.
        if (e.touches.length >= 2 && e.cancelable) e.preventDefault();
        return;
      }
      const t = e.touches[0];
      touchStartXRef.current = t.clientX;
      touchStartYRef.current = t.clientY;
      touchStartOffsetRef.current = offsetRef.current;
      touchTargetRef.current = e.target;
      touchDirRef.current = null;
      userTouchingRef.current = true;
      // Reset velocity sampling buffer; seed with the start point so a
      // touchend with no moves measures zero velocity (a tap).
      touchSamplesRef.current = [{ t: performance.now(), x: t.clientX }];
      // Cancel any in-flight inertia immediately — fingerback should grab
      // the strip from wherever it is, not chase a decaying velocity.
      inertiaVelocityRef.current = 0;
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      lastTsRef.current = null;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        // Multi-touch (pinch). Eat the default so the page doesn't zoom
        // while one of the inner GalleryImage buttons handles the gesture
        // start. The button's own native touchstart listener calls open()
        // and yarl's Zoom plugin takes over inside the lightbox.
        if (e.touches.length >= 2 && e.cancelable) e.preventDefault();
        return;
      }
      const t = e.touches[0];
      const dx = t.clientX - touchStartXRef.current;
      const dy = t.clientY - touchStartYRef.current;

      // Direction lock on the first move beyond slop.
      if (touchDirRef.current == null) {
        if (Math.abs(dx) < DIRECTION_LOCK_SLOP && Math.abs(dy) < DIRECTION_LOCK_SLOP) {
          return; // still within tap dead-zone
        }
        touchDirRef.current = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
      }

      if (touchDirRef.current !== "h") {
        // Vertical pan — let the page scroll, don't move the strip.
        return;
      }

      // Horizontal pan — we own the gesture. Block native page scroll
      // (and any iOS overscroll bounce) by preventing default.
      if (e.cancelable) e.preventDefault();

      const max = Math.max(0, trackWidthRef.current - viewportWidthRef.current);
      const w = viewportWidthRef.current;
      let next = touchStartOffsetRef.current - dx;
      // Apple-style rubber-band: instead of clamping past the boundary,
      // ease asymptotically toward (boundary + viewportWidth). The further
      // the finger pulls, the slower the offset moves — feels exactly like
      // the stretched-band behaviour of UIScrollView.
      if (next < 0) {
        next = -rubberBandAmount(-next, w);
      } else if (next > max) {
        next = max + rubberBandAmount(next - max, w);
      }
      offsetRef.current = next;
      const track = trackRef.current;
      if (track) track.style.transform = `translate3d(${-next}px, 0, 0)`;

      // Push the sample into the velocity ring. We trim from the front —
      // velocity at touchend is computed only from points within the last
      // VELOCITY_WINDOW_MS so a slow finger that pauses just before
      // release doesn't get falsely-fast inertia.
      const now = performance.now();
      const samples = touchSamplesRef.current;
      samples.push({ t: now, x: t.clientX });
      const cutoff = now - VELOCITY_WINDOW_MS;
      while (samples.length > 1 && samples[0].t < cutoff) samples.shift();
    };

    const onTouchEnd = () => {
      userTouchingRef.current = false;

      // tap = no direction lock established (no significant movement).
      const wasTap = touchDirRef.current == null;
      if (wasTap && touchTargetRef.current instanceof HTMLElement) {
        const btn = touchTargetRef.current.closest("button");
        if (btn && v.contains(btn)) {
          // Synthesize click — iOS may have suppressed the native one
          // because we preventDefault'd touchmove (we didn't on a tap, but
          // the engine sometimes still gates click on transform'd parents).
          // GalleryImage's open() is idempotent, so any double-fire is fine.
          btn.click();
        }
        // No inertia for a tap — just resume drift.
        phaseRef.current = "drift";
        lastTsRef.current = null;
        if (stepRef.current != null && rafRef.current == null) {
          rafRef.current = requestAnimationFrame(stepRef.current);
        }
        return;
      }

      // Compute release velocity in the OFFSET coord (px/s, signed).
      // Finger-velocity = (x_last - x_first) / dt — positive = finger moved
      // right. Offset-velocity is the inverse (offset increases as track
      // moves left, i.e. when finger moves left): so we negate.
      const samples = touchSamplesRef.current;
      let offsetVel = 0;
      if (samples.length >= 2) {
        const last = samples[samples.length - 1];
        const first = samples[0];
        const dtSec = (last.t - first.t) / 1000;
        if (dtSec > 0) {
          const fingerVel = (last.x - first.x) / dtSec; // px/s
          offsetVel = -fingerVel;
        }
      }
      touchSamplesRef.current = [];

      const max = Math.max(0, trackWidthRef.current - viewportWidthRef.current);

      // If the user dragged past a boundary (rubber-band stretched), the
      // release ALWAYS goes through the spring phase — no inertia, no
      // drift first. Velocity is irrelevant here; the spring's job is just
      // to settle back to the boundary cleanly. Direction for after-spring
      // drift is set away from the boundary so the bouncer makes sense.
      if (offsetRef.current < 0) {
        springTargetRef.current = 0;
        directionRef.current = 1;
        phaseRef.current = "spring";
      } else if (offsetRef.current > max) {
        springTargetRef.current = max;
        directionRef.current = -1;
        phaseRef.current = "spring";
      } else if (Math.abs(offsetVel) <= baseSpeed) {
        // Barely a swipe — skip inertia, pick a sane direction.
        directionRef.current =
          offsetVel !== 0
            ? offsetVel > 0
              ? 1
              : -1
            : offsetRef.current > max / 2
              ? -1
              : 1;
        phaseRef.current = "drift";
      } else {
        inertiaVelocityRef.current = offsetVel;
        phaseRef.current = "inertia";
      }

      // Re-arm rAF immediately — no fixed delay, the inertia phase IS the
      // pause and it gracefully decays into the drift phase.
      lastTsRef.current = null;
      if (stepRef.current != null && rafRef.current == null) {
        rafRef.current = requestAnimationFrame(stepRef.current);
      }
    };

    // touchstart MUST be passive:false — iOS Safari decides whether a 2-finger
    // gesture is page-pinch-zoom at touchstart-time, NOT at touchmove-time.
    // If touchstart is passive, we can't preventDefault and the page zooms
    // before our touchmove handler ever sees the gesture.
    v.addEventListener("touchstart", onTouchStart, { passive: false });
    v.addEventListener("touchmove", onTouchMove, { passive: false });
    v.addEventListener("touchend", onTouchEnd, { passive: true });
    v.addEventListener("touchcancel", onTouchEnd, { passive: true });
    return () => {
      v.removeEventListener("touchstart", onTouchStart);
      v.removeEventListener("touchmove", onTouchMove);
      v.removeEventListener("touchend", onTouchEnd);
      v.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [touchMode]);

  // Mouse-driven scrubbing. Desktop only.
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

  const setEngaged = React.useCallback((engaged: boolean) => {
    engagedRef.current = engaged;
    if (!engaged) {
      const max = Math.max(0, trackWidthRef.current - viewportWidthRef.current);
      const current = offsetRef.current;
      directionRef.current = current > max / 2 ? -1 : 1;
    }
  }, []);

  const items = React.useMemo(
    () => images.map((it, i) => ({ ...it, _k: `${i}-${it.src}` })),
    [images],
  );

  const trackStyle = React.useMemo<React.CSSProperties>(() => {
    if (!reducedMotion) return { willChange: "transform" };
    return {};
  }, [reducedMotion]);

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
      // `data-photo-strip` is a readiness marker for e2e tests — they wait
      // for `data-touch-mode` to flip after hydration before issuing CDP
      // touch events.
      data-photo-strip=""
      data-touch-mode={touchMode ? "true" : "false"}
      // No native scroll on either branch — the viewport is just a clipping
      // rectangle. Touch handlers above own all horizontal motion. select-none
      // keeps long-press from highlighting captions. touch-action: pan-y lets
      // the page accept vertical scroll while we eat horizontal gestures.
      className={cn(
        "relative w-full select-none overflow-hidden touch-pan-y",
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
              className="relative shrink-0 -mr-3 first:ml-2 last:mr-2 hover:z-20 focus-within:z-20"
              style={{
                transform: `rotate(${j.rot}deg) translateY(${j.ty}px)`,
                width: `${width}px`,
              }}
            >
              <div
                className={cn(
                  "bg-white p-2 pb-6 rounded-sm origin-center",
                  "shadow-[0_8px_24px_rgba(0,0,0,0.18)]",
                  "transition-shadow duration-200 ease-out",
                  "hover:scale-[1.08] hover:-translate-y-1 hover:shadow-[0_18px_40px_rgba(0,0,0,0.28)] hover:transition-[transform,box-shadow]",
                  "focus-within:scale-[1.08] focus-within:-translate-y-1 focus-within:shadow-[0_18px_40px_rgba(0,0,0,0.28)]",
                )}
              >
                <div className="overflow-hidden bg-neutral-100">
                  <GalleryImage
                    src={item.src}
                    thumbSrc={item.thumbSrc}
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
