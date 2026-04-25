import * as React from "react";
import Lightbox from "yet-another-react-lightbox";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import Captions from "yet-another-react-lightbox/plugins/captions";
import Counter from "yet-another-react-lightbox/plugins/counter";

import "yet-another-react-lightbox/styles.css";
import "yet-another-react-lightbox/plugins/captions.css";
import "yet-another-react-lightbox/plugins/counter.css";

import { cn } from "@/lib/utils";

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

  const open = React.useCallback((id: number) => {
    setEntries((prev) => {
      const idx = prev.findIndex((e) => e.id === id);
      setIndex(idx >= 0 ? idx : 0);
      return prev;
    });
    setIsOpen(true);
  }, []);

  const close = React.useCallback(() => {
    setIsOpen(false);
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
    }),
    [register, update, unregister, open, entries, isOpen, index, close, setTrigger],
  );

  return (
    <GalleryContext.Provider value={value}>{children}</GalleryContext.Provider>
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
  const { register, update, unregister, open, setTrigger } = useGallery();
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

  const handleTouchStart = React.useCallback(
    (e: React.TouchEvent<HTMLButtonElement>) => {
      // 2-finger pinch on the inline thumbnail: open the lightbox immediately.
      // The user's continuing pinch is then handled by yarl's Zoom plugin.
      if (e.touches.length === 2) {
        e.preventDefault();
        handleOpen();
      }
    },
    [handleOpen],
  );

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={handleOpen}
      onTouchStart={handleTouchStart}
      aria-label={`Открыть фото: ${caption || alt}`}
      // `appearance-none` + zero padding/border keeps tailwind sizing on the
      // outer className intact. `block w-full` so width-based utilities work.
      className={cn(
        "appearance-none p-0 m-0 border-0 bg-transparent block w-full cursor-zoom-in touch-manipulation",
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
  const { entries, isOpen, index, close } = useGallery();

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
      zoom={{
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
