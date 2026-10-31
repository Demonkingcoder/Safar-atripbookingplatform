
export function formatCurrency(amount, currency = 'INR', locale = 'en-IN') {
  if (
    amount === null ||
    amount === undefined ||
    amount === '' ||
    !Number.isFinite(Number(amount))
  ) {
    return locale.startsWith('hi') ? 'किराया उपलब्ध नहीं' : 'Price unavailable'
  }

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(Number(amount))
}

export default formatCurrency
