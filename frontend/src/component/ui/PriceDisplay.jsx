
function PriceDisplay({
  amount,
  label = 'per person',
  currency = 'INR',
  className = '',
}) {
  const price = Number(amount)

  const validPrice =
    amount !== null &&
    amount !== undefined &&
    amount !== '' &&
    Number.isFinite(price) &&
    price >= 0

  if (!validPrice) {
    return (
      <span className={`text-sm text-charcoal/60 ${className}`}>
        Price unavailable
      </span>
    )
  }

  const formattedPrice = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(price)

  return (
    <div className={className}>
      <p className="font-heading text-xl font-semibold text-forest">
        {formattedPrice}
      </p>

      {label && (
        <p className="mt-1 text-xs text-charcoal/60">
          {label}
        </p>
      )}
    </div>
  )
}

export default PriceDisplay
