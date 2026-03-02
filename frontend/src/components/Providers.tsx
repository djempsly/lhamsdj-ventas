"use client";
import { ReactNode, useEffect, useState } from "react";
import { ErrorBoundary } from "./ErrorBoundary";
import { I18nContext, getLocale, getTranslations, type Locale } from "@/i18n";

export function Providers({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>("es");

  useEffect(() => {
    setLocale(getLocale());
    // Listen for locale changes from settings page
    const handler = () => setLocale(getLocale());
    window.addEventListener("locale-changed", handler);
    return () => window.removeEventListener("locale-changed", handler);
  }, []);

  return (
    <I18nContext.Provider value={getTranslations(locale)}>
      <ErrorBoundary>{children}</ErrorBoundary>
    </I18nContext.Provider>
  );
}
