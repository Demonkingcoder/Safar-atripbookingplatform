import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { CalendarDays, Users, Ticket, XCircle } from 'lucide-react'
import bookingService from '../services/bookingService'
import Loaders from '../component/ui/Loaders'
import Button from '../component/ui/Button'
import EmptyState from '../component/ui/EmptyState'
import formatCurrency from '../utils/formatCurrency'
import { formatDate } from '../utils/formatDate'
import { useLanguage } from '../context/LanguageContext'
import { localizedApiError } from '../utils/localizedApiError'

function MyBookings() {
  const { t, locale } = useLanguage()
  const location = useLocation()
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [cancellingId, setCancellingId] = useState('')
  const [notice, setNotice] = useState(location.state?.messageKey ? t(location.state.messageKey) : (location.state?.message || ''))

  function getBookingsLoadError(err) {
    const status = err?.response?.status
    if (status === 401) return t('bookingHistory.session')
    if (status === 403) return t('bookingHistory.permission')
    if (status === 404) return t('bookingHistory.notFound')
    if (!err?.response) return t('bookingHistory.networkError')
    return t('bookingHistory.loadError')
  }

  const fetchBookings = useCallback(async () => {
    setLoading(true); setError('')
    try { setBookings(await bookingService.getMyBookings()) }
    catch (err) { setError(getBookingsLoadError(err)) }
    finally { setLoading(false) }
  }, [t])

  useEffect(() => { fetchBookings() }, [fetchBookings])

  async function cancelBooking(booking) {
    const id = booking._id || booking.id || booking.bookingId
    if (!id || !window.confirm(t('bookingHistory.cancelConfirm'))) return
    setCancellingId(id); setActionError(''); setNotice('')
    try {
      await bookingService.cancelBooking(id)
      setNotice(t('bookingHistory.cancelSuccess'))
      await fetchBookings()
    } catch (err) { setActionError(localizedApiError(err, t, 'bookingHistory.loadError')) }
    finally { setCancellingId('') }
  }

  if (loading) return <Loaders message={t('common.loading')} fullPage />
  return <main className="page-section"><div className="mx-auto max-w-5xl">
    <p className="eyebrow">{t('bookingHistory.eyebrow')}</p><h1 className="page-title mt-3">{t('bookingHistory.heading')}</h1><p className="mt-3 text-muted">{t('bookingHistory.intro')}</p>
    {notice && <p className="notice-success mt-6" role="status">{notice}</p>}
    {actionError && <p className="notice-error mt-4" role="alert">{actionError}</p>}
    {error ? <div className="mt-8"><div className="notice-error" role="alert">{error}</div><Button className="mt-4" onClick={fetchBookings}>{t('bookingHistory.tryAgain')}</Button></div> : bookings.length === 0 ? <div className="mt-10"><EmptyState title={t('bookingHistory.emptyHeading')} message={t('bookingHistory.emptyMessage')} actionLabel={t('bookingHistory.explore')} actionTo="/trips" /></div> : <div className="mt-9 space-y-4">{bookings.map((booking) => {
      const id = booking._id || booking.id || booking.bookingId
      const trip = booking.trip || booking.tripId || booking.departure?.trip || {}
      const departure = booking.departure || booking.departureId || {}
      const title = trip?.translations?.[locale === 'hi-IN' ? 'hi' : 'en']?.title || trip?.title || booking.tripTitle || t('bookingHistory.fallbackTitle')
      const statusKey = String(booking.status || 'pending')
      const status = t(`bookingHistory.statuses.${statusKey}`)
      const paymentStatus = String(booking.paymentStatus || 'pending').toLowerCase()
      const statusMessage = booking.status === 'confirmed' && paymentStatus === 'paid'
        ? t('bookingHistory.confirmed')
        : paymentStatus === 'refund_failed'
          ? t('bookingHistory.refundFailed')
        : booking.status === 'refund_pending' || paymentStatus === 'refund_pending'
          ? t('bookingHistory.refundPending')
          : booking.status === 'refunded' || paymentStatus === 'refunded'
            ? t('bookingHistory.refunded')
            : booking.status === 'expired'
              ? t('bookingHistory.expired')
        : booking.status === 'cancelled'
          ? t('bookingHistory.cancelled')
              : booking.status === 'failed' || paymentStatus === 'failed'
                ? t('bookingHistory.failed')
                  : booking.status === 'pending'
                    ? t('bookingHistory.pending')
                    : ''
      const seats = booking.numberOfSeats ?? booking.numberOfTravellers ?? booking.travellers ?? booking.guests ?? 1
      const date = departure?.startDate || departure?.departureDate || booking.startDate
      const price = booking.totalPrice ?? booking.totalAmount ?? booking.amount
      const canCancel = booking.status === 'pending' && paymentStatus === 'pending'
      return <article key={id} className="panel">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div><p className="eyebrow">{t('bookingHistory.reference')}</p><p className="mt-1 break-all text-xs font-semibold text-muted">{booking.bookingReference || booking.bookingId || id || t('bookingHistory.pendingReference')}</p><h2 className="mt-3 font-heading text-2xl font-semibold text-forest">{title}</h2></div><span className={`status-pill ${String(booking.status).toLowerCase() === 'confirmed' ? 'status-pill-success' : ''}`}>{status || statusKey.replaceAll('_', ' ')}</span></div>
        <div className="mt-6 grid gap-4 border-t border-forest/10 pt-5 sm:grid-cols-3"><div className="flex items-start gap-3"><CalendarDays size={18} className="mt-0.5 text-terracotta-dark"/><div><p className="text-xs font-semibold text-muted">{t('bookingHistory.departure')}</p><p className="mt-1 text-sm font-semibold text-charcoal">{date ? formatDate(date, {}, locale) : t('bookingHistory.toConfirm')}</p></div></div><div className="flex items-start gap-3"><Users size={18} className="mt-0.5 text-terracotta-dark"/><div><p className="text-xs font-semibold text-muted">{t('bookingHistory.travellers')}</p><p className="mt-1 text-sm font-semibold text-charcoal">{seats}</p></div></div><div className="flex items-start gap-3"><Ticket size={18} className="mt-0.5 text-terracotta-dark"/><div><p className="text-xs font-semibold text-muted">{t('bookingHistory.total')}</p><p className="mt-1 text-sm font-semibold text-charcoal">{price != null ? formatCurrency(price, 'INR', locale) : t('bookingHistory.details')}</p></div></div></div>
        {statusMessage && <p className={`mt-5 text-sm font-medium leading-6 ${booking.status === 'confirmed' || paymentStatus === 'refunded' ? 'notice-success' : booking.status === 'refund_pending' || paymentStatus === 'refund_failed' ? 'notice-warning' : 'text-muted'}`} role="status">{statusMessage}</p>}
        {canCancel && <p className="mt-4 text-xs leading-5 text-muted">{t('bookingHistory.cancelPolicy')}</p>}
        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-forest/10 pt-5">{trip?.slug && <Link to={`/trips/${trip.slug}`} className="rounded-full border border-forest/20 px-4 py-2 text-sm font-bold text-forest hover:bg-forest/5">{t('bookingHistory.viewTrip')}</Link>}{canCancel && <Button variant="outline" size="sm" disabled={Boolean(cancellingId)} loading={cancellingId === id} onClick={() => cancelBooking(booking)}><XCircle size={15}/> {t('bookingHistory.cancel')}</Button>}</div>
      </article>
    })}</div>}
  </div></main>
}

export default MyBookings
