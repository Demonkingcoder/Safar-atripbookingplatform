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
  assert.doesNotMatch(message.textContent, /refund has been successfully processed/i)
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
