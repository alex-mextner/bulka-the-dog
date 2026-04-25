import * as React from "react";
import { ChevronDown, ShieldCheck } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";

/** Stable ordering of FAQ items. Each key maps to faq.<key>.q / faq.<key>.a
 *  in translations.ts. Order here is the rendered order. */
const ITEM_KEYS = [
  "kids",
  "rental",
  "monthly_cost",
  "guarantee",
  "other_pets",
  "health",
  "remote",
  "deadline",
] as const;

/**
 * Self-contained FAQ section.
 *
 * Single-open accordion: opening one item closes the others. State is one
 * `useState` holding the currently open key (or null). The chevron flip is
 * keyed off `aria-expanded` so screen readers and CSS stay aligned.
 */
export default function FAQ() {
  const { t } = useLanguage();
  const [openKey, setOpenKey] = React.useState<string | null>(null);
  return (
    <div aria-labelledby="faq-title" className="px-0 py-0">
      <h2
        id="faq-title"
        className="text-3xl md:text-4xl font-bold mb-3 text-foreground"
      >
        {t("faq.title")}
      </h2>
      <p className="text-foreground/70 mb-6 max-w-2xl">
        {t("faq.subtitle")}
      </p>

      {/* Return guarantee banner — louder than the cards below it. */}
      <div
        role="note"
        className="mb-8 rounded-2xl border-2 border-primary/40 bg-primary/15 p-5 md:p-6 shadow-sm flex items-start gap-4 max-w-3xl"
      >
        <ShieldCheck
          size={32}
          aria-hidden="true"
          className="text-primary shrink-0 mt-0.5"
        />
        <div className="space-y-1">
          <p className="font-semibold text-base md:text-lg leading-snug">
            {t("faq.banner_title")}
          </p>
          <p className="text-foreground/80 text-sm md:text-base leading-snug">
            {t("faq.banner_subtitle")}
          </p>
        </div>
      </div>

      {/* Accordion list — single-open. */}
      <ul className="space-y-3 max-w-3xl">
        {ITEM_KEYS.map((key) => {
          const isOpen = openKey === key;
          return (
            <li key={key}>
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={`faq-${key}`}
                onClick={() => setOpenKey(isOpen ? null : key)}
                className={
                  "group w-full text-left rounded-xl border transition-colors px-4 py-3 md:px-5 md:py-4 flex items-center justify-between gap-4 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/30 " +
                  (isOpen
                    ? "bg-primary/5 border-primary/40"
                    : "bg-background/60 border-border/60 hover:bg-primary/5")
                }
              >
                <span className="font-semibold text-base md:text-lg">
                  {t(`faq.${key}.q`)}
                </span>
                <ChevronDown
                  size={20}
                  aria-hidden="true"
                  className={
                    "shrink-0 text-foreground/60 transition-transform duration-200 " +
                    (isOpen ? "rotate-180" : "")
                  }
                />
              </button>
              {isOpen && (
                <div
                  id={`faq-${key}`}
                  role="region"
                  className="px-4 pt-3 pb-1 md:px-5 md:pt-4 text-foreground/85 leading-relaxed"
                >
                  {t(`faq.${key}.a`)}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
