import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import useTrips from '../hooks/useTrips'
import useDebounce from '../hooks/useDebounce'
import TripCard from '../component/trips/TripCard'
import Loaders from '../component/ui/Loaders'
import SearchBar from '../component/ui/SearchBar'
import EmptyState from '../component/ui/EmptyState'
import ErrorMessage from '../component/ui/ErrorMessage'

function Trips() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [query, setQuery] = useState(searchParams.get('q') || '')
  const debouncedQuery = useDebounce(query, 250)
  const { trips, loading, error, refetch } = useTrips()
  useEffect(() => { setQuery(searchParams.get('q') || '') }, [searchParams])
  const filteredTrips = useMemo(() => {
    const search = debouncedQuery.trim().toLowerCase()
    if (!search) return trips
    return trips.filter((trip) => [trip.title, trip.name, trip.destination, trip.location, trip.description, trip.category].filter(Boolean).join(' ').toLowerCase().includes(search))
  }, [trips, debouncedQuery])
  function handleSearch(value) {
    setQuery(value)
    setSearchParams(value.trim() ? { q: value.trim() } : {})
  }
  return <main className="page-section">
    <div className="mx-auto max-w-7xl">
      <section className="max-w-3xl"><p className="eyebrow">Find your next adventure</p><h1 className="page-title mt-3">Journeys worth remembering.</h1><p className="mt-4 max-w-2xl text-base leading-7 text-muted">Discover new places, plan your journey, and find an experience worth remembering.</p></section>
      <div className="mt-8 max-w-2xl"><SearchBar onSearch={handleSearch} placeholder="Search by destination, experience, or place…" initialValue={query} /><p className="mt-2 text-xs text-muted">Press Find trips to search. Choose a journey to see details and available departures.</p></div>
      {loading && <Loaders message="Discovering journeys…" fullPage />}
      {!loading && error && <div className="mt-10"><ErrorMessage message={error} onRetry={refetch} /></div>}
      {!loading && !error && filteredTrips.length > 0 && <section className="mt-12"><div className="mb-6 flex items-end justify-between gap-4"><h2 className="font-heading text-2xl font-semibold text-forest">{debouncedQuery.trim() ? 'Search results' : 'All journeys'}</h2><p className="text-sm font-medium text-muted">{filteredTrips.length} {filteredTrips.length === 1 ? 'trip' : 'trips'}</p></div><div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{filteredTrips.map((trip) => <TripCard key={trip._id || trip.id || trip.slug} trip={trip} />)}</div></section>}
      {!loading && !error && filteredTrips.length === 0 && <div className="mt-12"><EmptyState title={debouncedQuery.trim() ? 'No matching journeys' : 'New journeys are on the way'} message={debouncedQuery.trim() ? `We couldn't find trips matching “${debouncedQuery}”. Try another destination.` : 'There are no published trips available right now. Please check back soon.'} showAction={Boolean(debouncedQuery.trim())} actionLabel="Explore all trips" actionTo="/trips" /><div className="mt-4 text-center"><button type="button" onClick={() => handleSearch('')} className="rounded-full px-4 py-2 text-sm font-bold text-forest underline underline-offset-4">Clear search</button></div></div>}
    </div>
  </main>
}

export default Trips
