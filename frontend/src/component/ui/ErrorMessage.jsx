
import Button from './Button'
import { useLanguage } from '../../context/LanguageContext'

function ErrorMessage({
  message,
  onRetry,
  title,
}) {
  const { t } = useLanguage()
  return (
    <div
      className="mx-auto w-full max-w-xl rounded-2xl border border-red-200 bg-white p-6 text-center sm:p-8"
      role="alert"
    >
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-2xl text-red-600">
        !
      </div>

      <h2 className="mt-4 font-heading text-2xl font-semibold text-forest">
          {title || t('common.errorTitle')}
      </h2>

      <p className="mt-3 text-sm leading-6 text-charcoal/65">
        {message || t('common.error')}
      </p>

      {onRetry && (
        <div className="mt-6">
          <Button onClick={onRetry} variant="primary">
          {t('common.retry')}
          </Button>
        </div>
      )}
    </div>
  )
}

export default ErrorMessage
