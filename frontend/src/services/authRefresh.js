const authEndpointsWithoutSessionRetry = /\/auth\/(?:login|register|refresh-token|logout)(?:[/?]|$)/

export function canRefreshRequest(error) {
  const config = error?.config
  return error?.response?.status === 401
    && Boolean(config)
    && !config._safarRetried
    && !config._skipAuthRefresh
    && !authEndpointsWithoutSessionRetry.test(config.url || '')
}

export function createRefreshCoordinator(refresh, onFailure) {
  let refreshInFlight = null
  return function refreshOnce() {
    if (!refreshInFlight) {
      refreshInFlight = Promise.resolve()
        .then(refresh)
        .catch((error) => {
          onFailure?.(error)
          throw error
        })
        .finally(() => { refreshInFlight = null })
    }
    return refreshInFlight
  }
}
