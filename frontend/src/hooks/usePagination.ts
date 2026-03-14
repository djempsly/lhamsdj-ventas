import { useState, useMemo, useCallback } from 'react';

interface PaginationState {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export function usePagination(initialPageSize = 25) {
  const [page, setPage] = useState(1);
  const [pageSize] = useState(initialPageSize);
  const [total, setTotal] = useState(0);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(total / pageSize)),
    [total, pageSize]
  );

  const canNext = page < totalPages;
  const canPrev = page > 1;

  const nextPage = useCallback(() => {
    if (canNext) setPage((p) => p + 1);
  }, [canNext]);

  const prevPage = useCallback(() => {
    if (canPrev) setPage((p) => p - 1);
  }, [canPrev]);

  return {
    page,
    pageSize,
    total,
    totalPages,
    setPage,
    setTotal,
    nextPage,
    prevPage,
    canNext,
    canPrev,
  } satisfies PaginationState & {
    setPage: (p: number) => void;
    setTotal: (t: number) => void;
    nextPage: () => void;
    prevPage: () => void;
    canNext: boolean;
    canPrev: boolean;
  };
}
