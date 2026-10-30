import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { CalendarDays, Users, Ticket, XCircle } from 'lucide-react'
import bookingService from '../services/bookingService'
import Loaders from '../component/ui/Loaders'
import Button from '../component/ui/Button'
import EmptyState from '../component/ui/EmptyState'
import formatCurrency from '../utils/formatCurrency'
import { formatDate } from '../utils/formatDate'
import { getErrorMessage } from '../services/api'

function MyBookings() {
  const location = useLocation()
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [cancellingId, setCancellingId] = useState('')
  const [notice, setNotice] = useState(location.state?.message || '')

  function getBookingsLoadError(err) {
    const status = err?.response?.status
    if (status === 401) return 'Your session has expired. Please sign in again to view your bookings.'
    if (status === 403) return "You don't have permission to view these bookings."
    if (status === 404) return 'The bookings service could not be found. Please try again later.'
    if (!err?.response) return 'Unable to reach Safar. Check your connection and try again.'
    if (status >= 500) return 'We could not load your bookings right now. Please try again.'
    return err?.response?.data?.message || 'Unable to load your bookings. Please try again.'
  }

  const fetchBookings = useCallback(async () => {
    setLoading(true); setError('')
    try { setBookings(await bookingService.getMyBookings()) }
    catch (err) { setError(getBookingsLoadError(err)) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchBookings() }, [fetchBookings])

  async function cancelBooking(booking) {
    const id = booking._id || booking.id || booking.bookingId
    if (!id || !window.confirm('Cancel this unpaid reservation? This releases the reserved seats. Paid and confirmed trips are not eligible for customer cancellation under the current Safar policy.')) return
    setCancellingId(id); setActionError(''); setNotice('')
    try {
      await bookingService.cancelBooking(id)
      setNotice('Your cancellation request has been received.')
      await fetchBookings()
    } catch (err) { setActionError(getErrorMessage(err, 'Unable to cancel this booking.')) }
    finally { setCancellingId('') }
  }

  if (loading) return <Loaders message="Finding your journeys…" fullPage />
  return <main className="page-section"><div className="mx-auto max-w-5xl">
    <p className="eyebrow">Your Safar</p><h1 className="page-title mt-3">My bookings.</h1><p className="mt-3 text-muted">All your planned journeys, together in one place.</p>
    {notice && <p className="notice-success mt-6" role="status">{notice}</p>}
    {actionError && <p className="notice-error mt-4" role="alert">{actionError}</p>}
    {error ? <div className="mt-8"><div className="notice-error" role="alert">{error}</div><Button className="mt-4" onClick={fetchBookings}>Try again</Button></div> : bookings.length === 0 ? <div className="mt-10"><EmptyState title="Your next adventure awaits" message="You don't have any bookings yet. Find a journey that feels like yours." actionLabel="Explore journeys" actionTo="/trips" /></div> : <div className="mt-9 space-y-4">{bookings.map((booking) => {
      const id = booking._id || booking.id || booking.bookingId
      const trip = booking.trip || booking.tripId || booking.departure?.trip || {}
      const departure = booking.departure || booking.departureId || {}
      const title = trip?.title || booking.tripTitle || 'Safar journey'
      const status = String(booking.status || 'pending').replaceAll('_', ' ')
      const paymentStatus = String(booking.paymentStatus || 'pending').toLowerCase()
      const statusMessage = booking.status === 'confirmed' && paymentStatus === 'paid'
        ? 'Your booking is confirmed! Your tickets are ready.'
        : paymentStatus === 'refund_failed'
          ? 'Your refund has not completed yet. Safar is reviewing the payment-provider response.'
        : booking.status === 'refund_pending' || paymentStatus === 'refund_pending'
          ? 'Your refund is being processed.'
          : booking.status === 'refunded' || paymentStatus === 'refunded'
            ? 'Your refund has been successfully processed.'
            : booking.status === 'expired'
              ? 'Your reservation expired because payment was not completed in time.'
        : booking.status === 'cancelled'
          ? 'This booking has been cancelled.'
              : booking.status === 'failed' || paymentStatus === 'failed'
                ? 'Your payment could not be completed. Your booking has not been confirmed.'
                  : booking.status === 'pending'
                    ? 'Your payment is being processed. Please wait while we confirm your booking.'
                    : ''
      const seats = booking.numberOfSeats ?? booking.numberOfTravellers ?? booking.travellers ?? booking.guests ?? 1
      const date = departure?.startDate || departure?.departureDate || booking.startDate
      const price = booking.totalPrice ?? booking.totalAmount ?? booking.amount
      const canCancel = booking.status === 'pending' && paymentStatus === 'pending'
      return <article key={id} className="panel">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div><p className="eyebrow">Booking reference</p><p className="mt-1 break-all text-xs font-semibold text-muted">{booking.bookingReference || booking.bookingId || id || 'Pending reference'}</p><h2 className="mt-3 font-heading text-2xl font-semibold text-forest">{title}</h2></div><span className={`status-pill ${String(booking.status).toLowerCase() === 'confirmed' ? 'status-pill-success' : ''}`}>{status}</span></div>
        <div className="mt-6 grid gap-4 border-t border-forest/10 pt-5 sm:grid-cols-3"><div className="flex items-start gap-3"><CalendarDays size={18} className="mt-0.5 text-terracotta-dark"/><div><p className="text-xs font-semibold text-muted">Departure</p><p className="mt-1 text-sm font-semibold text-charcoal">{date ? formatDate(date) : 'To be confirmed'}</p></div></div><div className="flex items-start gap-3"><Users size={18} className="mt-0.5 text-terracotta-dark"/><div><p className="text-xs font-semibold text-muted">Travellers</p><p className="mt-1 text-sm font-semibold text-charcoal">{seats}</p></div></div><div className="flex items-start gap-3"><Ticket size={18} className="mt-0.5 text-terracotta-dark"/><div><p className="text-xs font-semibold text-muted">Total</p><p className="mt-1 text-sm font-semibold text-charcoal">{price != null ? formatCurrency(price) : 'See booking details'}</p></div></div></div>
        {statusMessage && <p className={`mt-5 text-sm font-medium leading-6 ${booking.status === 'confirmed' || paymentStatus === 'refunded' ? 'notice-success' : booking.status === 'refund_pending' || paymentStatus === 'refund_failed' ? 'notice-warning' : 'text-muted'}`} role="status">{statusMessage}</p>}
        {canCancel && <p className="mt-4 text-xs leading-5 text-muted">Only an unpaid pending reservation can be cancelled online. Safar checks payment status before releasing seats; no cancellation fee applies to an unpaid reservation. Confirmed trips are not eligible under the current Safar policy.</p>}
        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-forest/10 pt-5">{trip?.slug && <Link to={`/trips/${trip.slug}`} className="rounded-full border border-forest/20 px-4 py-2 text-sm font-bold text-forest hover:bg-forest/5">View trip</Link>}{canCancel && <Button variant="outline" size="sm" disabled={Boolean(cancellingId)} loading={cancellingId === id} onClick={() => cancelBooking(booking)}><XCircle size={15}/> Cancel booking</Button>}</div>
      </article>
    })}</div>}
  </div></main>
}

export default MyBookings
