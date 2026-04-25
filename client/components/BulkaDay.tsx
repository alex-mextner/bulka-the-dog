import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// TODO: i18n. All copy is Russian-only on purpose. If/when this gets wired
// into translations.ts, lift the strings out into the same key tree.

// ---------- Types --------------------------------------------------------

type SceneId =
  | "morning"
  | "jump"
  | "run"
  | "bark"
  | "park"
  | "cat"
  | "snack"
  | "couch"
  | "ending_good"
  | "ending_silly"
  | "ending_dramatic";

type Choice = { label: string; nextId: SceneId };

type Scene = {
  id: SceneId;
  /** Render function for the pixel art. Accepts no args; the caller wraps it. */
  art: () => JSX.Element;
  narration: string;
  choices?: Choice[];
  /** If set, this scene is an ending. Tone modifies the badge color. */
  ending?: "good" | "silly" | "dramatic";
};

// ---------- Pixel-art palette -------------------------------------------
// Low-color palette tuned to the site (warm browns / cream / peach accent).
// Kept here so every scene draws from the same set.
const C = {
  bg: "#fdf6ec", // cream
  fur: "#a86a3d", // warm brown (primary-ish)
  furDark: "#6f4322", // shadow brown
  belly: "#f1c79a", // belly cream
  nose: "#3a2418", // dark nose / eye
  tongue: "#e8627c", // pink tongue
  accent: "#ee7a3d", // peach accent (matches --accent)
  grass: "#8bbf5c",
  grassDark: "#5d8a3a",
  sky: "#cfe7f5",
  sun: "#f5c248",
  human: "#f0c39a", // skin
  shirt: "#5b8def", // generic shirt blue (one cool note in palette)
  cat: "#3a2a22",
  food: "#c46a2a",
  white: "#ffffff",
} as const;

// ---------- Pixel renderer ----------------------------------------------
// Draws a 16x16 SVG. Each row is a string of single-character keys mapping
// to the palette above; "." is transparent. Editable like ASCII art.
type PaletteKey = keyof typeof C;
type RowMap = Record<string, PaletteKey>;

function PixelGrid({
  rows,
  map,
  className,
}: {
  rows: string[];
  map: RowMap;
  className?: string;
}) {
  const size = rows.length; // assume square
  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width="100%"
      height="100%"
      shapeRendering="crispEdges"
      role="img"
      aria-hidden="true"
      className={cn("block", className)}
      style={{ imageRendering: "pixelated" }}
    >
      {rows.map((row, y) =>
        row.split("").map((ch, x) => {
          if (ch === "." || !map[ch]) return null;
          return (
            <rect
              key={`${x}-${y}`}
              x={x}
              y={y}
              width={1}
              height={1}
              fill={C[map[ch]]}
            />
          );
        }),
      )}
    </svg>
  );
}

// ---------- Scene art ---------------------------------------------------
// Each art piece is a 16x16 grid. Backgrounds are filled first via a single
// rect for cleanliness; then character pixels overlay.

function Backdrop({ fill }: { fill: string }) {
  return <rect x={0} y={0} width={16} height={16} fill={fill} />;
}

const dogMap: RowMap = {
  F: "fur",
  D: "furDark",
  B: "belly",
  N: "nose",
  T: "tongue",
  G: "grass",
  g: "grassDark",
  S: "sky",
  Y: "sun",
  H: "human",
  C: "shirt",
  K: "cat",
  O: "food",
  W: "white",
  A: "accent",
};

/** Bulka standing, tail up. Idle wag animation handled by parent class. */
function ArtMorning() {
  // Bulka in front of a sunny window-ish backdrop, person silhouette far right.
  const rows = [
    "SSSSSSSSSSSSSSSS",
    "SSSSSYYYYSSSSSSS",
    "SSSSYYYYYYSSSSSS",
    "SSSSYYYYYYSSSCSS",
    "SSSSSYYYYSSCCCSS",
    "SSSSSSSSSSCCHCSS",
    "SSSSSSSSSSCCCCSS",
    "SS...DDDD..CCCCS",
    "S..DDFFFFD.CCCCS",
    "S.DFFFNFFFD.CCSS",
    "S.DFFBBBFFD.CCSS",
    "S.DFBBWWBFD.....",
    "S.DDBBWWBDD.....",
    "S..DD....DD.....",
    "S..D.D..D.D.....",
    "GGGGGGGGGGGGGGGG",
  ];
  return (
    <>
      <Backdrop fill={C.bg} />
      <PixelGrid rows={rows} map={dogMap} />
    </>
  );
}

/** Bulka mid-jump, paws off ground. */
function ArtJump() {
  const rows = [
    "SSSSSSSSSSSSSSSS",
    "SSSSSSSSSSSSSSSS",
    "SS...DDDD.......",
    "S..DDFFFFD......",
    "S.DFFFNFFFD.....",
    "S.DFFBBBFFD.....",
    "S.DFBBWWBFD.....",
    "S.DDBBWWBDD.....",
    "S..DDFFFFDD.....",
    "S...DFFFFD......",
    "S....DDDD.......",
    "SSSSSSSSSSSSSSSS",
    "SSSSSSSSSSSSSSSS",
    "SSSSAAAAASSSSSSS",
    "SSAAAAAAAASSSSSS",
    "GGGGGGGGGGGGGGGG",
  ];
  return (
    <>
      <Backdrop fill={C.bg} />
      <PixelGrid rows={rows} map={dogMap} />
    </>
  );
}

/** Bulka running, sprinkles of dust behind. */
function ArtRun() {
  const rows = [
    "SSSSSSSSSSSSSSSS",
    "SSSSSSSSSSSSSSSS",
    "SSSSSSSSSSSSSSSS",
    "SSSSSSSSSSSSSSSS",
    "....DDDDD.......",
    "...DFFFFFD......",
    "..DFFNFFFFD.....",
    "..DFFBBBFFD.....",
    "..DFBBWWBFD.....",
    "..DDBBWWBDD.....",
    "...DD...DDD.....",
    "...D.D.D.D......",
    "..D...D..D......",
    "................",
    "...A...A...A....",
    "GGGGGGGGGGGGGGGG",
  ];
  return (
    <>
      <Backdrop fill={C.bg} />
      <PixelGrid rows={rows} map={dogMap} />
    </>
  );
}

/** Bulka barking, mouth open with tongue. */
function ArtBark() {
  const rows = [
    "SSSSSSSSSSSSSSSS",
    "SSSAAASSSAAASSSS",
    "SSAAAAASAAAAASSS",
    "SSSAAASSSAAASSSS",
    "SS...DDDD.......",
    "S..DDFFFFD......",
    "S.DFFNFFFD......",
    "S.DFFBBBFD......",
    "S.DFBTTTBFD.....",
    "S.DDBTWTBDD.....",
    "S..DDFFFFDD.....",
    "S...DFFFFD......",
    "S...D.DD.D......",
    "S..D...D..D.....",
    "................",
    "GGGGGGGGGGGGGGGG",
  ];
  return (
    <>
      <Backdrop fill={C.bg} />
      <PixelGrid rows={rows} map={dogMap} />
    </>
  );
}

/** Park scene: trees + Bulka small in middle. */
function ArtPark() {
  const rows = [
    "SSSSSSSSSSSSSSSS",
    "SSgggSSSSSSSgggS",
    "SgggggSSSSgggggS",
    "SgGGGgSSSSgGGGgS",
    "SSGGGSSSSSSGGGSS",
    "SSSGSSSSSSSSGSSS",
    "SSSGSSSSSSSSGSSS",
    "SSSGSSSSSSSSGSSS",
    "SSSSSSSSSSSSSSSS",
    "SSSSSSDDDDSSSSSS",
    "SSSSSDFFFFDSSSSS",
    "SSSSDFFNFFDSSSSS",
    "SSSSDFBBBFDSSSSS",
    "SSSSDDFFDDD.....",
    "SSSSD.DD.D......",
    "GGGGGGGGGGGGGGGG",
  ];
  return (
    <>
      <Backdrop fill={C.bg} />
      <PixelGrid rows={rows} map={dogMap} />
    </>
  );
}

/** Cat scene: black cat on the right, Bulka on the left, both wary. */
function ArtCat() {
  const rows = [
    "SSSSSSSSSSSSSSSS",
    "SSSSSSSSSSSSSSSS",
    "SSSSSSSSSSSSKKKS",
    "SSSSSSSSSSKKKKKK",
    "SSSSSSSSSSKKWKWK",
    "SS.DDDDD..KKKKKK",
    "SDDFFFFFD.SKKKSS",
    "SDFFNFFFD.SKKKSS",
    "SDFFBBBFD.SKKKSS",
    "SDDBBWWBDD.KKKSS",
    "S.DDFFFFDD.KKKSS",
    "S..DDDDD...KKKSS",
    "S..D.DD.D..KKKSS",
    "S.D...D...DKKKSS",
    "................",
    "GGGGGGGGGGGGGGGG",
  ];
  return (
    <>
      <Backdrop fill={C.bg} />
      <PixelGrid rows={rows} map={dogMap} />
    </>
  );
}

/** Snack scene: a bowl of food, Bulka eyeing it. */
function ArtSnack() {
  const rows = [
    "SSSSSSSSSSSSSSSS",
    "SSSSSSSSSSSSSSSS",
    "SSSSSSSSSSSSSSSS",
    "SS...DDDD.......",
    "S..DDFFFFD......",
    "S.DFFNFFFD......",
    "S.DFFBBBFD......",
    "S.DFBTTTBFD.....",
    "S.DDBBWWBDD.....",
    "S..DDFFFFDD.....",
    "S...DDDDDD......",
    "S...D.DD.D......",
    "................",
    "........OOOO....",
    ".......OOOOOO...",
    "GGGGGGGGGGGGGGGG",
  ];
  return (
    <>
      <Backdrop fill={C.bg} />
      <PixelGrid rows={rows} map={dogMap} />
    </>
  );
}

/** Couch scene: Bulka curled up. */
function ArtCouch() {
  const rows = [
    "SSSSSSSSSSSSSSSS",
    "SSSSSSSSSSSSSSSS",
    "SSSSSSSSSSSSSSSS",
    "SSSSSSSSSSSSSSSS",
    "..AAAAAAAAAAAA..",
    ".AAAAAAAAAAAAAA.",
    "AAA.DDDDDDDD.AAA",
    "AA.DFFFFFFFFD.AA",
    "AA.DFFNFFNFFD.AA",
    "AA.DFFBBBBFFD.AA",
    "AA.DDFFFFFFDDA.A",
    "AAAA.DDDDDD.AAAA",
    "AAAAAAAAAAAAAAAA",
    "AAAAAAAAAAAAAAAA",
    "................",
    "GGGGGGGGGGGGGGGG",
  ];
  return (
    <>
      <Backdrop fill={C.bg} />
      <PixelGrid rows={rows} map={dogMap} />
    </>
  );
}

/** Good ending: Bulka and human, a heart in the air. */
function ArtEndingGood() {
  const rows = [
    "SSSSSSSSSSSSSSSS",
    "SSSAASSAASSSSSSS",
    "SSAAAAAAAASSSSSS",
    "SSAAAAAAAASSSSSS",
    "SSSAAAAAASSSSSSS",
    "SSSSAAAASSSSSSSS",
    "SSSSSAASSSSSSSSS",
    "SSSSSSSSSSSCCCSS",
    "SS..DDDD..CCHCSS",
    "S.DDFFFFD.CCCCSS",
    "S.DFFNFFD.CCCCSS",
    "S.DFFBBFD.CCCCSS",
    "S.DDBWWBDD.CCSSS",
    "S..DDDDDD..CCSSS",
    "S..D.DD.D..C.CSS",
    "GGGGGGGGGGGGGGGG",
  ];
  return (
    <>
      <Backdrop fill={C.bg} />
      <PixelGrid rows={rows} map={dogMap} />
    </>
  );
}

/** Silly ending: Bulka with food everywhere. */
function ArtEndingSilly() {
  const rows = [
    "SSSSSSSSSSSSSSSS",
    "SSSSOSOSSSSOSOSS",
    "SSOSSSSSOSSSSSOS",
    "SS...DDDD.......",
    "S..DDFFFFD......",
    "S.DFFNFFFD......",
    "S.DFOBBBOFD.....",
    "S.DFBOWOBFD.....",
    "S.DDBBWWBDD.....",
    "S..DDFFFFDD.....",
    "S...DDDDDD......",
    "S...D.DD.D......",
    "................",
    "..OOOO...OOOO...",
    ".OOOOOO.OOOOOO..",
    "GGGGGGGGGGGGGGGG",
  ];
  return (
    <>
      <Backdrop fill={C.bg} />
      <PixelGrid rows={rows} map={dogMap} />
    </>
  );
}

/** Dramatic ending: Bulka heroic silhouette, sun behind. */
function ArtEndingDramatic() {
  const rows = [
    "SSSSSSSSSSSSSSSS",
    "SSSSYYYYYYYSSSSS",
    "SSYYYYYYYYYYYYSS",
    "SYYYYYYYYYYYYYYS",
    "SSYYYYYYYYYYYYSS",
    "SSSYYYYYYYYYYSSS",
    "SSSSSDDDDDDDDSSS",
    "SSSSDDFFFFFFD...",
    "SSSDFFFNFFFFD...",
    "SSDFFFBBBBFFD...",
    "SDDFBBWWWWBFDD..",
    "SDDDFFFFFFFFDD..",
    "SSDDDDDDDDDDDD..",
    "SS.D.DD.DD.D....",
    "S.D...DD...D....",
    "GGGGGGGGGGGGGGGG",
  ];
  return (
    <>
      <Backdrop fill={C.bg} />
      <PixelGrid rows={rows} map={dogMap} />
    </>
  );
}

// ---------- Scene graph -------------------------------------------------

const START_ID: SceneId = "morning";

const scenes: Record<SceneId, Scene> = {
  morning: {
    id: "morning",
    art: ArtMorning,
    narration:
      "Утро. Человек шевелится. Это, вообще-то, мой человек, и план на день начинается прямо сейчас.",
    choices: [
      { label: "Прыгать", nextId: "jump" },
      { label: "Бегать", nextId: "run" },
      { label: "Лаять", nextId: "bark" },
    ],
  },
  jump: {
    id: "jump",
    art: ArtJump,
    narration:
      "Подскакиваю на кровать, как будто я лёгкая. Человек выдыхает все 22 кило сразу. Что дальше?",
    choices: [
      { label: "В парк", nextId: "park" },
      { label: "На диван", nextId: "couch" },
    ],
  },
  run: {
    id: "run",
    art: ArtRun,
    narration:
      "Делаю круг по квартире на максималках. Коврик уехал, тапок улетел. Куда теперь?",
    choices: [
      { label: "В парк", nextId: "park" },
      { label: "К миске", nextId: "snack" },
    ],
  },
  bark: {
    id: "bark",
    art: ArtBark,
    narration:
      "Один короткий рык — это, конечно, не лай, это напоминание. Сосед сверху, видимо, не понял.",
    choices: [
      { label: "Идти на кота", nextId: "cat" },
      { label: "К миске", nextId: "snack" },
    ],
  },
  park: {
    id: "park",
    art: ArtPark,
    narration:
      "Banovo brdo. Трава, белки, пара кобелей — настырные, конечно, но мне больше нравится мячик.",
    choices: [
      { label: "Гнаться за белкой", nextId: "ending_dramatic" },
      { label: "Вернуться домой", nextId: "ending_good" },
    ],
  },
  cat: {
    id: "cat",
    art: ArtCat,
    narration:
      "Кот. Сидит, смотрит. Я смотрю. Мы оба знаем, что я с котами вообще-то лажу. Но не сегодня.",
    choices: [
      { label: "Уйти достойно", nextId: "ending_good" },
      { label: "Гавкнуть в воздух", nextId: "ending_silly" },
    ],
  },
  snack: {
    id: "snack",
    art: ArtSnack,
    narration:
      "Миска. В ней что-то. Доктор говорит, мне это полезно. Я говорю — вкусно. Сходимся.",
    choices: [
      { label: "Съесть всё разом", nextId: "ending_silly" },
      { label: "Лечь рядом охранять", nextId: "couch" },
    ],
  },
  couch: {
    id: "couch",
    art: ArtCouch,
    narration:
      "Диван принимает. Не понимаю собак, которые боятся быть дома одни — наоборот же, тишина.",
    choices: [
      { label: "Спать", nextId: "ending_good" },
      { label: "Один глаз открыт", nextId: "ending_dramatic" },
    ],
  },

  // ---- Endings ----
  ending_good: {
    id: "ending_good",
    art: ArtEndingGood,
    narration:
      "День закрыт. Человек рядом, я рядом, всем хорошо. Прикиньте, всё работает как надо.",
    ending: "good",
  },
  ending_silly: {
    id: "ending_silly",
    art: ArtEndingSilly,
    narration:
      "Корм по всей кухне. Я не виновата, миска сама прыгнула. Это, конечно, считается дискриминацией.",
    ending: "silly",
  },
  ending_dramatic: {
    id: "ending_dramatic",
    art: ArtEndingDramatic,
    narration:
      "Закат. Я на холме (ну, на бордюре). Белка ушла, но мы оба знаем, кто хозяин этого квартала.",
    ending: "dramatic",
  },
};

// ---------- Component ---------------------------------------------------

const endingBadge: Record<NonNullable<Scene["ending"]>, string> = {
  good: "bg-primary text-primary-foreground",
  silly: "bg-accent text-accent-foreground",
  dramatic: "bg-foreground text-background",
};

const endingLabel: Record<NonNullable<Scene["ending"]>, string> = {
  good: "Хорошая концовка",
  silly: "Дурацкая концовка",
  dramatic: "Драматичная концовка",
};

export default function BulkaDay() {
  const [currentId, setCurrentId] = useState<SceneId>(START_ID);
  const liveRef = useRef<HTMLParagraphElement | null>(null);
  const scene = scenes[currentId];
  const isEnding = !!scene.ending;

  const reset = useCallback(() => setCurrentId(START_ID), []);

  // Re-focus the narration on every scene change so screen readers and
  // keyboard users land in the right place.
  useEffect(() => {
    liveRef.current?.focus();
  }, [currentId]);

  return (
    <section
      aria-labelledby="bulka-day-title"
      className="mx-auto w-full max-w-md rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6"
    >
      <header className="mb-4 flex items-center justify-between gap-3">
        <h3
          id="bulka-day-title"
          className="text-xl font-bold text-primary sm:text-2xl"
        >
          День Булки
        </h3>
        {isEnding && (
          <span
            className={cn(
              "rounded-full px-3 py-1 text-xs font-semibold",
              endingBadge[scene.ending!],
            )}
          >
            {endingLabel[scene.ending!]}
          </span>
        )}
      </header>

      {/* Pixel art frame */}
      <div
        className={cn(
          "mx-auto aspect-square w-48 overflow-hidden rounded-xl border-2 border-primary/40 bg-secondary/40",
          "sm:w-56",
          // Idle bounce; calmer on endings.
          isEnding ? "animate-bulka-idle-slow" : "animate-bulka-idle",
        )}
        style={{ imageRendering: "pixelated" }}
      >
        <scene.art />
      </div>

      <p
        ref={liveRef}
        tabIndex={-1}
        aria-live="polite"
        aria-atomic="true"
        className="mt-4 min-h-[4.5rem] text-base leading-relaxed text-foreground outline-none"
      >
        {scene.narration}
      </p>

      <div className="mt-4 flex flex-col gap-2">
        {scene.choices?.map((c) => (
          <button
            key={c.label}
            type="button"
            onClick={() => setCurrentId(c.nextId)}
            className={cn(
              "min-h-[44px] rounded-xl border border-primary/40 bg-primary px-4 py-3 text-base font-semibold text-primary-foreground transition-colors",
              "hover:bg-primary/90 active:bg-primary/80",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            )}
          >
            {c.label}
          </button>
        ))}

        {isEnding && (
          <button
            type="button"
            onClick={reset}
            className={cn(
              "min-h-[44px] rounded-xl border border-primary/40 bg-secondary px-4 py-3 text-base font-semibold text-secondary-foreground transition-colors",
              "hover:bg-secondary/80",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            )}
            autoFocus
          >
            Сыграть ещё раз
          </button>
        )}
      </div>

      {/* Local CSS — keeps the component self-contained. */}
      <style>{`
        @keyframes bulkaIdle {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-2px); }
        }
        .animate-bulka-idle      { animation: bulkaIdle 1.4s ease-in-out infinite; }
        .animate-bulka-idle-slow { animation: bulkaIdle 2.6s ease-in-out infinite; }

        @media (prefers-reduced-motion: reduce) {
          .animate-bulka-idle, .animate-bulka-idle-slow { animation: none; }
        }
      `}</style>

      {/* ----------------------------------------------------------------
          Add new scenes:
          1) Add the id to SceneId union.
          2) Add an art function (16x16 grid, palette via dogMap).
          3) Add an entry in `scenes` with narration + choices.
          4) Reference it from existing scenes' choices.
          --------------------------------------------------------------- */}
    </section>
  );
}
