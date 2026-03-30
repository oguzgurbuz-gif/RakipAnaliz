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
      return 'text-green-600 bg-green-50'
    case 'negative':
      return 'text-red-600 bg-red-50'
    case 'neutral':
    default:
      return 'text-gray-600 bg-gray-50'
  }
}

export function getStatusColor(status: string): string {
  switch (status) {
    case 'active':
      return 'text-green-600 bg-green-50 border-green-200'
    case 'ended':
      return 'text-gray-600 bg-gray-50 border-gray-200'
    case 'passive':
      return 'text-yellow-600 bg-yellow-50 border-yellow-200'
    case 'changed':
      return 'text-blue-600 bg-blue-50 border-blue-200'
    default:
      return 'text-gray-600 bg-gray-50 border-gray-200'
  }
}
