import { Navigate, Outlet, useLocation, useParams } from 'react-router-dom'

/**
 * Préstamos con su propia pestaña en la barra. Antes vivía dentro de Cuentas
 * (dos toques desde Inicio) y heredaba su encabezado.
 */
export function PrestamosLayout() {
  const { pathname } = useLocation()
  // Dentro de una persona o grupo, la pantalla trae su propio encabezado.
  const enLista = pathname === '/prestamos' || pathname === '/prestamos/'
  return (
    <div className="flex flex-col animate-[fade-in_300ms_ease-out]">
      {enLista && (
        <header className="px-4 pb-2 pt-3 lg:pt-2">
          <h1 className="font-display text-[28px] font-bold tracking-tight text-text">Préstamos</h1>
          <p className="mt-0.5 text-[12.5px] font-medium text-text-secondary">Lo que te deben y lo que debes</p>
        </header>
      )}
      <Outlet />
    </div>
  )
}

/** Enlaces viejos (`/cuentas/prestamos/...`, notificaciones guardadas): a la ruta nueva. */
export function RedirigePrestamos() {
  const { groupId } = useParams()
  const { state } = useLocation()
  return <Navigate to={groupId ? `/prestamos/${groupId}` : '/prestamos'} state={state} replace />
}
