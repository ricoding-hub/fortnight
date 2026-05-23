import { type ReactNode } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/hooks/useAuth'
import { useAutoSync } from '@/hooks/useAutoSync'
import { Layout } from '@/components/Layout'
import { Login } from '@/views/auth/Login'
import { AuthCallback } from '@/views/auth/AuthCallback'
import { Resumen } from '@/views/Resumen'
import { CuentasLayout } from '@/views/Cuentas'
import { MisCuentas } from '@/views/Cuentas/MisCuentas'
import { MisPrestamos } from '@/views/Cuentas/MisPrestamos'
import { Movimientos } from '@/views/Movimientos'
import { Profile } from '@/views/Profile'
import { AcercaDe } from '@/views/AcercaDe'
import { Notificaciones } from '@/views/Notificaciones'
import { PlanLayout } from '@/views/Plan'
import { Presupuesto } from '@/views/Plan/Presupuesto'
import { Objetivos } from '@/views/Plan/Objetivos'
import { Proyeccion } from '@/views/Plan/Proyeccion'
import { ToastContainer } from '@/components/ui/Toast'

function Splash({ label }: { label: string }) {
  return (
    <main className="flex min-h-svh items-center justify-center bg-bg-secondary">
      <p className="text-sm text-[#6b6375]">{label}</p>
    </main>
  )
}

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()
  // Kicks off a background refresh of synced bank credentials when the
  // session is fresh and the last sync is older than 6 hours. The hook
  // is a no-op when there is no user.
  useAutoSync()
  if (loading) return <Splash label="Cargando…" />
  return session ? <>{children}</> : <Navigate to="/login" replace />
}

function PublicOnlyRoute({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()
  if (loading) return <Splash label="Cargando…" />
  return session ? <Navigate to="/" replace /> : <>{children}</>
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route
            path="/login"
            element={
              <PublicOnlyRoute>
                <Login />
              </PublicOnlyRoute>
            }
          />
          <Route path="/auth/callback" element={<AuthCallback />} />

          <Route
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<Resumen />} />
            <Route path="/cuentas" element={<CuentasLayout />}>
              <Route index element={<Navigate to="mis" replace />} />
              <Route path="mis" element={<MisCuentas />} />
              <Route path="prestamos" element={<MisPrestamos />} />
            </Route>
            <Route path="/movimientos" element={<Movimientos />} />
            <Route path="/plan" element={<PlanLayout />}>
              <Route index element={<Navigate to="presupuesto" replace />} />
              <Route path="presupuesto" element={<Presupuesto />} />
              <Route path="objetivos" element={<Objetivos />} />
              <Route path="proyeccion" element={<Proyeccion />} />
            </Route>
            {/* Legacy URLs */}
            <Route path="/proyeccion" element={<Navigate to="/plan/proyeccion" replace />} />
            <Route path="/prestamos" element={<Navigate to="/cuentas/prestamos" replace />} />
            <Route path="/perfil" element={<Profile />} />
            <Route path="/notificaciones" element={<Notificaciones />} />
            <Route path="/acerca-de" element={<AcercaDe />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      <ToastContainer />
    </AuthProvider>
  )
}
