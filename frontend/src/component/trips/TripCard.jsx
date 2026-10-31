import { Link } from 'react-router-dom'
import { MapPin, Clock, ArrowUpRight, Eye, X } from 'lucide-react'
import { useState } from 'react'
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'motion/react'
import formatCurrency from '../../utils/formatCurrency'
import { useLanguage } from '../../context/LanguageContext'

function TripCard({ trip, entranceDelay = 0, className = '' }) {
  const { t, language, locale } = useLanguage()
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
  const price = trip.basePrice
  const title = trip.translations?.[language]?.title || trip.title
  const description = trip.translations?.[language]?.description || trip.description
  const destination = trip.translations?.[language]?.destination || trip.destination || trip.location || trip.category
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
      <Link to={slug ? `/trips/${slug}` : '/trips'} className="trip-card-image-link" aria-label={t('trip.viewAria', { title: title || t('trip.trip') })}>
        {image ? <img src={image} alt={title || t('trip.destinationFallback')} loading="lazy" /> : <div className="trip-image-fallback"><MapPin size={30} /><span>{t('trip.explore')}</span></div>}
        {trip.category && <span className="trip-category">{String(trip.category).replaceAll('_', ' ')}</span>}
      </Link>
      <div className={`trip-card-image-overlay ${previewOpen ? 'is-open' : ''}`}>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/75">{t('trip.exploreThis')}</p>
        <p className="mt-2 font-heading text-2xl font-semibold text-white">{destination || title || t('trip.destinationFallback')}</p>
        {duration && <p className="mt-1 text-sm text-white/85">{duration}</p>}
        <Link to={slug ? `/trips/${slug}` : '/trips'} className="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-bold text-forest transition hover:scale-[1.03] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
          {t('trip.explore')} <ArrowUpRight size={16} />
        </Link>
      </div>
      <button
        type="button"
        className="trip-card-preview-toggle md:hidden"
        aria-expanded={previewOpen}
        onClick={() => setPreviewOpen((open) => !open)}
      >
        {previewOpen ? <><X size={15} /> {t('trip.closePreview')}</> : <><Eye size={15} /> {t('trip.quickLook')}</>}
      </button>
    </div>
    <div className="p-5 sm:p-6">
      <div className="flex min-h-5 items-center gap-2 text-xs font-semibold tracking-wide text-forest-light">{destination && <span className="inline-flex items-center gap-1"><MapPin size={13} />{destination}</span>}{duration && <span className="inline-flex items-center gap-1"><Clock size={13} />{duration}</span>}</div>
      <h3 className="mt-3 font-heading text-2xl font-semibold tracking-[-0.02em] text-forest"><Link to={slug ? `/trips/${slug}` : '/trips'} className="transition-colors hover:text-terracotta-dark">{title || t('trip.nextAdventure')}</Link></h3>
      <p className="mt-3 min-h-[3rem] text-sm leading-6 text-charcoal/75">{description || t('trip.pageDescription')}</p>
      <div className="mt-5 flex items-end justify-between gap-3 border-t border-forest/10 pt-4">
        <div><p className="text-xs font-medium text-charcoal/65">{t('trip.fullPrice')}</p><p className="mt-1 text-lg font-bold text-forest">{price != null ? formatCurrency(price, 'INR', locale) : t('trip.pricing')}</p><p className="text-xs text-charcoal-light">{t('trip.perTraveller')}</p></div>
        <Link to={slug ? `/trips/${slug}` : '/trips'} className="inline-flex items-center gap-2 rounded-full bg-forest px-4 py-2.5 text-sm font-bold text-white transition hover:bg-forest-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest-light">{t('trip.view')} <ArrowUpRight size={16} /></Link>
      </div>
    </div>
  </motion.article>
}

export default TripCard
