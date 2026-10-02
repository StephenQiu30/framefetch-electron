import { cva, type VariantProps } from 'class-variance-authority';
import { type ClassValue, clsx } from 'clsx';
import { Dialog as PrimitiveDialog } from 'radix-ui';
import { type ComponentProps, cloneElement, type ReactElement, type ReactNode, useId } from 'react';
import { twMerge } from 'tailwind-merge';

export function cn(...values: ClassValue[]): string {
  return twMerge(clsx(values));
}

const buttonVariants = cva('button', {
  variants: {
    variant: {
      default: 'button-primary',
      secondary: 'button-secondary',
      ghost: 'button-ghost',
      destructive: 'button-destructive',
    },
    size: { default: 'button-normal', sm: 'button-small', icon: 'button-icon' },
  },
  defaultVariants: { variant: 'default', size: 'default' },
});

export function Button({
  className,
  variant,
  size,
  ...props
}: ComponentProps<'button'> & VariantProps<typeof buttonVariants>) {
  return (
    <button type="button" className={cn(buttonVariants({ variant, size }), className)} {...props} />
  );
}

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <PrimitiveDialog.Root open={open} onOpenChange={onOpenChange}>
      <PrimitiveDialog.Portal>
        <PrimitiveDialog.Overlay className="dialog-overlay" />
        <PrimitiveDialog.Content className="dialog-content">
          <PrimitiveDialog.Title className="dialog-title">{title}</PrimitiveDialog.Title>
          <PrimitiveDialog.Description className="muted">{description}</PrimitiveDialog.Description>
          {children}
        </PrimitiveDialog.Content>
      </PrimitiveDialog.Portal>
    </PrimitiveDialog.Root>
  );
}

export function EmptyState({
  title,
  description,
  icon,
  action,
}: {
  title: string;
  description: string;
  icon: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">{icon}</span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactElement<{ id?: string }>;
  hint?: string;
}) {
  const generatedId = useId();
  const controlId = children.props.id ?? generatedId;
  return (
    <label className="field" htmlFor={controlId}>
      <span>{label}</span>
      {cloneElement(children, { id: controlId })}
      {hint && <small className="muted">{hint}</small>}
    </label>
  );
}
