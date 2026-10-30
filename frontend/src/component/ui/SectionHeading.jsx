
function SectionHeading({
  eyebrow,
  title,
  description,
  align = 'left',
  className = '',
}) {
  const alignment =
    align === 'center' ? 'mx-auto text-center' : 'text-left'

  return (
    <div className={`max-w-3xl ${alignment} ${className}`}>
      {eyebrow && (
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-terracotta-dark">
          {eyebrow}
        </p>
      )}

      <h2 className="mt-3 font-heading text-3xl font-semibold leading-tight text-forest sm:text-4xl">
        {title}
      </h2>

      {description && (
        <p className="mt-4 text-sm leading-7 text-charcoal/65 sm:text-base">
          {description}
        </p>
      )}
    </div>
  )
}

export default SectionHeading
