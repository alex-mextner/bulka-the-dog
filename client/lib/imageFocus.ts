import * as React from "react";

import focusData from "./image-focus.json";

export type FocusEntry = {
  x: number;
  y: number;
  confidence?: number;
  kind?: "dog" | "cat" | "human" | "none" | string;
  label?: string;
  box?: number[];
  width?: number;
  height?: number;
  inferred?: boolean;
  detections?: FocusDetection[];
};

export type FocusDetection = {
  x: number;
  y: number;
  confidence?: number;
  kind?: "dog" | "cat" | "human" | "none" | string;
  label?: string;
  box?: number[];
  inferred?: boolean;
};

type FocusData = {
  images?: Record<string, FocusEntry>;
};

function normalizeImageKey(src: string): string {
  let path = src;
  try {
    path = new URL(src, window.location.href).pathname;
  } catch {
    // Keep raw path.
  }
  path = path.replace(/^\/+/, "");
  const imageIdx = path.indexOf("images/");
  if (imageIdx >= 0) path = path.slice(imageIdx);
  return path;
}

export function getImageFocus(src: string | undefined): FocusEntry | null {
  if (!src) return null;
  const images = (focusData as FocusData).images ?? {};
  return images[normalizeImageKey(src)] ?? null;
}

export function getImageFocusStyle(
  src: string | undefined,
): React.CSSProperties | undefined {
  const focus = getImageFocus(src);
  if (!focus) return undefined;
  const x = Math.max(0, Math.min(1, focus.x));
  const y = Math.max(0, Math.min(1, focus.y));
  return {
    objectPosition: `${(x * 100).toFixed(1)}% ${(y * 100).toFixed(1)}%`,
  };
}

export function useImageFocusDebugEnabled(): boolean {
  const [enabled, setEnabled] = React.useState(false);
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    setEnabled(new URLSearchParams(window.location.search).get("dev") === "1");
  }, []);
  return enabled;
}
