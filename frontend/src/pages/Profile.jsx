import { Link } from 'react-router-dom'
import { UserRound, Mail, CalendarDays, ShieldCheck } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

function Profile() {
  const { user } = useAuth()
  const fullName = user?.fullName || user?.name || user?.username || 'Safar traveller'
  const initials = fullName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'S'
  return <main className="page-section"><div className="mx-auto max-w-3xl"><p className="eyebrow">Your account</p><h1 className="page-title mt-3">A little about you.</h1><p className="mt-3 text-muted">Your Safar account details and booking shortcuts.</p>
    <section className="panel mt-8"><div className="flex flex-col gap-5 sm:flex-row sm:items-center"><div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-forest font-heading text-3xl font-bold text-white">{initials}</div><div><h2 className="font-heading text-2xl font-semibold text-forest">{fullName}</h2><p className="mt-1 text-sm text-muted">{user?.role ? `${user.role} account` : 'Safar traveller'}</p></div></div>
      <div className="mt-8 grid gap-4 sm:grid-cols-2"><div className="rounded-2xl bg-ivory p-5"><UserRound size={19} className="text-terracotta-dark"/><p className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted">Name / username</p><p className="mt-1 break-words font-semibold text-charcoal">{fullName}</p></div><div className="rounded-2xl bg-ivory p-5"><Mail size={19} className="text-terracotta-dark"/><p className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted">Email address</p><p className="mt-1 break-all font-semibold text-charcoal">{user?.email || 'Not available'}</p></div><div className="rounded-2xl bg-ivory p-5"><ShieldCheck size={19} className="text-terracotta-dark"/><p className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted">Account status</p><p className="mt-1 font-semibold text-charcoal">Signed in</p></div><div className="rounded-2xl bg-ivory p-5"><CalendarDays size={19} className="text-terracotta-dark"/><p className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted">Member since</p><p className="mt-1 font-semibold text-charcoal">{user?.createdAt ? new Date(user.createdAt).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : 'Welcome to Safar'}</p></div></div>
      <div className="mt-7 flex flex-wrap gap-3"><Link to="/my-bookings" className="inline-flex items-center rounded-full bg-forest px-5 py-3 text-sm font-bold text-white hover:bg-forest-light">View my bookings ↗</Link><Link to="/trips" className="inline-flex items-center rounded-full border border-forest/20 px-5 py-3 text-sm font-bold text-forest hover:bg-forest/5">Explore journeys</Link></div>
    </section>
  </div></main>
}

export default Profile
