import { useLanguage } from '../../context/LanguageContext'

function Loader({ message, fullPage = false }) {
  const { t } = useLanguage()
  return (
    <div
      className={`flex flex-col items-center justify-center gap-4 ${
        fullPage ? 'min-h-[60vh] w-full' : 'py-12'
      }`}
      role="status"
      aria-live="polite"
    >
      {/* Animated spinner */}
      <div className="relative flex h-14 w-14 items-center justify-center">
        <div className="absolute inset-0 animate-spin rounded-full border-[3px] border-forest/10 border-t-terracotta" />

        <span className="font-heading text-xl font-bold text-forest">
          S
        </span>
      </div>

      <p className="text-sm font-medium text-charcoal/65">
        {message || t('common.loading')}
      </p>
    </div>
  )
}

export default Loader
