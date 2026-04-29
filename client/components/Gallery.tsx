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
    // Mutable ref so imperative handlers always see the latest opts value.
    // useImperativeHandle captures closure at creation time ([] deps), so
    // reading opts directly would always see null (stale closure bug).
    const optsRef = React.useRef<PinchOpenOpts | null>(null);

    React.useImperativeHandle(
      ref,
      () => ({
        open: (o) => {
          setTransitioning(false);
          setOpts(o);
          optsRef.current = o;
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
            // Animate the overlay clone from "thumbnail-relative scale"
            // to "viewport-centre with the same scale" over ~200ms so
            // the visual handoff into the lightbox doesn't jump. The
            // lightbox underneath is mounting and seeding its own zoom
            // in parallel; by the time the overlay reaches viewport
            // centre yarl has applied the same scale and we can dismiss
            // the overlay cleanly.
            if (imgRef.current && optsRef.current) {
              const vw = window.innerWidth;
              const vh = window.innerHeight;
              const cardCenterX = optsRef.current.rect.left + optsRef.current.rect.width / 2;
              const cardCenterY = optsRef.current.rect.top + optsRef.current.rect.height / 2;
              const dx = vw / 2 - cardCenterX;
              const dy = vh / 2 - cardCenterY;
              // Read the current visible scale off the inline transform
              // so we don't reset it.
              const cur = imgRef.current.style.transform || "";
              const m = cur.match(/scale\(([\d.]+)\)/);
              const scale = m ? parseFloat(m[1]) : 1;
              setTransitioning(true);
              imgRef.current.style.transform = `translate3d(${dx}px, ${dy}px, 0) scale(${scale})`;
              if (dimRef.current) {
                dimRef.current.style.backgroundColor = "rgba(0,0,0,0.92)";
              }
            }
            window.setTimeout(() => {
              setOpts(null);
              setTransitioning(false);
              optsRef.current = null;
            }, 220);
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
              optsRef.current = null;
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
  // scale the user reached. Reset to 1 on close().
  pendingZoomRef: React.MutableRefObject<number>;
  // Pinch midpoint (viewport px, relative to screen center) at the moment
  // the user started the gesture. Passed as the focal point to changeZoom
  // so the lightbox zooms into the same region the user was pinching, rather
  // than always zooming from the image center. { dx: 0, dy: 0 } = center.
  pendingPanRef: React.MutableRefObject<{ dx: number; dy: number }>;
  // True while the user is actively pinching a thumbnail. The lightbox's
  // seed-zoom poll uses this to decide whether to keep guarding the zoom
  // value (gesture in progress → yes, fight resets aggressively) or to
  // wind down (gesture ended → 500ms grace then exit so we stop fighting
  // yarl's own pinch-zoom inside the lightbox).
  pinchActiveRef: React.MutableRefObject<boolean>;
  // Test-only: when true, the pinch-hold overlay poll refuses to dismiss
  // the overlay even if the image has already loaded. Set via
  // __bulkaTest.setHoldPinchOverlay(true) before opening the lightbox so
  // the e2e test can assert visibility before releasing.
  holdPinchOverlayRef: React.MutableRefObject<boolean>;
};

const GalleryContext = React.createContext<GalleryContextValue | null>(null);

export function useGallery(): GalleryContextValue {
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
  const pendingPanRef = React.useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
  const pinchActiveRef = React.useRef<boolean>(false);
  const holdPinchOverlayRef = React.useRef<boolean>(false);

  // Test hook — exposes the internal refs so e2e tests can drive the
  // seed-zoom path without simulating real multi-touch (which Chromium's
  // CDP touch dispatch can't reliably deliver to React-attached native
  // listeners). Production builds keep this in too — it's a few function
  // properties on window, ~0 cost, and lets us run TDD red/green cycles
  // without needing a real iPhone in the loop.
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    (window as unknown as Record<string, unknown>).__bulkaTest = {
      setPendingZoom: (v: number) => {
        pendingZoomRef.current = v;
      },
      getPendingZoom: () => pendingZoomRef.current,
      setPendingPan: (dx: number, dy: number) => {
        pendingPanRef.current = { dx, dy };
      },
      getPendingPan: () => pendingPanRef.current,
      setPinchActive: (v: boolean) => {
        pinchActiveRef.current = v;
      },
      // Prevent the pinch-hold overlay from auto-dismissing on image load.
      // Use in e2e tests to assert overlay visibility before allowing release.
      setHoldPinchOverlay: (v: boolean) => {
        holdPinchOverlayRef.current = v;
      },
    };
    return () => {
      delete (window as unknown as Record<string, unknown>).__bulkaTest;
    };
  }, []);

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
    // Reset seed zoom and pan so a subsequent open via tap (no pinch)
    // starts at scale 1 centered.
    pendingZoomRef.current = 1;
    pendingPanRef.current = { dx: 0, dy: 0 };
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
      pendingPanRef,
      pinchActiveRef,
      holdPinchOverlayRef,
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
  /** Displayed in the thumbnail; lightbox uses `src`. Defaults to `src`. */
  thumbSrc?: string;
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
  thumbSrc,
  alt,
  caption,
  className,
  imgClassName,
  loading = "lazy",
  ...imgProps
}: GalleryImageProps) {
  const {
    register,
    update,
    unregister,
    open,
    setTrigger,
    pinchOverlayRef,
    pendingZoomRef,
    pendingPanRef,
    pinchActiveRef,
  } = useGallery();
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
      // Update the seed-zoom ref LIVE during the gesture, not only on
      // touchend. Why: Chromium-emulated mobile (and possibly real iOS)
      // fires the synthetic `click` event after the FIRST finger lifts,
      // not after the last. That click triggers handleOpen() via the
      // button's onClick, which mounts the lightbox and starts its
      // useEffect-poll for pendingZoomRef BEFORE finishGesture has a
      // chance to set it. By writing it on every move we guarantee the
      // lightbox sees the current pinch scale whenever it opens.
      const clamped = Math.min(3, Math.max(1, scale));
      pendingZoomRef.current = clamped;
      pinchOverlayRef.current?.update(
        scale,
        midX - initialMidX,
        midY - initialMidY,
      );
    };

    const finishGesture = () => {
      if (!active) return;
      active = false;
      // KEEP pinchActiveRef true a little longer than the gesture itself.
      // Why: the lightbox mounts UNDER the user's still-down finger
      // (commit fires on the last touchend, but iOS can dispatch a fresh
      // touchstart on the newly-mounted .yarl__container if a finger is
      // resting in its bounds). That would trip the onUserTouch listener
      // and release zoom-ownership before our mount-effect has time to
      // read pendingZoomRef and apply the seed scale to yarl. The 600ms
      // grace covers React mount + yarl ZoomRef attach + first paint.
      const commit = lastScale >= PINCH_COMMIT_SCALE;
      if (commit) {
        // Stash the scale so the lightbox's mount-effect can hand it to
        // yarl's ZoomRef, opening already zoomed to where the user got to.
        // The 1 → max clamp matches yarl's own maxZoom (3 × by default).
        pendingZoomRef.current = Math.min(3, Math.max(1, lastScale));
        // Stash the pinch midpoint (relative to screen center) as the focal
        // point for the lightbox zoom. changeZoom(target, rapid, dx, dy)
        // treats dx/dy as the viewport-relative focal point: the image
        // zooms around that point rather than the screen center. YARL
        // clamps the resulting pan to valid bounds automatically.
        pendingPanRef.current = {
          dx: initialMidX - window.innerWidth / 2,
          dy: initialMidY - window.innerHeight / 2,
        };
        // Open the real lightbox first, then dismiss the overlay so yarl's
        // own opening visuals immediately replace ours with no flash gap.
        handleOpen();
        pinchOverlayRef.current?.close(true);
        // Release pinchActive only AFTER the mount-effect has had time to
        // run. See note above finishGesture.
        window.setTimeout(() => {
          pinchActiveRef.current = false;
        }, 600);
      } else {
        pendingZoomRef.current = 1;
        pendingPanRef.current = { dx: 0, dy: 0 };
        pinchOverlayRef.current?.close(false);
        pinchActiveRef.current = false;
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
      pinchActiveRef.current = true;

      // Start decoding the full-res image while the user is still pinching
      // so the lightbox doesn't flash a black frame on commit.
      const preload = new Image();
      preload.decode?.().catch(() => {});
      preload.src = src;

      // Snapshot the button rect AND its border-radius so the overlay
      // exactly mirrors the polaroid frame visually.
      const rect = btn.getBoundingClientRect();
      const cs = window.getComputedStyle(btn);
      pinchOverlayRef.current?.open({
        src: thumbSrc ?? src,
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
  }, [
    handleOpen,
    pinchOverlayRef,
    setTrigger,
    src,
    thumbSrc,
    alt,
    pendingZoomRef,
    pendingPanRef,
    pinchActiveRef,
  ]);

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
        src={thumbSrc ?? src}
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
  const { entries, isOpen, index, close, pendingZoomRef, pendingPanRef, pinchActiveRef, triggerRef, holdPinchOverlayRef } =
    useGallery();
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
  // Seed zoom — poll every frame while we still own it. Yarl has TWO
  // failure modes that defeat a one-shot apply:
  //   1. Mount-time `useLayoutEffect(() => setZoom(1), [globalIndex,
  //      currentSource])` resets zoom on the FIRST render and AGAIN
  //      after the preload→current image-source swap (~50–500ms after
  //      mount, depending on connection speed).
  //   2. yarl's `on.zoom` event-callback is gated by `!disabled` — and
  //      `disabled` is true exactly during the image-source swap. So
  //      the reset that resets us back to 1 is fired with disabled=true,
  //      meaning our on.zoom callback NEVER hears about it. Visible
  //      symptom: lightbox opens at scale 1 even though pendingZoomRef
  //      is at the user's pinch scale.
  //
  // Continuous poll covers both. Frame work is cheap (one ref read +
  // one comparison) and stops as soon as we lose ownership (user
  // touched the lightbox to drive their own zoom).
  React.useEffect(() => {
    if (!isOpen) return;
    // Set ownership sync at effect-entry. The other useEffect that
    // attaches the touchstart-release listener also sets this — both
    // setters are idempotent. Doing it here too avoids ordering
    // dependencies between the two effects.
    ownsZoomRef.current = true;
    let rafId = 0;
    const tick = () => {
      if (!ownsZoomRef.current) return;
      const target = Math.max(1, pendingZoomRef.current);
      if (target > 1) {
        const z = zoomRef.current;
        if (z && !z.disabled && Math.abs(z.zoom - target) > 0.01) {
          const pan = pendingPanRef.current;
          z.changeZoom(target, true, pan.dx, pan.dy);
        }
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isOpen, pendingZoomRef, pendingPanRef]);
  // After mount we hold ownership of the zoom level (= keep re-applying
  // pendingZoomRef on every yarl reset) until either:
  //   • the user touches anywhere inside the lightbox container — that's
  //     the start of an in-lightbox pinch we must NOT fight, OR
  //   • close().
  // No fixed timer because yarl's post-decode reset can land anywhere
  // from ~50ms to ~2s after open depending on network; a 500ms grace
  // window gambled wrong on slow connections and we lost the seed.
  const ownsZoomRef = React.useRef(false);
  // True while we should skip the next on.view event. Initialised to true so
  // the first on.view (which yarl fires synchronously on mount for the initial
  // slide) is a no-op and doesn't prematurely release ownership. Reset to true
  // in the close-cleanup so every subsequent open also gets one skip.
  const skipNextViewRef = React.useRef(true);
  React.useEffect(() => {
    if (!isOpen) {
      ownsZoomRef.current = false;
      skipNextViewRef.current = true; // arm the skip for the next open
      return;
    }
    ownsZoomRef.current = true;
    // Wait one frame for the lightbox container to mount, then attach a
    // capture-phase touchstart listener that releases ownership on the
    // user's first interaction. capture: true so we win the race against
    // yarl's own listeners on inner elements; passive: true so we don't
    // block the gesture.
    let releaseRaf = 0;
    const tryAttach = () => {
      const lb = document.querySelector(".yarl__container");
      if (!lb) {
        releaseRaf = requestAnimationFrame(tryAttach);
        return;
      }
      const onUserTouch = (e: TouchEvent) => {
        // Don't release while the thumbnail-pinch is still in progress,
        // UNLESS the user starts a new 2-finger pinch inside the lightbox.
        // Single-touch events during the 600ms window are ignored (the
        // opening hand may still be on screen). Two-finger events mean
        // the user has deliberately started their own zoom gesture.
        if (pinchActiveRef.current && e.touches.length < 2) return;
        ownsZoomRef.current = false;
        // Do NOT reset pendingZoomRef here — close() handles that on
        // unmount. Resetting it during an open lightbox would clobber
        // the seed value before the mount-effect's poll loop reads it.
        lb.removeEventListener("touchstart", onUserTouch, true);
      };
      lb.addEventListener("touchstart", onUserTouch, {
        capture: true,
        passive: true,
      });
    };
    releaseRaf = requestAnimationFrame(tryAttach);
    return () => {
      cancelAnimationFrame(releaseRaf);
      ownsZoomRef.current = false;
    };
  }, [isOpen, pinchActiveRef, pendingZoomRef]);

  // (MutationObserver pre-paint override removed — it was overriding
  // inline style on multiple slide wrappers in yarl's preload window
  // and producing visible "two ghost copies of the image stacked at
  // different scales" rendering glitches. The `on.zoom` callback below
  // handles yarl's resets event-driven, accepting a single-frame flash
  // on slow decode resets rather than fighting React reconciliation.)

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

  // Status-bar tint: while the lightbox is open, the iOS status bar should
  // sit on top of the photo's black backdrop, not on the orange page theme.
  // Flip <meta name="theme-color"> to #000 on open and restore on close so
  // the status-bar text auto-switches to a contrasting glyph color.
  React.useEffect(() => {
    if (typeof document === "undefined") return;
    const meta = document.querySelector(
      'meta[name="theme-color"]',
    ) as HTMLMetaElement | null;
    if (!meta) return;
    const original = meta.getAttribute("content") ?? "#f97316";
    if (isOpen) {
      meta.setAttribute("content", "#000000");
      return () => {
        meta.setAttribute("content", original);
      };
    }
  }, [isOpen]);

  // Safe-area coverage: on iPhone with viewport-fit=cover, iOS paints content
  // behind the notch (top) and home-indicator strip (bottom). If <body> has a
  // non-black background colour those safe-area zones show through as coloured
  // bands even though .yarl__portal covers the visual viewport. Setting body's
  // background to #000 while the lightbox is open fills those zones with the
  // same colour as the lightbox, making the strips invisible.
  // The original background is captured on open and restored on close.
  React.useEffect(() => {
    if (typeof document === "undefined") return;
    if (!isOpen) return;
    const body = document.body;
    const originalBg = body.style.backgroundColor;
    body.style.backgroundColor = "#000";
    return () => {
      body.style.backgroundColor = originalBg;
    };
  }, [isOpen]);

  // ── Pinch-to-open: hold thumbnail overlay until full image loads ────────────
  //
  // After fingers release and the lightbox opens, the full-resolution image
  // may take anywhere from 50ms to 2s+ to decode. During that gap yarl shows
  // a black background. We fill it with a fixed overlay that mirrors the
  // thumbnail and fades out once yarl's <img> reports complete + loaded.
  //
  // Independent of PinchTransitionOverlay (gesture-driven). Both can coexist
  // for the brief 220ms commit animation — same thumb image, no visible duplication.
  const [pinchHoldThumb, setPinchHoldThumb] = React.useState<string | null>(null);
  const [pinchHoldVisible, setPinchHoldVisible] = React.useState(false);

  React.useEffect(() => {
    if (!isOpen || pendingZoomRef.current <= 1) {
      // Plain tap-open or lightbox closed — clear any leftover overlay.
      setPinchHoldVisible(false);
      setPinchHoldThumb(null);
      return;
    }

    // Pinch-committed open: grab the thumbnail src from the triggering button.
    // triggerRef was set by setTrigger(btn) in onNativeTouchStart — it points
    // at the exact GalleryImage button the user was pinching.
    const thumbEl = triggerRef.current?.querySelector("img") as HTMLImageElement | null;
    const thumbSrc = thumbEl?.currentSrc ?? thumbEl?.src ?? null;

    if (!thumbSrc) {
      // No thumb available — nothing to hold.
      return;
    }

    setPinchHoldThumb(thumbSrc);
    setPinchHoldVisible(true);

    // Poll every rAF until yarl's current-slide img is fully loaded.
    // holdPinchOverlayRef allows e2e tests to block dismissal so they can
    // assert visibility before releasing (images may be browser-cached).
    let rafId = 0;
    let frameCount = 0;
    const MAX_FRAMES = 300; // ~5s at 60fps — safety exit
    const pollImageLoad = () => {
      frameCount++;
      if (frameCount > MAX_FRAMES) {
        // Give up — release overlay so user is never stuck behind it.
        setPinchHoldVisible(false);
        window.setTimeout(() => setPinchHoldThumb(null), 300);
        return;
      }
      // Test hook: allow tests to hold the overlay regardless of load state.
      if (holdPinchOverlayRef.current) {
        rafId = requestAnimationFrame(pollImageLoad);
        return;
      }
      const img = document.querySelector(
        ".yarl__slide_current .yarl__fullsize img",
      ) as HTMLImageElement | null;
      if (img && img.complete && img.naturalWidth > 0) {
        // Full image decoded — fade out the hold overlay.
        setPinchHoldVisible(false);
        window.setTimeout(() => setPinchHoldThumb(null), 300);
        return;
      }
      rafId = requestAnimationFrame(pollImageLoad);
    };
    rafId = requestAnimationFrame(pollImageLoad);

    return () => {
      cancelAnimationFrame(rafId);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);
  // ────────────────────────────────────────────────────────────────────────────

  return (
    <>
    {/* Pinch-hold thumbnail overlay — keeps thumb visible over yarl's black
        background until the full image finishes loading. Fades out on load.
        Only renders during a pinch-committed open (pendingZoom > 1). */}
    {pinchHoldThumb && typeof document !== "undefined" && createPortal(
      <div
        data-testid="pinch-thumb-overlay"
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 10000,
          pointerEvents: "none",
          backgroundImage: `url("${pinchHoldThumb}")`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          opacity: pinchHoldVisible ? 1 : 0,
          transition: "opacity 300ms ease-out",
        }}
      />,
      document.body,
    )}
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
          // Root = the .yarl__portal element. yarl's own styles.css already
          // sets `position: fixed; inset: 0` on this element. Use fully
          // opaque black (no alpha) so no page background bleeds through —
          // even on devices where the portal doesn't extend to the absolute
          // screen edge. Semi-transparent (#000 at 0.92) was enough for the
          // overlay look but let the cream page bg tint through by 8%.
          root: {
            backgroundColor: "#000",
          },
          container: {
            backgroundColor: "#000",
            // Override yarl's slide padding via CSS variable — this is
            // honoured by every slide DOM, including the first one (which
            // otherwise inherits a smaller default in some yarl versions).
            "--yarl__slide_padding": "10vw",
            // Defeat any safe-area-inset padding that might otherwise shrink
            // the photo away from the screen edges.
            paddingTop: 0,
            paddingBottom: 0,
            paddingLeft: 0,
            paddingRight: 0,
          },
        } as Record<string, React.CSSProperties>
      }
      // Pinch / wheel zoom config — keeps both touch and desktop snappy.
      // `ref: zoomRef` exposes ZoomRef.changeZoom so we can seed initial
      // zoom from a pinch-to-open gesture (see on.zoom callback below).
      zoom={{
        ref: zoomRef,
        maxZoomPixelRatio: 3,
        scrollToZoom: true,
        wheelZoomDistanceFactor: 100,
        pinchZoomDistanceFactor: 100,
        doubleTapDelay: 300,
        doubleClickDelay: 300,
      }}
      on={{
        // Release zoom ownership when the user navigates to a different slide.
        // Without this, the rAF seed-zoom poll keeps re-applying pendingZoomRef
        // to every subsequent slide (opened at scale 2.5, swipe to next slide →
        // next slide should start at 1, not 2.5).
        // skipNextViewRef guard: yarl fires one synthetic `view` for the initial
        // slide on mount — we skip it so the seed has time to apply.
        view: () => {
          if (skipNextViewRef.current) {
            skipNextViewRef.current = false;
            return;
          }
          ownsZoomRef.current = false;
        },
        // Event-driven seed-zoom guard. Yarl fires this callback on every
        // state.zoom change — both its own mount/decode resets AND
        // user-initiated pinch inside the lightbox. We re-apply the seed
        // ONLY while ownsZoomRef.current === true, which is set on open
        // and cleared the moment the user touches the lightbox container
        // (see the touchstart-listener effect above).
        zoom: ({ zoom: currentZoom }) => {
          if (!ownsZoomRef.current) return;
          const target = Math.max(1, pendingZoomRef.current);
          if (target <= 1) return;
          if (Math.abs(currentZoom - target) < 0.01) return;
          const z = zoomRef.current;
          if (z && !z.disabled) {
            const pan = pendingPanRef.current;
            z.changeZoom(target, true, pan.dx, pan.dy);
          }
        },
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
    </>
  );
}
