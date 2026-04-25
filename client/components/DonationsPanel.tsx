import { useEffect, useMemo, useState } from "react";
import { Heart, PawPrint } from "lucide-react";

// TODO(i18n): RS/EN parity. Сейчас панель только на русском —
// когда дойдут руки до переводов, перенести строки в translations.ts
// под ключ donations.* и обернуть useLanguage().

// Env gating. Vite exposes only VITE_*-prefixed vars to the client.
// Read once at module scope so the component is fully tree-shakable
// when the flag is off (component returns null, no DOM, no listeners).
const RAW_FLAG = import.meta.env.VITE_ENABLE_DONATIONS as string | undefined;
const ENABLED = RAW_FLAG === "1" || RAW_FLAG === "true";

const DONATION_URL =
  (import.meta.env.VITE_DONATION_URL as string | undefined) || "";

// Goal: 12 vet visits × ~5000 RSD (meds inclusive). Conservative.
const GOAL_RSD = 60_000;

// TODO(donations-wire): hook current_raised to a real source
// (Notion ledger / Netlify function / Google Sheet). Hardcoded 0 as a
// placeholder so the component stays purely presentational for now.
const CURRENT_RAISED_RSD = 0;

const PRESETS = [500, 1000, 2500, 5000] as const;

type Milestone = {
  amount: number;
  name: string;
  unlock: string;
};

// Sass over pity. Each milestone is what the money actually buys, in
// Bulka's voice — concrete, dry, slightly self-deprecating.
const MILESTONES: Milestone[] = [
  {
    amount: 5_000,
    name: "Один укол червя",
    unlock: "Окей, один раз ткнут иголкой — переживу.",
  },
  {
    amount: 15_000,
    name: "Две недели лекарств",
    unlock: "Лена больше не считает таблетки в столбик.",
  },
  {
    amount: 30_000,
    name: "Полкурса",
    unlock: "Червь начинает нервничать. Я — нет.",
  },
  {
    amount: 60_000,
    name: "Весь курс до конца",
    unlock: "Чисто. Можно и кота потерпеть.",
  },
];

function formatRSD(n: number): string {
  // Russian uses non-breaking spaces as thousand separators.
  return new Intl.NumberFormat("ru-RU").format(Math.max(0, Math.round(n)));
}

function clampAmount(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 10_000_000) return 10_000_000;
  return Math.round(n);
}

export default function DonationsPanel() {
  if (!ENABLED) return null;

  const [selectedPreset, setSelectedPreset] = useState<number | null>(1000);
  const [customAmount, setCustomAmount] = useState<string>("");
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduceMotion(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduceMotion(e.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  const chosenAmount = useMemo(() => {
    const custom = parseInt(customAmount, 10);
    if (Number.isFinite(custom) && custom > 0) return clampAmount(custom);
    if (selectedPreset != null) return selectedPreset;
    return 0;
  }, [customAmount, selectedPreset]);

  const raised = clampAmount(CURRENT_RAISED_RSD);
  const progressPct = Math.min(100, Math.round((raised / GOAL_RSD) * 100));

  // Highest milestone already cleared, plus the next one to chase.
  const reachedMilestone = useMemo(
    () => [...MILESTONES].reverse().find((m) => raised >= m.amount) ?? null,
    [raised],
  );
  const nextMilestone = useMemo(
    () => MILESTONES.find((m) => raised < m.amount) ?? null,
    [raised],
  );

  const handleDonate = () => {
    if (!DONATION_URL) {
      // eslint-disable-next-line no-console
      console.warn(
        "[DonationsPanel] VITE_DONATION_URL is not set. " +
          "Set it to a real donation page URL before going live.",
      );
      return;
    }
    const url = new URL(DONATION_URL, window.location.origin);
    if (chosenAmount > 0) {
      url.searchParams.set("amount", String(chosenAmount));
      url.searchParams.set("currency", "RSD");
    }
    window.open(url.toString(), "_blank", "noopener,noreferrer");
  };

  const donateDisabled = chosenAmount <= 0;
  const transitionClass = reduceMotion ? "" : "transition-all duration-500";

  return (
    <aside
      aria-labelledby="donations-title"
      className="bg-gradient-to-br from-primary/10 to-accent/10 p-6 md:p-8 rounded-2xl border border-primary/30 shadow-md"
    >
      <header className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h3
            id="donations-title"
            className="text-2xl md:text-3xl font-bold flex items-center gap-2"
          >
            <PawPrint
              size={26}
              aria-hidden="true"
              className="text-primary shrink-0"
            />
            Покормить Булку
          </h3>
          <p className="text-foreground/70 mt-1 text-sm md:text-base">
            Лена кормит меня и так. Это — на врача и таблетки от червя.
            Без надрыва, по силам.
          </p>
        </div>
      </header>

      {/* Progress to goal */}
      <div className="mb-5">
        <div className="flex justify-between items-baseline mb-2 text-sm">
          <span className="font-semibold text-foreground/80">
            {formatRSD(raised)} / {formatRSD(GOAL_RSD)} RSD
          </span>
          <span className="text-foreground/60">
            {progressPct}%{" "}
            {progressPct === 0 ? "— старт" : progressPct >= 100 ? "— готово" : ""}
          </span>
        </div>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={GOAL_RSD}
          aria-valuenow={raised}
          aria-valuetext={`Собрано ${formatRSD(raised)} из ${formatRSD(GOAL_RSD)} динаров, ${progressPct} процентов`}
          className="relative h-3 w-full bg-primary/10 rounded-full overflow-hidden border border-primary/20"
        >
          <div
            className={`h-full bg-gradient-to-r from-primary to-accent rounded-full ${transitionClass}`}
            style={{ width: `${progressPct}%` }}
            aria-hidden="true"
          />
        </div>

        {/* Status line — last reached + next target */}
        <p className="text-sm text-foreground/70 mt-2">
          {reachedMilestone ? (
            <>
              <span className="font-medium text-foreground/90">
                {reachedMilestone.unlock}
              </span>{" "}
            </>
          ) : null}
          {nextMilestone ? (
            <>
              До «{nextMilestone.name}» —{" "}
              <span className="font-semibold">
                {formatRSD(nextMilestone.amount - raised)} RSD
              </span>
              .
            </>
          ) : (
            <>Цель закрыта. Спасибо, дальше я уже сама.</>
          )}
        </p>
      </div>

      {/* Milestones list */}
      <ol className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-6" aria-label="Уровни">
        {MILESTONES.map((m) => {
          const reached = raised >= m.amount;
          return (
            <li
              key={m.amount}
              className={`p-3 rounded-xl border text-xs md:text-sm ${
                reached
                  ? "bg-primary/15 border-primary/40 text-foreground"
                  : "bg-background/40 border-border/40 text-foreground/60"
              }`}
            >
              <div className="font-semibold flex items-center gap-1">
                <span aria-hidden="true">{reached ? "✓" : "·"}</span>
                {m.name}
              </div>
              <div className="text-foreground/60 mt-1">
                {formatRSD(m.amount)} RSD
              </div>
            </li>
          );
        })}
      </ol>

      {/* Amount picker */}
      <fieldset className="mb-4">
        <legend className="text-sm font-semibold text-foreground/80 mb-2">
          Сколько отсыпать
        </legend>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((amt) => {
            const active = selectedPreset === amt && customAmount === "";
            return (
              <button
                key={amt}
                type="button"
                onClick={() => {
                  setSelectedPreset(amt);
                  setCustomAmount("");
                }}
                aria-pressed={active}
                className={`px-4 py-2 rounded-full text-sm font-semibold border transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/30 ${
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background/60 border-primary/30 text-foreground/80 hover:bg-primary/10"
                }`}
              >
                {formatRSD(amt)} RSD
              </button>
            );
          })}
        </div>

        <div className="mt-3">
          <label
            htmlFor="donations-custom-amount"
            className="block text-sm text-foreground/70 mb-1"
          >
            Или своя сумма (RSD)
          </label>
          <input
            id="donations-custom-amount"
            type="number"
            min={100}
            step={100}
            inputMode="numeric"
            placeholder="например, 750"
            value={customAmount}
            onChange={(e) => {
              setCustomAmount(e.target.value);
              if (e.target.value !== "") setSelectedPreset(null);
            }}
            className="w-full md:w-56 px-4 py-2 rounded-full bg-background/80 border border-primary/30 text-foreground placeholder:text-foreground/40 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/30"
          />
        </div>
      </fieldset>

      {/* Donate CTA */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <button
          type="button"
          onClick={handleDonate}
          disabled={donateDisabled}
          className="inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-primary/40 disabled:cursor-not-allowed px-6 py-3 rounded-full text-base font-semibold shadow-md shadow-primary/30 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/30"
        >
          <Heart size={18} aria-hidden="true" />
          Отправить{" "}
          {chosenAmount > 0 ? `${formatRSD(chosenAmount)} RSD` : ""}
        </button>
        <p className="text-xs text-foreground/60">
          Открывается в новой вкладке. Любая сумма помогает — даже на пакет
          риса.
        </p>
      </div>
    </aside>
  );
}
