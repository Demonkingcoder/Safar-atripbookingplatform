import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import authService from '../services/authService'

const AuthContext = createContext(null)

function extractUser(response) {
  const data = response?.data ?? response
  return data?.user ?? data?.currentUser ?? (data?._id || data?.id || data?.email ? data : null)
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const refreshUser = useCallback(async () => {
    try {
      const response = await authService.getCurrentUser()
      const currentUser = extractUser(response)
      setUser(currentUser)
      return currentUser
    } catch {
      setUser(null)
      return null
    }
  }, [])

  useEffect(() => {
    let active = true
    localStorage.removeItem('safar_access_token')
    const handleSessionExpired = () => {
      localStorage.removeItem('safar_access_token')
      setUser(null)
    }
    window.addEventListener('safar:session-expired', handleSessionExpired)
    async function initialize() {
      try {
        const response = await authService.getCurrentUser()
        if (active) setUser(extractUser(response))
      } catch (error) {
        if (error?.response?.status === 401) localStorage.removeItem('safar_access_token')
        if (active) setUser(null)
      } finally {
        if (active) setLoading(false)
      }
    }
    initialize()
    return () => {
      active = false
      window.removeEventListener('safar:session-expired', handleSessionExpired)
    }
  }, [])

  const login = useCallback(async (credentials) => {
    const response = await authService.login(credentials)
    const loggedInUser = extractUser(response)
    if (loggedInUser) {
      setUser(loggedInUser)
      return loggedInUser
    }
    const refreshedUser = await refreshUser()
    if (!refreshedUser) throw new Error('Signed in, but Safar could not load your account. Please try signing in again.')
    return refreshedUser
  }, [refreshUser])

  const register = useCallback((userData) => authService.register(userData), [])

  const logout = useCallback(async () => {
    try { await authService.logout() } finally { setUser(null) }
  }, [])

  const value = useMemo(() => ({
    user,
    loading,
    isAuthenticated: Boolean(user),
    login,
    register,
    logout,
    refreshUser,
  }), [user, loading, login, register, logout, refreshUser])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside an AuthProvider')
  return context
}
