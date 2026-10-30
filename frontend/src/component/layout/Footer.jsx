import { Link } from 'react-router-dom'
import { Compass, Mail, ArrowUpRight } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'

const footerGroups = [
  { heading: 'Discover', links: [{ label: 'All trips', to: '/trips' }, { label: 'My bookings', to: '/my-bookings' }] },
  { heading: 'Your account', links: [{ label: 'Log in', to: '/login' }, { label: 'Create account', to: '/register' }, { label: 'My profile', to: '/profile' }] },
]

function Footer() {
  const reduceMotion = useReducedMotion()
  return (
    <motion.footer id="footer" className="bg-forest text-ivory" initial={reduceMotion ? false : { opacity: 0, y: 22 }} whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.12 }} transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}>
      <div className="mx-auto max-w-7xl px-5 py-14 md:px-8 md:py-16">
        <motion.div className="grid gap-10 md:grid-cols-[1.5fr_1fr_1fr]" initial={reduceMotion ? false : 'hidden'} whileInView="visible" viewport={{ once: true, amount: 0.15 }} variants={{ visible: { transition: { staggerChildren: reduceMotion ? 0 : 0.1 } } }}>
          <motion.div initial={reduceMotion ? false : { opacity: 0, y: 14 }} whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.45 }}>
            <Link to="/" className="inline-flex items-center gap-2.5" aria-label="Safar home">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-ivory text-forest"><Compass size={22} /></span>
              <span className="font-heading text-3xl font-bold">safar<span className="text-terracotta-light">.</span></span>
            </Link>
            <p className="mt-5 max-w-sm text-sm leading-7 text-white/80">Thoughtfully chosen journeys, meaningful discoveries, and memories that travel home with you.</p>
            <a href="mailto:hello@safar.travel" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-white underline decoration-terracotta-light underline-offset-4 hover:text-terracotta-light"><Mail size={16} /> hello@safar.travel <ArrowUpRight size={15} /></a>
          </motion.div>
          {footerGroups.map((group) => <motion.div key={group.heading} initial={reduceMotion ? false : { opacity: 0, y: 14 }} whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.45 }}>
            <h2 className="mb-4 text-xs font-bold uppercase tracking-[0.18em] text-terracotta-light">{group.heading}</h2>
            <ul className="space-y-3">{group.links.map((link) => <li key={link.to}><Link to={link.to} className="text-sm font-medium text-white/85 transition hover:text-white hover:underline hover:underline-offset-4">{link.label}</Link></li>)}</ul>
          </motion.div>)}
        </motion.div>
        <div className="mt-12 flex flex-col gap-3 border-t border-white/20 pt-5 text-xs font-medium text-white/75 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Safar. All rights reserved.</p>
          <p>Made for the love of exploring.</p>
        </div>
      </div>
    </motion.footer>
  )
}

export default Footer
