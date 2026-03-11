import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'

/**
 * Combines clsx and tailwind-merge to handle conditional Tailwind CSS classes
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

/**
 * Formats a date string to a human-readable format (pt-BR locale)
 * @param dateString - ISO 8601 date string
 * @param formatStr - date-fns format string (default: 'dd/MM/yyyy')
 * @returns Formatted date string
 */
export function formatDate(dateString: string, formatStr = 'dd/MM/yyyy'): string {
  try {
    const date = parseISO(dateString)
    return format(date, formatStr, { locale: ptBR })
  } catch {
    return dateString
  }
}

/**
 * Formats a number to Brazilian number format (comma as decimal separator, period as thousands separator)
 * @param n - Number to format
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted number string
 */
export function formatNumber(n: number, decimals = 2): string {
  const formatter = new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
  return formatter.format(n)
}
