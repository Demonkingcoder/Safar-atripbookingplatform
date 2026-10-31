import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { LanguageProvider } from './context/LanguageContext'
import MainLayout from './layouts/MainLayout'
import Home from './pages/Home'
import Trips from './pages/Trips'
import TripDetails from './pages/TripDetails'
import Booking from './pages/Booking'
import MyBookings from './pages/MyBookings'
import Login from './pages/Login'
import Register from './pages/Register'
import VerifyEmail from './pages/VerifyEmail'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import Profile from './pages/Profile'
import Loaders from './component/ui/Loaders'
import { getAuthenticatedLandingPath } from './utils/authNavigation'

function ProtectedRoute({ children, roles }) {
  const { isAuthenticated, loading, user } = useAuth()
  const location = useLocation()
  if (loading) return <Loaders fullPage />
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location }} />
  if (roles && !roles.includes(user?.role)) return <Navigate to={getAuthenticatedLandingPath(user)} replace />
  return children
}

function GuestRoute({ children }) {
  const { isAuthenticated, loading, user } = useAuth()
  if (loading) return <Loaders fullPage />
  if (isAuthenticated) return <Navigate to={getAuthenticatedLandingPath(user)} replace />
  return children
}

function AppRoutes() {
  return <Routes>
    <Route path="/" element={<MainLayout><Home /></MainLayout>} />
    <Route path="/trips" element={<MainLayout><Trips /></MainLayout>} />
    <Route path="/trips/:slug" element={<MainLayout><TripDetails /></MainLayout>} />
    <Route path="/trips/:slug/book" element={<MainLayout><ProtectedRoute roles={['customer']}><Booking /></ProtectedRoute></MainLayout>} />
    <Route path="/login" element={<GuestRoute><MainLayout><Login /></MainLayout></GuestRoute>} />
    <Route path="/register" element={<GuestRoute><MainLayout><Register /></MainLayout></GuestRoute>} />
    <Route path="/forgot-password" element={<MainLayout><ForgotPassword /></MainLayout>} />
    <Route path="/reset-password" element={<Navigate to="/forgot-password" replace />} />
    <Route path="/reset-password/:token" element={<MainLayout><ResetPassword /></MainLayout>} />
    <Route path="/verify-email" element={<MainLayout><VerifyEmail /></MainLayout>} />
    <Route path="/verify-email/:token" element={<MainLayout><VerifyEmail /></MainLayout>} />
    <Route path="/profile" element={<MainLayout><ProtectedRoute><Profile /></ProtectedRoute></MainLayout>} />
    <Route path="/my-bookings" element={<MainLayout><ProtectedRoute roles={['customer']}><MyBookings /></ProtectedRoute></MainLayout>} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
}

function App() {
  return <BrowserRouter><LanguageProvider><AuthProvider><AppRoutes /></AuthProvider></LanguageProvider></BrowserRouter>
}

export default App
