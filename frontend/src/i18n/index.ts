"use client";
import { createContext, useContext } from "react";
import es from "./es";
import en from "./en";
import pt from "./pt";
import type { Translations } from "./es";

export type Locale = "es" | "en" | "pt";

const translations: Record<Locale, Translations> = {
  es,
  en,
  // pt is a partial stub; cast to satisfy the full Translations type
  pt: pt as unknown as Translations,
};

export function getTranslations(locale: Locale): Translations {
  return translations[locale] || translations.es;
}

export function getLocale(): Locale {
  if (typeof window === "undefined") return "es";
  return (localStorage.getItem("locale") as Locale) || "es";
}

export function setLocale(locale: Locale) {
  localStorage.setItem("locale", locale);
}

// React context for i18n
export const I18nContext = createContext<Translations>(es);

export function useI18n(): Translations {
  return useContext(I18nContext);
}

export { es, en, pt };
export type { Translations };
