import { ArrowClockwiseIcon, ArrowLeftIcon, WarningCircleIcon } from '@phosphor-icons/react';
import {
  cloneElement,
  type ReactElement,
  type ReactNode,
  useId,
  useLayoutEffect,
  useRef,
} from 'react';
import { Button } from '@/components/ui/button';
import {
  DialogContent,
  DialogDescription,
  DialogHeader,
  Dialog as DialogRoot,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { FieldDescription, FieldLabel, Field as FieldRoot } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { errorMessage } from '@/lib/format';

export { PageHeader } from '@/components/layout/page-header';
export { Pagination } from '@/components/layout/page-pagination';
export { Button, buttonVariants } from '@/components/ui/button';
export { Checkbox } from '@/components/ui/checkbox';
export { Input } from '@/components/ui/input';

/** Product composition around the official Radix/shadcn dialog. */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  title: ReactNode;
  description: ReactNode;
  children: ReactNode;
}) {
  const content = useRef<HTMLDivElement | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);
  useLayoutEffect(() => {
    if (open && !wasOpen.current) {
      // Radix FocusScope autofocus runs in a passive effect. Capture its
      // external invoker first, without replacing it with a modal control.
      const active = document.activeElement;
      returnFocus.current =
        active instanceof HTMLElement && !content.current?.contains(active) ? active : null;
    }
    wasOpen.current = open;
  }, [open]);
  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto"
        ref={content}
        onCloseAutoFocus={(event) => {
          // A delayed close callback must not steal focus from a newly opened dialog.
          if (wasOpen.current) {
            event.preventDefault();
            return;
          }
          if (returnFocus.current?.isConnected) {
            event.preventDefault();
            returnFocus.current.focus();
          }
          returnFocus.current = null;
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </DialogRoot>
  );
}

export function EmptyState({
  title,
  description,
  icon,
  action,
  compact = false,
}: {
  title: ReactNode;
  description: ReactNode;
  icon: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <Empty className={compact ? 'flex-none' : undefined}>
      <EmptyMedia variant="icon">{icon}</EmptyMedia>
      <EmptyHeader className="max-w-md">
        <EmptyTitle as="h2">{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {action ? (
        <EmptyContent className="flex-row flex-wrap justify-center">{action}</EmptyContent>
      ) : null}
    </Empty>
  );
}

type FieldControl = {
  id?: string;
  'aria-describedby'?: string;
};

export function Field({
  label,
  children,
  hint,
}: {
  label: ReactNode;
  children: ReactElement<FieldControl>;
  hint?: ReactNode;
}) {
  const generatedId = useId();
  const controlId = children.props.id ?? generatedId;
  const descriptionId = `${controlId}-description`;
  const describedBy = [children.props['aria-describedby'], hint ? descriptionId : undefined]
    .filter(Boolean)
    .join(' ');
  return (
    <FieldRoot>
      <FieldLabel htmlFor={controlId}>{label}</FieldLabel>
      {cloneElement(children, {
        id: controlId,
        'aria-describedby': describedBy || undefined,
      })}
      {hint ? <FieldDescription id={descriptionId}>{hint}</FieldDescription> : null}
    </FieldRoot>
  );
}

export function SelectControl({
  value,
  onValueChange,
  options,
  placeholder = '请选择',
  ...triggerProps
}: {
  value: string;
  onValueChange(value: string): void;
  options: readonly { value: string; label: ReactNode }[];
  placeholder?: string;
  id?: string;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
}) {
  return (
    <Select value={value} onValueChange={onValueChange} disabled={triggerProps.disabled}>
      <SelectTrigger {...triggerProps}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

export function PageNavigation({ onBack, label = '返回' }: { onBack(): void; label?: string }) {
  return (
    <nav
      aria-label="页面导航"
      className="mb-6 flex h-8 items-center justify-between gap-4"
      data-slot="page-navigation"
    >
      <Button className="-ml-2" onClick={onBack} variant="ghost" type="button">
        <ArrowLeftIcon aria-hidden data-icon="inline-start" />
        {label}
      </Button>
    </nav>
  );
}

export function QueryFeedback({
  error,
  onRetry,
  title = '操作未完成',
  compact = false,
}: {
  error: unknown;
  onRetry?: () => void;
  title?: string;
  compact?: boolean;
}) {
  if (!error) return null;
  return (
    <Empty
      aria-atomic="true"
      aria-live="assertive"
      className={compact ? 'flex-none' : undefined}
      role="alert"
    >
      <EmptyMedia variant="icon">
        <WarningCircleIcon aria-hidden className="text-destructive" />
      </EmptyMedia>
      <EmptyHeader className="max-w-md">
        <EmptyTitle as="h2">{title}</EmptyTitle>
        <EmptyDescription>{errorMessage(error)}</EmptyDescription>
      </EmptyHeader>
      {onRetry ? (
        <EmptyContent className="flex-row flex-wrap justify-center">
          <Button onClick={onRetry} variant="outline" type="button">
            <ArrowClockwiseIcon aria-hidden data-icon="inline-start" />
            重试
          </Button>
        </EmptyContent>
      ) : null}
    </Empty>
  );
}
