const isSettled = (result) => {
  const booking = result?.booking
  const paymentStatus = result?.paymentStatus || booking?.paymentStatus
  return (booking?.status === 'confirmed' && paymentStatus === 'paid')
    || ['failed', 'expired', 'cancelled', 'refunded'].includes(booking?.status)
    || ['failed', 'refund_pending', 'refund_failed', 'refunded'].includes(paymentStatus)
}

export async function pollPaymentStatus(reconcile, bookingId, {
  initialResult = null,
  attempts = 4,
  delayMs = 1200,
  wait = (duration) => new Promise((resolve) => setTimeout(resolve, duration)),
} = {}) {
  let result = initialResult
  let error = null
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (attempt > 0) await wait(delayMs)
    try {
      result = await reconcile(bookingId)
      error = null
    } catch (nextError) {
      error = nextError
    }
    if (isSettled(result)) break
  }
  return { result, error, settled: isSettled(result) }
}
