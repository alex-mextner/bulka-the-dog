import * as React from "react";
import { cn } from "@/lib/utils";
import { Header } from "@/components/Header";
import { GalleryImage, useGallery, usePinchToOpen } from "@/components/Gallery";
import BulkaDay from "@/components/BulkaDay";
import DonationsPanel from "@/components/DonationsPanel";
import FAQ from "@/components/FAQ";
import PhotoStrip from "@/components/PhotoStrip";
import { useLanguage } from "@/hooks/useLanguage";
import {
  Heart,
  Home,
  Users,
  MapPin,
  Send,
  MessageCircle,
  Phone,
  Instagram,
  Crosshair,
  Bone,
  Worm,
  Ban,
  ChevronDown,
} from "lucide-react";

// Tiny markdown helper: turns `**bold**` segments inside a translation
// string into <strong>. Keeps the rest of the text as plain nodes so
// surrounding utility classes still apply unmodified.
function richText(input: string): React.ReactNode[] {
  const parts = input.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-foreground">
          {p.slice(2, -2)}
        </strong>
      );
    }
    return <React.Fragment key={i}>{p}</React.Fragment>;
  });
}

const SHOW_GAME =
  import.meta.env.VITE_ENABLE_GAME === "1" ||
  import.meta.env.VITE_ENABLE_GAME === "true";

// Search by the actual destination — Super Vero Zira at Vukov Spomenik —
// rather than just the metro stop, so the pin lands on the meeting place.
const MAPS_URL =
  "https://www.google.com/maps/search/?api=1&query=Super+Vero+Zira+Vukov+Spomenik+Belgrade";

// Vite injects BASE_URL ('/' in dev, '/bulka-the-dog/' on GH Pages).
// Public-folder assets must be prefixed with it so they resolve under both.
const asset = (p: string) =>
  `${import.meta.env.BASE_URL}${p.replace(/^\//, "")}`;

const images = {
  health1: asset("images/health1.webp"),
  health2: asset("images/health2.webp"),
  cardiology: asset("images/cardiology.webp"),
  dogs_public: asset("images/dogs_public.webp"),
  lena_dogs: asset("images/lena_dogs.webp"),
  dog_car: asset("images/dog_car.webp"),
  dog_home: asset("images/dog_home.webp"),
  dog_vet: asset("images/dog_vet.webp"),
  dog_apartment: asset("images/dog_apartment.webp"),
  dog_vet2: asset("images/dog_vet2.webp"),
  person_dog: asset("images/person_dog.webp"),
  // New photos imported via scripts/import-new-photos.py.
  bulka_face: asset("images/bulka_face.webp"),
  bulka_friends: asset("images/bulka_friends.webp"),
  bulka_tv: asset("images/bulka_tv.webp"),
  // Photo session 2026-04-27 — full-res for lightbox, thumbs for strip display.
  ps_walk: asset("images/photo-set/ps_walk.webp"),
  ps_walk_thumb: asset("images/photo-set/thumbs/ps_walk.webp"),
  ps_portrait: asset("images/photo-set/ps_portrait.webp"),
  ps_portrait_thumb: asset("images/photo-set/thumbs/ps_portrait.webp"),
  ps_rug: asset("images/photo-set/ps_rug.webp"),
  ps_rug_thumb: asset("images/photo-set/thumbs/ps_rug.webp"),
  ps_ball: asset("images/photo-set/ps_ball.webp"),
  ps_ball_thumb: asset("images/photo-set/thumbs/ps_ball.webp"),
  ps_paw: asset("images/photo-set/ps_paw.webp"),
  ps_paw_thumb: asset("images/photo-set/thumbs/ps_paw.webp"),
  ps_balcony_sun: asset("images/photo-set/ps_balcony_sun.webp"),
  ps_balcony_sun_thumb: asset("images/photo-set/thumbs/ps_balcony_sun.webp"),
  ps_lick: asset("images/photo-set/ps_lick.webp"),
  ps_lick_thumb: asset("images/photo-set/thumbs/ps_lick.webp"),
  ps_scratch: asset("images/photo-set/ps_scratch.webp"),
  ps_scratch_thumb: asset("images/photo-set/thumbs/ps_scratch.webp"),
  ps_belly: asset("images/photo-set/ps_belly.webp"),
  ps_belly_thumb: asset("images/photo-set/thumbs/ps_belly.webp"),
  ps_hug: asset("images/photo-set/ps_hug.webp"),
  ps_hug_thumb: asset("images/photo-set/thumbs/ps_hug.webp"),
  ps_family: asset("images/photo-set/ps_family.webp"),
  ps_family_thumb: asset("images/photo-set/thumbs/ps_family.webp"),
  ps_cat_balcony: asset("images/photo-set/ps_cat_balcony.webp"),
  ps_cat_balcony_thumb: asset("images/photo-set/thumbs/ps_cat_balcony.webp"),
};

// Photos for the Habits scrollytelling section — one per habit item, in order.
const HABITS_PHOTOS = [
  images.ps_portrait,    // bathroom
  images.ps_walk,        // walks
  images.dogs_public,    // behavior
  images.lena_dogs,      // car — Lena + Bulka selfie in back seat
  images.bulka_tv,       // home
  images.ps_rug,         // food
  images.ps_cat_balcony, // cats
];

// Crossfading photo container: all photos are in the DOM with opacity 0/1.
// CSS transition handles the fade — no JS animation needed.
// On click OR pinch-to-open, opens the active photo in the gallery lightbox
// by looking up the src in the shared GalleryContext entries registry
// (PhotoStrip registers all HABITS_PHOTOS below, so they're present by the
// time any click fires).
//
// Pinch-to-open is enabled via `usePinchToOpen` — the same hook used by
// GalleryImage. The active img carries `data-pinch-thumb` so
// GalleryProvider.open() grabs the right thumbnail src for the hold-overlay.
function PhotoFader({ activeIdx, className }: { activeIdx: number; className?: string }) {
  const { entries, open, setTrigger } = useGallery();
  const activeSrc = HABITS_PHOTOS[activeIdx];
  const buttonRef = React.useRef<HTMLButtonElement | null>(null);

  const handleClick = React.useCallback(() => {
    const entry = entries.find((e) => e.src === activeSrc);
    if (entry) {
      setTrigger(buttonRef.current);
      open(entry.id);
    }
  }, [entries, open, activeSrc, setTrigger]);

  // Pinch-to-open: attach non-passive touchstart to detect 2-finger gesture
  // and drive the same overlay+seed-zoom path as GalleryImage. Meta is read
  // from a ref inside usePinchToOpen, so it updates with activeIdx without
  // re-attaching the listener (important: sticky photo changes every scroll).
  usePinchToOpen(buttonRef, { src: activeSrc, alt: "" }, handleClick);

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={handleClick}
      aria-label="Открыть фото"
      className={cn(
        "relative aspect-[4/3] rounded-2xl overflow-hidden shadow-lg bg-neutral-200",
        "appearance-none p-0 m-0 border-0 block w-full cursor-zoom-in",
        className,
      )}
    >
      {HABITS_PHOTOS.map((src, i) => (
        <img
          key={src}
          src={src}
          alt=""
          loading="lazy"
          // data-pinch-thumb marks the currently visible image so
          // GalleryProvider.open() picks the right src for the pinch-hold
          // overlay when opened from PhotoFader (which has 7 stacked imgs).
          {...(i === activeIdx ? { "data-pinch-thumb": "" } : {})}
          className="absolute inset-0 w-full h-full object-cover brightness-105 contrast-[1.03] saturate-[1.05] transition-opacity duration-500 ease-in-out"
          style={{ opacity: i === activeIdx ? 1 : 0 }}
        />
      ))}
    </button>
  );
}

function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: "smooth" });
}

// Common image classes — bounded by viewport on desktop so a tall portrait
// doesn't dominate. The text column drives the natural flow; the image is
// sized to feel companionable next to the text, not to dwarf it.
const SECTION_IMG_CLS =
  "rounded-2xl overflow-hidden shadow-lg w-full max-h-[80vh] md:max-h-[560px]";
const SECTION_IMG_INNER_CLS =
  "rounded-2xl object-cover w-full h-full max-h-[80vh] md:max-h-[560px] brightness-105 contrast-[1.03] saturate-[1.05]";

export default function Index() {
  const { t } = useLanguage();

  // Habits scrollytelling: track which habit item is most visible.
  const [habitsActiveIdx, setHabitsActiveIdx] = React.useState(0);
  const habitsSectionRef = React.useRef<HTMLElement | null>(null);
  const habitsRafPendingRef = React.useRef(false);

  React.useEffect(() => {
    const section = habitsSectionRef.current;
    if (!section) return;
    const handleScroll = () => {
      if (habitsRafPendingRef.current) return;
      habitsRafPendingRef.current = true;
      requestAnimationFrame(() => {
        habitsRafPendingRef.current = false;
        const items = section.querySelectorAll<HTMLElement>("[data-habit-item]");
        const vh = window.innerHeight;
        // On mobile, the sticky photo covers the top of the viewport — don't
        // count pixels hidden under it as "visible" to the user.
        const stickyEl = section.querySelector<HTMLElement>("[data-mobile-photo-stick]");
        const topClip = stickyEl ? Math.max(0, stickyEl.getBoundingClientRect().bottom) : 0;
        // Reading-line threshold: just below the sticky photo (or near the top
        // of the viewport on desktop where there is no sticky photo). The active
        // item is the last one whose top edge has scrolled above this line.
        // We intentionally include items that are partially hidden behind the
        // sticky photo — the photo IS the feedback that tells the user which
        // item they scrolled to.
        const readingLine = topClip + 24;
        let bestIdx = 0;
        items.forEach((item, i) => {
          const rect = item.getBoundingClientRect();
          // Item is active when its top has passed the reading line AND it
          // hasn't scrolled completely off the top of the viewport (bottom > 0).
          if (rect.top <= readingLine && rect.bottom > 0) {
            bestIdx = i;
          }
        });
        setHabitsActiveIdx(bestIdx);
      });
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    // Seed initial state — handles direct navigation to #habits.
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  type SectionProps = {
    id: string;
    title: string;
    children: React.ReactNode;
    image?: { src: string; thumbSrc?: string; alt: string; caption?: string };
    imagePosition?: "left" | "right";
    /**
     * On desktop, glue the image so it stays in view while the text column
     * scrolls past. On mobile this is ignored (the image stacks above text).
     */
    stickyImage?: boolean;
  };

  const Section = ({
    id,
    title,
    children,
    image,
    imagePosition = "right",
    stickyImage = false,
  }: SectionProps) => {
    const stickyCls = stickyImage ? " md:sticky md:top-24 md:self-start" : "";
    const imgEl = image ? (
      <GalleryImage
        src={image.src}
        thumbSrc={image.thumbSrc}
        alt={image.alt}
        caption={image.caption}
        className={SECTION_IMG_CLS + stickyCls}
        imgClassName={SECTION_IMG_INNER_CLS}
      />
    ) : null;

    return (
      <section
        id={id}
        aria-labelledby={`${id}-title`}
        className="scroll-mt-24 py-16 md:py-24 px-4 border-b border-border/30"
      >
        <div className="max-w-6xl mx-auto">
          <h2
            id={`${id}-title`}
            className="text-4xl md:text-5xl font-bold mb-8 text-foreground"
          >
            {title}
          </h2>

          {image ? (
            <div className="grid md:grid-cols-2 gap-8 items-start">
              {imagePosition === "left" && imgEl}
              <div className="space-y-4">{children}</div>
              {imagePosition === "right" && imgEl}
            </div>
          ) : (
            <div className="space-y-4">{children}</div>
          )}
        </div>
      </section>
    );
  };

  const currentYear = new Date().getFullYear();

  // Contact channels rendered as a list of links — used in #contact and
  // available as quick reach-out actions.
  // For Telegram/WhatsApp: keep `target` empty so iOS Universal Links hand
  // the URL to the installed app instead of opening Safari first. Adjust
  // research notes are in the chat history.
  const contactLinks = [
    {
      href: t("contact_links.telegram_url"),
      label: t("contact_links.telegram"),
      kind: "Telegram",
      Icon: Send,
      newTab: false,
    },
    {
      href: t("contact_links.whatsapp_url"),
      label: t("contact_links.whatsapp"),
      kind: "WhatsApp",
      Icon: MessageCircle,
      newTab: false,
    },
    {
      href: t("contact_links.instagram_url"),
      label: t("contact_links.instagram"),
      kind: "Instagram",
      Icon: Instagram,
      newTab: true,
    },
    {
      href: t("contact_links.phone_url"),
      label: t("contact_links.phone"),
      kind: "Phone",
      Icon: Phone,
      newTab: false,
    },
  ];

  return (
    <div
      className="bg-background"
      style={{
        minHeight: "max(100dvh, 100lvh, var(--bulka-viewport-height))",
      }}
    >
      <Header />

      <main id="main">
        {/* Hero Section */}
        <section
          aria-labelledby="hero-title"
          className="scroll-mt-24 pt-12 pb-16 md:pt-20 md:pb-24 px-4 bg-gradient-to-b from-primary/10 to-background"
        >
          <div className="max-w-6xl mx-auto">
            <h1
              id="hero-title"
              className="text-4xl md:text-6xl font-bold mb-6 text-primary text-center text-balance"
            >
              {t("hero.title")}
            </h1>

            <div className="mt-8 md:mt-12 grid md:grid-cols-[1fr_360px] gap-6 md:gap-12 items-stretch">
              {/* Image. On mobile: rendered FIRST (right after H1) and capped
                  to a portrait card via aspect ratio. On desktop: lives in
                  the right column. The button is absolutely positioned so
                  the image's natural aspect doesn't drag the grid row taller
                  than the text column — height is purely text-driven. */}
              <div className="order-1 md:order-2 mx-auto md:mx-0 w-full max-w-[280px] md:max-w-none aspect-[4/5] md:aspect-auto md:h-full md:relative">
                <GalleryImage
                  src={images.ps_portrait}
                  thumbSrc={images.ps_portrait_thumb}
                  alt={t("media.photoset.portrait_alt")}
                  caption={t("media.photoset.portrait_caption")}
                  className="rounded-2xl overflow-hidden shadow-xl h-full md:absolute md:inset-0"
                  imgClassName="rounded-2xl object-cover h-full w-full brightness-105 contrast-[1.03] saturate-[1.05]"
                  loading="eager"
                />
              </div>

              <div className="order-2 md:order-1 space-y-5">
                <p className="text-lg leading-relaxed text-foreground/80">
                  {t("hero.intro")}
                </p>
                <p className="text-lg leading-relaxed text-foreground/80">
                  {richText(t("hero.story"))}
                </p>
                <p className="text-lg leading-relaxed text-foreground/80">
                  {richText(t("hero.current"))}
                </p>
                <p className="text-xl font-semibold text-primary italic">
                  {t("hero.question")}
                </p>
                <div className="flex flex-wrap gap-3 pt-2">
                  <button
                    id="hero-cta"
                    type="button"
                    onClick={() => scrollToId("contact")}
                    aria-label={t("cta.adopt_aria")}
                    className="inline-flex items-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/95 px-6 py-3 rounded-full text-base md:text-lg font-semibold shadow-lg shadow-primary/30 transition-all hover:shadow-xl hover:shadow-primary/40 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/30"
                  >
                    <Heart size={20} aria-hidden="true" />
                    {t("cta.adopt")}
                  </button>
                  <button
                    type="button"
                    onClick={() => scrollToId("appearance")}
                    className="inline-flex items-center gap-2 bg-secondary/60 hover:bg-secondary text-foreground px-6 py-3 rounded-full text-base font-medium transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-secondary/40"
                  >
                    {t("cta.learn_more")}
                    <ChevronDown size={18} aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Appearance — pure infographic, no description duplication */}
        <Section
          id="appearance"
          title={t("appearance.title")}
          image={{
            src: images.ps_rug,
            thumbSrc: images.ps_rug_thumb,
            alt: t("media.photoset.rug_alt"),
            caption: t("media.photoset.rug_caption"),
          }}
          imagePosition="right"
        >
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <div className="bg-primary/10 border border-primary/20 rounded-2xl p-5 flex flex-col gap-1 col-span-1">
              <div className="text-4xl md:text-5xl font-bold text-primary leading-none">
                {t("ui.appearance.kg_value")}
                <span className="text-2xl md:text-3xl ml-1">
                  {t("ui.appearance.kg_unit")}
                </span>
              </div>
              <div className="text-foreground/70 text-sm">
                {t("ui.appearance.kg_label")}
              </div>
            </div>
            <div className="bg-primary/10 border border-primary/20 rounded-2xl p-5 flex flex-col gap-1 col-span-1">
              <div className="text-4xl md:text-5xl font-bold text-primary leading-none">
                {t("ui.appearance.cm_value")}
                <span className="text-2xl md:text-3xl ml-1">
                  {t("ui.appearance.cm_unit")}
                </span>
              </div>
              <div className="text-foreground/70 text-sm">
                {t("ui.appearance.cm_label")}
              </div>
            </div>
            <div className="bg-accent/20 border border-accent/30 rounded-2xl p-5 flex items-center gap-3 col-span-2">
              <span className="text-4xl" aria-hidden="true">
                🌸
              </span>
              <div>
                <div className="font-semibold text-foreground text-lg">
                  {t("ui.appearance.sex_value")}
                </div>
                <div className="text-foreground/60 text-xs uppercase tracking-wide">
                  {t("ui.appearance.sex_label")}
                </div>
              </div>
            </div>
            <div className="bg-secondary/60 border border-border/40 rounded-2xl p-5 flex items-center gap-3 col-span-2 sm:col-span-1">
              <span className="text-4xl" aria-hidden="true">
                🦊
              </span>
              <div>
                <div className="font-semibold text-foreground">
                  {t("ui.appearance.ears")}
                </div>
              </div>
            </div>
            <div className="bg-secondary/60 border border-border/40 rounded-2xl p-5 flex items-center gap-3 col-span-2 sm:col-span-1">
              <span className="text-4xl" aria-hidden="true">
                🌀
              </span>
              <div>
                <div className="font-semibold text-foreground">
                  {t("ui.appearance.tail")}
                </div>
              </div>
            </div>
            <div className="bg-accent/20 border border-accent/30 rounded-2xl p-5 flex items-center gap-3 col-span-2">
              <span className="text-4xl" aria-hidden="true">
                🐕
              </span>
              <div>
                <div className="font-semibold text-foreground">
                  {t("ui.appearance.face")}
                </div>
                <div className="text-foreground/60 text-xs italic">
                  {t("ui.appearance.face_sub")}
                </div>
              </div>
            </div>
          </div>
        </Section>

        {/* Habits Section — scrollytelling with crossfading photos.
            Mobile: one sticky photo at top changes as user scrolls through items.
            Desktop: two stacked sticky photos on the left, text column on the right. */}
        <section
          id="habits"
          ref={habitsSectionRef}
          aria-labelledby="habits-title"
          className="scroll-mt-24 py-16 md:py-24 px-4 border-b border-border/30"
        >
          <div className="max-w-6xl mx-auto">
            <h2
              id="habits-title"
              className="text-4xl md:text-5xl font-bold mb-8 text-foreground"
            >
              {t("habits.title")}
            </h2>

            {/* Mobile: sticky photo above the scrolling habit items.
                top:0 + paddingTop = header height so bg-background covers the full
                zone from the very top of the viewport down to the photo content.
                Without this, the gap between 0 and the photo top was transparent and
                habit-item text from previous items scrolled through visibly.
                Header height = safe-area-top + 60px inner div + 1px border-b. */}
            <div
              data-mobile-photo-stick=""
              className="sticky top-0 md:hidden mb-6 z-20 bg-background"
              style={{ paddingTop: "calc(61px + var(--safe-area-top, 0px))" }}
            >
              <PhotoFader activeIdx={habitsActiveIdx} />
            </div>

            <div className="md:grid md:grid-cols-2 md:gap-8 md:items-start">
              {/* Desktop: sticky photo column — two photos stacked.
                  Max-height per photo keeps the left column clearly shorter
                  than the right text column, giving sticky meaningful travel. */}
              <div
                data-desktop-photo-stick=""
                className="hidden md:flex md:sticky md:top-24 md:self-start flex-col gap-4"
              >
                <PhotoFader activeIdx={habitsActiveIdx} className="max-h-[260px]" />
                <PhotoFader activeIdx={(habitsActiveIdx + 3) % HABITS_PHOTOS.length} className="max-h-[260px]" />
              </div>

              {/* Habit items — single source for both mobile and desktop */}
              <div className="space-y-2">
                <div data-habit-item="" className="py-6">
                  <h3 className="font-bold text-lg mb-2">
                    <span aria-hidden="true">🚽</span> {t("ui.habits.bathroom_title")}
                  </h3>
                  <p className="text-foreground/80">{t("habits.bathroom")}</p>
                </div>
                <div data-habit-item="" className="py-6">
                  <h3 className="font-bold text-lg mb-2">
                    <span aria-hidden="true">🚶</span> {t("ui.habits.walks_title")}
                  </h3>
                  <p className="text-foreground/80">{t("habits.walks")}</p>
                </div>
                <div data-habit-item="" className="py-6">
                  <h3 className="font-bold text-lg mb-2">
                    <span aria-hidden="true">🐕</span> {t("ui.habits.behavior_title")}
                  </h3>
                  <p className="text-foreground/80">{t("habits.behavior")}</p>
                </div>
                <div data-habit-item="" className="py-6">
                  <h3 className="font-bold text-lg mb-2">
                    <span aria-hidden="true">🚗</span> {t("ui.habits.car_title")}
                  </h3>
                  <p className="text-foreground/80">{t("habits.car")}</p>
                </div>
                <div data-habit-item="" className="py-6">
                  <h3 className="font-bold text-lg mb-2">
                    <span aria-hidden="true">🏠</span> {t("ui.habits.home_title")}
                  </h3>
                  <p className="text-foreground/80">{t("habits.home")}</p>
                </div>
                <div data-habit-item="" className="py-6">
                  <h3 className="font-bold text-lg mb-2">
                    <span aria-hidden="true">🍖</span> {t("ui.habits.food_title")}
                  </h3>
                  <p className="text-foreground/80">{t("habits.food")}</p>
                </div>
                <div data-habit-item="" className="py-6">
                  <h3 className="font-bold text-lg mb-2">
                    <span aria-hidden="true">🐱</span> {t("ui.habits.cats_title")}
                  </h3>
                  <p className="text-foreground/80">{t("habits.cats")}</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Skills Section */}
        <Section
          id="skills"
          title={t("skills.title")}
          image={{
            src: images.ps_paw,
            thumbSrc: images.ps_paw_thumb,
            alt: t("media.photoset.paw_alt"),
            caption: t("media.photoset.paw_caption"),
          }}
        >
          <div className="space-y-6">
            <p className="text-lg leading-relaxed text-foreground/80">
              {t("skills.intro")}
            </p>

            <div className="bg-accent/20 border border-accent/30 p-6 rounded-xl">
              <h3 className="font-bold text-lg mb-4">
                {t("ui.skills.commands_title")}
              </h3>
              <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {[
                  t("ui.skills.cmd_sit"),
                  t("ui.skills.cmd_lie"),
                  t("ui.skills.cmd_place"),
                  t("ui.skills.cmd_come"),
                  t("ui.skills.cmd_paw"),
                  t("ui.skills.cmd_ball"),
                  t("ui.skills.cmd_no"),
                ].map((cmd) => (
                  <li
                    key={cmd}
                    className="flex items-center gap-2 bg-background/60 rounded-lg px-3 py-2"
                  >
                    <span className="text-accent" aria-hidden="true">
                      ✓
                    </span>
                    <span className="font-medium">{cmd}</span>
                  </li>
                ))}
              </ul>
            </div>

            <p className="text-foreground/70 italic">
              {t("skills.explanation")}
            </p>
          </div>
        </Section>

        {/* Health Section — x-rays + the vet-visit photo (moved from Conditions) */}
        <section
          id="health"
          aria-labelledby="health-title"
          className="scroll-mt-24 py-16 md:py-24 px-4 border-b border-border/30"
        >
          <div className="max-w-6xl mx-auto">
            <h2
              id="health-title"
              className="text-4xl md:text-5xl font-bold mb-8 text-foreground"
            >
              {t("health.title")}
            </h2>

            <div className="space-y-6">
              <p className="text-lg font-semibold text-foreground">
                {t("health.intro")}
              </p>

              <ul className="space-y-4">
                {[
                  { idx: 1, Icon: Crosshair, key: "health.bullet1" },
                  { idx: 2, Icon: Bone, key: "health.bullet2" },
                  { idx: 3, Icon: Worm, key: "health.bullet3" },
                  { idx: 4, Icon: Ban, key: "health.bullet4" },
                ].map(({ idx, Icon, key }) => (
                  <li
                    key={idx}
                    className="relative overflow-hidden flex gap-4 p-5 pl-7 rounded-2xl border bg-primary/[0.07] border-primary/30"
                  >
                    <span
                      aria-hidden="true"
                      className="absolute left-0 inset-y-0 w-1.5 bg-primary rounded-l-2xl"
                    />
                    <div className="shrink-0 w-12 h-12 rounded-xl flex items-center justify-center bg-primary/20 text-primary">
                      <Icon size={22} aria-hidden="true" />
                    </div>
                    <div className="flex-1">
                      <div className="text-xs uppercase tracking-wide font-bold mb-1 text-primary">
                        {t("ui.health_card.prefix")}
                        {idx}
                      </div>
                      <p className="text-foreground leading-relaxed">
                        {t(key)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>

              {/* Combined media gallery: vet visit + 2 x-rays + cardiology report.
                  Mobile: horizontal swipeable carousel with snap points (~85% width each).
                  Desktop (md+): 4-column grid, slightly smaller per-card to keep them tidy. */}
              <figure
                className={cn(
                  "mt-6",
                  "flex md:grid md:grid-cols-4 gap-3 md:gap-4 items-stretch",
                  "overflow-x-auto md:overflow-x-visible snap-x snap-mandatory md:snap-none",
                  "[-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
                  "-mx-4 px-4 md:mx-0 md:px-0",
                )}
              >
                <div className="snap-center md:snap-align-none shrink-0 md:shrink basis-[78%] md:basis-auto md:max-w-[260px]">
                  <GalleryImage
                    src={images.dog_apartment}
                    alt={t("media.conditions_alt")}
                    caption={t("media.conditions_caption")}
                    className="rounded-xl overflow-hidden shadow-lg h-full"
                    imgClassName="rounded-xl object-cover w-full h-full aspect-[3/4]"
                  />
                </div>
                {/* Bullet circle is BURNED INTO health1.webp via scripts/burn-xray-markers.py
                    so it shows in messenger previews / search crawls / lightbox without JS. */}
                <div className="snap-center md:snap-align-none shrink-0 md:shrink basis-[78%] md:basis-auto md:max-w-[260px]">
                  <GalleryImage
                    src={images.health1}
                    alt={t("media.health1_alt")}
                    caption={t("media.health1_caption")}
                    className="rounded-xl overflow-hidden shadow-lg h-full bg-black/5"
                    imgClassName="rounded-xl object-cover w-full h-full aspect-[3/4]"
                  />
                </div>
                {/* Fracture marker hidden — we don't have a reliable location to point at. */}
                <div className="snap-center md:snap-align-none shrink-0 md:shrink basis-[78%] md:basis-auto md:max-w-[260px]">
                  <GalleryImage
                    src={images.health2}
                    alt={t("media.health2_alt")}
                    caption={t("media.health2_caption")}
                    className="rounded-xl overflow-hidden shadow-lg h-full bg-black/5"
                    imgClassName="rounded-xl object-cover w-full h-full aspect-[3/4]"
                  />
                </div>
                <div className="snap-center md:snap-align-none shrink-0 md:shrink basis-[78%] md:basis-auto md:max-w-[260px]">
                  <GalleryImage
                    src={images.cardiology}
                    alt={t("ui.cardiology.alt")}
                    caption={t("ui.cardiology.caption")}
                    className="rounded-xl overflow-hidden shadow-lg bg-white h-full"
                    imgClassName="rounded-xl object-contain w-full h-full aspect-[3/4] bg-white"
                  />
                </div>
              </figure>
            </div>
          </div>
        </section>

        {/* Conditions Section — uses the bench-with-friends photo (Bulka in social context) */}
        <Section
          id="conditions"
          title={t("conditions.title")}
          image={{
            src: images.ps_family,
            thumbSrc: images.ps_family_thumb,
            alt: t("media.photoset.family_alt"),
            caption: t("media.photoset.family_caption"),
          }}
          imagePosition="left"
        >
          <div className="space-y-6">
            <div className="bg-primary/10 border border-primary/30 p-6 rounded-xl">
              <h3 className="font-bold text-lg mb-3 flex items-center gap-2">
                <Home size={24} className="text-primary" aria-hidden="true" />
                {t("ui.conditions.adoption_title")}
              </h3>
              <p className="text-foreground/80">{t("conditions.adoption")}</p>
            </div>

            <div className="bg-primary/10 border border-primary/30 p-6 rounded-xl">
              <h3 className="font-bold text-lg mb-3 flex items-center gap-2">
                <Users size={24} className="text-primary" aria-hidden="true" />
                {t("ui.conditions.support_title")}
              </h3>
              <p className="text-foreground/80 mb-4">
                {t("conditions.communication")}
              </p>
              <p className="text-foreground/80">{t("conditions.support")}</p>
            </div>

            <div className="bg-accent/20 border border-accent/30 p-6 rounded-xl">
              <h3 className="font-bold text-lg mb-3 flex items-center gap-2">
                <Heart size={24} className="text-accent" aria-hidden="true" />
                {t("ui.conditions.bonus_title")}
              </h3>
              <p className="text-foreground/80 italic">{t("conditions.perk")}</p>
            </div>
          </div>
        </Section>

        {/* FAQ section — preempts common objections + carries the "Лена заберёт обратно" guarantee.
            The component owns its own h2 + intro to keep tone of voice in one place. */}
        <section
          id="faq"
          aria-labelledby="faq-title"
          className="scroll-mt-24 py-16 md:py-24 px-4 border-b border-border/30"
        >
          <div className="max-w-6xl mx-auto">
            <FAQ />
          </div>
        </section>

        {/* Mini-game — env-gated. VITE_ENABLE_GAME=1 turns it on. */}
        {SHOW_GAME && (
          <section
            aria-labelledby="day-title"
            className="scroll-mt-24 py-16 md:py-24 px-4 border-b border-border/30 bg-gradient-to-b from-background to-primary/5"
          >
            <div className="max-w-6xl mx-auto">
              <h2
                id="day-title"
                className="text-3xl md:text-4xl font-bold mb-3 text-foreground"
              >
                {t("ui.game.title")}
              </h2>
              <p className="text-foreground/70 mb-8 max-w-2xl">
                {t("ui.game.subtitle")}
              </p>
              <BulkaDay />
            </div>
          </section>
        )}

        {/* Contact Section */}
        <section
          id="contact"
          aria-labelledby="contact-title"
          className="scroll-mt-24 py-16 md:py-24 px-4"
        >
          <div className="max-w-6xl mx-auto">
            <h2
              id="contact-title"
              className="text-4xl md:text-5xl font-bold mb-8 text-foreground"
            >
              {t("contact.title")}
            </h2>

            <div className="grid md:grid-cols-2 gap-8 items-stretch">
              <div className="space-y-6">
                <p className="text-lg leading-relaxed text-foreground/80">
                  {t("contact.location")}
                </p>

                <a
                  href={MAPS_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${t("ui.contact.location_address1")}, ${t("ui.contact.location_address2")} — ${t("contact_section.open_map")}`}
                  className="group relative block rounded-2xl overflow-hidden border border-primary/30 shadow-lg hover:shadow-xl transition-shadow focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/40"
                >
                  {/* Tinted map background as a CSS background-image, NOT a
                      nested <img> — Telegram Instant View rejects <img>
                      inside <a> with "NESTED_ELEMENT_NOT_SUPPORTED". The
                      orange gradient stacks on top of the map via the same
                      background-image rule (CSS layered backgrounds). */}
                  <div
                    aria-hidden="true"
                    className="absolute inset-0 saturate-75 contrast-[0.95] group-hover:brightness-95 transition-all"
                    style={{
                      backgroundImage: [
                        "linear-gradient(to right, hsl(var(--primary)) 0%, hsl(var(--primary) / 0.85) 35%, hsl(var(--primary) / 0.35) 65%, transparent 90%)",
                        `url(${asset("images/map.webp")})`,
                      ].join(", "),
                      backgroundSize: "cover, cover",
                      backgroundPosition: "center, center",
                      backgroundRepeat: "no-repeat, no-repeat",
                    }}
                  />
                  <address className="not-italic relative z-10 p-8 min-h-[280px] flex flex-col justify-end max-w-[60%]">
                    <h3 className="text-2xl font-bold mb-3 flex items-center gap-2 text-primary-foreground">
                      <MapPin size={24} aria-hidden="true" />
                      {t("ui.contact.location_title")}
                    </h3>
                    <p className="text-primary-foreground font-semibold">
                      {t("ui.contact.location_address1")}
                    </p>
                    <p className="text-primary-foreground/90">
                      {t("ui.contact.location_address2")}
                    </p>
                    <p className="text-primary-foreground/75 mt-2 text-sm">
                      {t("ui.contact.location_city")}
                    </p>
                    <span className="mt-5 inline-flex items-center gap-2 bg-primary-foreground text-primary group-hover:bg-primary-foreground/90 px-5 py-2.5 rounded-full text-sm font-semibold shadow-md self-start">
                      <MapPin size={16} aria-hidden="true" />
                      {t("contact_section.open_map")}
                    </span>
                  </address>
                </a>

                <div className="bg-gradient-to-br from-primary/20 to-secondary/20 p-8 rounded-2xl border border-primary/30">
                  <h3 className="text-2xl font-bold mb-4 flex items-center gap-2">
                    <span aria-hidden="true">🐾</span>{" "}
                    {t("ui.contact.contacts_title")}
                  </h3>
                  <ul className="space-y-3">
                    {contactLinks.map(({ href, label, kind, Icon, newTab }) => (
                      <li key={kind}>
                        <a
                          href={href}
                          rel="noopener"
                          {...(newTab ? { target: "_blank" } : {})}
                          className="group flex items-center gap-3 px-4 py-3 rounded-xl bg-background/60 hover:bg-background border border-border/50 hover:border-primary/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                        >
                          <Icon
                            size={20}
                            aria-hidden="true"
                            className="text-primary shrink-0"
                          />
                          <div className="flex flex-col leading-tight min-w-0">
                            <span className="text-xs uppercase tracking-wide text-foreground/50">
                              {kind}
                            </span>
                            <span className="text-foreground font-medium truncate">
                              {label}
                            </span>
                          </div>
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Donations panel — env-gated. Renders nothing without VITE_ENABLE_DONATIONS=1 */}
                <DonationsPanel />
              </div>

              {/* Photo column: same absolute trick as the hero — image button
                  is positioned absolutely so its natural aspect doesn't drag
                  the grid row taller than the left column of cards. */}
              <div className="md:relative md:h-full">
                <GalleryImage
                  src={images.ps_hug}
                  thumbSrc={images.ps_hug_thumb}
                  alt={t("media.photoset.hug_alt")}
                  caption={t("media.photoset.hug_caption")}
                  className="rounded-2xl overflow-hidden shadow-xl h-full md:absolute md:inset-0"
                  imgClassName="rounded-2xl object-cover w-full h-full brightness-105 contrast-[1.03] saturate-[1.05]"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Photo strip — leftover-but-loved photos, lazy-drift gallery. */}
        <section
          id="gallery"
          aria-label={t("ui.strip.aria")}
          className="scroll-mt-24 py-16 md:py-20 border-t border-border/30 bg-gradient-to-b from-background to-primary/5"
        >
          <div className="max-w-6xl mx-auto px-4 mb-6">
            <h2 className="text-2xl md:text-3xl font-bold text-foreground">
              {t("ui.strip.title")}
            </h2>
            <p className="text-foreground/60 text-sm mt-1">
              {t("ui.strip.subtitle")}
            </p>
          </div>
          <PhotoStrip
            images={[
              {
                src: images.ps_portrait,
                thumbSrc: images.ps_portrait_thumb,
                alt: t("media.photoset.portrait_alt"),
                caption: t("media.photoset.portrait_caption"),
              },
              {
                src: images.ps_walk,
                thumbSrc: images.ps_walk_thumb,
                alt: t("media.photoset.walk_alt"),
                caption: t("media.photoset.walk_caption"),
              },
              {
                src: images.ps_scratch,
                thumbSrc: images.ps_scratch_thumb,
                alt: t("media.photoset.scratch_alt"),
                caption: t("media.photoset.scratch_caption"),
              },
              {
                src: images.ps_ball,
                thumbSrc: images.ps_ball_thumb,
                alt: t("media.photoset.ball_alt"),
                caption: t("media.photoset.ball_caption"),
              },
              {
                src: images.ps_hug,
                thumbSrc: images.ps_hug_thumb,
                alt: t("media.photoset.hug_alt"),
                caption: t("media.photoset.hug_caption"),
              },
              {
                src: images.ps_rug,
                thumbSrc: images.ps_rug_thumb,
                alt: t("media.photoset.rug_alt"),
                caption: t("media.photoset.rug_caption"),
              },
              {
                src: images.ps_paw,
                thumbSrc: images.ps_paw_thumb,
                alt: t("media.photoset.paw_alt"),
                caption: t("media.photoset.paw_caption"),
              },
              {
                src: images.ps_balcony_sun,
                thumbSrc: images.ps_balcony_sun_thumb,
                alt: t("media.photoset.balcony_sun_alt"),
                caption: t("media.photoset.balcony_sun_caption"),
              },
              {
                src: images.ps_lick,
                thumbSrc: images.ps_lick_thumb,
                alt: t("media.photoset.lick_alt"),
                caption: t("media.photoset.lick_caption"),
              },
              {
                src: images.ps_belly,
                thumbSrc: images.ps_belly_thumb,
                alt: t("media.photoset.belly_alt"),
                caption: t("media.photoset.belly_caption"),
              },
              {
                src: images.ps_cat_balcony,
                thumbSrc: images.ps_cat_balcony_thumb,
                alt: t("media.photoset.cat_balcony_alt"),
                caption: t("media.photoset.cat_balcony_caption"),
              },
              {
                src: images.ps_family,
                thumbSrc: images.ps_family_thumb,
                alt: t("media.photoset.family_alt"),
                caption: t("media.photoset.family_caption"),
              },
              {
                src: images.dog_home,
                alt: t("media.strip.home_alt"),
                caption: t("media.strip.home_caption"),
              },
              {
                src: images.dog_vet,
                alt: t("media.strip.vet_alt"),
                caption: t("media.strip.vet_caption"),
              },
              {
                src: images.dogs_public,
                alt: t("media.strip.park_alt"),
                caption: t("media.strip.park_caption"),
              },
              {
                src: images.lena_dogs,
                alt: t("media.strip.car_alt"),
                caption: t("media.strip.car_caption"),
              },
              {
                src: images.dog_car,
                alt: t("media.habits_alt"),
                caption: t("media.habits_caption"),
              },
              {
                src: images.bulka_tv,
                alt: t("media.skills_alt"),
                caption: t("media.skills_caption"),
              },
              {
                src: images.bulka_friends,
                alt: t("media.story_alt"),
                caption: t("media.story_caption"),
              },
              {
                src: images.person_dog,
                alt: t("media.contact_alt"),
                caption: t("media.contact_caption"),
              },
            ]}
          />
        </section>
      </main>

      {/* Footer */}
      <footer
        className="bg-primary/10 border-t border-border py-12 px-4 mt-0"
        style={{ paddingBottom: "calc(3rem + var(--safe-area-bottom))" }}
      >
        <div className="max-w-6xl mx-auto text-center space-y-2">
          <p className="text-2xl font-bold text-primary">
            🐾 {t("brand.name")}
          </p>
          <p className="text-foreground/70">{t("footer.tagline")}</p>
          {/* Footer credit — Лена → Instagram, Алекс → mextner.com. Underlines
              kept very faint so the line reads as prose, not a link bar. */}
          <p className="text-sm text-foreground/50">
            © {currentYear} ·{" "}
            {(() => {
              const tpl = t("ui.footer_made.template");
              const linkCls =
                "underline decoration-foreground/15 underline-offset-2 hover:decoration-primary/60 hover:text-primary transition-colors";
              const lena = (
                <a
                  key="lena"
                  href={t("contact_links.instagram_url")}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={linkCls}
                >
                  {t("ui.footer_made.lena")}
                </a>
              );
              const alex = (
                <a
                  key="alex"
                  href="https://mextner.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={linkCls}
                >
                  {t("ui.footer_made.alex")}
                </a>
              );
              const parts = tpl.split(/(\{LENA\}|\{ALEX\})/);
              return parts.map((p, i) => {
                if (p === "{LENA}") return <React.Fragment key={i}>{lena}</React.Fragment>;
                if (p === "{ALEX}") return <React.Fragment key={i}>{alex}</React.Fragment>;
                return <React.Fragment key={i}>{p}</React.Fragment>;
              });
            })()}
          </p>
        </div>
      </footer>
    </div>
  );
}
