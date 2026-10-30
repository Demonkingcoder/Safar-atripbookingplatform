import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { Menu, X, Compass, UserRound, LogOut, CalendarDays } from 'lucide-react'
import { AnimatePresence, motion, useMotionValueEvent, useReducedMotion, useScroll } from 'motion/react'
import { useAuth } from '../../context/AuthContext'

const linkClass = ({ isActive }) =>
  `rounded-full px-3 py-2 text-sm font-semibold transition-colors ${isActive ? 'bg-forest/10 text-forest' : 'text-charcoal hover:bg-forest/5 hover:text-forest'}`

function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false)
  const { user, isAuthenticated, loading, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { scrollY } = useScroll()
  const reduceMotion = useReducedMotion()
  const [scrolled, setScrolled] = useState(false)
  const [activeSection, setActiveSection] = useState('')
  useMotionValueEvent(scrollY, 'change', (latest) => setScrolled(latest > 12))
  const closeMenu = () => setMenuOpen(false)

  useEffect(() => {
    if (location.pathname !== '/') {
      setActiveSection('')
      return undefined
    }
    const sections = ['trips', 'why-safar', 'footer'].map((id) => document.getElementById(id)).filter(Boolean)
    if (!sections.length) return undefined
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
      if (visible) setActiveSection(visible.target.id)
    }, { rootMargin: '-18% 0px -62% 0px', threshold: [0, 0.2, 0.5] })
    sections.forEach((section) => observer.observe(section))
    return () => observer.disconnect()
  }, [location.pathname])

  useEffect(() => {
    const id = location.hash.slice(1)
    if (!id) return undefined
    const timer = window.setTimeout(() => {
      document.getElementById(decodeURIComponent(id))?.scrollIntoView({
        behavior: reduceMotion ? 'auto' : 'smooth',
        block: 'start',
      })
    }, 0)
    return () => window.clearTimeout(timer)
  }, [location.pathname, location.hash, reduceMotion])

  const sectionLink = (id) => `nav-section-link ${activeSection === id ? 'is-active' : ''}`

  async function handleLogout() {
    await logout()
    closeMenu()
    navigate('/', { replace: true, state: { from: location.pathname } })
  }

  return (
    <motion.header
      className="sticky top-0 z-50 border-b border-forest/10 bg-ivory"
      initial={reduceMotion ? false : { opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0, backgroundColor: scrolled ? '#FFFFFF' : '#FAF8F3', boxShadow: scrolled ? '0 8px 26px rgba(24,61,58,0.12)' : '0 4px 20px rgba(24,61,58,0.04)' }}
      transition={reduceMotion ? { duration: 0 } : { duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
    >
      <nav className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8" aria-label="Main navigation">
        <Link to="/" onClick={closeMenu} className="group inline-flex shrink-0 items-center gap-2.5" aria-label="Safar home">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-forest text-ivory shadow-sm transition-transform group-hover:-rotate-6">
            <Compass size={23} strokeWidth={1.8} />
          </span>
          <span className="font-heading text-2xl font-bold tracking-tight text-forest">safar<span className="text-terracotta">.</span></span>
        </Link>

        <div className="hidden items-center gap-1 lg:flex">
          <NavLink to="/trips" className={({ isActive }) => `${linkClass({ isActive })} nav-section-link ${isActive || activeSection === 'trips' ? 'is-active' : ''}`}>Explore trips</NavLink>
          <a href={location.pathname === '/' ? '#why-safar' : '/#why-safar'} className={sectionLink('why-safar')}>Why Safar</a>
          <a href={location.pathname === '/' ? '#footer' : '/#footer'} className={sectionLink('footer')}>Contact</a>
        </div>

        <div className="hidden items-center gap-2 md:flex">
          {loading ? <span className="h-10 w-10" aria-hidden="true" /> : isAuthenticated ? (
            user?.role === 'admin' ? <>
              <Link to="/" className="rounded-full px-3 py-2 text-sm font-semibold text-charcoal hover:bg-forest/5">Home</Link>
              <Link to="/profile" className="inline-flex items-center gap-2 rounded-full border border-forest/15 bg-white px-3 py-2 text-sm font-semibold text-forest hover:border-forest/35"><UserRound size={17} /> {user?.fullName?.split(' ')[0] || 'Account'}</Link>
              <button onClick={handleLogout} type="button" title="Log out" aria-label="Log out" className="inline-flex h-10 w-10 items-center justify-center rounded-full text-charcoal hover:bg-red-50 hover:text-red-700"><LogOut size={17} /></button>
            </> : <>
              <Link to="/my-bookings" className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold text-charcoal hover:bg-forest/5"><CalendarDays size={17} /> My bookings</Link>
              <Link to="/profile" className="inline-flex items-center gap-2 rounded-full border border-forest/15 bg-white px-3 py-2 text-sm font-semibold text-forest hover:border-forest/35"><UserRound size={17} /> {user?.fullName?.split(' ')[0] || user?.name?.split(' ')[0] || 'Account'}</Link>
              <button onClick={handleLogout} type="button" title="Log out" aria-label="Log out" className="inline-flex h-10 w-10 items-center justify-center rounded-full text-charcoal hover:bg-red-50 hover:text-red-700"><LogOut size={17} /></button>
            </>
          ) : (
            <>
              <Link to="/login" className="rounded-full px-4 py-2.5 text-sm font-semibold text-forest transition-colors hover:bg-forest/5">Log in</Link>
              <Link to="/register" className="inline-flex items-center justify-center rounded-full bg-forest px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-forest-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest-light">Create account <span className="ml-2" aria-hidden="true">↗</span></Link>
            </>
          )}
        </div>

        <button type="button" className="flex h-10 w-10 items-center justify-center rounded-xl border border-forest/20 bg-white text-forest lg:hidden" aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'} aria-expanded={menuOpen} aria-controls="mobile-navigation" onClick={() => setMenuOpen((open) => !open)}>
          {menuOpen ? <X size={21} /> : <Menu size={21} />}
        </button>
      </nav>

      <AnimatePresence initial={false}>
      {menuOpen && <motion.div id="mobile-navigation" initial={reduceMotion ? false : { opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={reduceMotion ? undefined : { opacity: 0, height: 0 }} transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }} className="overflow-hidden border-t border-forest/10 bg-ivory px-4 py-4 shadow-lg lg:hidden">
        <div className="mx-auto flex max-w-7xl flex-col gap-1">
          <NavLink to="/trips" onClick={closeMenu} className={linkClass}>Explore trips</NavLink>
          <a href="/#why-safar" onClick={closeMenu} className="rounded-full px-3 py-2.5 text-sm font-semibold text-charcoal hover:bg-forest/5">Why Safar</a>
          <a href="/#footer" onClick={closeMenu} className="rounded-full px-3 py-2.5 text-sm font-semibold text-charcoal hover:bg-forest/5">Contact</a>
          {loading ? null : isAuthenticated ? user?.role === 'admin' ? <>
            <NavLink to="/" onClick={closeMenu} className={linkClass}>Home</NavLink>
            <NavLink to="/profile" onClick={closeMenu} className={linkClass}>My profile</NavLink>
            <button type="button" onClick={handleLogout} className="mt-2 inline-flex items-center justify-center gap-2 rounded-full border border-red-200 px-4 py-3 text-sm font-semibold text-red-700"><LogOut size={17} /> Log out</button>
          </> : <>
            <NavLink to="/my-bookings" onClick={closeMenu} className={(state) => `${linkClass(state)} md:hidden`}>My bookings</NavLink>
            <NavLink to="/profile" onClick={closeMenu} className={(state) => `${linkClass(state)} md:hidden`}>My profile</NavLink>
            <button type="button" onClick={handleLogout} className="mt-2 inline-flex items-center justify-center gap-2 rounded-full border border-red-200 px-4 py-3 text-sm font-semibold text-red-700 md:hidden"><LogOut size={17} /> Log out</button>
          </> : <div className="mt-3 grid grid-cols-2 gap-2 md:hidden">
            <Link to="/login" onClick={closeMenu} className="rounded-full border border-forest/20 bg-white px-4 py-3 text-center text-sm font-semibold text-forest">Log in</Link>
            <Link to="/register" onClick={closeMenu} className="rounded-full bg-forest px-4 py-3 text-center text-sm font-bold text-white">Create account</Link>
          </div>}
        </div>
      </motion.div>}
      </AnimatePresence>
    </motion.header>
  )
}

export default Navbar
