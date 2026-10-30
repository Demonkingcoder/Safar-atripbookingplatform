import api, { unwrapData } from './api'

const bookingService = {
  async createBooking(bookingData, idempotencyKey) {
    const response = await api.post('/bookings', bookingData, {
      headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {},
    })
    return unwrapData(response)
  },
  async createPaymentOrder(bookingId) {
    const response = await api.post(`/bookings/${encodeURIComponent(bookingId)}/payment-order`)
    return unwrapData(response)
  },
  async verifyPayment(bookingId, paymentData) {
    const response = await api.post(`/bookings/${encodeURIComponent(bookingId)}/verify-payment`, paymentData)
    return unwrapData(response)
  },
  async reconcilePayment(bookingId) {
    const response = await api.post(`/bookings/${encodeURIComponent(bookingId)}/reconcile-payment`)
    return unwrapData(response)
  },
  async getMyBookings() {
    const response = await api.get('/bookings/my-bookings')
    const data = unwrapData(response)
    if (Array.isArray(data)) return data
    if (Array.isArray(data?.bookings)) return data.bookings
    if (Array.isArray(data?.results)) return data.results
    return []
  },
  async getBookingById(bookingId) {
    const response = await api.get(`/bookings/${encodeURIComponent(bookingId)}`)
    return unwrapData(response)
  },
  async cancelBooking(bookingId) {
    const response = await api.patch(`/bookings/${encodeURIComponent(bookingId)}/cancel`)
    return unwrapData(response)
  },
}

export default bookingService
