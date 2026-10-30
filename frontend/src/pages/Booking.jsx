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
import { getErrorMessage } from '../services/api'

let razorpayScriptPromise
const paymentFailureMessage = 'Your payment could not be completed. Your booking has not been confirmed and no tickets have been issued. Please try again.'

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
  const [cancelling, setCancelling] = useState(false)
  const [error, setError] = useState('')
  const submitLockRef = useRef(false)
  const idempotencyRef = useRef({ selection: '', key: '' })

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
  const price = selected?.price ?? trip?.basePrice ?? trip?.price ?? trip?.pricing?.pricePerPerson ?? trip?.pricing?.basePrice ?? (typeof trip?.pricing === 'number' ? trip.pricing : 0)
  const total = Number(price || 0) * Number(travellers)

  async function handleSubmit(event) {
    event.preventDefault()
    if (submitLockRef.current || paymentWindowOpen) return
    setError('')
    if (!departureId) { setError('Please choose an available departure date.'); return }
    const travellerCount = Number(travellers)
    const availableSeats = Number(selected?.availableSeats ?? selected?.seatsAvailable)
    if (!Number.isInteger(travellerCount) || travellerCount < 1 || travellerCount > 10) {
      setError('Choose between 1 and 10 travellers.')
      return
    }
    if (Number.isFinite(availableSeats) && travellerCount > availableSeats) {
      setError('There are not enough seats left for that many travellers. Choose fewer travellers or another departure.')
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
          { departureId, numberOfSeats: travellerCount },
          idempotencyRef.current.key,
        )
        const booking = response?.booking ?? response?.data?.booking ?? response?.data ?? response
        bookingId = booking?._id || booking?.id || booking?.bookingId
        if (!bookingId) throw new Error('The server did not return a booking reference. Please try again.')
        if (booking.paymentStatus === 'paid' || booking.status === 'confirmed') {
          navigate('/my-bookings', { replace: true, state: { message: 'This booking has already been paid and confirmed.' } })
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
        description: `${trip?.title || 'Trip booking'} · ${travellerCount} ${travellerCount === 1 ? 'traveller' : 'travellers'}`,
        prefill: { name: user?.fullName || '', email: user?.email || '' },
        handler: async (paymentResponse) => {
          submitLockRef.current = true
          setPaymentWindowOpen(false)
          setSubmitting(true)
          setError('')
          try {
            const result = await bookingService.verifyPayment(bookingId, paymentResponse)
            if (result?.booking?.status === 'confirmed' || result?.status === 'confirmed') {
              navigate('/my-bookings', { replace: true, state: { message: 'Your booking is confirmed! Your tickets are ready.' } })
            } else if (['refund_pending', 'refund_failed'].includes(result?.paymentStatus || result?.booking?.paymentStatus)) {
              setPendingBooking(null)
              idempotencyRef.current = { selection: '', key: '' }
              setError(result?.paymentStatus === 'refund_failed' || result?.booking?.paymentStatus === 'refund_failed'
                ? 'The payment was captured after the reservation closed. The refund is not yet complete and Safar is reviewing it; no ticket has been issued.'
                : 'The payment was captured after the reservation closed. Your refund is being processed; no ticket has been issued.')
            } else {
              setError('Your payment is being processed. Please wait while we confirm your booking.')
            }
          } catch {
            try {
              const state = await bookingService.reconcilePayment(bookingId)
              const bookingState = state?.booking?.status
              const paymentState = state?.paymentStatus || state?.booking?.paymentStatus
              if (bookingState === 'confirmed' || paymentState === 'paid') {
                navigate('/my-bookings', { replace: true, state: { message: 'Your booking is confirmed! Your tickets are ready.' } })
              } else if (['refund_pending', 'refund_failed'].includes(paymentState)) {
                setPendingBooking(null)
                idempotencyRef.current = { selection: '', key: '' }
                setError(paymentState === 'refund_failed'
                  ? 'The payment was captured after the reservation closed. The refund is not yet complete and Safar is reviewing it; no ticket has been issued.'
                  : 'The payment was captured after the reservation closed. Your refund is being processed; no ticket has been issued.')
              } else if (paymentState === 'failed' || ['failed', 'expired', 'cancelled'].includes(bookingState)) {
                setPendingBooking(null)
                idempotencyRef.current = { selection: '', key: '' }
                setError(paymentFailureMessage)
              } else {
                setError('Your payment is being processed. Please wait while we confirm your booking. Do not pay again until the status is updated.')
              }
            } catch {
              setError('We could not confirm the payment status with the provider. Your booking is not confirmed yet; check My Bookings before retrying.')
            }
          } finally {
            setSubmitting(false)
            submitLockRef.current = false
          }
        },
        modal: {
          ondismiss: async () => {
            setPaymentWindowOpen(false)
            try {
              const state = await bookingService.reconcilePayment(bookingId)
              const bookingState = state?.booking?.status
              const paymentState = state?.paymentStatus || state?.booking?.paymentStatus
              if (bookingState === 'confirmed' || paymentState === 'paid') {
                navigate('/my-bookings', { replace: true, state: { message: 'Your booking is confirmed! Your tickets are ready.' } })
              } else if (paymentState === 'failed' || ['failed', 'expired', 'cancelled'].includes(bookingState)) {
                setPendingBooking(null)
                idempotencyRef.current = { selection: '', key: '' }
                setError(paymentFailureMessage)
              } else {
                setError('Your payment is being processed. Please wait while we confirm your booking.')
              }
            } catch {
              setError('Your payment status is still being confirmed. Your booking has not been marked successful; please check My Bookings before retrying.')
            }
          },
        },
      })
      checkout.on('payment.failed', async () => {
        setPaymentWindowOpen(false)
        try {
          const state = await bookingService.reconcilePayment(bookingId)
          const bookingState = state?.booking?.status
          const paymentState = state?.paymentStatus || state?.booking?.paymentStatus
          if (bookingState === 'confirmed' || paymentState === 'paid') {
            navigate('/my-bookings', { replace: true, state: { message: 'Your booking is confirmed! Your tickets are ready.' } })
          } else if (paymentState === 'failed' || ['failed', 'expired', 'cancelled'].includes(bookingState)) {
            setPendingBooking(null)
            idempotencyRef.current = { selection: '', key: '' }
            setError(paymentFailureMessage)
          } else if (['refund_pending', 'refund_failed'].includes(paymentState)) {
            setPendingBooking(null)
            idempotencyRef.current = { selection: '', key: '' }
            setError(paymentState === 'refund_failed'
              ? 'The payment was captured after the reservation closed. The refund is not yet complete and Safar is reviewing it; no ticket has been issued.'
              : 'The payment was captured after the reservation closed. Your refund is being processed; no ticket has been issued.')
          } else {
            setError('Your payment is being processed. Please wait while we confirm your booking.')
          }
        } catch {
          setError('Your payment status is still being confirmed. Your booking has not been marked successful; please check My Bookings before retrying.')
        }
      })
      setPaymentWindowOpen(true)
      checkout.open()
    } catch (err) {
      setPaymentWindowOpen(false)
      setError(err?.response?.data?.message || (!err?.response ? 'Unable to reach Safar. Check your connection and try again.' : getErrorMessage(err, 'We could not prepare your booking and payment. Please try again.')))
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
      idempotencyRef.current = { selection: '', key: '' }
    } catch (err) {
      setError(err?.response?.data?.message || 'We could not cancel this pending booking. Please try again.')
    } finally {
      setCancelling(false)
    }
  }

  if (loading) return <Loaders message="Preparing your booking…" fullPage />
  if (error && !trip) return <main className="page-section"><div className="mx-auto max-w-2xl rounded-3xl border border-red-200 bg-white p-8 text-center"><h1 className="font-heading text-3xl font-semibold text-forest">Booking unavailable</h1><p role="alert" className="mt-3 text-sm text-red-700">{error}</p><Link to={`/trips/${slug}`} className="mt-6 inline-flex rounded-full bg-forest px-5 py-3 font-bold text-white">Back to trip</Link></div></main>

  return <main className="page-section"><div className="mx-auto max-w-5xl"><Link to={`/trips/${slug}`} className="text-sm font-bold text-forest underline underline-offset-4">← Back to trip details</Link><p className="eyebrow mt-7">Make it official</p><h1 className="page-title mt-3">Book your journey.</h1><p className="mt-3 text-muted">Choose a departure and tell us how many people are travelling.</p>
    <div className="mt-8 grid gap-7 lg:grid-cols-[1fr_340px]">
      <form onSubmit={handleSubmit} className="panel space-y-6">
        <div><h2 className="font-heading text-2xl font-semibold text-forest">{trip?.title || 'Your journey'}</h2><p className="mt-2 text-sm leading-6 text-muted">Review the details carefully before submitting your booking.</p></div>
        <div className="field"><label htmlFor="departure">Departure date</label><select id="departure" required value={departureId} onChange={(e) => setDepartureId(e.target.value)} disabled={!departures.length || Boolean(pendingBooking)}><option value="">{departures.length ? 'Choose a departure' : 'No open departures available'}</option>{departures.map((item) => { const id = item._id || item.id; const date = item.startDate || item.departureDate || item.date; const seats = item.availableSeats ?? item.seatsAvailable; return <option key={id} value={id} disabled={Number(seats) <= 0}>{formatDate(date)}{seats != null ? ` · ${seats} seats left` : ''}</option> })}</select></div>
        <div className="field"><label htmlFor="travellers">Travellers</label><div className="flex items-center gap-3"><Users size={18} className="text-forest" /><select id="travellers" value={travellers} onChange={(e) => setTravellers(Number(e.target.value))} className="flex-1" disabled={Boolean(pendingBooking)}>{Array.from({ length: Math.max(1, Math.min(10, Number(selected?.availableSeats ?? 10))) }, (_, index) => index + 1).map((count) => <option key={count} value={count}>{count} {count === 1 ? 'traveller' : 'travellers'}</option>)}</select></div></div>
        {error && <p className="notice-error" role="alert">{error}</p>}
        {!departures.length && <p className="notice-warning">There are currently no open departure dates for this trip. You can return to trip details or explore other journeys.</p>}
        <Button type="submit" size="lg" className="w-full" loading={submitting || paymentWindowOpen} disabled={!departures.length || !departureId || cancelling}>{pendingBooking ? 'Retry secure payment' : 'Continue to secure payment'}</Button>
        {pendingBooking && <Button type="button" variant="outline" className="w-full" loading={cancelling} disabled={submitting || paymentWindowOpen} onClick={cancelPendingBooking}>Cancel pending booking and release seats</Button>}
        <p className="flex items-start gap-2 text-xs leading-5 text-muted"><ShieldCheck size={16} className="mt-0.5 shrink-0 text-forest" />Your seats remain reserved only while this booking is pending. A booking is confirmed after Safar verifies payment.</p>
      </form>
      <aside className="panel h-fit bg-forest text-white"><p className="text-xs font-bold uppercase tracking-[0.18em] text-terracotta-light">Booking summary</p><h2 className="mt-3 font-heading text-2xl font-semibold text-white">{trip?.title || 'Your trip'}</h2><div className="mt-6 border-b border-white/20 pb-4"><span className="text-sm text-white/80">Departure</span><strong className="mt-1 block">{selected?.startDate ? formatDate(selected.startDate) : 'Choose a departure'}</strong>{selected?.endDate && <span className="mt-1 block text-xs text-white/75">Through {formatDate(selected.endDate)}</span>}</div><div className="mt-4 flex items-center justify-between gap-3 border-b border-white/20 pb-4"><span className="text-sm text-white/80">Travellers</span><strong>{travellers}</strong></div><div className="mt-4 flex items-center justify-between gap-3 border-b border-white/20 pb-4"><span className="text-sm text-white/80">Price per traveller</span><strong>{formatCurrency(price)}</strong></div><div className="mt-5 flex items-end justify-between gap-3"><span className="text-sm text-white/80">Total</span><strong className="font-heading text-2xl text-white">{formatCurrency(total)}</strong></div><p className="mt-4 text-xs leading-5 text-white/70">Booking confirmation follows secure payment verification.</p></aside>
    </div>
  </div></main>
}

export default Booking
