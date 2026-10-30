
export function formatDate(date, options = {}) {
  if (!date) return 'Date unavailable'

  const parsedDate = new Date(date)

  if (Number.isNaN(parsedDate.getTime())) {
    return 'Date unavailable'
  }

  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...options,
  }).format(parsedDate)
}

export function formatDateRange(startDate, endDate) {
  if (!startDate && !endDate) {
    return 'Dates unavailable'
  }

  if (!startDate) {
    return `Until ${formatDate(endDate)}`
  }

  if (!endDate) {
    return `From ${formatDate(startDate)}`
  }

  return `${formatDate(startDate)} – ${formatDate(endDate)}`
}

export function formatDateTime(date) {
  if (!date) return 'Date and time unavailable'

  const parsedDate = new Date(date)

  if (Number.isNaN(parsedDate.getTime())) {
    return 'Date and time unavailable'
  }

  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(parsedDate)
}
