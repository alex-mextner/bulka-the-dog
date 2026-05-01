import * as React from "react";
import { createPortal } from "react-dom";
import Lightbox, { type ZoomRef } from "yet-another-react-lightbox";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import Captions from "yet-another-react-lightbox/plugins/captions";
import Counter from "yet-another-react-lightbox/plugins/counter";

import "yet-another-react-lightbox/styles.css";
import "yet-another-react-lightbox/plugins/captions.css";
import "yet-another-react-lightbox/plugins/counter.css";

import { ImageFocusDebugOverlay } from "@/components/ImageFocusDebugOverlay";
import { getImageFocusStyle } from "@/lib/imageFocus";
import { cn } from "@/lib/utils";

const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? React.useLayoutEffect : React.useEffect;

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
  objectFit: React.CSSProperties["objectFit"];
  objectPosition: React.CSSProperties["objectPosition"];
};

type PinchOverlayHandle = {
  open: (opts: PinchOpenOpts) => void;
  update: (scale: number, dx: number, dy: number) => void;
  commit: () => void;
  dismiss: () => void;
  close: (commit: boolean) => void;
  isActive: () => boolean;
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

const PINCH_DISMISS_MS = 180;
const PINCH_CENTER_MS = 240;

const PinchTransitionOverlay = React.forwardRef<
  PinchOverlayHandle,
  { activeRef: React.MutableRefObject<boolean> }
>(function PinchTransitionOverlay({ activeRef }, ref) {
  const [opts, setOpts] = React.useState<PinchOpenOpts | null>(null);
  const [transitioning, setTransitioning] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const imgRef = React.useRef<HTMLImageElement | null>(null);
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
        activeRef.current = true;
        window.requestAnimationFrame(() => {
          if (rootRef.current) {
            rootRef.current.style.opacity = "1";
            rootRef.current.style.transition = "none";
          }
        });
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
      commit: () => {
        // Keep the clone exactly where the user's fingers left it. The real
        // lightbox is mounted underneath and receives the matching zoom/pan;
        // GalleryLightbox dismisses this overlay only after that state is
        // painted. Moving the clone to viewport centre here is the source of
        // the visible "thumb disappears, then lightbox appears" gap.
        setTransitioning(false);
        if (dimRef.current) {
          dimRef.current.style.backgroundColor = "rgba(0,0,0,1)";
        }
      },
      dismiss: () => {
        if (!optsRef.current) return;
        setTransitioning(true);
        if (rootRef.current) {
          rootRef.current.style.transition = `opacity ${PINCH_DISMISS_MS}ms ease-out`;
          rootRef.current.style.opacity = "0";
        }
        window.setTimeout(() => {
          setOpts(null);
          setTransitioning(false);
          optsRef.current = null;
          activeRef.current = false;
        }, PINCH_DISMISS_MS);
      },
      close: (commit) => {
        if (commit) {
          // Backward-compatible alias for the commit hold. Dismissal is
          // intentionally separate and is driven by GalleryLightbox after
          // the target zoom/pan has painted underneath.
          if (dimRef.current) {
            dimRef.current.style.backgroundColor = "rgba(0,0,0,1)";
          }
        } else {
          // Animate back to identity (= thumbnail rect) over PINCH_CANCEL_MS,
          // then unmount.
          setTransitioning(true);
          if (imgRef.current) {
            imgRef.current.style.transform = "translate3d(0, 0, 0) scale(1)";
          }
          if (dimRef.current) {
            dimRef.current.style.backgroundColor = "rgba(0,0,0,0)";
          }
          window.setTimeout(() => {
            setOpts(null);
            setTransitioning(false);
            optsRef.current = null;
            activeRef.current = false;
          }, PINCH_CANCEL_MS);
        }
      },
      isActive: () => activeRef.current,
    }),
    [activeRef],
  );

  if (!opts || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={rootRef}
      data-testid="pinch-transition-overlay"
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10001,
        opacity: 1,
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
      <img
        ref={imgRef}
        data-testid="pinch-transition-clone"
        src={opts.src}
        alt=""
        draggable={false}
        style={{
          position: "absolute",
          left: opts.rect.left,
          top: opts.rect.top,
          width: opts.rect.width,
          height: opts.rect.height,
          objectFit: opts.objectFit ?? "cover",
          objectPosition: opts.objectPosition ?? "center",
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
});

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
  // True while the gesture transition overlay is mounted. GalleryLightbox uses
  // this to avoid rendering the older full-screen thumbnail fallback on top of
  // the precise handoff clone.
  pinchTransitionActiveRef: React.MutableRefObject<boolean>;
  // Carry the final pinch scale from the overlay (in GalleryImage's commit
  // path) over to the lightbox's first-render effect, where we feed it to
  // yarl's ZoomRef.changeZoom so the lightbox opens already zoomed to the
  // scale the user reached. Reset to 1 on close().
  //
  // Semantics depend on pendingThumbWidthRef:
  //   - pendingThumbWidthRef > 0 → pendingZoomRef holds "target CSS pixels"
  //     (= thumb_width × pinch_scale). The rAF poll converts to yarl zoom
  //     by dividing by the actual fit_width read from the DOM (at zoom=1).
  //   - pendingThumbWidthRef = 0 → legacy path: pendingZoomRef is used as a
  //     direct yarl zoom multiplier (backward-compat for tests that don't
  //     set a thumb width).
  pendingZoomRef: React.MutableRefObject<number>;
  // Width of the thumbnail element in CSS pixels at the moment the pinch
  // gesture started. Zero when the lightbox was opened via tap (no pinch),
  // or when using the legacy test hook path.
  pendingThumbWidthRef: React.MutableRefObject<number>;
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
  // Thumbnail src captured synchronously at open()-time (before the first
  // paint with isOpen=true). Consumed by GalleryLightbox to render the
  // pinch-hold overlay on the SAME paint cycle that the lightbox mounts,
  // preventing the 1-frame black flash between gesture-overlay fade and
  // full-image decode. Null when opened via tap (no pinch).
  pinchThumbSrc: string | null;
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
  const pinchTransitionActiveRef = React.useRef<boolean>(false);
  const pendingZoomRef = React.useRef<number>(1);
  const pendingThumbWidthRef = React.useRef<number>(0);
  const pendingPanRef = React.useRef<{ dx: number; dy: number }>({
    dx: 0,
    dy: 0,
  });
  const pinchActiveRef = React.useRef<boolean>(false);
  const holdPinchOverlayRef = React.useRef<boolean>(false);
  const isOpenRef = React.useRef(false);
  const lightboxHistoryKeyRef = React.useRef(0);
  const activeHistoryKeyRef = React.useRef<number | null>(null);
  // Thumbnail src captured synchronously in open() so the hold-overlay renders
  // on the SAME paint cycle as isOpen=true (not one frame later via useEffect).
  const [pinchThumbSrc, setPinchThumbSrc] = React.useState<string | null>(null);

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
      // Set thumb width in CSS pixels for the pixel-based zoom conversion path.
      // When non-zero, the rAF poll treats pendingZoomRef as "target CSS pixels"
      // and divides by the actual fit_width from DOM to get yarl zoom.
      // When zero (default), pendingZoomRef is used as direct yarl zoom (legacy).
      setThumbWidth: (v: number) => {
        pendingThumbWidthRef.current = v;
      },
      getThumbWidth: () => pendingThumbWidthRef.current,
      // Set the thumbnail centre relative to viewport centre (CSS px).
      // This is the new semantics: dx/dy is the thumb-centre offset, not a
      // raw yarl focal point. The rAF poll converts to yarl focal point via
      //   dx_focal = -dx / (yarlZoom - 1)
      // For the legacy direct-focal-point path, leave pendingThumbWidthRef=0.
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
      // Deterministic pinch-handoff driver for Playwright. It mirrors the
      // production touch path without relying on browser multi-touch delivery.
      beginPinchHandoff: (
        selector: string,
        opts: { scale: number; dx?: number; dy?: number },
      ) => {
        const el = document.querySelector(selector) as HTMLElement | null;
        if (!el) throw new Error(`beginPinchHandoff: no match for ${selector}`);
        const img = (el.querySelector("img[data-pinch-thumb]") ??
          el.querySelector("img")) as HTMLImageElement | null;
        const visualEl = img ?? el;
        const rect = visualEl.getBoundingClientRect();
        const cs = window.getComputedStyle(visualEl);
        const scale = Math.min(PINCH_MAX_SCALE, Math.max(1, opts.scale));
        const dx = opts.dx ?? 0;
        const dy = opts.dy ?? 0;
        triggerRef.current = el;
        pendingThumbWidthRef.current = rect.width;
        pendingZoomRef.current = rect.width * scale;
        pendingPanRef.current = {
          dx: rect.left + rect.width / 2 + dx - window.innerWidth / 2,
          dy: rect.top + rect.height / 2 + dy - window.innerHeight / 2,
        };
        pinchActiveRef.current = true;
        pinchOverlayRef.current?.open({
          src: img?.currentSrc || img?.src || "",
          alt: img?.alt || "",
          rect: {
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
          },
          borderRadius: cs.borderRadius,
          objectFit: cs.objectFit as React.CSSProperties["objectFit"],
          objectPosition:
            cs.objectPosition as React.CSSProperties["objectPosition"],
        });
        pinchOverlayRef.current?.update(scale, dx, dy);
        window.setTimeout(
          () => pinchOverlayRef.current?.update(scale, dx, dy),
          0,
        );
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            pinchOverlayRef.current?.update(scale, dx, dy);
          });
        });
        return {
          x: rect.left + dx + (rect.width * (1 - scale)) / 2,
          y: rect.top + dy + (rect.height * (1 - scale)) / 2,
          width: rect.width * scale,
          height: rect.height * scale,
        };
      },
      commitPinchHandoff: (selector: string) => {
        const el = document.querySelector(selector) as HTMLElement | null;
        if (!el)
          throw new Error(`commitPinchHandoff: no match for ${selector}`);
        el.click();
        pinchOverlayRef.current?.commit();
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

  const open = React.useCallback(
    (id: number) => {
      setEntries((prev) => {
        const idx = prev.findIndex((e) => e.id === id);
        setIndex(idx >= 0 ? idx : 0);
        return prev;
      });
      // Capture thumbnail src synchronously, BEFORE setIsOpen(true) so that
      // when React batches all these setState calls into a single paint, the
      // hold-overlay is already in the DOM on the first frame. Doing this in a
      // useEffect would be one paint too late and cause the black flash.
      //
      // Only populate if there's an active pinch gesture (pendingZoomRef > 1).
      // For plain tap-opens we don't need the hold overlay.
      if (pendingZoomRef.current > 1) {
        // Prefer img[data-pinch-thumb] if present (PhotoFader marks its active
        // image with this attribute so we grab the right frame out of the stack).
        // Fall back to the first <img> for single-image triggers (GalleryImage).
        const thumbEl = (triggerRef.current?.querySelector(
          "img[data-pinch-thumb]",
        ) ??
          triggerRef.current?.querySelector("img")) as HTMLImageElement | null;
        const src = thumbEl?.currentSrc ?? thumbEl?.src ?? null;
        setPinchThumbSrc(src);
      } else {
        setPinchThumbSrc(null);
      }
      // Eagerly add yarl__no_scroll before setIsOpen so the CSS isolation
      // (visibility:hidden on #root, black body background) is already in
      // effect on the very first paint. Without this, YARL adds the class in a
      // passive useEffect one paint cycle after isOpen becomes true, leaving a
      // brief window where iOS Safari chrome compositing can show live page
      // content in the top/bottom chrome strips. classList.add is idempotent,
      // so YARL's own add is a no-op, and YARL's cleanup correctly removes the
      // class on close.
      if (typeof document !== "undefined") {
        document.body.classList.add("yarl__no_scroll");
      }
      isOpenRef.current = true;
      setIsOpen(true);
      // Push exactly one history entry for the whole lightbox session — slide
      // changes inside the lightbox stay invisible to history. The Android
      // back gesture / browser back will pop this entry and trigger popstate,
      // which we handle by closing.
      if (typeof window !== "undefined") {
        try {
          const key = lightboxHistoryKeyRef.current + 1;
          lightboxHistoryKeyRef.current = key;
          activeHistoryKeyRef.current = key;
          const state =
            window.history.state && typeof window.history.state === "object"
              ? window.history.state
              : {};
          window.history.pushState(
            { ...state, __bulkaLightbox: key },
            "",
            window.location.href,
          );
          ownsHistoryEntryRef.current = true;
        } catch {
          ownsHistoryEntryRef.current = false;
          activeHistoryKeyRef.current = null;
        }
      }
      // pendingZoomRef and triggerRef are stable refs (never change identity);
      // setPinchThumbSrc is a stable useState setter. Empty eslint-disable would
      // be stricter but these truly don't need to be in the dep array.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [setPinchThumbSrc],
  );

  const close = React.useCallback(() => {
    isOpenRef.current = false;
    setIsOpen(false);
    setPinchThumbSrc(null);
    // Mirror the eager add in open(): remove the class immediately so that if
    // close() is called before YARL's NoScroll effect has mounted (e.g. a
    // popstate arriving before React commits the isOpen=true render), the
    // class doesn't stick and leave #root hidden.
    if (typeof document !== "undefined") {
      document.body.classList.remove("yarl__no_scroll");
    }
    // Reset seed zoom, thumb width, and pan so a subsequent open via tap
    // (no pinch) starts at scale 1 centered.
    pendingZoomRef.current = 1;
    pendingThumbWidthRef.current = 0;
    pendingPanRef.current = { dx: 0, dy: 0 };
    // If we still own the pushed entry (close came from X / backdrop / ESC,
    // not from popstate), pop it so the URL/history stays clean. popstate
    // resets the flag before invoking close, so we don't double-pop.
    if (ownsHistoryEntryRef.current && typeof window !== "undefined") {
      ownsHistoryEntryRef.current = false;
      const state = window.history.state as { __bulkaLightbox?: number } | null;
      if (
        state &&
        state.__bulkaLightbox != null &&
        state.__bulkaLightbox === activeHistoryKeyRef.current
      ) {
        try {
          window.history.back();
        } catch {
          /* no-op */
        }
      }
    }
    activeHistoryKeyRef.current = null;
    // Return focus to the thumbnail that opened the lightbox.
    // rAF (not queueMicrotask) ensures we wait until after the paint — otherwise
    // body.yarl__no_scroll is still set when the microtask fires, #root is
    // visibility:hidden, and focus() is silently rejected by the browser.
    // preventScroll: true so the browser doesn't jump to the thumbnail position.
    requestAnimationFrame(() => {
      triggerRef.current?.focus?.({ preventScroll: true });
    });
  }, []);

  const setTrigger = React.useCallback((el: HTMLElement | null) => {
    triggerRef.current = el;
  }, []);

  React.useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);

  // Permanent popstate listener: Android can dispatch the back navigation very
  // soon after open(), before an "only while open" effect has attached. We keep
  // one listener for the provider lifetime and gate it with isOpenRef.
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const onPopState = () => {
      if (!isOpenRef.current) return;
      // Browser already moved history; don't call history.back again in close.
      ownsHistoryEntryRef.current = false;
      activeHistoryKeyRef.current = null;
      close();
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [close]);

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
      pinchTransitionActiveRef,
      pendingZoomRef,
      pendingThumbWidthRef,
      pendingPanRef,
      pinchActiveRef,
      holdPinchOverlayRef,
      pinchThumbSrc,
    }),
    [
      register,
      update,
      unregister,
      open,
      entries,
      isOpen,
      index,
      close,
      setTrigger,
      pinchThumbSrc,
    ],
  );

  return (
    <GalleryContext.Provider value={value}>
      {children}
      <PinchTransitionOverlay
        ref={pinchOverlayRef}
        activeRef={pinchTransitionActiveRef}
      />
    </GalleryContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Thumbnail trigger
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// usePinchToOpen — reusable pinch-to-open hook
//
// Attaches a non-passive native touchstart listener to the given element ref
// and drives the pinch-to-open transition overlay. Call `onCommit` when the
// gesture reaches PINCH_COMMIT_SCALE (the caller is expected to open the
// lightbox). The element is also registered as the focus-restore trigger in
// GalleryContext on touchstart.
//
// `meta` is read from a ref internally so the touchstart listener does NOT
// need to be re-attached when src/alt change — important for PhotoFader
// where activeIdx changes on every scroll step.
// ---------------------------------------------------------------------------

export type PinchToOpenMeta = {
  src: string;
  alt: string;
  thumbSrc?: string;
};

export function usePinchToOpen(
  elementRef: React.RefObject<HTMLElement | null>,
  meta: PinchToOpenMeta,
  onCommit: () => void,
) {
  const {
    setTrigger,
    pinchOverlayRef,
    pendingZoomRef,
    pendingThumbWidthRef,
    pendingPanRef,
    pinchActiveRef,
  } = useGallery();

  // Store latest meta and callback in refs so the touchstart listener
  // (attached once) always reads the current values without being
  // re-attached on every render / activeIdx change.
  const metaRef = React.useRef<PinchToOpenMeta>(meta);
  const onCommitRef = React.useRef<() => void>(onCommit);
  React.useEffect(() => {
    metaRef.current = meta;
  });
  React.useEffect(() => {
    onCommitRef.current = onCommit;
  });

  React.useEffect(
    () => {
      const el = elementRef.current;
      if (!el) return;

      let active = false;
      let initialDist = 0;
      let initialMidX = 0;
      let initialMidY = 0;
      let lastScale = 1;
      let lastDx = 0;
      let lastDy = 0;
      // Width of the thumbnail element at gesture start (CSS pixels).
      // Snapshotted in onNativeTouchStart so it's stable throughout the gesture.
      let thumbWidthPx = 0;
      // Center of the thumbnail element in viewport coordinates at gesture start.
      // Used to compute the correct yarl focal-point offset so the lightbox opens
      // with the image centred on the same pixel as the thumbnail.
      let thumbCenterX = 0;
      let thumbCenterY = 0;
      let cleanup: (() => void) | null = null;

      const distance = (t1: Touch, t2: Touch) =>
        Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);

      const onWindowTouchMove = (e: TouchEvent) => {
        if (!active) return;
        if (e.touches.length < 2) return;
        // Block page-zoom and page-pan throughout the gesture.
        if (e.cancelable) e.preventDefault();
        e.stopPropagation();
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const dist = distance(t1, t2);
        if (initialDist <= 0) return;
        const scale = dist / initialDist;
        const midX = (t1.clientX + t2.clientX) / 2;
        const midY = (t1.clientY + t2.clientY) / 2;
        lastScale = scale;
        lastDx = midX - initialMidX;
        lastDy = midY - initialMidY;
        // Update the seed-zoom ref LIVE during the gesture, not only on
        // touchend. Why: Chromium-emulated mobile (and possibly real iOS)
        // fires the synthetic `click` event after the FIRST finger lifts,
        // not after the last. That click triggers handleOpen() via the
        // button's onClick, which mounts the lightbox and starts its
        // useEffect-poll for pendingZoomRef BEFORE finishGesture has a
        // chance to set it. By writing it on every move we guarantee the
        // lightbox sees the current pinch scale whenever it opens.
        //
        // Store as "target CSS pixels" = thumbWidth × scale so the lightbox's
        // rAF poll can divide by the actual fit_width and get the correct yarl
        // zoom. (pendingThumbWidthRef > 0 signals this pixel-based path.)
        const clamped = Math.min(3, Math.max(1, scale));
        pendingZoomRef.current = thumbWidthPx * clamped;
        pendingPanRef.current = {
          dx: thumbCenterX + lastDx - window.innerWidth / 2,
          dy: thumbCenterY + lastDy - window.innerHeight / 2,
        };
        pinchOverlayRef.current?.update(scale, lastDx, lastDy);
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
          // Stash the target width (thumb × scale, CSS pixels) so the lightbox's
          // rAF poll can compute the correct yarl zoom by dividing by fit_width.
          // Clamp to PINCH_MAX_SCALE for consistency with the overlay clamp.
          const clampedScale = Math.min(
            PINCH_MAX_SCALE,
            Math.max(1, lastScale),
          );
          pendingZoomRef.current = thumbWidthPx * clampedScale;
          pendingThumbWidthRef.current = thumbWidthPx;
          // Stash the thumbnail centre (relative to viewport centre) so the
          // lightbox's rAF poll can compute the exact focal-point argument for
          // yarl's changeZoom, placing the image centre over the same pixel as
          // the thumbnail centre on screen.
          //
          // NOTE: pendingPanRef now stores the THUMB CENTRE (not the pinch
          // midpoint). The rAF poll converts it to a yarl focal-point offset
          // using: dx_focal = -thumbCenterDx / (yarlZoom - 1). This is derived
          // from the yarl changeZoom formula which applies
          //   changeOffsets(dx * (1/zoom - 1/newZoom), …)
          // so that the resulting screenOffset = offsetX * newZoom = thumbCenterDx.
          pendingPanRef.current = {
            dx: thumbCenterX + lastDx - window.innerWidth / 2,
            dy: thumbCenterY + lastDy - window.innerHeight / 2,
          };
          // Open the real lightbox first, then dismiss the overlay so yarl's
          // own opening visuals immediately replace ours with no flash gap.
          onCommitRef.current();
          pinchOverlayRef.current?.commit();
          // Release pinchActive only AFTER the mount-effect has had time to
          // run. See note above finishGesture.
          window.setTimeout(() => {
            pinchActiveRef.current = false;
          }, 600);
        } else {
          pendingZoomRef.current = 1;
          pendingThumbWidthRef.current = 0;
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
        e.stopPropagation();
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        initialDist = distance(t1, t2);
        initialMidX = (t1.clientX + t2.clientX) / 2;
        initialMidY = (t1.clientY + t2.clientY) / 2;
        lastScale = 1;
        lastDx = 0;
        lastDy = 0;
        active = true;
        pinchActiveRef.current = true;

        const { src, thumbSrc, alt } = metaRef.current;

        // Start decoding the full-res image while the user is still pinching
        // so the lightbox doesn't flash a black frame on commit.
        const preload = new Image();
        preload.decode?.().catch(() => {});
        preload.src = src;

        // Snapshot the element rect AND its border-radius so the overlay
        // exactly mirrors the thumbnail frame visually.
        const thumbImg = (el.querySelector("img[data-pinch-thumb]") ??
          el.querySelector("img")) as HTMLImageElement | null;
        const visualEl = thumbImg ?? el;
        const rect = visualEl.getBoundingClientRect();
        // Capture thumb width for the zoom-scale conversion in GalleryLightbox.
        // The rAF poll divides pendingZoomRef (target CSS px) by the fit_width
        // read from yarl's DOM to get the correct yarl zoom multiplier.
        thumbWidthPx = rect.width;
        pendingThumbWidthRef.current = rect.width;
        // Capture thumb center for the focal-point pan calculation.
        // The rAF poll uses this to compute the yarl offset that places the
        // lightbox image centre over the same viewport pixel as the thumbnail.
        thumbCenterX = rect.left + rect.width / 2;
        thumbCenterY = rect.top + rect.height / 2;
        const cs = window.getComputedStyle(visualEl);
        pinchOverlayRef.current?.open({
          src: thumbImg?.currentSrc || thumbImg?.src || thumbSrc || src,
          alt,
          rect: {
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
          },
          borderRadius: cs.borderRadius,
          objectFit: cs.objectFit as React.CSSProperties["objectFit"],
          objectPosition:
            cs.objectPosition as React.CSSProperties["objectPosition"],
        });
        // Remember the original trigger so close()-after-commit returns focus
        // here, not to whatever else might steal it during the gesture.
        setTrigger(el as HTMLElement);

        window.addEventListener("touchmove", onWindowTouchMove, {
          passive: false,
        });
        window.addEventListener("touchend", onWindowTouchEnd, {
          passive: false,
        });
        window.addEventListener("touchcancel", onWindowTouchCancel, {
          passive: false,
        });
        cleanup = () => {
          window.removeEventListener("touchmove", onWindowTouchMove);
          window.removeEventListener("touchend", onWindowTouchEnd);
          window.removeEventListener("touchcancel", onWindowTouchCancel);
        };
      };

      const onLocalGesture = (e: Event) => {
        // Safari's non-standard gesture events are what turn a two-finger
        // gesture into page zoom. Prevent them only on gallery triggers, so a
        // user who zoomed the whole page can still pinch the rest of the page
        // back down normally.
        if (e.cancelable) e.preventDefault();
        e.stopPropagation();
      };

      el.addEventListener("touchstart", onNativeTouchStart, { passive: false });
      el.addEventListener("gesturestart", onLocalGesture, { passive: false });
      el.addEventListener("gesturechange", onLocalGesture, { passive: false });
      return () => {
        el.removeEventListener("touchstart", onNativeTouchStart);
        el.removeEventListener("gesturestart", onLocalGesture);
        el.removeEventListener("gesturechange", onLocalGesture);
        cleanup?.();
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [
      // elementRef is stable (useRef), pinch*Refs are stable context refs.
      // Re-attach only if the element itself changes (e.g. conditional render).
      // meta and onCommit are tracked via their own refs above.
    ],
  );
}

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
  const { register, update, unregister, open, setTrigger } = useGallery();
  const idRef = React.useRef<number | null>(null);
  const buttonRef = React.useRef<HTMLButtonElement | null>(null);
  const { style: imgStyle, ...restImgProps } = imgProps;
  const focusStyle = getImageFocusStyle(thumbSrc ?? src) ?? getImageFocusStyle(src);

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
  usePinchToOpen(buttonRef, { src, thumbSrc, alt }, handleOpen);

  return (
    <button
      ref={buttonRef}
      type="button"
      data-gallery-image=""
      data-pinch-open-root=""
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
        "relative appearance-none p-0 m-0 border-0 bg-transparent block w-full cursor-zoom-in",
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
        style={focusStyle ? { ...focusStyle, ...imgStyle } : imgStyle}
        {...restImgProps}
      />
      <ImageFocusDebugOverlay src={thumbSrc ?? src} />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Lightbox
// ---------------------------------------------------------------------------

export function GalleryLightbox() {
  const {
    entries,
    isOpen,
    index,
    close,
    pinchOverlayRef,
    pinchTransitionActiveRef,
    pendingZoomRef,
    pendingThumbWidthRef,
    pendingPanRef,
    pinchActiveRef,
    holdPinchOverlayRef,
    pinchThumbSrc,
  } = useGallery();
  // yarl exposes the active slide's zoom controls through a forwarded ref.
  // We need this to seed the initial zoom level after a pinch-to-open
  // commit, so the lightbox opens already zoomed to the scale the user
  // reached on the thumbnail (instead of resetting to fit-the-screen).
  const zoomRef = React.useRef<ZoomRef | null>(null);
  // Cached fit_width (CSS px) of the current slide image at yarl zoom=1.
  // Read once per open from the DOM when z.zoom is still 1 (before the seed
  // is applied). Used to convert "target CSS pixels" → yarl zoom multiplier.
  // Reset to 0 on close so the next open re-reads a fresh value.
  const fitWidthCacheRef = React.useRef<number>(0);
  // After mount we hold ownership of the zoom level (= keep re-applying
  // pendingZoomRef on every yarl reset) until either:
  //   • the user touches anywhere inside the lightbox container — that's
  //     the start of an in-lightbox pinch we must NOT fight, OR
  //   • close().
  // No fixed timer because yarl's post-decode reset can land anywhere
  // from ~50ms to ~2s after open depending on network; a 500ms grace
  // window gambled wrong on slow connections and we lost the seed.
  const ownsZoomRef = React.useRef(false);

  const getEffectiveSeedPan = React.useCallback(() => {
    const pan = pendingPanRef.current;
    const viewport = document.querySelector(
      ".bulka-lightbox .yarl__container",
    ) as HTMLElement | null;
    if (!viewport) return pan;
    const rect = viewport.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return pan;
    return {
      dx: window.innerWidth / 2 + pan.dx - (rect.left + rect.width / 2),
      dy: window.innerHeight / 2 + pan.dy - (rect.top + rect.height / 2),
    };
  }, [pendingPanRef]);

  const applyUnboundedSeedTransform = React.useCallback(
    (targetZoom: number) => {
      if (pendingThumbWidthRef.current <= 0 || targetZoom <= 1) return;
      const fullsize = document.querySelector(
        ".yarl__slide_current .yarl__fullsize",
      ) as HTMLElement | null;
      if (!fullsize) return;
      const pan = getEffectiveSeedPan();
      const offsetX = pan.dx / targetZoom;
      const offsetY = pan.dy / targetZoom;
      fullsize.style.transform = `scale(${targetZoom}) translateX(${offsetX}px) translateY(${offsetY}px)`;
      fullsize.dataset.bulkaSeedTransform = "true";
    },
    [getEffectiveSeedPan, pendingThumbWidthRef],
  );

  const isUnboundedSeedPainted = React.useCallback(
    (targetZoom: number) => {
      if (pendingThumbWidthRef.current <= 0 || targetZoom <= 1.05) return true;
      const img = document.querySelector(
        ".yarl__slide_current .yarl__fullsize img",
      ) as HTMLImageElement | null;
      if (!img) return false;
      const rect = img.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      const pan = pendingPanRef.current;
      const targetCenterX = window.innerWidth / 2 + pan.dx;
      const targetCenterY = window.innerHeight / 2 + pan.dy;
      const expectedWidth =
        fitWidthCacheRef.current > 0
          ? fitWidthCacheRef.current * targetZoom
          : pendingZoomRef.current;
      const scalePainted =
        expectedWidth <= 0 ||
        Math.abs(rect.width - expectedWidth) <=
          Math.max(4, expectedWidth * 0.04);
      return (
        scalePainted &&
        Math.abs(rect.left + rect.width / 2 - targetCenterX) <= 2 &&
        Math.abs(rect.top + rect.height / 2 - targetCenterY) <= 2
      );
    },
    [pendingPanRef, pendingThumbWidthRef, pendingZoomRef],
  );

  const scheduleUnboundedSeedTransform = React.useCallback(
    (targetZoom: number) => {
      applyUnboundedSeedTransform(targetZoom);
      window.setTimeout(() => {
        if (ownsZoomRef.current) applyUnboundedSeedTransform(targetZoom);
      }, 0);
    },
    [applyUnboundedSeedTransform],
  );

  const centerSeededPan = React.useCallback(() => {
    if (pendingThumbWidthRef.current <= 0) return;
    const z = zoomRef.current;
    const fullsize = document.querySelector(
      ".yarl__slide_current .yarl__fullsize",
    ) as HTMLElement | null;
    if (!fullsize) return;

    fullsize.dataset.bulkaSeedCentering = "true";
    const finish = () => {
      fullsize.dataset.bulkaSeedCentered = "true";
      delete fullsize.dataset.bulkaSeedCentering;
    };

    if (
      !z ||
      z.disabled ||
      z.zoom <= 1.01 ||
      (Math.abs(z.offsetX) < 1 && Math.abs(z.offsetY) < 1)
    ) {
      finish();
      return;
    }

    let nextZoom =
      z.zoom < z.maxZoom * 0.999
        ? Math.min(z.maxZoom, z.zoom * 1.001)
        : Math.max(z.minZoom, z.zoom * 0.999);
    let denominator = 1 / z.zoom - 1 / nextZoom;
    if (Math.abs(denominator) < 0.000001) {
      nextZoom = Math.max(z.minZoom, z.zoom * 0.995);
      denominator = 1 / z.zoom - 1 / nextZoom;
    }
    if (Math.abs(denominator) < 0.000001) {
      finish();
      return;
    }

    // Stop the seed guard before centering; otherwise the rAF poll would keep
    // re-applying the under-finger pan while we animate back to center.
    ownsZoomRef.current = false;

    const focalDx = z.offsetX / denominator;
    const focalDy = z.offsetY / denominator;
    const fromTransform =
      window.getComputedStyle(fullsize).transform || fullsize.style.transform;
    const toTransform = `scale(${nextZoom}) translateX(0px) translateY(0px)`;
    fullsize.getAnimations().forEach((animation) => animation.cancel());
    const animation = fullsize.animate(
      [
        {
          transform:
            fromTransform === "none" ? fullsize.style.transform : fromTransform,
        },
        { transform: toTransform },
      ],
      {
        duration: PINCH_CENTER_MS,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        fill: "forwards",
      },
    );
    animation.onfinish = () => {
      z.changeZoom(nextZoom, true, focalDx, focalDy);
      fullsize.style.transform = toTransform;
      finish();
    };
    animation.oncancel = finish;
  }, [pendingThumbWidthRef]);

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
  useIsomorphicLayoutEffect(() => {
    if (!isOpen) return;
    // Set ownership sync at effect-entry. The other useEffect that
    // attaches the touchstart-release listener also sets this — both
    // setters are idempotent. Doing it here too avoids ordering
    // dependencies between the two effects.
    ownsZoomRef.current = true;
    fitWidthCacheRef.current = 0; // reset cache on each open
    let rafId = 0;
    const tick = () => {
      if (!ownsZoomRef.current) return;
      const z = zoomRef.current;

      // Resolve the target yarl zoom from pendingZoomRef.
      // Two paths depending on whether thumbWidth was provided:
      //
      //   pendingThumbWidthRef > 0 → "pixel-based path":
      //     pendingZoomRef holds (thumb_width × pinch_scale) in CSS px.
      //     We need fit_width (image size at yarl zoom=1) to convert.
      //     Read it once from the DOM while z.zoom is still 1.
      //     target_yarl = clamp(1, maxZoom, targetPx / fit_width)
      //
      //   pendingThumbWidthRef = 0 → "legacy path":
      //     pendingZoomRef is used directly as yarl zoom (backward-compat
      //     for tests and programmatic callers that don't set thumbWidth).
      let target: number;
      if (pendingThumbWidthRef.current > 0) {
        const targetPx = pendingZoomRef.current;
        // Lazily read fit_width from DOM. Only sample when yarl zoom is
        // still 1 (i.e. before we've applied any seed zoom). After the
        // first changeZoom the image will be scaled, so we must not
        // re-read — just use the cached value.
        if (fitWidthCacheRef.current <= 0 && z && z.zoom <= 1.01) {
          const img = document.querySelector(
            ".yarl__slide_current .yarl__fullsize img",
          ) as HTMLImageElement | null;
          if (img) {
            const w = img.getBoundingClientRect().width;
            if (w > 0) fitWidthCacheRef.current = w;
          }
        }
        const fitWidth = fitWidthCacheRef.current;
        if (fitWidth > 0) {
          const maxZoom = z ? z.maxZoom : 3;
          target = Math.min(maxZoom, Math.max(1, targetPx / fitWidth));
        } else {
          // fit_width not yet readable (image not in DOM yet) — skip this tick.
          rafId = requestAnimationFrame(tick);
          return;
        }
      } else {
        // Legacy path: pendingZoomRef is a direct yarl zoom value.
        target = Math.max(1, pendingZoomRef.current);
      }

      if (target > 1) {
        if (z && !z.disabled && Math.abs(z.zoom - target) > 0.01) {
          const pan =
            pendingThumbWidthRef.current > 0
              ? getEffectiveSeedPan()
              : pendingPanRef.current;
          // Convert thumb-centre coords to yarl focal-point offset.
          // When pendingThumbWidthRef > 0 (pixel-based path), pan.dx/dy is the
          // thumbnail centre relative to viewport centre (not the pinch midpoint).
          // yarl's changeZoom(Z, rapid, dx, dy) applies:
          //   newOffset = currentOffset - dx * (1/currentZoom - 1/Z)
          // Starting from zoom=1, offsetX=0 we need newOffset * Z = pan.dx, so:
          //   dx_focal = -pan.dx / (Z - 1)
          // For the legacy path (pendingThumbWidthRef=0) pan.dx is already the
          // raw focal point as before.
          let focalDx: number;
          let focalDy: number;
          if (pendingThumbWidthRef.current > 0 && target > 1) {
            focalDx = -pan.dx / (target - 1);
            focalDy = -pan.dy / (target - 1);
          } else {
            focalDx = pan.dx;
            focalDy = pan.dy;
          }
          z.changeZoom(target, true, focalDx, focalDy);
        }
        scheduleUnboundedSeedTransform(target);
      }
      rafId = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(rafId);
  }, [
    isOpen,
    pendingZoomRef,
    pendingThumbWidthRef,
    pendingPanRef,
    scheduleUnboundedSeedTransform,
    getEffectiveSeedPan,
  ]);
  // True while we should skip the next on.view event. Initialised to true so
  // the first on.view (which yarl fires synchronously on mount for the initial
  // slide) is a no-op and doesn't prematurely release ownership. Reset to true
  // in the close-cleanup so every subsequent open also gets one skip.
  const skipNextViewRef = React.useRef(true);
  React.useEffect(() => {
    if (!isOpen) {
      ownsZoomRef.current = false;
      skipNextViewRef.current = true; // arm the skip for the next open
      fitWidthCacheRef.current = 0; // reset fit_width cache for next open
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

  // ── Pinch-to-open: hold thumbnail overlay until full image loads ────────────
  //
  // After fingers release and the lightbox opens, the full-resolution image
  // may take anywhere from 50ms to 2s+ to decode. During that gap yarl shows
  // a black background. We fill it with a fixed overlay that mirrors the
  // thumbnail and fades out once yarl's <img> reports complete AND the pinch
  // grace period (600ms) has elapsed.
  //
  // `pinchThumbSrc` is captured synchronously inside GalleryProvider.open()
  // (before setIsOpen(true)) so the overlay is in the DOM on the SAME paint
  // cycle that the lightbox mounts — no 1-frame black flash.
  //
  // CRITICAL: the overlay must appear at opacity:1 on the very first paint.
  // Using `useState(false)` + `useEffect → setPinchHoldVisible(true)` causes
  // a one-render cycle where opacity=0 is painted (useEffect runs after paint),
  // then the CSS transition animates 0→1 over 300ms — that IS the black flash.
  //
  // Fix: track only the dismissal phase. Overlay renders at opacity:1 as soon
  // as pinchThumbSrc is non-null (no effect needed for show). `pinchHoldDismissing`
  // is set to true when the AND-gate fires, which triggers the fade-out
  // transition. The overlay stays in DOM until GalleryProvider.close() clears
  // pinchThumbSrc.
  //
  // Independent of PinchTransitionOverlay (gesture-driven). Both can coexist
  // for the brief 220ms commit animation — same thumb image, no visible duplication.
  const [pinchHoldDismissing, setPinchHoldDismissing] = React.useState(false);
  const [pinchHoldFallbackVisible, setPinchHoldFallbackVisible] =
    React.useState(false);

  // True once the full-resolution image in the current slide has finished
  // decoding. Reset on slide navigation and on lightbox open. Used as part
  // of the AND-gate dismissal condition together with !pinchActiveRef.
  const imageLoadedRef = React.useRef(false);

  React.useEffect(() => {
    if (!isOpen || !pinchThumbSrc) {
      // Plain tap-open or lightbox closed — reset dismissal state.
      setPinchHoldDismissing(false);
      setPinchHoldFallbackVisible(false);
      imageLoadedRef.current = false;
      return;
    }

    // Pinch-committed open: reset dismissing flag (overlay is already at
    // opacity:1 from the first render — no setState needed to show it).
    setPinchHoldDismissing(false);
    setPinchHoldFallbackVisible(false);
    imageLoadedRef.current = false;

    // Poll every rAF until yarl's current-slide img is fully loaded AND the
    // pinch grace period has elapsed (both must be true to avoid premature
    // dismiss on browser-cached images).
    let rafId = 0;
    let frameCount = 0;
    const MAX_FRAMES = 300; // ~5s at 60fps — safety exit
    // How many consecutive frames the AND-gate has been satisfied.
    // We require STABLE_REQUIRED in a row before dismissing the overlay.
    // Why: yarl fires a useLayoutEffect reset (zoom→1) when the preload image
    // source swaps to full-res (~50–500ms after mount). zoomRef.current.zoom
    // drops to 1 for one tick, then our seed-zoom rAF re-applies the target.
    // Without stability tracking, the gate fires the frame the ref first
    // hits target, the overlay fades, and the user sees the image flash to
    // zoom=1 during the next frame's reset. Three consecutive frames with no
    // drop back below threshold confirms the reset has settled.
    let stableFrames = 0;
    const STABLE_REQUIRED = 3;
    let fallbackReleased = false;
    const releaseTransitionToFallback = () => {
      if (fallbackReleased) return;
      fallbackReleased = true;
      setPinchHoldFallbackVisible(true);
      requestAnimationFrame(() => {
        pinchOverlayRef.current?.dismiss();
      });
    };
    const pollImageLoad = () => {
      frameCount++;
      if (frameCount > MAX_FRAMES) {
        // Give up — release overlay so user is never stuck behind it.
        releaseTransitionToFallback();
        setPinchHoldDismissing(true);
        return;
      }
      // Test hook: allow tests to hold the overlay regardless of load state.
      if (holdPinchOverlayRef.current) {
        rafId = requestAnimationFrame(pollImageLoad);
        return;
      }
      // Check image load state.
      if (!imageLoadedRef.current) {
        const img = document.querySelector(
          ".yarl__slide_current .yarl__fullsize img",
        ) as HTMLImageElement | null;
        if (img && img.complete && img.naturalWidth > 0) {
          imageLoadedRef.current = true;
        }
      }
      if (
        !imageLoadedRef.current &&
        frameCount >= 12 &&
        pinchTransitionActiveRef.current
      ) {
        releaseTransitionToFallback();
      }
      // AND-gate: dismiss only when ALL conditions are met:
      //   1. Full image is loaded (imageLoadedRef.current = true)
      //   2. Pinch grace period has elapsed (!pinchActiveRef.current)
      //   3. yarl has painted the seed zoom (CSS transform scale ≈ pendingZoom)
      //      Read from DOM so we check the *actually painted* state, not just
      //      the internal zoom state which fires one tick before rAF commit.
      // Resolve the target yarl zoom. Two paths (mirrors the seed-zoom rAF tick):
      //   thumbW > 0 → pixel-based: pendingZoomRef holds CSS px, divide by fitWidth.
      //   thumbW = 0 → legacy: pendingZoomRef is a direct yarl zoom factor.
      const thumbW = pendingThumbWidthRef.current;
      let fitW = fitWidthCacheRef.current;
      let targetYarlZoom: number;
      if (thumbW > 0) {
        if (fitW <= 0) {
          // fitWidth not cached yet. Fallback: derive from img's rendered width
          // divided by the current zoom, which works whether zoom=1 (direct
          // measurement) or zoom>1 (seed-zoom already applied before we cached).
          const currentZoom = zoomRef.current?.zoom ?? 1;
          const img = document.querySelector(
            ".yarl__slide_current .yarl__fullsize img",
          ) as HTMLImageElement | null;
          if (img) {
            const w = img.getBoundingClientRect().width;
            if (w > 0) {
              fitWidthCacheRef.current = w / Math.max(1, currentZoom);
              fitW = fitWidthCacheRef.current;
            }
          }
        }
        if (fitW <= 0) {
          // Image not in DOM yet — defer.
          rafId = requestAnimationFrame(pollImageLoad);
          return;
        }
        const maxZ = zoomRef.current?.maxZoom ?? 3;
        targetYarlZoom = Math.min(
          maxZ,
          Math.max(1, pendingZoomRef.current / fitW),
        );
      } else {
        targetYarlZoom = Math.max(1, pendingZoomRef.current);
      }
      // Use actual yarl zoom state (zoomRef.current.zoom), not CSS transform regex.
      // The old CSS regex path compared CSS px scale (~2.5) against pixel-based
      // pendingZoomRef.current (~480), producing "2.5 >= 432" — always false → 5s wait.
      const zoomPainted =
        targetYarlZoom <= 1.05 ||
        (zoomRef.current?.zoom ?? 1) >= targetYarlZoom * 0.9;
      const panPainted = isUnboundedSeedPainted(targetYarlZoom);
      if (
        imageLoadedRef.current &&
        !pinchActiveRef.current &&
        zoomPainted &&
        panPainted
      ) {
        stableFrames++;
        if (stableFrames >= STABLE_REQUIRED) {
          // All conditions met for N consecutive frames → overlay safe to fade.
          // While it fades, animate the seeded under-finger pan back to the
          // centered lightbox position so the final frame feels intentional.
          releaseTransitionToFallback();
          centerSeededPan();
          pinchOverlayRef.current?.dismiss();
          setPinchHoldDismissing(true);
          return;
        }
      } else {
        stableFrames = 0;
      }
      rafId = requestAnimationFrame(pollImageLoad);
    };
    rafId = requestAnimationFrame(pollImageLoad);

    return () => {
      cancelAnimationFrame(rafId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isOpen,
    pinchThumbSrc,
    isUnboundedSeedPainted,
    centerSeededPan,
    pinchOverlayRef,
    pinchTransitionActiveRef,
  ]);
  // ────────────────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Backdrop behind the yarl portal (z=9998 < 9999). It uses the same
        fullscreen viewport CSS as the portal, so it is a real layer rather
        than a repaint of the document canvas. */}
      {isOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="bulka-lightbox-backdrop"
            aria-hidden="true"
            style={{
              position: "fixed",
              inset: 0,
              backgroundImage: "linear-gradient(to bottom, #000 0%, #000 100%)",
              zIndex: 9998,
              pointerEvents: "none",
            }}
          />,
          document.body,
        )}
      {/* Pinch-hold thumbnail overlay — keeps thumb visible over yarl's black
        background until the full image finishes loading AND pinch grace ends.
        pinchThumbSrc is null for plain tap opens — overlay not rendered. */}
      {pinchThumbSrc &&
        (pinchHoldFallbackVisible || !pinchTransitionActiveRef.current) &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="bulka-pinch-thumb-overlay"
            data-testid="pinch-thumb-overlay"
            aria-hidden="true"
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 10000,
              pointerEvents: "none",
              backgroundImage: `url("${pinchThumbSrc}")`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              // Overlay appears at opacity:1 immediately on the first paint (no
              // useEffect delay) — pinchThumbSrc is set synchronously in open().
              // Transition applies only on the way OUT (pinchHoldDismissing=true)
              // so there is no 0→1 fade-in that would produce a black flash.
              opacity: pinchHoldDismissing ? 0 : 1,
              transition: pinchHoldDismissing
                ? "opacity 180ms ease-out"
                : "none",
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
        className={cn(
          "bulka-lightbox",
          pinchThumbSrc ? "bulka-lightbox--pinch" : "bulka-lightbox--cover",
        )}
        // ESC + backdrop-click are yarl defaults; restated for clarity.
        controller={{ closeOnBackdropClick: true, closeOnPullDown: true }}
        animation={{ zoom: PINCH_CENTER_MS }}
        // Loop arrows: with finite=false there's never an "end", so both
        // prev/next arrows render on every slide when there are 2+ slides.
        // Tap-open uses full-bleed cover so Safari chrome / Dynamic Island zones
        // don't read as black letterbox strips. Pinch-open keeps contain sizing:
        // the seed zoom/pan math depends on yarl's fit-width matching the
        // thumbnail clone exactly for a pixel-stable handoff.
        carousel={{
          finite: false,
          imageFit: pinchThumbSrc ? "contain" : "cover",
          padding: 0,
        }}
        styles={
          {
            // Root = the .yarl__portal element. yarl's own styles.css already
            // sets `position: fixed; inset: 0` on this element. Use fully
            // opaque black (no alpha) so no page background bleeds through —
            // even on devices where the portal doesn't extend to the absolute
            // screen edge. Semi-transparent (#000 at 0.92) was enough for the
            // overlay look but let the cream page bg tint through by 8%.
            //
            // iOS Safari height fix is applied via global.css (.yarl__portal rule)
            // rather than here via inline styles — inline height on portal breaks
            // yarl's internal fit-width DOM measurement (getBoundingClientRect on
            // the fullsize img reads wrong when height is set inline in the same
            // render cycle that the portal mounts).
            root: {
              backgroundColor: "#000",
            },
            container: {
              backgroundColor: "#000",
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
            // Reset image-loaded flag when the user navigates to a new slide so
            // the hold-overlay poll re-checks load state for the new image.
            imageLoadedRef.current = false;
          },
          // Event-driven seed-zoom guard. Yarl fires this callback on every
          // state.zoom change — both its own mount/decode resets AND
          // user-initiated pinch inside the lightbox. We re-apply the seed
          // ONLY while ownsZoomRef.current === true, which is set on open
          // and cleared the moment the user touches the lightbox container
          // (see the touchstart-listener effect above).
          zoom: ({ zoom: currentZoom }) => {
            if (!ownsZoomRef.current) return;
            // Convert pendingZoomRef to a yarl zoom target using the same
            // pixel-based path as the rAF tick (fitWidthCacheRef is shared).
            let target: number;
            if (
              pendingThumbWidthRef.current > 0 &&
              fitWidthCacheRef.current > 0
            ) {
              const z = zoomRef.current;
              const maxZoom = z ? z.maxZoom : 3;
              target = Math.min(
                maxZoom,
                Math.max(1, pendingZoomRef.current / fitWidthCacheRef.current),
              );
            } else {
              target = Math.max(1, pendingZoomRef.current);
            }
            if (target <= 1) return;
            if (Math.abs(currentZoom - target) < 0.01) return;
            const z = zoomRef.current;
            if (z && !z.disabled) {
              const pan =
                pendingThumbWidthRef.current > 0
                  ? getEffectiveSeedPan()
                  : pendingPanRef.current;
              // Same focal-point conversion as the rAF tick: pan.dx/dy is the
              // thumbnail centre offset (not a raw focal point) when
              // pendingThumbWidthRef > 0.
              let focalDx: number;
              let focalDy: number;
              if (pendingThumbWidthRef.current > 0 && target > 1) {
                focalDx = -pan.dx / (target - 1);
                focalDy = -pan.dy / (target - 1);
              } else {
                focalDx = pan.dx;
                focalDy = pan.dy;
              }
              z.changeZoom(target, true, focalDx, focalDy);
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
