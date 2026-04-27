'use client'

import type { ReactNode } from 'react'
import { createContext, useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const supabase = createClient()
import type { Company } from '@/types/database'

export interface AuthContextType {
  user: AuthUser | null
  session: AuthSession | null
  company: Company | null
  companies: Company[]
  loading: boolean
  error: string | null
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, fullName: string) => Promise<void>
  signOut: () => Promise<void>
  switchCompany: (companyId: string) => Promise<void>
}

interface AuthUser {
  id: string
  email?: string
  user_metadata?: {
    full_name?: string
  }
}

interface AuthSession {
  access_token: string
  refresh_token: string
  expires_at: number
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined)

const ACTIVE_COMPANY_KEY = 'irrigaagro:active_company_id'

function getPersistedCompanyId(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return localStorage.getItem(ACTIVE_COMPANY_KEY)
  } catch {
    return null
  }
}

function persistCompanyId(companyId: string | null): void {
  if (typeof window === 'undefined') return
  try {
    if (companyId) {
      localStorage.setItem(ACTIVE_COMPANY_KEY, companyId)
      document.cookie = `${ACTIVE_COMPANY_KEY}=${companyId};path=/;max-age=${60 * 60 * 24 * 365};SameSite=Lax`
    } else {
      localStorage.removeItem(ACTIVE_COMPANY_KEY)
      document.cookie = `${ACTIVE_COMPANY_KEY}=;path=/;max-age=0`
    }
  } catch {
    // ignore storage errors
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [session, setSession] = useState<AuthSession | null>(null)
  const [company, setCompany] = useState<Company | null>(null)
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Fetch user's companies
  const fetchUserCompanies = useCallback(async (userId: string) => {
    try {
      const { data, error: fetchError } = await supabase
        .from('company_members')
        .select('company_id')
        .eq('user_id', userId)

      if (fetchError) throw fetchError

      if (!data || data.length === 0) {
        setCompanies([])
        setCompany(null)
        return
      }

      const companyIds = (data as unknown as Array<{ company_id: string }>).map((member) => member.company_id)

      const { data: companiesData, error: companiesError } = await supabase
        .from('companies')
        .select('*')
        .in('id', companyIds)

      if (companiesError) throw companiesError

      setCompanies(companiesData || [])

      // Restore persisted company or fallback to first
      if (companiesData && companiesData.length > 0) {
        const persistedId = getPersistedCompanyId()
        const restored = persistedId
          ? companiesData.find((c) => c.id === persistedId)
          : null
        setCompany(restored ?? companiesData[0])
      }
    } catch (err) {
      console.error('Failed to fetch user companies:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch companies')
    }
  }, [])

  // Initialize auth state via onAuthStateChange (inclui INITIAL_SESSION)
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, currentSession) => {
      if (currentSession?.user) {
        const authUser: AuthUser = {
          id: currentSession.user.id,
          email: currentSession.user.email,
          user_metadata: currentSession.user.user_metadata,
        }
        setUser(authUser)
        setSession({
          access_token: currentSession.access_token,
          refresh_token: currentSession.refresh_token,
          expires_at: currentSession.expires_at || 0,
        })

        if (
          event === 'INITIAL_SESSION' ||
          event === 'SIGNED_IN' ||
          event === 'TOKEN_REFRESHED'
        ) {
          await fetchUserCompanies(currentSession.user.id)
        }
      } else {
        setUser(null)
        setSession(null)
        setCompany(null)
        setCompanies([])
      }

      // Libera o loading após o primeiro evento (INITIAL_SESSION ou sem sessão)
      if (event === 'INITIAL_SESSION') {
        setLoading(false)
      }
    })

    return () => {
      subscription?.unsubscribe()
    }
  }, [fetchUserCompanies])

  const signIn = useCallback(
    async (email: string, password: string) => {
      try {
        setLoading(true)
        setError(null)

        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        })

        if (signInError) throw signInError

        if (data.user) {
          const authUser: AuthUser = {
            id: data.user.id,
            email: data.user.email,
            user_metadata: data.user.user_metadata,
          }
          setUser(authUser)

          if (data.session) {
            setSession({
              access_token: data.session.access_token,
              refresh_token: data.session.refresh_token,
              expires_at: data.session.expires_at || 0,
            })

            await fetchUserCompanies(data.user.id)
          }
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Sign in failed'
        setError(errorMessage)
        throw err
      } finally {
        setLoading(false)
      }
    },
    [fetchUserCompanies],
  )

  const signUp = useCallback(
    async (email: string, password: string, fullName: string) => {
      try {
        setLoading(true)
        setError(null)

        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName,
            },
          },
        })

        if (signUpError) throw signUpError

        if (data.user) {
          const authUser: AuthUser = {
            id: data.user.id,
            email: data.user.email,
            user_metadata: data.user.user_metadata,
          }
          setUser(authUser)

          if (data.session) {
            setSession({
              access_token: data.session.access_token,
              refresh_token: data.session.refresh_token,
              expires_at: data.session.expires_at || 0,
            })
          }

          // Fetch companies (trigger auto-creates a company, so fetch after signup)
          await fetchUserCompanies(data.user.id)
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Sign up failed'
        setError(errorMessage)
        throw err
      } finally {
        setLoading(false)
      }
    },
    [fetchUserCompanies],
  )

  const signOut = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const { error: signOutError } = await supabase.auth.signOut()

      if (signOutError) throw signOutError

      setUser(null)
      setSession(null)
      setCompany(null)
      setCompanies([])
      persistCompanyId(null)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Sign out failed'
      setError(errorMessage)
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  const switchCompany = useCallback(async (companyId: string) => {
    try {
      setError(null)

      const selectedCompany = companies.find((c) => c.id === companyId)

      if (!selectedCompany) {
        throw new Error('Company not found')
      }

      setCompany(selectedCompany)
      persistCompanyId(selectedCompany.id)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to switch company'
      setError(errorMessage)
      throw err
    }
  }, [companies])

  const value: AuthContextType = {
    user,
    session,
    company,
    companies,
    loading,
    error,
    signIn,
    signUp,
    signOut,
    switchCompany,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
