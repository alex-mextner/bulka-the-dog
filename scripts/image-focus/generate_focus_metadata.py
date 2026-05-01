#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

import torch
from PIL import Image, ImageOps
from transformers import OwlViTForObjectDetection, OwlViTProcessor


MODEL_ID = "google/owlvit-base-patch32"
PROMPTS = [
    "dog face",
    "dog head",
    "dog muzzle",
    "face of a dog",
    "head of a dog",
    "cat face",
    "cat head",
    "face of a cat",
    "head of a cat",
    "human face",
    "person face",
    "face of a person",
]
PRIORITY = {
    "dog muzzle": 9.0,
    "dog face": 7.0,
    "face of a dog": 7.0,
    "dog head": 5.5,
    "head of a dog": 5.5,
    "cat face": 7.0,
    "face of a cat": 7.0,
    "cat head": 5.5,
    "head of a cat": 5.5,
    "human face": 1.0,
    "person face": 1.0,
    "face of a person": 1.0,
    "inferred dog face": 1.0,
    "inferred cat face": 1.0,
    "inferred human face": 1.0,
}
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp"}
NON_PHOTO_NAMES = {"cardiology.webp", "health1.webp", "health2.webp", "map.webp"}
KIND_THRESHOLDS = {
    "dog": 0.025,
    "cat": 0.06,
    "human": 0.08,
}
BODY_THRESHOLDS = {
    "dog": 0.08,
    "cat": 0.08,
    "human": 0.08,
}
BODY_LABELS: set[str] = set()
MANUAL_DETECTIONS = {
    "images/bulka_face.webp": [
        ("dog", "dog face", [0.28, 0.15, 0.74, 0.55]),
    ],
    "images/bulka_tv.webp": [
        ("dog", "dog face", [0.30, 0.55, 0.64, 0.85]),
    ],
    "images/dog_car.webp": [
        ("dog", "dog face", [0.38, 0.22, 0.80, 0.52]),
    ],
    "images/lena_dogs.webp": [
        ("dog", "dog face", [0.62, 0.39, 0.96, 0.66]),
        ("human", "human face", [0.02, 0.17, 0.54, 0.52]),
    ],
    "images/photo-set/DSC01851.jpg": [
        ("dog", "dog face", [0.10, 0.04, 0.94, 0.66]),
    ],
    "images/photo-set/DSC01856.jpg": [
        ("dog", "dog face", [0.30, 0.06, 0.72, 0.40]),
    ],
    "images/photo-set/DSC01859.jpg": [
        ("dog", "dog face", [0.33, 0.06, 0.70, 0.40]),
    ],
    "images/photo-set/DSC01878.jpg": [
        ("dog", "dog face", [0.25, 0.08, 0.72, 0.46]),
    ],
    "images/photo-set/ps_balcony_sun.webp": [
        ("dog", "dog face", [0.25, 0.08, 0.72, 0.46]),
    ],
    "images/photo-set/ps_ball.webp": [
        ("dog", "dog face", [0.33, 0.06, 0.70, 0.40]),
    ],
    "images/photo-set/ps_portrait.webp": [
        ("dog", "dog face", [0.10, 0.04, 0.94, 0.66]),
    ],
    "images/photo-set/ps_rug.webp": [
        ("dog", "dog face", [0.30, 0.06, 0.72, 0.40]),
    ],
    "images/photo-set/thumbs/ps_balcony_sun.webp": [
        ("dog", "dog face", [0.24, 0.08, 0.73, 0.48]),
    ],
    "images/photo-set/thumbs/ps_ball.webp": [
        ("dog", "dog face", [0.30, 0.05, 0.72, 0.40]),
    ],
    "images/photo-set/thumbs/ps_portrait.webp": [
        ("dog", "dog face", [0.08, 0.02, 0.96, 0.70]),
    ],
    "images/photo-set/thumbs/ps_rug.webp": [
        ("dog", "dog face", [0.28, 0.04, 0.74, 0.42]),
    ],
    "images/photo-set/thumbs/ps_scratch.webp": [
        ("dog", "dog face", [0.42, 0.10, 0.80, 0.44]),
    ],
}


@dataclass
class Detection:
    kind: str
    label: str
    score: float
    box: list[float]
    x: float
    y: float
    inferred: bool = False

    @property
    def rank(self) -> float:
        width = max(1.0, self.box[2] - self.box[0])
        height = max(1.0, self.box[3] - self.box[1])
        area_bonus = min(1.25, (width * height) ** 0.5 / 500)
        return self.score * PRIORITY.get(self.label, 0.5) * (1 + area_bonus * 0.08)


def iter_images(public_dir: Path, include_raw: bool) -> Iterable[Path]:
    root = public_dir / "images"
    for path in sorted(root.rglob("*")):
        if not path.is_file() or path.suffix.lower() not in IMAGE_EXTS:
            continue
        if not include_raw and "_raw" in path.parts:
            continue
        yield path


def detection_kind(label: str) -> str:
    if "dog" in label:
        return "dog"
    if "cat" in label:
        return "cat"
    return "human"


def is_body_label(label: str) -> bool:
    return label in BODY_LABELS


def focus_from_box(box: list[float], image_w: int, image_h: int) -> tuple[float, float]:
    x1, y1, x2, y2 = box
    x = (x1 + x2) / 2
    y = (y1 + y2) / 2
    return x / image_w, y / image_h


def inferred_face_box(kind: str, box: list[float], image_w: int, image_h: int) -> list[float]:
    x1, y1, x2, y2 = box
    w = max(1.0, x2 - x1)
    h = max(1.0, y2 - y1)

    if kind == "human":
        cx = x1 + w * 0.5
        cy = y1 + h * 0.16
        size = min(w * 0.42, h * 0.24)
    else:
        cx = x1 + w * 0.5
        cy = y1 + h * 0.28
        size = min(w * 0.46, h * 0.28)

    half = size / 2
    return [
        round(max(0.0, min(float(image_w), cx - half)), 2),
        round(max(0.0, min(float(image_h), cy - half)), 2),
        round(max(0.0, min(float(image_w), cx + half)), 2),
        round(max(0.0, min(float(image_h), cy + half)), 2),
    ]


def iou(a: list[float], b: list[float]) -> float:
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    ix1 = max(ax1, bx1)
    iy1 = max(ay1, by1)
    ix2 = min(ax2, bx2)
    iy2 = min(ay2, by2)
    iw = max(0.0, ix2 - ix1)
    ih = max(0.0, iy2 - iy1)
    intersection = iw * ih
    if intersection <= 0:
        return 0.0
    area_a = max(0.0, ax2 - ax1) * max(0.0, ay2 - ay1)
    area_b = max(0.0, bx2 - bx1) * max(0.0, by2 - by1)
    union = area_a + area_b - intersection
    return intersection / union if union > 0 else 0.0


def nms(detections: list[Detection], threshold: float = 0.45) -> list[Detection]:
    kept: list[Detection] = []
    for detection in sorted(detections, key=lambda det: det.rank, reverse=True):
        if any(
            existing.kind == detection.kind and iou(existing.box, detection.box) > threshold
            for existing in kept
        ):
            continue
        kept.append(detection)
    return kept


def detection_to_json(detection: Detection) -> dict:
    return {
        "kind": detection.kind,
        "label": detection.label,
        "confidence": round(detection.score, 4),
        "x": round(detection.x, 4),
        "y": round(detection.y, 4),
        "box": detection.box,
        "inferred": detection.inferred,
    }


def manual_focus_entry(image_path: Path, key: str) -> dict | None:
    manual = MANUAL_DETECTIONS.get(key)
    if not manual:
        return None

    image = ImageOps.exif_transpose(Image.open(image_path).convert("RGB"))
    detections: list[Detection] = []
    for idx, (kind, label, normalized_box) in enumerate(manual):
        x1, y1, x2, y2 = normalized_box
        box = [
            round(max(0.0, min(float(image.width), x1 * image.width)), 2),
            round(max(0.0, min(float(image.height), y1 * image.height)), 2),
            round(max(0.0, min(float(image.width), x2 * image.width)), 2),
            round(max(0.0, min(float(image.height), y2 * image.height)), 2),
        ]
        x, y = focus_from_box(box, image.width, image.height)
        detections.append(
            Detection(
                kind=kind,
                label=label,
                score=0.99 - idx * 0.01,
                box=box,
                x=max(0.05, min(0.95, x)),
                y=max(0.05, min(0.95, y)),
            )
        )

    detections.sort(key=lambda det: det.rank, reverse=True)
    best = detections[0]
    return {
        "x": round(best.x, 4),
        "y": round(best.y, 4),
        "confidence": round(best.score, 4),
        "kind": best.kind,
        "label": best.label,
        "box": best.box,
        "width": image.width,
        "height": image.height,
        "detections": [detection_to_json(det) for det in detections[:8]],
    }


def detect_focus(processor: OwlViTProcessor, model: OwlViTForObjectDetection, image_path: Path) -> dict:
    image = ImageOps.exif_transpose(Image.open(image_path).convert("RGB"))
    inputs = processor(text=[PROMPTS], images=image, return_tensors="pt")
    with torch.inference_mode():
        outputs = model(**inputs)
    target_sizes = torch.tensor([(image.height, image.width)])
    results = processor.image_processor.post_process_object_detection(
        outputs=outputs,
        target_sizes=target_sizes,
        threshold=0.055,
    )[0]

    detections: list[Detection] = []
    for score, label_idx, box in zip(
        results["scores"].tolist(),
        results["labels"].tolist(),
        results["boxes"].tolist(),
    ):
        label = PROMPTS[int(label_idx)]
        kind = detection_kind(label)
        body_label = is_body_label(label)
        threshold = BODY_THRESHOLDS[kind] if body_label else KIND_THRESHOLDS[kind]
        if score < threshold:
            continue
        normalized_box = [
            round(max(0.0, min(float(image.width), float(box[0]))), 2),
            round(max(0.0, min(float(image.height), float(box[1]))), 2),
            round(max(0.0, min(float(image.width), float(box[2]))), 2),
            round(max(0.0, min(float(image.height), float(box[3]))), 2),
        ]
        inferred = False
        if body_label:
            normalized_box = inferred_face_box(kind, normalized_box, image.width, image.height)
            label = f"inferred {kind} face"
            inferred = True
        x, y = focus_from_box(normalized_box, image.width, image.height)
        detections.append(
            Detection(
                kind=kind,
                label=label,
                score=float(score) * (0.78 if inferred else 1),
                box=normalized_box,
                x=max(0.05, min(0.95, x)),
                y=max(0.05, min(0.95, y)),
                inferred=inferred,
            )
        )

    detections = nms(detections)
    detections.sort(key=lambda det: det.rank, reverse=True)
    if detections:
        best = detections[0]
        return {
            "x": round(best.x, 4),
            "y": round(best.y, 4),
            "confidence": round(best.score, 4),
            "kind": best.kind,
            "label": best.label,
            "box": best.box,
            "width": image.width,
            "height": image.height,
            "detections": [detection_to_json(det) for det in detections[:8]],
        }

    return {
        "x": 0.5,
        "y": 0.5,
        "confidence": 0,
        "label": "center-fallback",
        "box": [0, 0, image.width, image.height],
        "width": image.width,
        "height": image.height,
        "detections": [],
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--public-dir", type=Path, default=Path("public"))
    parser.add_argument("--output", type=Path, default=Path("client/lib/image-focus.json"))
    parser.add_argument("--include-raw", action="store_true")
    args = parser.parse_args()

    public_dir = args.public_dir.resolve()
    output = args.output.resolve()
    images = list(iter_images(public_dir, args.include_raw))

    print(f"model={MODEL_ID}")
    print(f"images={len(images)} output={output}")
    processor = OwlViTProcessor.from_pretrained(MODEL_ID)
    model = OwlViTForObjectDetection.from_pretrained(MODEL_ID)
    model.eval()

    data: dict[str, object] = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "model": MODEL_ID,
        "prompts": PROMPTS,
        "images": {},
    }
    entries: dict[str, object] = data["images"]  # type: ignore[assignment]

    for idx, image_path in enumerate(images, 1):
        key = image_path.relative_to(public_dir).as_posix()
        try:
            if image_path.name in NON_PHOTO_NAMES:
                entry = {
                    "x": 0.5,
                    "y": 0.5,
                    "confidence": 0,
                    "kind": "none",
                    "label": "non-photo-center",
                    "box": [0, 0, 0, 0],
                    "width": 0,
                    "height": 0,
                    "detections": [],
                }
            else:
                entry = manual_focus_entry(image_path, key) or detect_focus(
                    processor,
                    model,
                    image_path,
                )
            entries[key] = entry
            print(f"[{idx:02d}/{len(images):02d}] {key} -> {entry['label']} {entry['x']},{entry['y']} {entry['confidence']}")
        except Exception as exc:
            entries[key] = {
                "x": 0.5,
                "y": 0.5,
                "confidence": 0,
                "kind": "none",
                "label": "error-fallback",
                "error": str(exc),
                "width": 0,
                "height": 0,
                "detections": [],
            }
            print(f"[{idx:02d}/{len(images):02d}] {key} -> ERROR {exc}")

    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")


if __name__ == "__main__":
    main()
