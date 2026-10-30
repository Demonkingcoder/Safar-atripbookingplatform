
import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import TripCard from '../trips/TripCard';
import Loader from '../ui/Loaders.jsx';

function FeaturedTrips({
  trips = [],
  loading = false,
  error = '',
  onRetry,
}) {
  const reduceMotion = useReducedMotion()
  const carouselRef = useRef(null)
  const [activeIndex, setActiveIndex] = useState(0)

  function handleCarouselScroll() {
    const viewport = carouselRef.current
    if (!viewport) return
    const slides = Array.from(viewport.querySelectorAll('.featured-trip-slide'))
    const viewportLeft = viewport.getBoundingClientRect().left
    const nearest = slides.reduce((best, slide, index) => {
      const offset = Math.abs(slide.getBoundingClientRect().left - viewportLeft)
      return offset < best.offset ? { index, offset } : best
    }, { index: 0, offset: Infinity })
    setActiveIndex(nearest.index)
  }

  function goToSlide(index) {
    const viewport = carouselRef.current
    const slides = viewport ? Array.from(viewport.querySelectorAll('.featured-trip-slide')) : []
    const target = slides[index]
    if (!viewport || !target) return
    const left = target.getBoundingClientRect().left - viewport.getBoundingClientRect().left + viewport.scrollLeft
    viewport.scrollTo({ left, behavior: reduceMotion ? 'instant' : 'smooth' })
    setActiveIndex(index)
  }
  return (
    <section id="trips" className="bg-ivory px-5 py-16 sm:px-6 sm:py-20 md:px-8 md:py-24">
      <div className="mx-auto max-w-7xl">
        {/* Section heading */}
        <motion.div
          className="mb-8 flex flex-col gap-5 border-b border-forest/10 pb-7 sm:mb-10 sm:flex-row sm:items-end sm:justify-between"
          initial={reduceMotion ? false : { opacity: 0, y: 16 }}
          whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.35 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        >
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-terracotta-dark">
              Your next adventure
            </p>

            <h2 className="font-heading text-4xl font-semibold tracking-[-0.03em] text-forest sm:text-5xl">
              Journeys worth taking.
            </h2>

            <p className="mt-3 max-w-xl text-sm leading-7 text-charcoal/75 sm:mt-4 sm:text-base">
              Discover memorable places and find the journey that speaks to you.
            </p>
          </div>

          <Link to="/trips" className="inline-flex w-fit items-center gap-2 rounded-full border border-forest/20 bg-white px-5 py-3 font-bold text-forest transition-colors hover:bg-forest hover:text-white">
            Explore all trips <span aria-hidden="true">↗</span>
          </Link>
        </motion.div>

        {/* Loading state */}
        {loading && (
          <Loader message="Finding your next adventure..." />
        )}

        {/* Error state */}
        {!loading && error && (
          <div
            className="rounded-2xl border border-red-200 bg-white p-8 text-center"
            role="alert"
          >
            <p className="font-semibold text-charcoal">
              We couldn't load the trips.
            </p>

            <p className="mt-2 text-sm text-charcoal/65">
              {error}
            </p>

            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="mt-5 rounded-full bg-forest px-5 py-3 text-sm font-bold text-white hover:bg-forest-light"
              >
                Try again
              </button>
            )}
          </div>
        )}

        {/* Trip cards */}
        {!loading && !error && trips.length > 0 && (
          <div>
            <div className="mb-5 flex items-center justify-between gap-4">
              <p className="text-sm font-medium text-charcoal-light">{activeIndex + 1} <span aria-hidden="true">/</span> {trips.length} journeys</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => goToSlide(Math.max(activeIndex - 1, 0))} disabled={activeIndex === 0} aria-label="Previous featured trip" className="carousel-arrow">
                  <ArrowLeft size={18} />
                </button>
                <button type="button" onClick={() => goToSlide(Math.min(activeIndex + 1, trips.length - 1))} disabled={activeIndex >= trips.length - 1} aria-label="Next featured trip" className="carousel-arrow">
                  <ArrowRight size={18} />
                </button>
              </div>
            </div>
            <div
              ref={carouselRef}
              className="featured-carousel no-scrollbar"
              role="region"
              aria-label="Featured trips"
              aria-roledescription="carousel"
              tabIndex={0}
              onScroll={handleCarouselScroll}
            >
              <div className="flex w-max gap-6 pb-3">
                {trips.map((trip, index) => (
                  <div className="featured-trip-slide" key={trip._id || trip.id || trip.slug} role="group" aria-roledescription="slide" aria-label={`${index + 1} of ${trips.length}`}>
                    <TripCard trip={trip} entranceDelay={index * 0.06} className="h-full" />
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-5 flex justify-center gap-2" role="group" aria-label="Choose featured trip">
              {trips.map((trip, index) => (
                <button
                  key={trip._id || trip.id || trip.slug}
                  type="button"
                  aria-label={`Go to trip ${index + 1}`}
                  aria-current={index === activeIndex ? 'true' : undefined}
                  onClick={() => goToSlide(index)}
                  className={`carousel-indicator ${index === activeIndex ? 'is-active' : ''}`}
                />
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && trips.length === 0 && (
          <div className="rounded-2xl border border-forest/10 bg-white px-6 py-14 text-center">
            <p className="font-heading text-2xl font-semibold text-forest">
              New adventures are on the way.
            </p>

            <p className="mt-3 text-sm text-charcoal/65">
              There are no trips to display right now.
            </p>
          </div>
        )}
      </div>
    </section>
  )
}

export default FeaturedTrips
