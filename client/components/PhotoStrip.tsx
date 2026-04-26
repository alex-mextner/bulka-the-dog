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
// Idle delay after touch release before auto-drift resumes.
const RESUME_DELAY_MS = 2500;

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

  // Touch state. No "yield mid-frame" flag — the loop is fully cancelled
  // while a finger is down and re-armed from the resume timer.
  const userTouchingRef = React.useRef(false);
  const touchStartXRef = React.useRef(0);
  const touchStartYRef = React.useRef(0);
  const touchStartOffsetRef = React.useRef(0);
  const touchTargetRef = React.useRef<EventTarget | null>(null);
  const touchDirRef = React.useRef<"h" | "v" | null>(null);
  const touchResumeTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const [fits, setFits] = React.useState(false);

  const [touchMode, setTouchMode] = React.useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return isTouchDevice();
  });
  const [reducedMotion, setReducedMotion] = React.useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return prefersReducedMotion();
  });

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

  React.useEffect(() => {
    return () => {
      if (touchResumeTimerRef.current != null) {
        clearTimeout(touchResumeTimerRef.current);
        touchResumeTimerRef.current = null;
      }
    };
  }, []);

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
        const tgt = targetOffsetRef.current;
        offsetRef.current += (tgt - offsetRef.current) * Math.min(1, 12 * dt);
        if (track)
          track.style.transform = `translate3d(${-offsetRef.current}px, 0, 0)`;
      } else {
        // Auto-drift, bouncing.
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
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      touchStartXRef.current = t.clientX;
      touchStartYRef.current = t.clientY;
      touchStartOffsetRef.current = offsetRef.current;
      touchTargetRef.current = e.target;
      touchDirRef.current = null;
      userTouchingRef.current = true;
      if (touchResumeTimerRef.current != null) {
        clearTimeout(touchResumeTimerRef.current);
        touchResumeTimerRef.current = null;
      }
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      lastTsRef.current = null;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
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
      // Finger moves right (dx > 0) → content should move right → track
      // shifts right → offset (the leftward shift) decreases.
      let next = touchStartOffsetRef.current - dx;
      if (next < 0) next = 0;
      else if (next > max) next = max;
      offsetRef.current = next;
      const track = trackRef.current;
      if (track) track.style.transform = `translate3d(${-next}px, 0, 0)`;
    };

    const onTouchEnd = () => {
      // tap = no direction lock established, no significant movement.
      const wasTap = touchDirRef.current == null;
      if (wasTap && touchTargetRef.current instanceof HTMLElement) {
        const btn = touchTargetRef.current.closest("button");
        if (btn && v.contains(btn)) {
          // Synthesize click — iOS may have suppressed the native one
          // because the touch landed inside an element we touched the
          // transform of. Click handlers are idempotent (GalleryImage
          // gates open() by an idRef), so a double-fire is harmless.
          btn.click();
        }
      }

      // Set direction for the resumed drift to head away from whichever
      // edge we're closest to.
      const max = Math.max(0, trackWidthRef.current - viewportWidthRef.current);
      directionRef.current = offsetRef.current > max / 2 ? -1 : 1;

      if (touchResumeTimerRef.current != null) {
        clearTimeout(touchResumeTimerRef.current);
      }
      touchResumeTimerRef.current = setTimeout(() => {
        touchResumeTimerRef.current = null;
        userTouchingRef.current = false;
        lastTsRef.current = null;
        if (stepRef.current != null && rafRef.current == null) {
          rafRef.current = requestAnimationFrame(stepRef.current);
        }
      }, RESUME_DELAY_MS);
    };

    v.addEventListener("touchstart", onTouchStart, { passive: true });
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
