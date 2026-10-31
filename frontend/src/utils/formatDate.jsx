
export function formatDate(date, options = {}, locale = 'en-IN') {
  if (!date) return locale.startsWith('hi') ? 'तारीख उपलब्ध नहीं' : 'Date unavailable'

  const parsedDate = new Date(date)

  if (Number.isNaN(parsedDate.getTime())) {
    return locale.startsWith('hi') ? 'तारीख उपलब्ध नहीं' : 'Date unavailable'
  }

  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...options,
  }).format(parsedDate)
}

export function formatDateRange(startDate, endDate, locale = 'en-IN') {
  if (!startDate && !endDate) {
    return locale.startsWith('hi') ? 'तारीखें उपलब्ध नहीं' : 'Dates unavailable'
  }

  if (!startDate) {
    return locale.startsWith('hi') ? `${formatDate(endDate, {}, locale)} तक` : `Until ${formatDate(endDate, {}, locale)}`
  }

  if (!endDate) {
    return locale.startsWith('hi') ? `${formatDate(startDate, {}, locale)} से` : `From ${formatDate(startDate, {}, locale)}`
  }

  return `${formatDate(startDate, {}, locale)} – ${formatDate(endDate, {}, locale)}`
}

export function formatDateTime(date, locale = 'en-IN') {
  if (!date) return locale.startsWith('hi') ? 'तारीख और समय उपलब्ध नहीं' : 'Date and time unavailable'

  const parsedDate = new Date(date)

  if (Number.isNaN(parsedDate.getTime())) {
    return locale.startsWith('hi') ? 'तारीख और समय उपलब्ध नहीं' : 'Date and time unavailable'
  }

  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(parsedDate)
}
