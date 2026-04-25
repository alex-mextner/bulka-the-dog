import { useContext } from "react";
import { LanguageContext } from "@/context/LanguageContext";
import { getTranslation, Language } from "@/lib/translations";

export function useLanguage() {
  const context = useContext(LanguageContext);

  if (!context) {
    throw new Error("useLanguage must be used within LanguageProvider");
  }

  const t = (key: string): string => {
    return getTranslation(context.language, key);
  };

  return {
    language: context.language as Language,
    setLanguage: context.setLanguage,
    t,
  };
}
