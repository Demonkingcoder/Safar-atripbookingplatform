import { Languages } from 'lucide-react'
import { useLanguage } from '../../context/LanguageContext'

function LanguageSwitcher({ className = '' }) {
  const { language, setLanguage, t } = useLanguage()
  return <label className={`language-switcher inline-flex items-center gap-2 rounded-full border border-forest/15 bg-white px-3 py-2 text-sm font-semibold text-forest ${className}`}>
    <Languages size={16} aria-hidden="true" />
    <span className="sr-only">{t('language')}</span>
    <select aria-label={t('language')} value={language} onChange={(event) => setLanguage(event.target.value)} className="language-select cursor-pointer text-sm font-semibold text-forest outline-none focus-visible:ring-2 focus-visible:ring-terracotta">
      <option value="en">{t('english')}</option>
      <option value="hi">{t('hindi')}</option>
    </select>
  </label>
}

export default LanguageSwitcher
