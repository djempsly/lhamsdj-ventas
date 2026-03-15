import { useMemo } from 'react';

interface CountryConfig {
  pais: {
    codigo: string;
    moneda_codigo: string;
    moneda_simbolo: string;
  };
  zona_horaria: string;
}

export function useLocaleFormat(config?: CountryConfig | null) {
  const locale = useMemo(() => {
    const code = config?.pais?.codigo;
    const map: Record<string, string> = {
      DOM: 'es-DO', MEX: 'es-MX', COL: 'es-CO', ARG: 'es-AR',
      USA: 'en-US', BRA: 'pt-BR',
    };
    return map[code || ''] || 'es-DO';
  }, [config]);

  const formatCurrency = useMemo(() => {
    const currencyCode = config?.pais?.moneda_codigo || 'DOP';
    const formatter = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currencyCode,
    });
    return (amount: number) => formatter.format(amount);
  }, [locale, config]);

  const formatNumber = useMemo(() => {
    const formatter = new Intl.NumberFormat(locale);
    return (n: number) => formatter.format(n);
  }, [locale]);

  const formatDate = useMemo(() => {
    const tz = config?.zona_horaria || 'America/Santo_Domingo';
    const formatter = new Intl.DateTimeFormat(locale, {
      year: 'numeric', month: '2-digit', day: '2-digit',
      timeZone: tz,
    });
    return (date: string | Date) => formatter.format(new Date(date));
  }, [locale, config]);

  const formatDateTime = useMemo(() => {
    const tz = config?.zona_horaria || 'America/Santo_Domingo';
    const formatter = new Intl.DateTimeFormat(locale, {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
      timeZone: tz,
    });
    return (date: string | Date) => formatter.format(new Date(date));
  }, [locale, config]);

  const formatPercent = useMemo(() => {
    const formatter = new Intl.NumberFormat(locale, {
      style: 'percent',
      minimumFractionDigits: 1,
      maximumFractionDigits: 2,
    });
    return (n: number) => formatter.format(n / 100);
  }, [locale]);

  return { locale, formatCurrency, formatNumber, formatDate, formatDateTime, formatPercent };
}
