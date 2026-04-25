import { useState, useEffect } from "react";
import { useLanguage } from "@/hooks/useLanguage";
import { Language } from "@/lib/translations";
import { Menu, X, Globe } from "lucide-react";

const navItems = [
  { id: "home", key: "nav.home" },
  { id: "appearance", key: "nav.appearance" },
  { id: "habits", key: "nav.habits" },
  { id: "skills", key: "nav.skills" },
  { id: "health", key: "nav.health" },
  { id: "conditions", key: "nav.conditions" },
  { id: "contact", key: "nav.contact" },
];

const languages: { code: Language; name: string }[] = [
  { code: "ru", name: "Русский" },
  { code: "rs", name: "Српски" },
  { code: "en", name: "English" },
];

export function Header() {
  const { language, setLanguage, t } = useLanguage();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isLangDropdownOpen, setIsLangDropdownOpen] = useState(false);
  const [activeSection, setActiveSection] = useState("home");

  useEffect(() => {
    const handleScroll = () => {
      const sections = navItems.map((item) => item.id);
      let current = "home";

      for (const section of sections) {
        const element = document.getElementById(section);
        if (element) {
          const rect = element.getBoundingClientRect();
          if (rect.top <= 100) {
            current = section;
          }
        }
      }

      setActiveSection(current);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleNavClick = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
      setIsMenuOpen(false);
    }
  };

  return (
    <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border">
      <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
        {/* Logo */}
        <button
          onClick={() => handleNavClick("home")}
          className="text-2xl font-bold text-primary hover:text-primary/80 transition-colors"
        >
          🐾 Булка
        </button>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => handleNavClick(item.id)}
              className={`px-3 py-2 rounded-lg font-medium transition-colors ${
                activeSection === item.id
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-secondary text-foreground"
              }`}
            >
              {t(item.key)}
            </button>
          ))}
        </nav>

        {/* Language Switcher */}
        <div className="relative">
          <button
            onClick={() => setIsLangDropdownOpen(!isLangDropdownOpen)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-secondary transition-colors"
            aria-label="Language"
          >
            <Globe size={20} />
            <span className="font-medium">{language.toUpperCase()}</span>
          </button>

          {isLangDropdownOpen && (
            <div className="absolute right-0 mt-2 bg-card border border-border rounded-lg shadow-lg overflow-hidden">
              {languages.map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => {
                    setLanguage(lang.code);
                    setIsLangDropdownOpen(false);
                  }}
                  className={`w-full text-left px-4 py-2 hover:bg-secondary transition-colors ${
                    language === lang.code ? "bg-accent text-accent-foreground" : ""
                  }`}
                >
                  {lang.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Mobile Menu Button */}
        <button
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className="md:hidden p-2 rounded-lg hover:bg-secondary transition-colors"
          aria-label="Menu"
        >
          {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile Navigation */}
      {isMenuOpen && (
        <div className="md:hidden border-t border-border bg-background/98">
          <nav className="flex flex-col p-4 gap-2">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                className={`w-full text-left px-4 py-3 rounded-lg font-medium transition-colors ${
                  activeSection === item.id
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-secondary text-foreground"
                }`}
              >
                {t(item.key)}
              </button>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}
