export function localizedApiError(error, t, fallback = 'common.error') {
  const status = error?.response?.status
  if (!error?.response) return t('common.network')
  if (status === 400 || status === 422) return t('common.invalid')
  if (status === 401) return t('auth.loginError')
  if (status === 403) return t('auth.verify')
  if (status === 404) return t('common.notFound')
  if (status === 409) return t('common.conflict')
  if (status === 429) return t('common.rateLimited')
  if (status >= 500) return t('common.serverError')
  return t(fallback)
}

