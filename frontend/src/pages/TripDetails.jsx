
import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion, useScroll, useTransform } from 'motion/react'
import tripService from '../services/tripService'
import Loaders from '../component/ui/Loaders'
import formatCurrency from '../utils/formatCurrency'

function TripDetails() {
  const { slug } = useParams()
  const heroRef = useRef(null)
  const reduceMotion = useReducedMotion()
  const supportsHover = typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] })
  const heroImageY = useTransform(scrollYProgress, [0, 1], [0, 48])

  const [trip, setTrip] = useState(null)
  const [selectedDayIndex, setSelectedDayIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true

    async function fetchTrip() {
      setLoading(true)
      setError('')
      setTrip(null)

      try {
        const response = await tripService.getTripBySlug(slug)

        // Support common response wrappers until we verify the API contract.
        const result =
          response?.data?.trip ??
          response?.trip ??
          response?.data ??
          response

        if (!result || typeof result !== 'object' || Array.isArray(result)) {
          throw new Error('The trip response was not in the expected format.')
        }

        if (active) setTrip(result)
      } catch (err) {
        if (active) {
          setError(
            err.response?.data?.message ||
              'Unable to load this trip. Please try again.'
          )
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    if (slug) fetchTrip()

    return () => {
      active = false
    }
  }, [slug])

  if (loading) {
    return <Loaders message="Preparing your journey..." fullPage />
  }

  if (error || !trip) {
    return (
      <main className="mx-auto min-h-[60vh] max-w-3xl px-5 py-20 text-center">
        <h1 className="font-heading text-3xl font-semibold text-forest">
          We couldn't find this journey.
        </h1>

        <p className="mt-4 text-sm text-charcoal/65">
          {error || 'This trip may no longer be available.'}
        </p>

        <div className="mt-7">
          <Link
            to="/trips"
            className="font-semibold text-forest underline underline-offset-4"
          >
            Back to all trips
          </Link>
        </div>
      </main>
    )
  }

  const imageUrl = Array.isArray(trip.images)
    ? trip.images[0]
    : trip.images

  const price =
    trip.basePrice ?? trip.price ??
    (typeof trip.pricing === 'number'
      ? trip.pricing
      : trip.pricing?.pricePerPerson ?? trip.pricing?.basePrice)

  const inclusions = Array.isArray(trip.inclusions)
    ? trip.inclusions
    : []

  const exclusions = Array.isArray(trip.exclusions)
    ? trip.exclusions
    : []

  const itinerary = Array.isArray(trip.itinerary)
    ? trip.itinerary
    : []

  return (
    <main className="min-h-screen bg-ivory">
      {/* Trip hero */}
      <section ref={heroRef} className="relative isolate overflow-hidden bg-forest">
        {imageUrl && (
          <motion.img
            src={imageUrl}
            alt={trip.title || 'Trip destination'}
            className="absolute inset-0 -z-20 h-full w-full object-cover"
            initial={reduceMotion ? false : { opacity: 0, scale: 1.08 }}
            animate={{ opacity: 1, scale: 1.04 }}
            transition={{ duration: reduceMotion ? 0 : 0.9, ease: [0.22, 1, 0.36, 1] }}
            style={supportsHover && !reduceMotion ? { y: heroImageY } : undefined}
          />
        )}

        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-forest/90 via-forest/65 to-forest/30" />

        <div className="mx-auto max-w-7xl px-5 py-20 text-ivory md:px-8 md:py-28">
          <motion.div initial={reduceMotion ? false : { opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}>
          <Link
            to="/trips"
            className="text-sm text-ivory/75 hover:text-white"
          >
            ← All trips
          </Link>

            <motion.h1 initial={reduceMotion ? false : { opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.72, delay: 0.1, ease: [0.22, 1, 0.36, 1] }} style={{ color: 'var(--color-ivory)' }} className="mt-8 max-w-4xl font-heading text-4xl font-semibold text-ivory sm:text-6xl">
            {trip.title || 'Your next adventure'}
          </motion.h1>

          {trip.description && (
            <motion.p initial={reduceMotion ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.58, delay: 0.2 }} className="mt-5 max-w-2xl text-base leading-7 text-ivory/80">
              {trip.description}
            </motion.p>
          )}

          <motion.div initial={reduceMotion ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.3 }} className="mt-7 flex flex-wrap gap-4 text-sm text-ivory/80">
            {trip.duration && <span>{trip.duration}</span>}
            {trip.destination && <span>{trip.destination}</span>}
          </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Trip information */}
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-12 md:px-8 md:py-16 lg:grid-cols-[1fr_340px]">
        <div className="space-y-12">
          {itinerary.length > 0 && (
            <section>
              <h2 className="font-heading text-3xl font-semibold text-forest">
                Your itinerary
              </h2>

              <motion.div initial={reduceMotion ? false : { opacity: 0, y: 16 }} whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.2 }} transition={{ duration: 0.5 }} className="mt-6">
                <div className="itinerary-tabs" role="tablist" aria-label="Choose an itinerary day">
                  {itinerary.map((day, index) => (
                    <button
                      key={day._id || day.day || index}
                      type="button"
                      role="tab"
                      id={`itinerary-tab-${index}`}
                      aria-selected={selectedDayIndex === index}
                      aria-controls="itinerary-panel"
                      onClick={() => setSelectedDayIndex(index)}
                      className={`itinerary-tab ${selectedDayIndex === index ? 'is-active' : ''}`}
                    >
                      <span className="itinerary-tab-number">{String(index + 1).padStart(2, '0')}</span>
                      <span className="itinerary-tab-title">{day.title || day.heading || `Day ${index + 1}`}</span>
                    </button>
                  ))}
                  <motion.span className="itinerary-progress" animate={{ scaleX: (selectedDayIndex + 1) / itinerary.length }} transition={{ duration: 0.35, ease: 'easeOut' }} />
                </div>
                <AnimatePresence mode="wait" initial={false}>
                  {itinerary[selectedDayIndex] && (() => {
                    const day = itinerary[selectedDayIndex]
                    const activities = Array.isArray(day.activities) ? day.activities : []
                    return (
                      <motion.article
                        key={day._id || day.day || selectedDayIndex}
                        id="itinerary-panel"
                        role="tabpanel"
                        aria-labelledby={`itinerary-tab-${selectedDayIndex}`}
                        initial={reduceMotion ? false : { opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
                        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                        className="itinerary-day-panel rounded-b-2xl border border-t-0 border-forest/10 bg-white p-5 sm:p-7"
                      >
                        <p className="text-xs font-bold uppercase tracking-[0.18em] text-terracotta-dark">Day {selectedDayIndex + 1}</p>
                        <h3 className="mt-2 font-heading text-2xl font-semibold text-forest">{day.title || day.heading || `Day ${selectedDayIndex + 1}`}</h3>
                        {(day.description || day.details) && <p className="mt-3 text-sm leading-7 text-charcoal/70">{day.description || day.details}</p>}
                        {activities.length > 0 && (
                          <ul className="mt-5 space-y-3">
                            {activities.map((activity, index) => <motion.li key={activity._id || activity.title || index} initial={reduceMotion ? false : { opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.25, delay: reduceMotion ? 0 : index * 0.06 }} className="flex gap-3 text-sm text-charcoal/80"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-terracotta" aria-hidden="true" />{typeof activity === 'string' ? activity : activity.title || activity.name || activity.description}</motion.li>)}
                          </ul>
                        )}
                      </motion.article>
                    )
                  })()}
                </AnimatePresence>
              </motion.div>
            </section>
          )}

          {inclusions.length > 0 && (
            <motion.section initial={reduceMotion ? false : { opacity: 0, y: 18 }} whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.25 }} transition={{ duration: 0.5 }}>
              <h2 className="font-heading text-3xl font-semibold text-forest">
                What's included
              </h2>

              <ul className="mt-5 space-y-3">
                {inclusions.map((item, index) => (
                  <motion.li key={index} initial={reduceMotion ? false : { opacity: 0, x: -8 }} whileInView={reduceMotion ? undefined : { opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.3, delay: index * 0.04 }} className="flex gap-3 text-sm text-charcoal/75">
                    <span className="text-forest" aria-hidden="true">✓</span>
                    {typeof item === 'string' ? item : item.title || item.name}
                  </motion.li>
                ))}
              </ul>
            </motion.section>
          )}

          {exclusions.length > 0 && (
            <motion.section initial={reduceMotion ? false : { opacity: 0, y: 18 }} whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.25 }} transition={{ duration: 0.5 }}>
              <h2 className="font-heading text-3xl font-semibold text-forest">
                What's not included
              </h2>

              <ul className="mt-5 space-y-3">
                {exclusions.map((item, index) => (
                  <motion.li key={index} initial={reduceMotion ? false : { opacity: 0, x: -8 }} whileInView={reduceMotion ? undefined : { opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.3, delay: index * 0.04 }} className="flex gap-3 text-sm text-charcoal/75">
                    <span className="text-terracotta-dark" aria-hidden="true">×</span>
                    {typeof item === 'string' ? item : item.title || item.name}
                  </motion.li>
                ))}
              </ul>
            </motion.section>
          )}
        </div>

        {/* Booking summary */}
        <motion.aside initial={reduceMotion ? false : { opacity: 0, y: 18 }} whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.2 }} transition={{ duration: 0.5 }} className="h-fit rounded-2xl border border-forest/10 bg-white p-6 lg:sticky lg:top-28">
          <p className="text-sm text-charcoal-light">Trip price</p>

          <motion.p initial={reduceMotion ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.32, duration: 0.4 }} className="mt-2 font-heading text-3xl font-semibold text-forest">
            {price != null ? formatCurrency(price) : 'See departure options'}
          </motion.p>

          <p className="mt-1 text-xs text-charcoal-light">
            Confirm the final price and availability before booking.
          </p>

          <Link to={`/trips/${slug}/book`} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-forest px-6 py-4 text-base font-bold text-white shadow-sm transition hover:bg-forest-dark focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-forest-light">
            Choose a departure <span aria-hidden="true">↗</span>
          </Link>
        </motion.aside>
      </div>
    </main>
  )
}

export default TripDetails
