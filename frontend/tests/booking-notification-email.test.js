import assert from 'node:assert/strict'
import test from 'node:test'
import { buildBookingNotificationEmail } from '../../src/utils/booking-notification-email.js'

test('Safar notification email is responsive, branded, and escapes user-controlled copy', () => {
  const message = buildBookingNotificationEmail({
    type: 'booking_confirmed',
    fullName: '<Traveler & Co>',
    tripTitle: '<Mountain escape>',
    bookingReference: 'SAF-123',
    numberOfSeats: 2,
    totalAmount: 18000,
    departureDate: '2027-02-01T00:00:00.000Z',
  })

  assert.match(message.subject, /confirmed/i)
  assert.match(message.htmlContent, /@media only screen and \(max-width:600px\)/)
  assert.match(message.htmlContent, /#183d3a/)
  assert.match(message.htmlContent, /&lt;Traveler &amp; Co&gt;/)
  assert.match(message.htmlContent, /&lt;Mountain escape&gt;/)
  assert.match(message.textContent, /SAF-123/)
})

test('refund notification copy does not claim completion while refund is pending', () => {
  const message = buildBookingNotificationEmail({ type: 'refund_pending', tripTitle: 'Manali Adventure', totalAmount: 1000 })
  assert.match(message.subject, /being processed/i)
  assert.match(message.textContent, /processing your refund/i)
  assert.match(message.textContent, /Refund amount: ₹1,000/)
  assert.doesNotMatch(message.textContent, /refund has been successfully processed/i)
})

test('English confirmation includes the payment reference and Hindi notifications are localized', () => {
  const english = buildBookingNotificationEmail({
    type: 'booking_confirmed', language: 'en', tripTitle: 'Manali Adventure', bookingReference: 'SAF-123',
    numberOfSeats: 2, totalAmount: 18000, departureDate: '2027-02-01T00:00:00.000Z', paymentReference: 'pay_abc123',
  })
  assert.match(english.textContent, /Payment reference: pay_abc123/)

  const hindi = buildBookingNotificationEmail({
    type: 'booking_confirmed', language: 'hi', tripTitle: 'मनाली यात्रा', bookingReference: 'SAF-123',
    numberOfSeats: 2, totalAmount: 18000, paymentReference: 'pay_abc123',
  })
  assert.match(hindi.htmlContent, /lang="hi"/)
  assert.match(hindi.subject, /बुकिंग की पुष्टि/)
  assert.match(hindi.textContent, /भुगतान संदर्भ: pay_abc123/)
})

test('definitive payment failure email contains trip and departure details with a safe retry link', () => {
  const message = buildBookingNotificationEmail({
    type: 'payment_failed', language: 'en', tripTitle: 'Manali Adventure', tripSlug: 'manali-adventure',
    bookingReference: 'SAF-123', numberOfSeats: 2, totalAmount: 18000, departureDate: '2027-02-01T00:00:00.000Z',
  })
  assert.match(message.textContent, /Manali Adventure/)
  assert.match(message.textContent, /Departure:/)
  assert.match(message.textContent, /\/trips\/manali-adventure\/book/)
})

test('booking, admin, cancellation, refund, and reminder notification variants render safely', () => {
  const variants = [
    ['admin_booking_notification', /A booking is confirmed/],
    ['booking_cancelled', /Booking cancelled/],
    ['departure_cancelled', /Departure update/],
    ['refund_pending', /Refund in progress/],
    ['refund_processed', /Refund completed/],
    ['refund_failed', /Refund needs attention/],
    ['upcoming_trip_reminder', /journey is getting closer/i],
  ]
  for (const [type, expected] of variants) {
    const message = buildBookingNotificationEmail({ type, fullName: 'Traveler', tripTitle: 'Manali Adventure', bookingReference: 'SAF-123', totalAmount: 250 })
    assert.match(message.htmlContent, expected)
    assert.match(message.htmlContent, /href="http:\/\/localhost:5173(?:\/|")/)
    assert.match(message.textContent, /Manali Adventure/)
  }
})

test('every customer and admin notification variant has a Hindi template', () => {
  const types = ['booking_confirmed', 'booking_expired', 'payment_failed', 'booking_cancelled', 'refund_pending', 'refund_processed', 'refund_failed', 'admin_booking_notification', 'upcoming_trip_reminder', 'departure_cancelled']
  for (const type of types) {
    const message = buildBookingNotificationEmail({ type, language: 'hi', fullName: 'यात्री', tripTitle: 'मनाली यात्रा', bookingReference: 'SAF-123', numberOfSeats: 2, totalAmount: 250 })
    assert.match(message.htmlContent, /lang="hi"/)
    assert.match(message.subject, /[^\x00-\x7F]/)
    assert.match(message.textContent, /मनाली यात्रा/)
  }
})
