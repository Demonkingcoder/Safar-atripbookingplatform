import api, { unwrapData } from './api'

const paymentService = {
  async createOrder(bookingId) {
    const response = await api.post(`/bookings/${encodeURIComponent(bookingId)}/payment-order`)
    return unwrapData(response)
  },
  async verifyPayment(bookingId, paymentData) {
    const response = await api.post(`/bookings/${encodeURIComponent(bookingId)}/verify-payment`, paymentData)
    return unwrapData(response)
  },
}

export default paymentService
