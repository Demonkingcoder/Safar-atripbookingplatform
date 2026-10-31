import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Compass, Eye, EyeOff } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import Button from '../component/ui/Button'
import authService from '../services/authService'
import { getAuthenticatedLandingPath } from '../utils/authNavigation'
import { useLanguage } from '../context/LanguageContext'

function Login() {
  const { t } = useLanguage()
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [form, setForm] = useState({ email: '', password: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const [error, setError] = useState('')
  const [verificationRequired, setVerificationRequired] = useState(false)
  const [resendMessage, setResendMessage] = useState('')
  const [resendError, setResendError] = useState('')
  const notice = location.state?.message

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setVerificationRequired(false)
    setResendMessage('')
    setResendError('')
    setLoading(true)
    try {
      const loggedInUser = await login({ email: form.email.trim().toLowerCase(), password: form.password })
      const destination = getAuthenticatedLandingPath(loggedInUser)
      navigate(destination, { replace: true })
    } catch (err) {
      if (err?.response?.data?.code === 'EMAIL_NOT_VERIFIED') {
        setVerificationRequired(true)
        setError(t('auth.verify'))
      } else if (!err?.response) {
        setError(t('auth.network'))
      } else if (err.response.status >= 500) {
        setError(t('auth.server'))
      } else {
        setError(t('auth.loginError'))
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleResendVerification() {
    setResending(true)
    setResendError('')
    setResendMessage('')
    try {
      await authService.resendVerificationEmail(form.email.trim().toLowerCase())
      setResendMessage(t('auth.resendSuccess'))
    } catch (err) {
      if (!err?.response) {
        setResendError(t('auth.network'))
      } else if (err.response.status >= 500) {
        setResendError(t('auth.resendError'))
      } else {
        setResendError(t('auth.resendError'))
      }
    } finally {
      setResending(false)
    }
  }

  return <main className="auth-page px-4 py-12 sm:px-6 sm:py-16">
    <section className="auth-card">
      <Link to="/" className="brand-lockup" aria-label="Safar home"><span className="brand-mark"><Compass size={22} /></span><span className="font-heading text-2xl font-bold text-forest">safar<span className="text-terracotta">.</span></span></Link>
      <p className="eyebrow mt-8">{t('auth.loginEyebrow')}</p>
      <h1 className="mt-3 font-heading text-4xl font-semibold text-forest">{t('auth.loginHeading')}</h1>
      <p className="mt-3 text-sm leading-6 text-muted">{t('auth.loginIntro')}</p>
      {notice && <p className="notice-success mt-5" role="status">{notice}</p>}
      <form onSubmit={handleSubmit} className="mt-7 space-y-5">
        <div className="field"><label htmlFor="login-email">{t('auth.email')}</label><input id="login-email" name="email" type="email" autoComplete="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@example.com" /></div>
        <div className="field"><label htmlFor="login-password">{t('auth.password')}</label><div className="password-wrap"><input id="login-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder={t('auth.password')} /><button type="button" onClick={() => setShowPassword((value) => !value)} className="password-toggle" aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></div>
        <div className="-mt-2 text-right"><Link to="/forgot-password" className="text-sm font-semibold text-forest underline underline-offset-4">{t('auth.forgot')}</Link></div>
        {error && <p role="alert" className="notice-error">{error}</p>}
        <Button type="submit" size="lg" className="w-full" loading={loading}>{t('auth.signIn')} <span aria-hidden="true">↗</span></Button>
        {verificationRequired && <div className="space-y-3" aria-live="polite">
          <Button type="button" variant="secondary" className="w-full" loading={resending} onClick={handleResendVerification}>{t('auth.resend')}</Button>
          {resendError && <p role="alert" className="notice-error">{resendError}</p>}
          {resendMessage && <p role="status" className="notice-success">{resendMessage}</p>}
        </div>}
      </form>
      <p className="mt-6 text-center text-sm text-muted">{t('auth.newTo')} <Link to="/register" className="font-bold text-forest underline decoration-terracotta underline-offset-4">{t('auth.create')}</Link></p>
    </section>
  </main>
}

export default Login
