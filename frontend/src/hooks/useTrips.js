import { useCallback, useEffect, useState } from 'react'
import tripService from '../services/tripService'
import { getErrorMessage } from '../services/api'

function useTrips() {
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
      setError(getErrorMessage(err, 'Unable to load trips. Please try again.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchTrips() }, [fetchTrips])

  return { trips, loading, error, refetch: fetchTrips }
}

export default useTrips
