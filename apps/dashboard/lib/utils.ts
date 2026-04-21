import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, formatDistanceToNow, parseISO } from 'date-fns'
import { tr } from 'date-fns/locale'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  return format(d, 'dd MMM yyyy', { locale: tr })
}

export function formatDateTime(date: string | Date): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  return format(d, 'dd MMM yyyy HH:mm', { locale: tr })
}

export function formatRelativeDate(date: string | Date): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  return formatDistanceToNow(d, { addSuffix: true, locale: tr })
}

export function formatDateRange(dateFrom: string | null, dateTo: string | null): string {
  if (!dateFrom && !dateTo) return 'Belirsiz'
  if (!dateFrom) return `${formatDate(dateTo!)}'e kadar`
  if (!dateTo) return `${formatDate(dateFrom)}'den itibaren`
  return `${formatDate(dateFrom)} - ${formatDate(dateTo)}`
}

export function getSentimentColor(sentiment: string): string {
  switch (sentiment) {
    case 'positive':
      return 'bg-emerald-100 text-emerald-800 border border-emerald-200'
    case 'negative':
      return 'bg-rose-100 text-rose-800 border border-rose-200'
    case 'neutral':
    default:
      return 'bg-slate-100 text-slate-700 border border-slate-200'
  }
}

export function getStatusColor(status: string): string {
  switch (status) {
    case 'active':
      return 'bg-gradient-to-r from-emerald-500 to-emerald-400 text-white shadow-sm shadow-emerald-200'
    // Scraper schema uses 'expired'; legacy UI used 'ended' — accept both so
    // the table renders the correct slate badge for ended campaigns.
    case 'expired':
    case 'ended':
      return 'bg-gradient-to-r from-slate-500 to-slate-400 text-white shadow-sm shadow-slate-200'
    case 'hidden':
    case 'passive':
      return 'bg-gradient-to-r from-amber-500 to-amber-400 text-white shadow-sm shadow-amber-200'
    case 'changed':
      return 'bg-gradient-to-r from-blue-500 to-blue-400 text-white shadow-sm shadow-blue-200'
    default:
      return 'bg-slate-100 text-slate-600 border border-slate-200'
  }
}
