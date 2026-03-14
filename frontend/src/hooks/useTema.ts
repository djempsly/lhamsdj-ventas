import { useMemo } from 'react';

interface Tema {
  bg: string;
  card: string;
  borde: string;
  texto: string;
  subtexto: string;
  accent: string;
  secondary: string;
}

const TEMA_CLARO: Tema = {
  bg: 'bg-gray-50',
  card: 'bg-white',
  borde: 'border-gray-200',
  texto: 'text-gray-900',
  subtexto: 'text-gray-500',
  accent: 'bg-blue-600',
  secondary: 'bg-gray-100',
};

const TEMA_OSCURO: Tema = {
  bg: 'bg-gray-900',
  card: 'bg-gray-800',
  borde: 'border-gray-700',
  texto: 'text-white',
  subtexto: 'text-gray-400',
  accent: 'bg-blue-500',
  secondary: 'bg-gray-700',
};

export function useTema() {
  const tema = useMemo<Tema>(() => {
    try {
      const stored = localStorage.getItem('tema');
      return stored === 'claro' ? TEMA_CLARO : TEMA_OSCURO;
    } catch {
      return TEMA_OSCURO;
    }
  }, []);

  const esClaro = useMemo(() => {
    try {
      return localStorage.getItem('tema') === 'claro';
    } catch {
      return false;
    }
  }, []);

  return { tema, esClaro };
}
