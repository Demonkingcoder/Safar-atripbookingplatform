import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Compass, Eye, EyeOff } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import Button from '../component/ui/Button'
import authService from '../services/authService'
import { getErrorMessage } from '../services/api'
import { getAuthenticatedLandingPath } from '../utils/authNavigation'

function Login() {
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
      const responseMessage = err?.response?.data?.message || ''
      if (err?.response?.status === 403 && /verify.*email/i.test(responseMessage)) {
        setVerificationRequired(true)
        setError('Please verify your email address before continuing.')
      } else if (!err?.response) {
        setError('We could not reach the server. Check your connection and try again.')
      } else if (err.response.status >= 500) {
        setError('The server could not complete sign in. Please try again shortly.')
      } else {
        setError(getErrorMessage(err, 'Unable to sign in. Check your email and password.'))
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
      setResendMessage('If this email belongs to an account that still needs verification, a verification email will be sent. Check your inbox and spam folder. If you have already verified your email, please sign in again.')
    } catch (err) {
      if (!err?.response) {
        setResendError('We could not reach the server. Check your connection and try again.')
      } else if (err.response.status >= 500) {
        setResendError('We could not send the verification email right now. Please try again later.')
      } else {
        setResendError(getErrorMessage(err, 'Unable to resend the verification email. Please try again.'))
      }
    } finally {
      setResending(false)
    }
  }

  return <main className="auth-page px-4 py-12 sm:px-6 sm:py-16">
    <section className="auth-card">
      <Link to="/" className="brand-lockup" aria-label="Safar home"><span className="brand-mark"><Compass size={22} /></span><span className="font-heading text-2xl font-bold text-forest">safar<span className="text-terracotta">.</span></span></Link>
      <p className="eyebrow mt-8">Your next chapter awaits</p>
      <h1 className="mt-3 font-heading text-4xl font-semibold text-forest">Welcome back.</h1>
      <p className="mt-3 text-sm leading-6 text-muted">Sign in to manage your journeys and keep your plans in one place.</p>
      {notice && <p className="notice-success mt-5" role="status">{notice}</p>}
      <form onSubmit={handleSubmit} className="mt-7 space-y-5">
        <div className="field"><label htmlFor="login-email">Email address</label><input id="login-email" name="email" type="email" autoComplete="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@example.com" /></div>
        <div className="field"><label htmlFor="login-password">Password</label><div className="password-wrap"><input id="login-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Enter your password" /><button type="button" onClick={() => setShowPassword((value) => !value)} className="password-toggle" aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></div>
        <div className="-mt-2 text-right"><Link to="/forgot-password" className="text-sm font-semibold text-forest underline underline-offset-4">Forgot password?</Link></div>
        {error && <p role="alert" className="notice-error">{error}</p>}
        <Button type="submit" size="lg" className="w-full" loading={loading}>Sign in <span aria-hidden="true">↗</span></Button>
        {verificationRequired && <div className="space-y-3" aria-live="polite">
          <Button type="button" variant="secondary" className="w-full" loading={resending} onClick={handleResendVerification}>Resend verification email</Button>
          {resendError && <p role="alert" className="notice-error">{resendError}</p>}
          {resendMessage && <p role="status" className="notice-success">{resendMessage}</p>}
        </div>}
      </form>
      <p className="mt-6 text-center text-sm text-muted">New to Safar? <Link to="/register" className="font-bold text-forest underline decoration-terracotta underline-offset-4">Create an account</Link></p>
    </section>
  </main>
}

export default Login
