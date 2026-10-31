import { useCallback, useEffect, useState } from 'react'
import tripService from '../services/tripService'
import { useLanguage } from '../context/LanguageContext'

function useTrips() {
  const { t } = useLanguage()
  const [trips, setTrips] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchTrips = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const list = await tripService.getTrips()
      setTrips(Array.isArray(list) ? list : [])
    } catch (err) {
      setError(!err?.response ? t('common.network') : err.response.status >= 500 ? t('common.serverError') : t('common.error'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => { fetchTrips() }, [fetchTrips])

  return { trips, loading, error, refetch: fetchTrips }
}

export default useTrips
