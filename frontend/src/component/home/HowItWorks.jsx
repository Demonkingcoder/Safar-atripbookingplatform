
import { motion, useReducedMotion } from 'motion/react'

const steps = [
  {
    number: '01',
    title: 'Find your adventure',
    description:
      'Explore available trips and discover destinations that match your travel plans.',
    icon: '⌕',
  },
  {
    number: '02',
    title: 'Choose your departure',
    description:
      'Review trip details, compare available departure dates, and choose your journey.',
    icon: '◷',
  },
  {
    number: '03',
    title: 'Book your journey',
    description:
      'Enter your booking details, complete the payment process, and check your booking status.',
    icon: '↗',
  },
]

function HowItWorks() {
  const reduceMotion = useReducedMotion()
  return (
    <section className="bg-forest px-5 py-20 text-ivory md:px-8 md:py-28">
      <div className="mx-auto max-w-7xl">
        <motion.div
          className="max-w-2xl"
          initial={reduceMotion ? false : { opacity: 0, y: 18 }}
          whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.35 }}
          transition={{ duration: 0.58, ease: [0.22, 1, 0.36, 1] }}
        >
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.22em] text-terracotta-light">
            Your journey starts here
          </p>

          <h2 className="font-heading text-4xl font-semibold leading-tight sm:text-5xl">
            Three steps.
            <br />
            <span className="italic text-terracotta-light">
              One unforgettable journey.
            </span>
          </h2>

          <p className="mt-5 max-w-xl text-base leading-7 text-ivory/70">
            We've designed the journey from discovering a trip to managing
            your booking to feel simple and clear.
          </p>
        </motion.div>

        <div className="mt-14 grid gap-10 md:grid-cols-3 md:gap-8">
          {steps.map((step, index) => (
            <motion.article
              key={step.number}
              className="relative"
              initial={reduceMotion ? false : { opacity: 0, y: 20 }}
              whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.55, delay: index * 0.11, ease: [0.22, 1, 0.36, 1] }}
            >
              {/* Step connector on desktop */}
              {index < steps.length - 1 && (
                <motion.div
                  className="absolute left-16 right-0 top-7 hidden border-t border-dashed border-ivory/25 md:block"
                  aria-hidden="true"
                  initial={reduceMotion ? false : { scaleX: 0 }}
                  whileInView={reduceMotion ? undefined : { scaleX: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.75, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
                  style={{ transformOrigin: 'left center' }}
                />
              )}

              <div className="relative flex h-14 w-14 items-center justify-center rounded-full border border-terracotta/60 bg-forest text-2xl text-terracotta-light">
                {step.icon}
              </div>

              <p className="mt-7 text-xs font-semibold tracking-[0.2em] text-terracotta-light">
                STEP {step.number}
              </p>

              <h3 className="mt-3 font-heading text-2xl font-semibold">
                {step.title}
              </h3>

              <p className="mt-4 max-w-sm text-sm leading-7 text-ivory/70">
                {step.description}
              </p>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  )
}

export default HowItWorks
