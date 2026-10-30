
const variants = {
  default: 'bg-ivory text-charcoal',
  featured: 'bg-terracotta/15 text-forest',
  success: 'bg-green-100 text-green-800',
  warning: 'bg-amber-100 text-amber-800',
  danger: 'bg-red-100 text-red-800',
}

function Badge({
  children,
  variant = 'default',
  className = '',
}) {
  const style = variants[variant] || variants.default

  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold capitalize ${style} ${className}`}
    >
      {children}
    </span>
  )
}

export default Badge
