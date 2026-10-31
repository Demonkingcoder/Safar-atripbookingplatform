import { motion, useReducedMotion } from 'motion/react'
import { useLanguage } from '../../context/LanguageContext'

function Button({ children, variant = 'primary', size = 'md', type = 'button', disabled = false, loading = false, className = '', onClick }) {
  const { t } = useLanguage()
  const reduceMotion = useReducedMotion()
  const supportsHover = typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches
  const base = 'inline-flex items-center justify-center gap-2 rounded-full font-bold transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-forest-light disabled:cursor-not-allowed disabled:bg-charcoal-light disabled:text-white disabled:shadow-none'
  const variants = {
    primary: 'bg-forest !text-white hover:bg-forest-light shadow-sm hover:shadow-md',
    secondary: 'border border-forest/15 bg-ivory text-forest hover:bg-sage shadow-sm hover:shadow-md',
    outline: 'border border-forest/40 bg-white text-forest hover:bg-sage',
    light: 'bg-ivory text-forest hover:bg-white',
  }
  const sizes = { sm: 'px-4 py-2 text-sm', md: 'px-6 py-3 text-sm md:text-base', lg: 'px-7 py-3.5 text-base' }
  return <motion.button
    type={type}
    disabled={disabled || loading}
    onClick={onClick}
    whileHover={reduceMotion || !supportsHover || disabled || loading ? undefined : { scale: 1.025 }}
    whileTap={reduceMotion || disabled || loading ? undefined : { scale: 0.975 }}
    transition={{ type: 'spring', stiffness: 420, damping: 28, mass: 0.45 }}
    className={`${base} ${variants[variant] || variants.primary} ${sizes[size] || sizes.md} ${className}`}
  >
    {loading && <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" />}
    {loading ? t('common.wait') : children}
  </motion.button>
}
export default Button
