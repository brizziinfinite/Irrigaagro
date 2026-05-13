import type React from 'react';
import { useId } from 'react';
import { cn } from '@/lib/utils';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  variant?: 'text' | 'number' | 'date' | 'email';
}

export function Input({
  label,
  error,
  helperText,
  variant = 'text',
  className,
  id,
  disabled,
  ...props
}: InputProps) {
  const generatedId = useId();
  const inputId = id || `input-${generatedId}`;

  const typeMap = {
    text: 'text',
    number: 'number',
    date: 'date',
    email: 'email',
  };

  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={inputId}
          className="block text-sm font-medium text-text mb-2"
        >
          {label}
        </label>
      )}
      <input
        id={inputId}
        type={typeMap[variant]}
        disabled={disabled}
        className={cn(
          'w-full px-4 py-2 rounded-[var(--radius-md)] border border-border',
          'bg-surface text-text placeholder:text-text-muted',
          'transition-colors duration-200',
          'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-0 focus:border-primary-500',
          'disabled:bg-surface-secondary disabled:cursor-not-allowed disabled:text-text-muted',
          error && 'border-danger-500 focus:ring-danger-500 focus:border-danger-500',
          className
        )}
        {...props}
      />
      {error && (
        <p className="text-sm text-danger-500 mt-2">{error}</p>
      )}
      {helperText && !error && (
        <p className="text-sm text-text-muted mt-2">{helperText}</p>
      )}
    </div>
  );
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  helperText?: string;
  options: Array<{ value: string | number; label: string }>;
}

export function Select({
  label,
  error,
  helperText,
  options,
  className,
  id,
  disabled,
  ...props
}: SelectProps) {
  const generatedId = useId();
  const inputId = id || `select-${generatedId}`;

  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={inputId}
          className="block text-sm font-medium text-text mb-2"
        >
          {label}
        </label>
      )}
      <select
        id={inputId}
        disabled={disabled}
        className={cn(
          'w-full px-4 py-2 rounded-[var(--radius-md)] border border-border',
          'bg-surface text-text',
          'transition-colors duration-200',
          'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-0 focus:border-primary-500',
          'disabled:bg-surface-secondary disabled:cursor-not-allowed disabled:text-text-muted',
          error && 'border-danger-500 focus:ring-danger-500 focus:border-danger-500',
          className
        )}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error && (
        <p className="text-sm text-danger-500 mt-2">{error}</p>
      )}
      {helperText && !error && (
        <p className="text-sm text-text-muted mt-2">{helperText}</p>
      )}
    </div>
  );
}
