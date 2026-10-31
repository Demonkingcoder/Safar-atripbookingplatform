import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Users, ShieldCheck } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import tripService from '../services/tripService'
import bookingService from '../services/bookingService'
import Loaders from '../component/ui/Loaders'
import Button from '../component/ui/Button'
import formatCurrency from '../utils/formatCurrency'
import { formatDate } from '../utils/formatDate'
import { useLanguage } from '../context/LanguageContext'
import { localizedApiError } from '../utils/localizedApiError'
import { pollPaymentStatus } from '../utils/paymentStatusPolling'

let razorpayScriptPromise

function loadRazorpayCheckout() {
  if (window.Razorpay) return Promise.resolve(true)
  if (!razorpayScriptPromise) {
    razorpayScriptPromise = new Promise((resolve) => {
      const script = document.createElement('script')
      script.src = 'https://checkout.razorpay.com/v1/checkout.js'
      script.async = true
      script.onload = () => resolve(Boolean(window.Razorpay))
      script.onerror = () => resolve(false)
      document.body.appendChild(script)
    })
  }
  return razorpayScriptPromise
}

function Booking() {
  const { t, language, locale } = useLanguage()
  const { slug } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [trip, setTrip] = useState(null)
  const [departures, setDepartures] = useState([])
  const [departureId, setDepartureId] = useState('')
  const [travellers, setTravellers] = useState(1)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [paymentWindowOpen, setPaymentWindowOpen] = useState(false)
  const [pendingBooking, setPendingBooking] = useState(null)
  const [paymentUncertain, setPaymentUncertain] = useState(false)
  const [checkingPayment, setCheckingPayment] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [error, setError] = useState('')
  const submitLockRef = useRef(false)
  const idempotencyRef = useRef({ selection: '', key: '' })

  async function refreshPaymentStatus(bookingId, initialResult = null) {
    setCheckingPayment(true)
    try {
      const { result } = await pollPaymentStatus(bookingService.reconcilePayment, bookingId, { initialResult })
      const booking = result?.booking
      const paymentState = result?.paymentStatus || booking?.paymentStatus
      if (booking?.status === 'confirmed' && paymentState === 'paid') {
        setPaymentUncertain(false)
        navigate('/my-bookings', { replace: true, state: { messageKey: 'booking.success' } })
      } else if (['refund_pending', 'refund_failed'].includes(paymentState)) {
        setPendingBooking(null)
        setPaymentUncertain(false)
        idempotencyRef.current = { selection: '', key: '' }
        setError(paymentState === 'refund_failed' ? t('booking.refundFailed') : t('booking.refundPending'))
      } else if (paymentState === 'failed' || ['failed', 'expired', 'cancelled'].includes(booking?.status)) {
        setPendingBooking(null)
        setPaymentUncertain(false)
        idempotencyRef.current = { selection: '', key: '' }
        setError(booking?.status === 'expired' ? t('booking.expired') : t('booking.failure'))
      } else {
        setPaymentUncertain(true)
        setError(t('booking.paymentUncertain'))
      }
    } finally {
      setCheckingPayment(false)
    }
  }

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true); setError('')
      try {
        const tripData = await tripService.getTripBySlug(slug)
        const tripId = tripData?._id || tripData?.id
        if (!tripId) throw new Error('The trip response is missing its ID.')
        const departureList = await tripService.getDepartures(slug)
        if (!active) return
        setTrip(tripData)
        setDepartures(departureList)
        setDepartureId(departureList[0]?._id || departureList[0]?.id || '')
      } catch (err) {
        if (active) {
          const status = err?.response?.status
          const serverMessage = err?.response?.data?.message
          const message = serverMessage
            || (status === 404 ? "We couldn't find this trip or its departure options."
              : !err?.response ? 'Unable to reach Safar. Check your connection and try again.'
                : status >= 500 ? 'We could not load this trip and its departures right now. Please try again.'
                  : 'Could not load this trip and its departures. Please try again.')
          setError(message)
        }
      } finally { if (active) setLoading(false) }
    }
    load()
    return () => { active = false }
  }, [slug])

  const selected = useMemo(() => departures.find((item) => (item._id || item.id) === departureId), [departures, departureId])
  const price = selected?.price ?? 0
  const total = Number(price || 0) * Number(travellers)

  async function handleSubmit(event) {
    event.preventDefault()
    if (submitLockRef.current || paymentWindowOpen || checkingPayment || paymentUncertain) return
    setError('')
    if (!departureId) { setError(t('booking.chooseValidDeparture')); return }
    const travellerCount = Number(travellers)
    const availableSeats = Number(selected?.availableSeats ?? selected?.seatsAvailable)
    if (!Number.isInteger(travellerCount) || travellerCount < 1 || travellerCount > 10) {
      setError(t('booking.chooseValidDeparture'))
      return
    }
    if (Number.isFinite(availableSeats) && travellerCount > availableSeats) {
      setError(t('booking.chooseValidDeparture'))
      return
    }

    const selection = `${departureId}:${travellerCount}`
    if (idempotencyRef.current.selection !== selection) {
      idempotencyRef.current = {
        selection,
        key: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      }
    }

    submitLockRef.current = true
    setSubmitting(true)
    try {
      const matchingPendingBooking = pendingBooking?.selection === selection ? pendingBooking : null
      let bookingId = matchingPendingBooking?.id
      if (!bookingId) {
        const response = await bookingService.createBooking(
          { departureId, numberOfSeats: travellerCount, notificationLanguage: language },
          idempotencyRef.current.key,
        )
        const booking = response?.booking ?? response?.data?.booking ?? response?.data ?? response
        bookingId = booking?._id || booking?.id || booking?.bookingId
        if (!bookingId) throw new Error('The server did not return a booking reference. Please try again.')
        if (booking.paymentStatus === 'paid' && booking.status === 'confirmed') {
          navigate('/my-bookings', { replace: true, state: { messageKey: 'booking.success' } })
          return
        }
        const nextPendingBooking = { id: bookingId, selection }
        setPendingBooking(nextPendingBooking)
      }

      const paymentOrder = await bookingService.createPaymentOrder(bookingId)
      if (!paymentOrder?.key_id || !paymentOrder?.order_id || !paymentOrder?.amount || !paymentOrder?.currency) {
        throw new Error('The server returned incomplete payment details. Please try again.')
      }
      const checkoutReady = await loadRazorpayCheckout()
      if (!checkoutReady) throw new Error('Secure checkout could not be loaded. Check your connection and retry.')

      const checkout = new window.Razorpay({
        key: paymentOrder.key_id,
        amount: paymentOrder.amount,
        currency: paymentOrder.currency,
        order_id: paymentOrder.order_id,
        name: 'Safar',
        description: `${trip?.translations?.[language]?.title || trip?.title || t('trip.nextAdventure')} · ${travellerCount} ${travellerCount === 1 ? t('booking.traveller') : t('booking.travellersPlural')}`,
        prefill: { name: user?.fullName || '', email: user?.email || '' },
        handler: async (paymentResponse) => {
          submitLockRef.current = true
          setPaymentWindowOpen(false)
          setSubmitting(true)
          setError('')
          try {
            const result = await bookingService.verifyPayment(bookingId, paymentResponse)
            await refreshPaymentStatus(bookingId, result)
          } catch {
            await refreshPaymentStatus(bookingId)
          } finally {
            setSubmitting(false)
            submitLockRef.current = false
          }
        },
        modal: {
          ondismiss: async () => {
            setPaymentWindowOpen(false)
            await refreshPaymentStatus(bookingId)
          },
        },
      })
      checkout.on('payment.failed', async () => {
        setPaymentWindowOpen(false)
        await refreshPaymentStatus(bookingId)
      })
      setPaymentWindowOpen(true)
      checkout.open()
    } catch (err) {
      setPaymentWindowOpen(false)
      setError(localizedApiError(err, t, 'booking.paymentPrepareError'))
    } finally {
      setSubmitting(false)
      submitLockRef.current = false
    }
  }

  async function cancelPendingBooking() {
    if (!pendingBooking || cancelling || submitLockRef.current) return
    setCancelling(true)
    setError('')
    try {
      await bookingService.cancelBooking(pendingBooking.id)
      setPendingBooking(null)
      setPaymentUncertain(false)
      idempotencyRef.current = { selection: '', key: '' }
    } catch (err) {
      setError(localizedApiError(err, t, 'booking.cancelError'))
    } finally {
      setCancelling(false)
    }
  }

  if (loading) return <Loaders message={t('common.loading')} fullPage />
  if (error && !trip) return <main className="page-section"><div className="mx-auto max-w-2xl rounded-3xl border border-red-200 bg-white p-8 text-center"><h1 className="font-heading text-3xl font-semibold text-forest">{t('booking.unavailable')}</h1><p role="alert" className="mt-3 text-sm text-red-700">{error}</p><Link to={`/trips/${slug}`} className="mt-6 inline-flex rounded-full bg-forest px-5 py-3 font-bold text-white">{t('booking.backTrip')}</Link></div></main>

  return <main className="page-section"><div className="mx-auto max-w-5xl"><Link to={`/trips/${slug}`} className="text-sm font-bold text-forest underline underline-offset-4">← {t('booking.backDetails')}</Link><p className="eyebrow mt-7">{t('booking.eyebrow')}</p><h1 className="page-title mt-3">{t('booking.heading')}</h1><p className="mt-3 text-muted">{t('booking.intro')}</p>
    <div className="mt-8 grid gap-7 lg:grid-cols-[1fr_340px]">
      <form onSubmit={handleSubmit} className="panel space-y-6">
        <div><h2 className="font-heading text-2xl font-semibold text-forest">{trip?.translations?.[language]?.title || trip?.title || t('trip.nextAdventure')}</h2><p className="mt-2 text-sm leading-6 text-muted">{t('booking.review')}</p></div>
        <div className="field"><label htmlFor="departure">{t('booking.departure')}</label><select id="departure" required value={departureId} onChange={(e) => setDepartureId(e.target.value)} disabled={!departures.length || Boolean(pendingBooking)}><option value="">{departures.length ? t('booking.choose') : t('booking.noDepartures')}</option>{departures.map((item) => { const id = item._id || item.id; const date = item.startDate || item.departureDate || item.date; const seats = item.availableSeats ?? item.seatsAvailable; return <option key={id} value={id} disabled={Number(seats) <= 0}>{formatDate(date, {}, locale)}{seats != null ? ` · ${t('booking.seatsLeft', { count: seats })}` : ''}</option> })}</select></div>
        <div className="field"><label htmlFor="travellers">{t('booking.travellers')}</label><div className="flex items-center gap-3"><Users size={18} className="text-forest" /><select id="travellers" value={travellers} onChange={(e) => setTravellers(Number(e.target.value))} className="flex-1" disabled={Boolean(pendingBooking)}>{Array.from({ length: Math.max(1, Math.min(10, Number(selected?.availableSeats ?? 10))) }, (_, index) => index + 1).map((count) => <option key={count} value={count}>{count} {count === 1 ? t('booking.traveller') : t('booking.travellersPlural')}</option>)}</select></div></div>
        {error && <p className="notice-error" role="alert">{error}</p>}
        {!departures.length && <p className="notice-warning">{t('booking.noDates')}</p>}
        <Button type="submit" size="lg" className="w-full" loading={submitting || paymentWindowOpen || checkingPayment} disabled={!departures.length || !departureId || cancelling || checkingPayment || paymentUncertain}>{pendingBooking ? t('booking.retryPayment') : t('booking.continuePayment')}</Button>
        {paymentUncertain && pendingBooking && <Button type="button" variant="outline" className="w-full" loading={checkingPayment} disabled={submitting || paymentWindowOpen} onClick={() => refreshPaymentStatus(pendingBooking.id)}>{checkingPayment ? t('booking.checkingStatus') : t('booking.checkStatus')}</Button>}
        {pendingBooking && <Button type="button" variant="outline" className="w-full" loading={cancelling} disabled={submitting || paymentWindowOpen || checkingPayment} onClick={cancelPendingBooking}>{t('booking.cancelPending')}</Button>}
        <p className="flex items-start gap-2 text-xs leading-5 text-muted"><ShieldCheck size={16} className="mt-0.5 shrink-0 text-forest" />{t('booking.reserved')}</p>
      </form>
      <aside className="panel h-fit bg-forest text-white"><p className="text-xs font-bold uppercase tracking-[0.18em] text-terracotta-light">{t('booking.summary')}</p><h2 className="mt-3 font-heading text-2xl font-semibold text-white">{trip?.translations?.[language]?.title || trip?.title || t('trip.nextAdventure')}</h2><div className="mt-6 border-b border-white/20 pb-4"><span className="text-sm text-white/80">{t('booking.departure')}</span><strong className="mt-1 block">{selected?.startDate ? formatDate(selected.startDate, {}, locale) : t('booking.chooseDepartureHint')}</strong>{selected?.endDate && <span className="mt-1 block text-xs text-white/75">{t('booking.through', { date: formatDate(selected.endDate, {}, locale) })}</span>}</div><div className="mt-4 flex items-center justify-between gap-3 border-b border-white/20 pb-4"><span className="text-sm text-white/80">{t('booking.travellers')}</span><strong>{travellers}</strong></div><div className="mt-4 flex items-center justify-between gap-3 border-b border-white/20 pb-4"><span className="text-sm text-white/80">{t('booking.pricePerTraveller')}</span><strong>{formatCurrency(price, 'INR', locale)}</strong></div><div className="mt-5 flex items-end justify-between gap-3"><span className="text-sm text-white/80">{t('booking.total')}</span><strong className="font-heading text-2xl text-white">{formatCurrency(total, 'INR', locale)}</strong></div><p className="mt-4 text-xs leading-5 text-white/70">{t('booking.paymentConfirm')}</p></aside>
    </div>
  </div></main>
}

export default Booking
