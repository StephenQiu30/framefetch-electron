import { CaretLeftIcon, CaretRightIcon } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import {
  PaginationContent,
  PaginationItem,
  Pagination as PaginationRoot,
} from '@/components/ui/pagination';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export function Pagination({
  page,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
  busy = false,
  ariaLabel = '列表分页',
}: {
  page: number;
  pageSize: number;
  totalItems: number;
  onPageChange(page: number): void;
  onPageSizeChange(pageSize: number): void;
  busy?: boolean;
  ariaLabel?: string;
}) {
  const pages = Math.max(1, Math.ceil(totalItems / pageSize));
  if (totalItems === 0) return null;
  return (
    <div className="ml-auto flex w-full flex-wrap items-center justify-end gap-3">
      <Select
        disabled={busy}
        value={String(pageSize)}
        onValueChange={(value) => onPageSizeChange(Number(value))}
      >
        <SelectTrigger aria-label={`${ariaLabel}每页条数`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {[10, 20, 50].map((size) => (
              <SelectItem key={size} value={String(size)}>
                每页 {size} 条
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <PaginationRoot aria-label={ariaLabel} className="mx-0 w-auto justify-end">
        <PaginationContent>
          <PaginationItem>
            <Button
              aria-label="上一页"
              disabled={busy || page <= 1}
              onClick={() => onPageChange(page - 1)}
              size="icon"
              type="button"
              variant="outline"
            >
              <CaretLeftIcon aria-hidden />
            </Button>
          </PaginationItem>
          <PaginationItem>
            <span aria-current="page" aria-live="polite" className="px-2 text-sm tabular-nums">
              {page} / {pages}
            </span>
          </PaginationItem>
          <PaginationItem>
            <Button
              aria-label="下一页"
              disabled={busy || page >= pages}
              onClick={() => onPageChange(page + 1)}
              size="icon"
              type="button"
              variant="outline"
            >
              <CaretRightIcon aria-hidden />
            </Button>
          </PaginationItem>
        </PaginationContent>
      </PaginationRoot>
    </div>
  );
}
