
import { motion, useReducedMotion } from 'motion/react'
import { useLanguage } from '../../context/LanguageContext'

const benefits = [
  {
    number: '01',
    title: 'Journeys with meaning',
    description:
      'Go beyond the usual tourist trail and discover experiences that make every journey memorable.',
    icon: '✳',
  },
  {
    number: '02',
    title: 'Adventure made simple',
    description:
      'Explore trip details, compare departures, and plan your next escape in one place.',
    icon: '↗',
  },
  {
    number: '03',
    title: 'Your kind of travel',
    description:
      'From mountain escapes to discovering new places, find a journey that feels right for you.',
    icon: '⌁',
  },
]

function WhySafar() {
  const { t } = useLanguage()
  const reduceMotion = useReducedMotion()
  return (
    <section
      id="why-safar"
      className="bg-white px-5 py-20 md:px-8 md:py-28"
    >
      <div className="mx-auto max-w-7xl">
        {/* Section heading */}
        <motion.div
          className="mx-auto max-w-2xl text-center"
          initial={reduceMotion ? false : { opacity: 0, y: 18 }}
          whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.35 }}
          transition={{ duration: 0.58, ease: [0.22, 1, 0.36, 1] }}
        >
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.22em] text-terracotta-dark">
            {t('home.whyEyebrow')}
          </p>

          <h2 className="font-heading text-4xl font-semibold leading-tight text-forest sm:text-5xl">
            {t('story.whyTitle')}
          </h2>

          <p className="mt-5 text-base leading-7 text-charcoal/70">
            {t('story.whyBody')}
          </p>
        </motion.div>

        {/* Benefits */}
        <div className="mt-14 grid gap-5 md:grid-cols-3">
          {benefits.map((benefit) => (
            <motion.article
              key={benefit.number}
              className="group rounded-2xl border border-forest/10 bg-ivory/50 p-7 transition-all duration-300 hover:-translate-y-1 hover:border-terracotta/40 hover:bg-ivory hover:shadow-lg sm:p-8"
              initial={reduceMotion ? false : { opacity: 0, y: 18 }}
              whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.25 }}
              transition={{ duration: 0.55, delay: reduceMotion ? 0 : Number(benefit.number) * 0.09, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="flex items-center justify-between">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-forest text-2xl text-ivory transition-colors group-hover:bg-terracotta">
                  {benefit.icon}
                </span>

                <span className="font-heading text-lg text-forest/35">
                  {benefit.number}
                </span>
              </div>

              <h3 className="mt-8 font-heading text-2xl font-semibold text-forest">
                  {t(`story.benefit${Number(benefit.number)}`)}
              </h3>

              <p className="mt-4 text-sm leading-7 text-charcoal/70">
                  {t(`story.benefit${Number(benefit.number)}Body`)}
              </p>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  )
}

export default WhySafar
