const authEndpointsWithoutSessionRetry = /\/auth\/(?:login|register|refresh-token|logout)(?:[/?]|$)/

export function canRefreshRequest(error) {
  const config = error?.config
  return error?.response?.status === 401
    && Boolean(config)
    && !config._safarRetried
    && !config._skipAuthRefresh
    && !authEndpointsWithoutSessionRetry.test(config.url || '')
}

export function createRefreshCoordinator(refresh, onFailure, {
  locks = globalThis.navigator?.locks,
  lockName = 'safar-auth-refresh',
} = {}) {
  let refreshInFlight = null
  const refreshWithCrossTabLock = () => (
    typeof locks?.request === 'function'
      ? locks.request(lockName, { mode: 'exclusive' }, refresh)
      : refresh()
  )

  return function refreshOnce() {
    if (!refreshInFlight) {
      refreshInFlight = Promise.resolve()
        .then(refreshWithCrossTabLock)
        .catch((error) => {
          onFailure?.(error)
          throw error
        })
        .finally(() => { refreshInFlight = null })
    }
    return refreshInFlight
  }
}
