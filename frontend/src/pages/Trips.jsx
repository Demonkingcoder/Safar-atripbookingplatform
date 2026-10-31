import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import useTrips from '../hooks/useTrips'
import useDebounce from '../hooks/useDebounce'
import TripCard from '../component/trips/TripCard'
import Loaders from '../component/ui/Loaders'
import SearchBar from '../component/ui/SearchBar'
import EmptyState from '../component/ui/EmptyState'
import ErrorMessage from '../component/ui/ErrorMessage'
import { useLanguage } from '../context/LanguageContext'

function Trips() {
  const { t, language } = useLanguage()
  const [searchParams, setSearchParams] = useSearchParams()
  const [query, setQuery] = useState(searchParams.get('q') || '')
  const debouncedQuery = useDebounce(query, 250)
  const { trips, loading, error, refetch } = useTrips()
  useEffect(() => { setQuery(searchParams.get('q') || '') }, [searchParams])
  const filteredTrips = useMemo(() => {
    const search = debouncedQuery.trim().toLowerCase()
    if (!search) return trips
    return trips.filter((trip) => [trip.translations?.[language]?.title || trip.title, trip.name, trip.translations?.[language]?.destination || trip.destination, trip.location, trip.translations?.[language]?.description || trip.description, trip.category].filter(Boolean).join(' ').toLowerCase().includes(search))
  }, [trips, debouncedQuery, language])
  function handleSearch(value) {
    setQuery(value)
    setSearchParams(value.trim() ? { q: value.trim() } : {})
  }
  return <main className="page-section">
    <div className="mx-auto max-w-7xl">
      <section className="max-w-3xl"><p className="eyebrow">{t('trip.searchEyebrow')}</p><h1 className="page-title mt-3">{t('trip.pageHeading')}</h1><p className="mt-4 max-w-2xl text-base leading-7 text-muted">{t('trip.pageDescription')}</p></section>
      <div className="mt-8 max-w-2xl"><SearchBar onSearch={handleSearch} placeholder={t('trip.searchPlaceholder')} initialValue={query} /><p className="mt-2 text-xs text-muted">{t('trip.searchHint')}</p></div>
      {loading && <Loaders message={t('common.loading')} fullPage />}
      {!loading && error && <div className="mt-10"><ErrorMessage message={error} onRetry={refetch} /></div>}
      {!loading && !error && filteredTrips.length > 0 && <section className="mt-12"><div className="mb-6 flex items-end justify-between gap-4"><h2 className="font-heading text-2xl font-semibold text-forest">{debouncedQuery.trim() ? t('trip.searchResults') : t('trip.allJourneys')}</h2><p className="text-sm font-medium text-muted">{filteredTrips.length} {filteredTrips.length === 1 ? t('trip.trip') : t('trip.trips')}</p></div><div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{filteredTrips.map((trip) => <TripCard key={trip._id || trip.id || trip.slug} trip={trip} />)}</div></section>}
      {!loading && !error && filteredTrips.length === 0 && <div className="mt-12"><EmptyState title={debouncedQuery.trim() ? t('trip.noMatches') : t('trip.newOnWay')} message={debouncedQuery.trim() ? t('trip.noMatchMessage', { query: debouncedQuery }) : t('trip.noPublished')} showAction={Boolean(debouncedQuery.trim())} actionLabel={t('trip.exploreAll')} actionTo="/trips" /><div className="mt-4 text-center"><button type="button" onClick={() => handleSearch('')} className="rounded-full px-4 py-2 text-sm font-bold text-forest underline underline-offset-4">{t('trip.clearSearch')}</button></div></div>}
    </div>
  </main>
}

export default Trips
