import * as React from "react";

import {
  getImageFocus,
  type FocusDetection,
  useImageFocusDebugEnabled,
} from "@/lib/imageFocus";

const KIND_COLORS: Record<
  string,
  { stroke: string; fill: string; labelText: string }
> = {
  dog: {
    stroke: "#9a5a2e",
    fill: "rgba(154, 90, 46, 0.18)",
    labelText: "#ffffff",
  },
  cat: {
    stroke: "#111111",
    fill: "rgba(0, 0, 0, 0.14)",
    labelText: "#ffffff",
  },
  human: {
    stroke: "#facc15",
    fill: "rgba(250, 204, 21, 0.18)",
    labelText: "#1f1300",
  },
  none: {
    stroke: "#9ca3af",
    fill: "rgba(156, 163, 175, 0.14)",
    labelText: "#111827",
  },
};

function getColors(kind: string | undefined) {
  return KIND_COLORS[kind ?? ""] ?? KIND_COLORS.none;
}

function getBoxStyle(
  detection: FocusDetection,
  width: number | undefined,
  height: number | undefined,
): React.CSSProperties | null {
  if (!detection.box || detection.box.length !== 4 || !width || !height) {
    return null;
  }

  return {
    left: `${(detection.box[0] / width) * 100}%`,
    top: `${(detection.box[1] / height) * 100}%`,
    width: `${((detection.box[2] - detection.box[0]) / width) * 100}%`,
    height: `${((detection.box[3] - detection.box[1]) / height) * 100}%`,
  };
}

export function ImageFocusDebugOverlay({ src }: { src?: string }) {
  const enabled = useImageFocusDebugEnabled();
  const focus = getImageFocus(src);
  if (!enabled || !focus) return null;

  const x = Math.max(0, Math.min(1, focus.x));
  const y = Math.max(0, Math.min(1, focus.y));
  const focusColors = getColors(focus.kind);
  const detections = focus.detections?.length
    ? focus.detections
    : (focus.confidence ?? 0) > 0
      ? [focus]
      : [];

  return (
    <div
      data-image-focus-debug=""
      aria-hidden="true"
      className="absolute inset-0 z-20 pointer-events-none"
    >
      {detections.map((detection, index) => {
        const colors = getColors(detection.kind);
        const boxStyle = getBoxStyle(detection, focus.width, focus.height);
        if (!boxStyle) return null;

        return (
          <div
            key={`${detection.kind ?? "focus"}-${detection.label ?? "box"}-${index}`}
            data-image-focus-debug-kind={detection.kind}
            className="absolute border-2 shadow-[0_0_0_1px_rgba(255,255,255,0.8)]"
            style={{
              ...boxStyle,
              borderColor: colors.stroke,
              backgroundColor: colors.fill,
            }}
          >
            <div
              className="absolute left-0 top-0 whitespace-nowrap rounded-sm px-1 py-0.5 text-[10px] font-semibold leading-none"
              style={{
                backgroundColor: colors.stroke,
                color: colors.labelText,
              }}
            >
              {detection.kind ?? "focus"}{" "}
              {Math.round((detection.confidence ?? 0) * 100)}
              {detection.inferred ? " inferred" : ""}
            </div>
          </div>
        );
      })}
      <div
        className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.75)]"
        style={{
          left: `${x * 100}%`,
          top: `${y * 100}%`,
          backgroundColor: focusColors.stroke,
        }}
      />
      <div
        className="absolute left-1 top-1 max-w-[calc(100%-0.5rem)] rounded px-1.5 py-0.5 text-[10px] font-semibold leading-tight shadow-[0_0_0_1px_rgba(255,255,255,0.7)]"
        style={{
          backgroundColor: focusColors.stroke,
          color: focusColors.labelText,
        }}
      >
        {focus.kind ?? "focus"} {focus.label ?? "focus"} {Math.round(x * 100)}
        /{Math.round(y * 100)}
      </div>
    </div>
  );
}
