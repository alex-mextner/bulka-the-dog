import { Header } from "@/components/Header";
import { useLanguage } from "@/hooks/useLanguage";
import { Heart, Home, Zap, Heart as HealthIcon, Users } from "lucide-react";

export default function Index() {
  const { t } = useLanguage();

  const images = {
    health1:
      "https://cdn.builder.io/api/v1/image/assets%2F349256541d1341939e72d696071cd0ab%2Febe081f5d802478d89617400572093e4?format=webp&width=800&height=1200",
    health2:
      "https://cdn.builder.io/api/v1/image/assets%2F349256541d1341939e72d696071cd0ab%2Fa244d2443be4415d9888eea1cd496cd7?format=webp&width=800&height=1200",
    dogs_public:
      "https://cdn.builder.io/api/v1/image/assets%2F349256541d1341939e72d696071cd0ab%2F94d2a5cd4a9343468b23dde87cfcd8a8?format=webp&width=800&height=1200",
    lena_dogs:
      "https://cdn.builder.io/api/v1/image/assets%2F349256541d1341939e72d696071cd0ab%2F7077bb27222143f29bc9c2dbd5149d58?format=webp&width=800&height=1200",
    dog_car:
      "https://cdn.builder.io/api/v1/image/assets%2F349256541d1341939e72d696071cd0ab%2Fc2c3eed2b76c40808c2af7de062fdc63?format=webp&width=800&height=1200",
    dog_home:
      "https://cdn.builder.io/api/v1/image/assets%2F349256541d1341939e72d696071cd0ab%2F925731d3575142aeaf9e8435f62050f1?format=webp&width=800&height=1200",
    dog_vet:
      "https://cdn.builder.io/api/v1/image/assets%2F349256541d1341939e72d696071cd0ab%2Fb222c688f26b4823bd38803cb3ced601?format=webp&width=800&height=1200",
    dog_apartment:
      "https://cdn.builder.io/api/v1/image/assets%2F349256541d1341939e72d696071cd0ab%2Fb3df19060f194e8b8ff85ecffe8febe3?format=webp&width=800&height=1200",
    dog_vet2:
      "https://cdn.builder.io/api/v1/image/assets%2F349256541d1341939e72d696071cd0ab%2F4e39f271bcb4455e8f51105960493e24?format=webp&width=800&height=1200",
    person_dog:
      "https://cdn.builder.io/api/v1/image/assets%2F349256541d1341939e72d696071cd0ab%2F0478849b4a5440ea8690fcb045a610bf?format=webp&width=800&height=1200",
  };

  const Section = ({
    id,
    title,
    children,
    image,
    imagePosition = "right",
  }: {
    id: string;
    title: string;
    children: React.ReactNode;
    image?: string;
    imagePosition?: "left" | "right";
  }) => (
    <section
      id={id}
      className="scroll-mt-24 py-16 md:py-24 px-4 border-b border-border/30"
    >
      <div className="max-w-6xl mx-auto">
        <h2 className="text-4xl md:text-5xl font-bold mb-8 text-foreground">
          {title}
        </h2>

        {image ? (
          <div
            className={`grid md:grid-cols-2 gap-8 items-center ${
              imagePosition === "left" ? "md:auto-rows-min" : ""
            }`}
          >
            {imagePosition === "left" && (
              <img
                src={image}
                alt={title}
                className="w-full h-auto rounded-2xl shadow-lg object-cover"
              />
            )}
            <div className="space-y-4">{children}</div>
            {imagePosition === "right" && (
              <img
                src={image}
                alt={title}
                className="w-full h-auto rounded-2xl shadow-lg object-cover"
              />
            )}
          </div>
        ) : (
          <div className="space-y-4">{children}</div>
        )}
      </div>
    </section>
  );

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* Hero Section */}
      <section
        id="home"
        className="scroll-mt-24 py-16 md:py-32 px-4 bg-gradient-to-b from-primary/10 to-background"
      >
        <div className="max-w-6xl mx-auto text-center">
          <h1 className="text-5xl md:text-7xl font-bold mb-6 text-primary">
            {t("hero.title")}
          </h1>
          <p className="text-xl md:text-2xl text-foreground/90 mb-8 max-w-3xl mx-auto leading-relaxed">
            {t("hero.intro")}
          </p>

          <div className="grid md:grid-cols-2 gap-8 items-center mt-12">
            <div className="space-y-6">
              <p className="text-lg leading-relaxed text-foreground/80">
                {t("hero.story")}
              </p>
              <p className="text-lg leading-relaxed text-foreground/80">
                {t("hero.current")}
              </p>
              <p className="text-xl font-semibold text-primary italic">
                {t("hero.question")}
              </p>
            </div>
            <img
              src={images.dogs_public}
              alt="Bulka the dog"
              className="w-full h-auto rounded-2xl shadow-xl object-cover"
            />
          </div>
        </div>
      </section>

      {/* Appearance Section */}
      <Section
        id="appearance"
        title={t("appearance.title")}
        image={images.dog_home}
        imagePosition="right"
      >
        <p className="text-lg leading-relaxed text-foreground/80">
          {t("appearance.description")}
        </p>
        <div className="bg-secondary/50 p-6 rounded-xl mt-6">
          <h3 className="font-bold text-lg mb-3 flex items-center gap-2">
            <span>📏</span> {t("appearance.title")}
          </h3>
          <ul className="space-y-2 text-foreground/80">
            <li>• 22 kg</li>
            <li>• 50 cm at withers</li>
            <li>• Soft ears like a Corgi</li>
            <li>• Curly tail like a Husky</li>
            <li>• Face like an Akita Inu</li>
          </ul>
        </div>
      </Section>

      {/* Habits Section */}
      <Section
        id="habits"
        title={t("habits.title")}
        image={images.dog_car}
        imagePosition="left"
      >
        <div className="space-y-6">
          <div>
            <h3 className="font-bold text-lg mb-2">🚽 {t("habits.title")}</h3>
            <p className="text-foreground/80">{t("habits.bathroom")}</p>
          </div>

          <div>
            <h3 className="font-bold text-lg mb-2">🚶 Walks</h3>
            <p className="text-foreground/80">{t("habits.walks")}</p>
          </div>

          <div>
            <h3 className="font-bold text-lg mb-2">🐕 Behavior</h3>
            <p className="text-foreground/80">{t("habits.behavior")}</p>
          </div>

          <div>
            <h3 className="font-bold text-lg mb-2">🚗 Car Rides</h3>
            <p className="text-foreground/80">{t("habits.car")}</p>
          </div>

          <div>
            <h3 className="font-bold text-lg mb-2">🏠 At Home</h3>
            <p className="text-foreground/80">{t("habits.home")}</p>
          </div>

          <div>
            <h3 className="font-bold text-lg mb-2">🍖 Food</h3>
            <p className="text-foreground/80">{t("habits.food")}</p>
          </div>

          <div>
            <h3 className="font-bold text-lg mb-2">🐱 Living with Cats</h3>
            <p className="text-foreground/80">{t("habits.cats")}</p>
          </div>
        </div>
      </Section>

      {/* Skills Section */}
      <Section id="skills" title={t("skills.title")} image={images.dog_vet}>
        <div className="space-y-6">
          <p className="text-lg leading-relaxed text-foreground/80">
            {t("skills.intro")}
          </p>
          <p className="text-lg leading-relaxed text-foreground/80 italic">
            {t("skills.explanation")}
          </p>

          <div className="bg-accent/20 border border-accent/30 p-6 rounded-xl">
            <h3 className="font-bold text-lg mb-4">Commands I Know:</h3>
            <ul className="grid grid-cols-2 gap-3">
              <li className="flex items-center gap-2">
                <span className="text-accent">✓</span> Sit
              </li>
              <li className="flex items-center gap-2">
                <span className="text-accent">✓</span> Lie Down
              </li>
              <li className="flex items-center gap-2">
                <span className="text-accent">✓</span> Place
              </li>
              <li className="flex items-center gap-2">
                <span className="text-accent">✓</span> Come
              </li>
              <li className="flex items-center gap-2">
                <span className="text-accent">✓</span> Give Paw
              </li>
              <li className="flex items-center gap-2">
                <span className="text-accent">✓</span> Ball
              </li>
            </ul>
          </div>
        </div>
      </Section>

      {/* Health Section */}
      <Section id="health" title={t("health.title")} imagePosition="right">
        <div className="space-y-6">
          <p className="text-lg font-semibold text-foreground">{t("health.intro")}</p>

          <div className="space-y-4">
            <div className="bg-secondary/50 p-6 rounded-xl">
              <p className="text-foreground/80">{t("health.bullet1")}</p>
            </div>

            <div className="bg-secondary/50 p-6 rounded-xl">
              <p className="text-foreground/80">{t("health.bullet2")}</p>
            </div>

            <div className="bg-secondary/50 p-6 rounded-xl">
              <p className="text-foreground/80">{t("health.bullet3")}</p>
            </div>

            <div className="bg-secondary/50 p-6 rounded-xl">
              <p className="text-foreground/80">{t("health.bullet4")}</p>
            </div>
          </div>

          <div className="mt-8 grid md:grid-cols-2 gap-4">
            <img
              src={images.health1}
              alt="Health records"
              className="w-full h-auto rounded-xl shadow-lg"
            />
            <img
              src={images.health2}
              alt="Health records"
              className="w-full h-auto rounded-xl shadow-lg"
            />
          </div>
        </div>
      </Section>

      {/* Conditions Section */}
      <Section id="conditions" title={t("conditions.title")} image={images.dog_apartment} imagePosition="left">
        <div className="space-y-6">
          <div className="bg-primary/10 border border-primary/30 p-6 rounded-xl">
            <h3 className="font-bold text-lg mb-3 flex items-center gap-2">
              <Home size={24} className="text-primary" />
              {t("conditions.title")}
            </h3>
            <p className="text-foreground/80">{t("conditions.adoption")}</p>
          </div>

          <div className="bg-primary/10 border border-primary/30 p-6 rounded-xl">
            <h3 className="font-bold text-lg mb-3 flex items-center gap-2">
              <Users size={24} className="text-primary" />
              Relationship & Support
            </h3>
            <p className="text-foreground/80 mb-4">{t("conditions.communication")}</p>
            <p className="text-foreground/80">{t("conditions.support")}</p>
          </div>

          <div className="bg-accent/20 border border-accent/30 p-6 rounded-xl">
            <h3 className="font-bold text-lg mb-3 flex items-center gap-2">
              <Heart size={24} className="text-accent" />
              Package Deal
            </h3>
            <p className="text-foreground/80 italic">{t("conditions.perk")}</p>
          </div>
        </div>
      </Section>

      {/* Contact Section */}
      <section id="contact" className="scroll-mt-24 py-16 md:py-24 px-4">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl md:text-5xl font-bold mb-8 text-foreground">
            {t("contact.title")}
          </h2>

          <div className="grid md:grid-cols-2 gap-8 items-center">
            <div className="space-y-6">
              <p className="text-lg leading-relaxed text-foreground/80">
                {t("contact.location")}
              </p>

              <div className="bg-gradient-to-br from-accent/20 to-primary/20 p-8 rounded-2xl border border-primary/30">
                <h3 className="text-2xl font-bold mb-4">📍 Location</h3>
                <p className="text-foreground/80 mb-2">Vukov Spomenik</p>
                <p className="text-foreground/80">near Super Vero Zira</p>
                <p className="text-foreground/80 mt-4 text-sm">Belgrade, Serbia</p>
              </div>

              <div className="bg-gradient-to-br from-primary/20 to-secondary/20 p-8 rounded-2xl border border-primary/30">
                <h3 className="text-2xl font-bold mb-4">🐾 Next Steps</h3>
                <ul className="space-y-2 text-foreground/80">
                  <li>✓ Learn about me</li>
                  <li>✓ Come for a walk with us</li>
                  <li>✓ Have some tea & chat</li>
                  <li>✓ Let's become family!</li>
                </ul>
              </div>
            </div>

            <img
              src={images.person_dog}
              alt="Meeting spot"
              className="w-full h-auto rounded-2xl shadow-xl object-cover"
            />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-primary/10 border-t border-border py-12 px-4">
        <div className="max-w-6xl mx-auto text-center">
          <h3 className="text-2xl font-bold mb-2 text-primary">🐾 Bulka</h3>
          <p className="text-foreground/70 mb-4">
            A dog looking for a loving home
          </p>
          <p className="text-sm text-foreground/50">
            Made with ❤️ by Lena for Bulka's future
          </p>
        </div>
      </footer>
    </div>
  );
}
