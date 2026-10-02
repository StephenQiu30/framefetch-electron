import { useState } from 'react';

export function usePagedList<T>(items: T[]) {
  const [requestedPage, setPage] = useState(1);
  const [pageSize, setSize] = useState(10);
  const page = Math.min(requestedPage, Math.max(1, Math.ceil(items.length / pageSize)));
  return {
    items: items.slice((page - 1) * pageSize, page * pageSize),
    page,
    pageSize,
    totalItems: items.length,
    onPageChange: setPage,
    onPageSizeChange: (size: number) => {
      setSize(size);
      setPage(1);
    },
    reset: () => setPage(1),
  };
}
