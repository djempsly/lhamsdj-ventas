import { useMemo } from 'react';
import { ROLES, ROLES_POS_ACCESS, ROLES_ADMIN, ROLES_CREDIT_EDIT } from '../lib/constants';

interface Usuario {
  id: number;
  username: string;
  nombre: string;
  rol: string;
  permisos: string[];
}

function getUsuarioFromStorage(): Usuario | null {
  try {
    const raw = localStorage.getItem('usuario');
    if (!raw) return null;
    return JSON.parse(raw) as Usuario;
  } catch {
    return null;
  }
}

export function usePermissions() {
  const usuario = useMemo(() => getUsuarioFromStorage(), []);

  const rol = usuario?.rol ?? '';

  const hasRole = (...roles: string[]): boolean => {
    return roles.includes(rol);
  };

  const isAdmin = hasRole(ROLES.SUPER_ADMIN, ROLES.ADMIN_NEGOCIO);

  const canEditCredit = (ROLES_CREDIT_EDIT as readonly string[]).includes(rol);

  const canAccessPOS = (ROLES_POS_ACCESS as readonly string[]).includes(rol);

  const canVoidSales = hasRole(ROLES.GERENTE, ROLES.ADMIN_NEGOCIO, ROLES.SUPER_ADMIN);

  const canManageUsers = hasRole(ROLES.ADMIN_NEGOCIO, ROLES.SUPER_ADMIN);

  const canApplyDiscount = hasRole(
    ROLES.CAJERO,
    ROLES.VENDEDOR,
    ROLES.GERENTE,
    ROLES.ADMIN_NEGOCIO,
    ROLES.SUPER_ADMIN
  );

  const maxDiscount = useMemo(() => {
    if (hasRole(ROLES.SUPER_ADMIN, ROLES.ADMIN_NEGOCIO)) return 100;
    if (hasRole(ROLES.GERENTE)) return 30;
    if (hasRole(ROLES.CAJERO, ROLES.VENDEDOR)) return 10;
    return 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rol]);

  return {
    usuario,
    hasRole,
    isAdmin,
    canEditCredit,
    canAccessPOS,
    canVoidSales,
    canManageUsers,
    canApplyDiscount,
    maxDiscount,
  };
}
