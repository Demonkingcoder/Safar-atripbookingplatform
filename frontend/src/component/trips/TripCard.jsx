import { Link } from 'react-router-dom'
import { MapPin, Clock, ArrowUpRight, Eye, X } from 'lucide-react'
import { useState } from 'react'
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'motion/react'
import formatCurrency from '../../utils/formatCurrency'

function TripCard({ trip, entranceDelay = 0, className = '' }) {
  const [previewOpen, setPreviewOpen] = useState(false)
  const reduceMotion = useReducedMotion()
  const supportsHover = typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches
  const pointerX = useMotionValue(0)
  const pointerY = useMotionValue(0)
  const smoothX = useSpring(pointerX, { stiffness: 180, damping: 24, mass: 0.45 })
  const smoothY = useSpring(pointerY, { stiffness: 180, damping: 24, mass: 0.45 })
  const rotateY = useTransform(smoothX, [-0.5, 0.5], [-3, 3])
  const rotateX = useTransform(smoothY, [-0.5, 0.5], [3, -3])

  function handlePointerMove(event) {
    if (reduceMotion || event.pointerType !== 'mouse' || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return
    const bounds = event.currentTarget.getBoundingClientRect()
    pointerX.set((event.clientX - bounds.left) / bounds.width - 0.5)
    pointerY.set((event.clientY - bounds.top) / bounds.height - 0.5)
  }

  function resetTilt() {
    pointerX.set(0)
    pointerY.set(0)
  }

  if (!trip) return null
  const slug = trip.slug || trip._id || trip.id
  const image = Array.isArray(trip.images) ? trip.images[0] : trip.images || trip.coverImage || trip.image
  const price = trip.basePrice ?? trip.price ?? trip.pricing?.pricePerPerson ?? trip.pricing?.basePrice ?? (typeof trip.pricing === 'number' ? trip.pricing : undefined)
  const destination = trip.destination || trip.location || trip.category
  const duration = typeof trip.duration === 'object' ? trip.duration?.label : trip.duration
  return <motion.article
    className={`trip-card group ${className}`}
    onPointerMove={handlePointerMove}
    onPointerLeave={resetTilt}
    style={reduceMotion ? undefined : { rotateX, rotateY, transformPerspective: 1000, transformStyle: 'preserve-3d' }}
    initial={reduceMotion ? false : { opacity: 0, y: 22 }}
    whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
    viewport={{ once: true, amount: 0.18 }}
    transition={{ duration: 0.58, delay: entranceDelay, ease: [0.22, 1, 0.36, 1] }}
    whileHover={reduceMotion || !supportsHover ? undefined : { y: -5, boxShadow: '0 22px 44px rgba(16,43,38,.14)' }}
  >
    <div className={`trip-card-image ${image ? '' : 'is-placeholder'} ${previewOpen ? 'preview-open' : ''}`}>
      <Link to={slug ? `/trips/${slug}` : '/trips'} className="trip-card-image-link" aria-label={`View ${trip.title || 'trip'} details`}>
        {image ? <img src={image} alt={trip.title || 'Travel destination'} loading="lazy" /> : <div className="trip-image-fallback"><MapPin size={30} /><span>Discover somewhere new</span></div>}
        {trip.category && <span className="trip-category">{String(trip.category).replaceAll('_', ' ')}</span>}
      </Link>
      <div className={`trip-card-image-overlay ${previewOpen ? 'is-open' : ''}`}>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/75">Explore this journey</p>
        <p className="mt-2 font-heading text-2xl font-semibold text-white">{destination || trip.title || 'A new destination'}</p>
        {duration && <p className="mt-1 text-sm text-white/85">{duration}</p>}
        <Link to={slug ? `/trips/${slug}` : '/trips'} className="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-bold text-forest transition hover:scale-[1.03] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
          Explore trip <ArrowUpRight size={16} />
        </Link>
      </div>
      <button
        type="button"
        className="trip-card-preview-toggle md:hidden"
        aria-expanded={previewOpen}
        onClick={() => setPreviewOpen((open) => !open)}
      >
        {previewOpen ? <><X size={15} /> Close preview</> : <><Eye size={15} /> Quick look</>}
      </button>
    </div>
    <div className="p-5 sm:p-6">
      <div className="flex min-h-5 items-center gap-2 text-xs font-semibold tracking-wide text-forest-light">{destination && <span className="inline-flex items-center gap-1"><MapPin size={13} />{destination}</span>}{duration && <span className="inline-flex items-center gap-1"><Clock size={13} />{duration}</span>}</div>
      <h3 className="mt-3 font-heading text-2xl font-semibold tracking-[-0.02em] text-forest"><Link to={slug ? `/trips/${slug}` : '/trips'} className="transition-colors hover:text-terracotta-dark">{trip.title || 'A journey to remember'}</Link></h3>
      <p className="mt-3 min-h-[3rem] text-sm leading-6 text-charcoal/75">{trip.description || 'Explore a thoughtfully planned journey and discover something new.'}</p>
      <div className="mt-5 flex items-end justify-between gap-3 border-t border-forest/10 pt-4">
        <div><p className="text-xs font-medium text-charcoal/65">Starting from</p><p className="mt-1 text-lg font-bold text-forest">{price != null ? formatCurrency(price) : 'View pricing'}</p><p className="text-xs text-charcoal-light">per traveller</p></div>
        <Link to={slug ? `/trips/${slug}` : '/trips'} className="inline-flex items-center gap-2 rounded-full bg-forest px-4 py-2.5 text-sm font-bold text-white transition hover:bg-forest-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest-light">View details <ArrowUpRight size={16} /></Link>
      </div>
    </div>
  </motion.article>
}

export default TripCard
