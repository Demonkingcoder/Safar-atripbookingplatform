import { useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'motion/react'
import { Check, MapPin, X } from 'lucide-react'
import Button from '../ui/Button'
import heroImage from '../../assets/images/safar-hero.webp'

function Hero({ onSearch, trips = [] }) {
  const supportsHover = typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches
  const [destination, setDestination] = useState('')
  const [selectedDestination, setSelectedDestination] = useState('')
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)
  const searchRef = useRef(null)
  const reduceMotion = useReducedMotion()
  const pointerX = useMotionValue(0)
  const pointerY = useMotionValue(0)
  const smoothPointerX = useSpring(pointerX, { stiffness: 38, damping: 20, mass: 0.8 })
  const smoothPointerY = useSpring(pointerY, { stiffness: 38, damping: 20, mass: 0.8 })
  const backgroundX = useTransform(smoothPointerX, [-1, 1], [-9, 9])
  const backgroundY = useTransform(smoothPointerY, [-1, 1], [-6, 6])

  const suggestions = useMemo(() => {
    const unique = new Map()
    trips.forEach((trip) => {
      const label = trip.destination || trip.location || trip.title || trip.name
      if (label && !unique.has(String(label).trim())) unique.set(String(label).trim(), trip)
    })
    const query = destination.trim().toLowerCase()
    return [...unique.entries()]
      .filter(([label, trip]) => !query || `${label} ${trip.title || ''} ${trip.description || ''}`.toLowerCase().includes(query))
      .slice(0, 5)
  }, [trips, destination])

  function handleSubmit(event) {
    event.preventDefault()
    setSuggestionsOpen(false)
    onSearch?.(destination.trim())
  }

  function handlePointerMove(event) {
    if (reduceMotion || event.pointerType !== 'mouse' || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return
    const bounds = event.currentTarget.getBoundingClientRect()
    pointerX.set(((event.clientX - bounds.left) / bounds.width - 0.5) * 2)
    pointerY.set(((event.clientY - bounds.top) / bounds.height - 0.5) * 2)
  }

  function resetParallax() {
    pointerX.set(0)
    pointerY.set(0)
  }

  function clearDestination() {
    setDestination('')
    setSelectedDestination('')
    setSuggestionsOpen(true)
    searchRef.current?.focus()
  }

  function selectDestination(label) {
    setDestination(label)
    setSelectedDestination(label)
    setSuggestionsOpen(false)
  }

  const headlineWords = ['The', 'world', 'is', 'wide.']

  return (
    <section
      className="relative isolate overflow-hidden bg-forest"
      onPointerMove={handlePointerMove}
      onPointerLeave={resetParallax}
    >
      <motion.div
        className="absolute inset-0 -z-20 bg-cover bg-center"
        animate={reduceMotion ? undefined : { scale: [1.04, 1.085, 1.04] }}
        transition={reduceMotion ? undefined : { scale: { duration: 52, repeat: Infinity, ease: 'easeInOut' } }}
        style={{ backgroundImage: `url(${heroImage})`, ...(reduceMotion ? {} : { x: backgroundX, y: backgroundY }) }}
        aria-hidden="true"
      />

      <motion.div
        className="hero-gradient-overlay absolute inset-0 -z-10 bg-gradient-to-r from-forest-dark/95 via-forest-dark/80 to-forest-dark/45"
        animate={reduceMotion ? undefined : { opacity: [0.96, 1, 0.96] }}
        transition={reduceMotion ? undefined : { duration: 20, repeat: Infinity, ease: 'easeInOut' }}
        aria-hidden="true"
      />

      <div className="mx-auto flex min-h-[560px] max-w-7xl items-center px-5 py-16 sm:min-h-[620px] sm:px-6 sm:py-20 lg:min-h-[700px] lg:px-8">
        <div className="w-full max-w-4xl">
          <motion.p
            initial={reduceMotion ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
            className="mb-5 inline-flex items-center gap-3 text-[0.68rem] font-bold uppercase tracking-[0.24em] text-terracotta-light sm:mb-6 sm:text-xs"
          >
            <span className="h-px w-8 bg-terracotta-light" />
            Find your kind of extraordinary
          </motion.p>

          <h1
            aria-label="The world is wide. Go find yourself."
            className="max-w-4xl font-heading text-[clamp(2rem,7.5vw,6.25rem)] font-medium leading-[1.06] tracking-[-0.045em] text-[#FAF8F3]"
          >
            <span className="hero-headline-chip block w-fit bg-[#183D3A] px-[0.16em] py-[0.04em] text-[#FAF8F3]">
              {headlineWords.map((word, index) => (
                <motion.span
                  key={word}
                  aria-hidden="true"
                  initial={reduceMotion ? false : { opacity: 0, y: '0.34em' }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.62, delay: 0.2 + index * 0.13, ease: [0.22, 1, 0.36, 1] }}
                  className="mr-[0.22em] inline-block last:mr-0"
                >
                  {word}
                </motion.span>
              ))}
            </span>
            <motion.span
              initial={reduceMotion ? false : { opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.72, delay: 0.84, ease: [0.22, 1, 0.36, 1] }}
              className="mt-1 block font-normal italic text-terracotta-light sm:mt-2"
            >
              Go find yourself.
            </motion.span>
          </h1>

          <motion.p
            initial={reduceMotion ? false : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, delay: 1.08, ease: [0.22, 1, 0.36, 1] }}
            className="mt-5 max-w-xl text-sm leading-6 text-ivory/90 sm:mt-6 sm:text-base sm:leading-7 lg:text-lg lg:leading-8"
          >
            Discover remarkable places, unforgettable adventures, and journeys
            that stay with you long after you return home.
          </motion.p>

          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.68, delay: 1.28, ease: [0.22, 1, 0.36, 1] }}
            className="relative mt-8 max-w-2xl sm:mt-9"
          >
            <motion.form
              onSubmit={handleSubmit}
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) setSuggestionsOpen(false)
              }}
              onFocus={() => setSuggestionsOpen(true)}
              whileHover={reduceMotion || !supportsHover ? undefined : { y: -2, boxShadow: '0 24px 44px rgba(16,43,42,.24)' }}
              transition={{ duration: 0.28, ease: 'easeOut' }}
              className="hero-search flex flex-col gap-2 rounded-3xl border border-white/65 bg-ivory p-2 shadow-xl shadow-forest-dark/20 sm:flex-row sm:items-center sm:rounded-full sm:pl-6"
            >
              <label htmlFor="hero-destination" className="sr-only">Where do you want to go?</label>
              <div className="flex min-h-12 min-w-0 flex-1 items-center gap-3 px-3 sm:px-0">
                <MapPin size={20} className="shrink-0 text-terracotta-dark" aria-hidden="true" />
                <input
                  ref={searchRef}
                  id="hero-destination"
                  type="text"
                  inputMode="search"
                  role="combobox"
                  aria-autocomplete="list"
                  aria-expanded={suggestionsOpen}
                  aria-controls="hero-destination-options"
                  value={destination}
                  onChange={(event) => {
                    setDestination(event.target.value)
                    setSelectedDestination('')
                    setSuggestionsOpen(true)
                  }}
                  placeholder="Where do you want to go?"
                  className="min-w-0 flex-1 bg-transparent py-3 text-sm text-charcoal outline-none placeholder:text-charcoal-light"
                />
                {destination && (
                  <button type="button" onClick={clearDestination} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-charcoal-light transition hover:bg-sage hover:text-forest focus-visible:outline-2" aria-label="Clear destination">
                    <X size={17} />
                  </button>
                )}
              </div>
              <Button type="submit" variant="secondary" size="lg">
                Explore trips <span aria-hidden="true">↗</span>
              </Button>
            </motion.form>

            <AnimatePresence initial={false}>
              {selectedDestination && !suggestionsOpen && (
                <motion.div
                  role="status"
                  initial={reduceMotion ? false : { opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduceMotion ? undefined : { opacity: 0, y: -5 }}
                  transition={{ duration: 0.18 }}
                  className="mt-2 inline-flex items-center gap-2 rounded-full border border-white/20 bg-forest-dark/70 px-3 py-1.5 text-xs font-semibold text-white shadow-sm"
                >
                  <Check size={14} aria-hidden="true" />
                  Searching {selectedDestination}
                  <button type="button" onClick={clearDestination} className="ml-1 rounded-full p-1 text-white/80 hover:bg-white/15 hover:text-white" aria-label="Clear selected destination"><X size={13} /></button>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence initial={false}>
              {suggestionsOpen && (
                <motion.div
                  id="hero-destination-options"
                  role="listbox"
                  aria-label="Available destinations"
                  initial={reduceMotion ? false : { opacity: 0, y: -8, scale: 0.985 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={reduceMotion ? undefined : { opacity: 0, y: -6, scale: 0.99 }}
                  transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                  className="absolute inset-x-0 top-[calc(100%+0.65rem)] z-30 overflow-hidden rounded-2xl border border-forest/10 bg-ivory p-2 text-charcoal shadow-2xl shadow-forest-dark/25"
                >
                  <p className="px-3 pb-2 pt-2 text-[0.65rem] font-bold uppercase tracking-[0.18em] text-charcoal-light">
                    {destination ? 'Matching destinations' : 'Popular destinations'}
                  </p>
                  {suggestions.length ? suggestions.map(([label, trip]) => (
                    <button
                      key={label}
                      type="button"
                      role="option"
                      aria-selected={selectedDestination === label}
                      onClick={() => selectDestination(label)}
                      className="group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-sage focus-visible:bg-sage"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-terracotta-dark"><MapPin size={16} /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-forest">{label}</span>
                        <span className="block truncate text-xs text-charcoal-light">{trip.title || trip.name || 'Explore this destination'}</span>
                      </span>
                      {selectedDestination === label && <Check size={17} className="text-forest" aria-hidden="true" />}
                    </button>
                  )) : (
                    <p className="px-3 py-4 text-sm text-charcoal-light">No trips match that search yet. Explore all trips to browse.</p>
                  )}
                  {selectedDestination && (
                    <div className="mt-1 flex items-center justify-between border-t border-forest/10 px-3 py-3 text-xs">
                      <span className="font-semibold text-forest">Selected: {selectedDestination}</span>
                      <button type="button" onClick={clearDestination} className="font-bold text-terracotta-dark underline underline-offset-2">Clear</button>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 1.5, ease: [0.22, 1, 0.36, 1] }}
            className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm font-medium text-ivory/90 sm:mt-7"
          >
            <span className="flex items-center gap-2"><span className="text-terracotta-light">✦</span>Meaningful journeys</span>
            <span className="flex items-center gap-2"><span className="text-terracotta-light">✦</span>Memorable adventures</span>
          </motion.div>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-ivory/55 to-transparent" aria-hidden="true" />
    </section>
  )
}

export default Hero
