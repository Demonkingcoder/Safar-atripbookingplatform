
export function formatCurrency(amount, currency = 'INR') {
  if (
    amount === null ||
    amount === undefined ||
    amount === '' ||
    !Number.isFinite(Number(amount))
  ) {
    return 'Price unavailable'
  }

  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(Number(amount))
}

export default formatCurrency
