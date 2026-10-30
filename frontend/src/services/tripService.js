import api, { unwrapData } from './api'

function getTripList(payload) {
  const data = payload?.data ?? payload
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.trips)) return data.trips
  if (Array.isArray(data?.results)) return data.results
  return []
}

const tripService = {
  async getTrips(params = {}) {
    const response = await api.get('/trips', { params })
    return getTripList(unwrapData(response))
  },
  async getTripBySlug(slug) {
    const response = await api.get(`/trips/${encodeURIComponent(slug)}`)
    const data = unwrapData(response)
    return data?.trip ?? data
  },
  async getDepartures(tripSlug) {
    const response = await api.get(`/departures/${encodeURIComponent(tripSlug)}/departures`)
    const data = unwrapData(response)
    if (Array.isArray(data)) return data
    if (Array.isArray(data?.departures)) return data.departures
    if (Array.isArray(data?.results)) return data.results
    return []
  },
  async getDepartureById(departureId) {
    const response = await api.get(`/departures/${encodeURIComponent(departureId)}`)
    const data = unwrapData(response)
    return data?.departure ?? data
  },
}

export default tripService
