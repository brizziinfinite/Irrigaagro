import type React from 'react';
import { cn } from '@/lib/utils';

interface CardProps {
  children: React.ReactNode;
  className?: string;
}

export function Card({ children, className }: CardProps) {
  return (
    <div
      className={cn(
        'bg-surface border border-border rounded-[var(--radius-lg)] p-6',
        className
      )}
    >
      {children}
    </div>
  );
}

interface CardHeaderProps {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export function CardHeader({
  title,
  subtitle,
  action,
  className,
}: CardHeaderProps) {
  return (
    <div className={cn('flex items-start justify-between mb-4', className)}>
      <div className="flex-1">
        {title && (
          <h3 className="text-lg font-semibold text-text">{title}</h3>
        )}
        {subtitle && (
          <p className="text-sm text-text-muted mt-1">{subtitle}</p>
        )}
      </div>
      {action && <div className="ml-4">{action}</div>}
    </div>
  );
}

interface CardContentProps {
  children: React.ReactNode;
  className?: string;
}

export function CardContent({ children, className }: CardContentProps) {
  return <div className={cn('', className)}>{children}</div>;
}

interface CardFooterProps {
  children: React.ReactNode;
  className?: string;
}

export function CardFooter({ children, className }: CardFooterProps) {
  return (
    <div className={cn('flex items-center justify-between mt-6 pt-6 border-t border-border', className)}>
      {children}
    </div>
  );
}
