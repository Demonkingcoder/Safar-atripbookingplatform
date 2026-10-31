import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import Button from './Button'
import { useLanguage } from '../../context/LanguageContext'

function SearchBar({ onSearch, placeholder = 'Where do you want to go?', initialValue = '' }) {
  const { t } = useLanguage()
  const [query, setQuery] = useState(initialValue)
  useEffect(() => { setQuery(initialValue) }, [initialValue])
  function handleSubmit(event) {
    event.preventDefault()
    onSearch?.(query.trim())
  }
  return <form onSubmit={handleSubmit} role="search" className="flex w-full flex-col gap-3 rounded-2xl border border-forest/10 bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:rounded-full">
    <div className="flex min-w-0 flex-1 items-center gap-3 px-3"><Search size={19} className="shrink-0 text-forest" aria-hidden="true" /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={placeholder || t('trip.searchPlaceholder')} aria-label={t('trip.searchAria')} className="min-w-0 flex-1 bg-transparent py-3 text-sm text-charcoal outline-none placeholder:text-charcoal-light" /></div>
    <Button type="submit" variant="primary" disabled={!query.trim()}>{t('trip.findTrips')}</Button>
  </form>
}

export default SearchBar
