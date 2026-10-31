import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Compass } from 'lucide-react'
import Button from '../component/ui/Button'
import authService from '../services/authService'
import { useLanguage } from '../context/LanguageContext'

function ForgotPassword() {
  const { t } = useLanguage()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      await authService.requestPasswordReset(email.trim().toLowerCase())
      setSubmitted(true)
    } catch {
      setError(t('auth.resetFailed'))
    } finally {
      setLoading(false)
    }
  }

  return <main className="auth-page px-4 py-12 sm:px-6 sm:py-16">
    <section className="auth-card">
      <Link to="/" className="brand-lockup" aria-label="Safar home"><span className="brand-mark"><Compass size={22} /></span><span className="font-heading text-2xl font-bold text-forest">safar<span className="text-terracotta">.</span></span></Link>
      <p className="eyebrow mt-8">{t('auth.accountRecovery')}</p>
      <h1 className="mt-3 font-heading text-4xl font-semibold text-forest">{t('auth.forgotTitle')}</h1>
      {submitted ? <div className="mt-6 space-y-4" aria-live="polite">
        <p className="notice-success" role="status">{t('auth.forgotIntro')}</p>
        <Link to="/login" className="inline-flex font-semibold text-forest underline underline-offset-4">{t('auth.continueSignIn')}</Link>
      </div> : <>
        <p className="mt-3 text-sm leading-6 text-muted">{t('auth.forgotIntro')}</p>
        <form onSubmit={handleSubmit} className="mt-7 space-y-5">
          <div className="field"><label htmlFor="forgot-email">{t('auth.email')}</label><input id="forgot-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></div>
          {error && <p className="notice-error" role="alert">{error}</p>}
          <Button type="submit" size="lg" className="w-full" loading={loading}>{t('auth.sendReset')}</Button>
        </form>
        <p className="mt-6 text-center text-sm text-muted"><Link to="/login" className="font-bold text-forest underline underline-offset-4">{t('auth.continueSignIn')}</Link></p>
      </>}
    </section>
  </main>
}

export default ForgotPassword
