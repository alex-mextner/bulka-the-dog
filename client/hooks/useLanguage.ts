import { useContext } from "react";
import { CmsCopyContext } from "@/cms/CopyContext";
import { localizeLookup } from "@/cms/content-model";
import { LanguageContext } from "@/context/LanguageContext";
import { getTranslation, type Language } from "@/lib/translations";

export function useLanguage() {
  const context = useContext(LanguageContext);
  const copy = useContext(CmsCopyContext);

  if (!context) {
    throw new Error("useLanguage must be used within LanguageProvider");
  }

  const t = (key: string): string => {
    const field = key.replaceAll(".", "__");
    return localizeLookup(copy, field, { [field]: getTranslation(context.language, key) });
  };

  return {
    language: context.language as Language,
    setLanguage: context.setLanguage,
    availableLanguages: context.availableLanguages,
    t,
  };
}
