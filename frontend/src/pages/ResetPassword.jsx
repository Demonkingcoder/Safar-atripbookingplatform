import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Compass, Eye, EyeOff } from 'lucide-react'
import Button from '../component/ui/Button'
import authService from '../services/authService'
import { useLanguage } from '../context/LanguageContext'

function ResetPassword() {
  const { t } = useLanguage()
  const { token } = useParams()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmation, setShowConfirmation] = useState(false)
  const [loading, setLoading] = useState(false)
  const [complete, setComplete] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    if (password.length < 8) {
      setError(t('auth.passwordLength'))
      return
    }
    if (password !== confirmPassword) {
      setError(t('auth.passwordMismatch'))
      return
    }
    setLoading(true)
    try {
      await authService.resetPassword(token, password)
      setComplete(true)
      setPassword('')
      setConfirmPassword('')
    } catch (requestError) {
      setError(requestError?.response?.status === 400
        ? t('auth.verifyFailure')
        : t('auth.resetFailed'))
    } finally {
      setLoading(false)
    }
  }

  return <main className="auth-page px-4 py-12 sm:px-6 sm:py-16">
    <section className="auth-card">
      <Link to="/" className="brand-lockup" aria-label="Safar home"><span className="brand-mark"><Compass size={22} /></span><span className="font-heading text-2xl font-bold text-forest">safar<span className="text-terracotta">.</span></span></Link>
      <p className="eyebrow mt-8">{t('auth.accountRecovery')}</p>
      <h1 className="mt-3 font-heading text-4xl font-semibold text-forest">{t('auth.resetTitle')}</h1>
      {complete ? <div className="mt-6 space-y-4" aria-live="polite">
        <p className="notice-success" role="status">{t('auth.resetSuccess')}</p>
        <Link to="/login" className="inline-flex font-semibold text-forest underline underline-offset-4">{t('auth.continueSignIn')}</Link>
      </div> : <>
        <p className="mt-3 text-sm leading-6 text-muted">{t('auth.passwordLength')}</p>
        <form onSubmit={handleSubmit} className="mt-7 space-y-5">
          <div className="field"><label htmlFor="new-password">{t('auth.newPassword')}</label><div className="password-wrap"><input id="new-password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} /><button type="button" onClick={() => setShowPassword((shown) => !shown)} className="password-toggle" aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></div>
          <div className="field"><label htmlFor="confirm-password">{t('auth.confirmPassword')}</label><div className="password-wrap"><input id="confirm-password" type={showConfirmation ? 'text' : 'password'} autoComplete="new-password" minLength={8} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /><button type="button" onClick={() => setShowConfirmation((shown) => !shown)} className="password-toggle" aria-label={showConfirmation ? t('auth.hidePassword') : t('auth.showPassword')}>{showConfirmation ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></div>
          {error && <p className="notice-error" role="alert">{error}</p>}
          <Button type="submit" size="lg" className="w-full" loading={loading}>{t('auth.reset')}</Button>
        </form>
        <p className="mt-6 text-center text-sm text-muted"><Link to="/forgot-password" className="font-bold text-forest underline underline-offset-4">{t('auth.sendReset')}</Link></p>
      </>}
    </section>
  </main>
}

export default ResetPassword
