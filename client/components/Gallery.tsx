import * as React from "react";
import { createPortal } from "react-dom";
import Lightbox, { type ZoomRef } from "yet-another-react-lightbox";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import Captions from "yet-another-react-lightbox/plugins/captions";
import Counter from "yet-another-react-lightbox/plugins/counter";

import "yet-another-react-lightbox/styles.css";
import "yet-another-react-lightbox/plugins/captions.css";
import "yet-another-react-lightbox/plugins/counter.css";

import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Pinch-to-open transition overlay
//
// iOS Photos pattern: on a 2-finger pinch over a thumbnail, the lightbox
// reveals progressively under the user's fingers — the thumbnail clones
// into a fixed-position layer, scales up, the background dims, and on
// release we either commit (open lightbox) or animate back (cancel).
//
// IMPLEMENTATION: imperative API so we don't setState 60 times per second
// during the gesture. The overlay component exposes `open / update / close`
// via a handle ref, and GalleryImage manipulates the cloned image's
// transform directly through that handle. Cancel paths rely on a one-shot
// CSS transition so the spring-back is GPU-accelerated.
// ---------------------------------------------------------------------------

type PinchOpenOpts = {
  src: string;
  alt: string;
  rect: { left: number; top: number; width: number; height: number };
  borderRadius: string;
};

type PinchOverlayHandle = {
  open: (opts: PinchOpenOpts) => void;
  update: (scale: number, dx: number, dy: number) => void;
  close: (commit: boolean) => void;
};

// Scale at which a release commits to opening the lightbox. Below this we
// treat the gesture as a "false start" and animate back.
const PINCH_COMMIT_SCALE = 1.25;
// Maximum scale we render under the finger — clamps the visual size of the
// overlay so a wild pinch doesn't blow up off-screen. Past this point the
// overlay simply stops growing (dim still progresses).
const PINCH_MAX_SCALE = 2.5;
// Cancel animation duration (ms). The CSS transition on the cloned image
// runs for this long when we abort.
const PINCH_CANCEL_MS = 220;

const PinchTransitionOverlay = React.forwardRef<PinchOverlayHandle, {}>(
  function PinchTransitionOverlay(_props, ref) {
    const [opts, setOpts] = React.useState<PinchOpenOpts | null>(null);
    const [transitioning, setTransitioning] = React.useState(false);
    const imgRef = React.useRef<HTMLDivElement | null>(null);
    const dimRef = React.useRef<HTMLDivElement | null>(null);

    React.useImperativeHandle(
      ref,
      () => ({
        open: (o) => {
          setTransitioning(false);
          setOpts(o);
        },
        update: (scale, dx, dy) => {
          // Clamp visible scale; dim still tracks the un-clamped scale so
          // a stuck-at-max pinch keeps reading as "more committed".
          const visibleScale = Math.min(PINCH_MAX_SCALE, Math.max(0.5, scale));
          const dimAlpha = Math.min(0.9, Math.max(0, (scale - 1) / 1.5));
          if (imgRef.current) {
            imgRef.current.style.transform = `translate3d(${dx}px, ${dy}px, 0) scale(${visibleScale})`;
          }
          if (dimRef.current) {
            dimRef.current.style.backgroundColor = `rgba(0,0,0,${dimAlpha})`;
          }
        },
        close: (commit) => {
          if (commit) {
            // Caller is opening the real lightbox right now. Hold the
            // overlay over the lightbox for ~150ms so yarl has time to
            // mount, our useEffect-poll has time to apply the seed zoom,
            // and React can paint the slide already at the target scale.
            // Without this hold, the lightbox first paints at zoom=1 for
            // a frame or two before our changeZoom lands, which the user
            // sees as the image "jumping back, then animating forward".
            // The overlay underneath shows the picture at the same scale,
            // so the visual handoff is invisible.
            window.setTimeout(() => {
              setOpts(null);
              setTransitioning(false);
            }, 150);
          } else {
            // Animate back to identity (= thumbnail rect) over PINCH_CANCEL_MS,
            // then unmount.
            setTransitioning(true);
            if (imgRef.current) {
              imgRef.current.style.transform =
                "translate3d(0, 0, 0) scale(1)";
            }
            if (dimRef.current) {
              dimRef.current.style.backgroundColor = "rgba(0,0,0,0)";
            }
            window.setTimeout(() => {
              setOpts(null);
              setTransitioning(false);
            }, PINCH_CANCEL_MS);
          }
        },
      }),
      [],
    );

    if (!opts || typeof document === "undefined") return null;

    return createPortal(
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9999,
          pointerEvents: "none", // touch events still go to whoever's listening on window
        }}
      >
        <div
          ref={dimRef}
          style={{
            position: "absolute",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0)",
            transition: transitioning
              ? `background-color ${PINCH_CANCEL_MS}ms ease-out`
              : "none",
          }}
        />
        <div
          ref={imgRef}
          style={{
            position: "absolute",
            left: opts.rect.left,
            top: opts.rect.top,
            width: opts.rect.width,
            height: opts.rect.height,
            backgroundImage: `url("${opts.src}")`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            borderRadius: opts.borderRadius,
            transform: "translate3d(0, 0, 0) scale(1)",
            transformOrigin: "center center",
            transition: transitioning
              ? `transform ${PINCH_CANCEL_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`
              : "none",
            willChange: "transform",
          }}
        />
      </div>,
      document.body,
    );
  },
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type GalleryEntry = {
  id: number;
  src: string;
  alt: string;
  caption?: string;
};

type GalleryContextValue = {
  register: (entry: Omit<GalleryEntry, "id">) => number;
  update: (id: number, entry: Omit<GalleryEntry, "id">) => void;
  unregister: (id: number) => void;
  open: (id: number) => void;
  // Internal state consumed by GalleryLightbox.
  entries: GalleryEntry[];
  isOpen: boolean;
  index: number;
  close: () => void;
  // Where focus was before opening — used to restore on close.
  triggerRef: React.MutableRefObject<HTMLElement | null>;
  setTrigger: (el: HTMLElement | null) => void;
  // Imperative handle for the pinch-to-open transition overlay. GalleryImage
  // drives this directly during a 2-finger gesture so we avoid 60Hz setState.
  pinchOverlayRef: React.MutableRefObject<PinchOverlayHandle | null>;
  // Carry the final pinch scale from the overlay (in GalleryImage's commit
  // path) over to the lightbox's first-render effect, where we feed it to
  // yarl's ZoomRef.changeZoom so the lightbox opens already zoomed to the
  // scale the user reached. Reset to 1 on every successful read.
  pendingZoomRef: React.MutableRefObject<number>;
};

const GalleryContext = React.createContext<GalleryContextValue | null>(null);

function useGallery(): GalleryContextValue {
  const ctx = React.useContext(GalleryContext);
  if (!ctx) {
    throw new Error("Gallery components must be used inside <GalleryProvider>");
  }
  return ctx;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function GalleryProvider({ children }: { children: React.ReactNode }) {
  // Stable monotonically increasing ids — the registry preserves the
  // *registration order*, which is the React mount order, which (for normal
  // top-down trees) matches DOM/reading order.
  const nextIdRef = React.useRef(0);
  const [entries, setEntries] = React.useState<GalleryEntry[]>([]);
  const [isOpen, setIsOpen] = React.useState(false);
  const [index, setIndex] = React.useState(0);
  const triggerRef = React.useRef<HTMLElement | null>(null);
  const pinchOverlayRef = React.useRef<PinchOverlayHandle | null>(null);
  const pendingZoomRef = React.useRef<number>(1);

  const register = React.useCallback((entry: Omit<GalleryEntry, "id">) => {
    const id = nextIdRef.current++;
    setEntries((prev) => [...prev, { id, ...entry }]);
    return id;
  }, []);

  const update = React.useCallback(
    (id: number, entry: Omit<GalleryEntry, "id">) => {
      setEntries((prev) =>
        prev.map((e) => (e.id === id ? { id, ...entry } : e)),
      );
    },
    [],
  );

  const unregister = React.useCallback((id: number) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }, []);

  // Track whether we own a pushed history entry, so close() pops it exactly
  // once. popstate (Android back / browser back) sets this to false before
  // calling close — the entry is already gone, no need to history.back again.
  const ownsHistoryEntryRef = React.useRef(false);

  const open = React.useCallback((id: number) => {
    setEntries((prev) => {
      const idx = prev.findIndex((e) => e.id === id);
      setIndex(idx >= 0 ? idx : 0);
      return prev;
    });
    setIsOpen(true);
    // Push exactly one history entry for the whole lightbox session — slide
    // changes inside the lightbox stay invisible to history. The Android
    // back gesture / browser back will pop this entry and trigger popstate,
    // which we handle by closing.
    if (typeof window !== "undefined") {
      try {
        window.history.pushState({ lightbox: true }, "");
        ownsHistoryEntryRef.current = true;
      } catch {
        ownsHistoryEntryRef.current = false;
      }
    }
  }, []);

  const close = React.useCallback(() => {
    setIsOpen(false);
    // If we still own the pushed entry (close came from X / backdrop / ESC,
    // not from popstate), pop it so the URL/history stays clean. popstate
    // resets the flag before invoking close, so we don't double-pop.
    if (ownsHistoryEntryRef.current && typeof window !== "undefined") {
      ownsHistoryEntryRef.current = false;
      const state = window.history.state as { lightbox?: boolean } | null;
      if (state && state.lightbox) {
        try {
          window.history.back();
        } catch {
          /* no-op */
        }
      }
    }
    // Return focus to the thumbnail that opened the lightbox.
    // yarl unmounts its overlay on close; restoring on the next tick avoids
    // the focus race with its internal cleanup.
    queueMicrotask(() => {
      triggerRef.current?.focus?.();
    });
  }, []);

  const setTrigger = React.useCallback((el: HTMLElement | null) => {
    triggerRef.current = el;
  }, []);

  // popstate listener — active only while the lightbox is open. Fires on
  // Android back gesture, browser back button, or hardware back. The entry
  // we pushed has already been popped by the time we run, so we only need
  // to flip our own state (clear ownership flag, then close).
  React.useEffect(() => {
    if (!isOpen) return;
    if (typeof window === "undefined") return;
    const onPopState = () => {
      // Browser already moved history; don't call history.back again in close.
      ownsHistoryEntryRef.current = false;
      close();
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [isOpen, close]);

  const value = React.useMemo<GalleryContextValue>(
    () => ({
      register,
      update,
      unregister,
      open,
      entries,
      isOpen,
      index,
      close,
      triggerRef,
      setTrigger,
      pinchOverlayRef,
      pendingZoomRef,
    }),
    [register, update, unregister, open, entries, isOpen, index, close, setTrigger],
  );

  return (
    <GalleryContext.Provider value={value}>
      {children}
      <PinchTransitionOverlay ref={pinchOverlayRef} />
    </GalleryContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Thumbnail trigger
// ---------------------------------------------------------------------------

export type GalleryImageProps = {
  src: string;
  alt: string;
  caption?: string;
  className?: string;
  imgClassName?: string;
  loading?: "lazy" | "eager";
} & Omit<
  React.ImgHTMLAttributes<HTMLImageElement>,
  "src" | "alt" | "loading" | "className"
>;

export function GalleryImage({
  src,
  alt,
  caption,
  className,
  imgClassName,
  loading = "lazy",
  ...imgProps
}: GalleryImageProps) {
  const { register, update, unregister, open, setTrigger, pinchOverlayRef, pendingZoomRef } =
    useGallery();
  const idRef = React.useRef<number | null>(null);
  const buttonRef = React.useRef<HTMLButtonElement | null>(null);

  // Register exactly once per mount; unregister on unmount.
  React.useEffect(() => {
    const id = register({ src, alt, caption });
    idRef.current = id;
    return () => {
      idRef.current = null;
      unregister(id);
    };
    // Intentionally only on mount: re-running this would change DOM order.
    // Subsequent prop changes are mirrored via the update() effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mirror prop changes into the registry without re-ordering entries.
  React.useEffect(() => {
    if (idRef.current != null) {
      update(idRef.current, { src, alt, caption });
    }
  }, [src, alt, caption, update]);

  const handleOpen = React.useCallback(() => {
    if (idRef.current == null) return;
    setTrigger(buttonRef.current);
    open(idRef.current);
  }, [open, setTrigger]);

  // Pinch-to-open with progressive transition overlay (iOS Photos style).
  //
  // The native non-passive touchstart listener is mandatory because React's
  // synthetic onTouchStart is registered passive at the document root, so
  // preventDefault inside it is a silent no-op. We need preventDefault to
  // block iOS Safari's page-pinch-zoom on a 2-finger gesture.
  //
  // Once we own the gesture we attach window-level listeners (also non-
  // passive) so we keep tracking even if a finger leaves the button rect.
  // Per-frame updates push directly into the overlay's imperative API —
  // no React rerenders during the gesture.
  React.useEffect(() => {
    const btn = buttonRef.current;
    if (!btn) return;

    let active = false;
    let initialDist = 0;
    let initialMidX = 0;
    let initialMidY = 0;
    let lastScale = 1;
    let cleanup: (() => void) | null = null;

    const distance = (t1: Touch, t2: Touch) =>
      Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);

    const onWindowTouchMove = (e: TouchEvent) => {
      if (!active) return;
      if (e.touches.length < 2) return;
      // Block page-zoom and page-pan throughout the gesture.
      if (e.cancelable) e.preventDefault();
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = distance(t1, t2);
      if (initialDist <= 0) return;
      const scale = dist / initialDist;
      const midX = (t1.clientX + t2.clientX) / 2;
      const midY = (t1.clientY + t2.clientY) / 2;
      lastScale = scale;
      pinchOverlayRef.current?.update(
        scale,
        midX - initialMidX,
        midY - initialMidY,
      );
    };

    const finishGesture = () => {
      if (!active) return;
      active = false;
      const commit = lastScale >= PINCH_COMMIT_SCALE;
      if (commit) {
        // Stash the scale so the lightbox's mount-effect can hand it to
        // yarl's ZoomRef, opening already zoomed to where the user got to.
        // The 1 → max clamp matches yarl's own maxZoom (3 × by default).
        pendingZoomRef.current = Math.min(3, Math.max(1, lastScale));
        // Open the real lightbox first, then dismiss the overlay so yarl's
        // own opening visuals immediately replace ours with no flash gap.
        handleOpen();
        pinchOverlayRef.current?.close(true);
      } else {
        pendingZoomRef.current = 1;
        pinchOverlayRef.current?.close(false);
      }
      cleanup?.();
      cleanup = null;
    };

    const onWindowTouchEnd = (e: TouchEvent) => {
      if (!active) return;
      // Commit only when BOTH fingers are off — otherwise wait (finger
      // adjustments mid-pinch shouldn't trigger commit).
      if (e.touches.length >= 1) return;
      finishGesture();
    };

    const onWindowTouchCancel = () => {
      if (!active) return;
      finishGesture();
    };

    const onNativeTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      if (active) return;
      if (e.cancelable) e.preventDefault();
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      initialDist = distance(t1, t2);
      initialMidX = (t1.clientX + t2.clientX) / 2;
      initialMidY = (t1.clientY + t2.clientY) / 2;
      lastScale = 1;
      active = true;

      // Snapshot the button rect AND its border-radius so the overlay
      // exactly mirrors the polaroid frame visually.
      const rect = btn.getBoundingClientRect();
      const cs = window.getComputedStyle(btn);
      pinchOverlayRef.current?.open({
        src,
        alt,
        rect: {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
        },
        borderRadius: cs.borderRadius,
      });
      // Remember the original trigger so close()-after-commit returns focus
      // here, not to whatever else might steal it during the gesture.
      setTrigger(btn);

      window.addEventListener("touchmove", onWindowTouchMove, {
        passive: false,
      });
      window.addEventListener("touchend", onWindowTouchEnd, { passive: false });
      window.addEventListener("touchcancel", onWindowTouchCancel, {
        passive: false,
      });
      cleanup = () => {
        window.removeEventListener("touchmove", onWindowTouchMove);
        window.removeEventListener("touchend", onWindowTouchEnd);
        window.removeEventListener("touchcancel", onWindowTouchCancel);
      };
    };

    btn.addEventListener("touchstart", onNativeTouchStart, { passive: false });
    return () => {
      btn.removeEventListener("touchstart", onNativeTouchStart);
      cleanup?.();
    };
  }, [handleOpen, pinchOverlayRef, setTrigger, src, alt, pendingZoomRef]);

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={handleOpen}
      aria-label={`Открыть фото: ${caption || alt}`}
      // `appearance-none` + zero padding/border keeps tailwind sizing on the
      // outer className intact. `block w-full` so width-based utilities work.
      className={cn(
        // Note: NO `touch-manipulation` here. When this button lives inside
        // an overflow-x-auto scroll container (e.g. PhotoStrip), iOS treats
        // touch-manipulation as "this element only handles taps, no
        // panning", which blocks horizontal swipe for the parent scroll
        // engine. Default touch-action lets iOS pick: tap if the finger
        // doesn't move, pan if it does.
        "appearance-none p-0 m-0 border-0 bg-transparent block w-full cursor-zoom-in",
        className,
      )}
    >
      <img
        src={src}
        alt={alt}
        loading={loading}
        decoding="async"
        draggable={false}
        className={cn("block w-full h-auto", imgClassName)}
        {...imgProps}
      />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Lightbox
// ---------------------------------------------------------------------------

export function GalleryLightbox() {
  const { entries, isOpen, index, close, pendingZoomRef } = useGallery();
  // yarl exposes the active slide's zoom controls through a forwarded ref.
  // We need this to seed the initial zoom level after a pinch-to-open
  // commit, so the lightbox opens already zoomed to the scale the user
  // reached on the thumbnail (instead of resetting to fit-the-screen).
  const zoomRef = React.useRef<ZoomRef | null>(null);

  // After the lightbox opens, if there's a pending zoom from a pinch gesture
  // (set by GalleryImage's commit path), feed it to yarl. We can't do this
  // in the same tick that isOpen flips — yarl's zoom plugin attaches its ref
  // on its own first render, which happens AFTER our state update commits.
  // requestAnimationFrame defers us by one frame, by which point the slide
  // is mounted, the ref is set, and `disabled` is false.
  React.useEffect(() => {
    if (!isOpen) return;
    const target = pendingZoomRef.current;
    if (target <= 1) return;
    // Poll up to 30 frames (~500ms) waiting for yarl's ZoomRef to attach
    // and the slide to be ready. The Zoom plugin attaches its ref on the
    // active slide; until that slide is mounted and its image started
    // decoding, `disabled` stays true and changeZoom is a no-op.
    // Yarl's ZoomState has a useLayoutEffect that resets zoom to 1 on mount
    // and on globalIndex/currentSource changes. The reset can fire AFTER
    // our first changeZoom(target) call (yarl performs several internal
    // layout commits while preloading + decoding the slide). On production
    // it can land anywhere in the first ~1.5s.
    //
    // We poll every frame for 1500ms and re-issue changeZoom whenever
    // zoomRef.zoom drifts off target. ALL calls use rapid:true — that
    // means yarl skips its WebAnimations zoom-in and sets state.zoom
    // synchronously, so the next render produces inline
    // `transform: scale(target)` with no visible animation flash from
    // 1 → target (which the user reported as "zoom jumps back then
    // animates forward"). Visually the lightbox simply opens already at
    // the user's pinch scale.
    const startTs = performance.now();
    let rafId = 0;
    const POLL_MS = 1500;
    const tick = () => {
      const elapsed = performance.now() - startTs;
      const z = zoomRef.current;
      if (z && !z.disabled && Math.abs(z.zoom - target) > 0.01) {
        z.changeZoom(target, true);
      }
      if (elapsed > POLL_MS) {
        pendingZoomRef.current = 1;
        return;
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isOpen, pendingZoomRef]);

  const slides = React.useMemo(
    () =>
      entries.map((e) => ({
        src: e.src,
        alt: e.alt,
        // Only `description` — `title` would duplicate the caption at the top,
        // overlapping the counter and producing visual noise on narrow screens.
        description: e.caption,
      })),
    [entries],
  );

  // Touch devices: pinch + double-tap cover zoom; the toolbar Zoom button is
  // just clutter. Detect once on mount via `(pointer: coarse)`.
  const [isCoarsePointer, setIsCoarsePointer] = React.useState(false);
  React.useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    setIsCoarsePointer(window.matchMedia("(pointer: coarse)").matches);
  }, []);

  return (
    <Lightbox
      open={isOpen}
      close={close}
      index={index}
      slides={slides}
      plugins={[Zoom, Captions, Counter]}
      // ESC + backdrop-click are yarl defaults; restated for clarity.
      controller={{ closeOnBackdropClick: true, closeOnPullDown: true }}
      // Loop arrows: with finite=false there's never an "end", so both
      // prev/next arrows render on every slide when there are 2+ slides.
      // We force the first slide to size like the rest by overriding yarl's
      // CSS variable for slide padding (sets the inner box that bounds the
      // image). 10vw on each side → image ~80vw wide on phones, consistent
      // across all slides regardless of which one was opened first.
      carousel={{ finite: false }}
      styles={
        {
          container: {
            backgroundColor: "rgba(0, 0, 0, 0.92)",
            // Override yarl's slide padding via CSS variable — this is
            // honoured by every slide DOM, including the first one (which
            // otherwise inherits a smaller default in some yarl versions).
            "--yarl__slide_padding": "10vw",
          },
        } as Record<string, React.CSSProperties>
      }
      // Pinch / wheel zoom config — keeps both touch and desktop snappy.
      // `ref: zoomRef` exposes ZoomRef.changeZoom so we can seed initial
      // zoom from a pinch-to-open gesture (see useEffect on isOpen above).
      zoom={{
        ref: zoomRef,
        maxZoomPixelRatio: 3,
        scrollToZoom: true,
        wheelZoomDistanceFactor: 100,
        pinchZoomDistanceFactor: 100,
        doubleTapDelay: 300,
        doubleClickDelay: 300,
      }}
      counter={{
        container: {
          style: {
            top: 8,
            left: "50%",
            transform: "translateX(-50%)",
            color: "rgba(255,255,255,0.85)",
            fontSize: 13,
            fontWeight: 500,
          },
        },
      }}
      captions={{
        descriptionTextAlign: "center",
        // Hide the title overlay (it's a duplicate of description and clashes with the counter).
        // Keep description (renders at the bottom).
      }}
      // Single-slide: hide arrows. Multi-slide: let yarl render defaults
      // (carousel.finite=false guarantees both arrows appear on every slide).
      // Touch (coarse pointer): hide the toolbar Zoom button — pinch /
      // double-tap still work because the Zoom plugin is loaded.
      render={{
        ...(entries.length <= 1
          ? { buttonPrev: () => null, buttonNext: () => null }
          : {}),
        ...(isCoarsePointer ? { buttonZoom: () => null } : {}),
      }}
    />
  );
}
