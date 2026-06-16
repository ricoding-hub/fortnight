import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import type { Driver } from 'driver.js'
import { useUiStore } from '@/store/uiStore'
import { createResumenTour, createCuentasTour, createPlanTour } from '@/lib/tour'

export function AppTour() {
  const tourOpen = useUiStore((s) => s.tourOpen)
  const closeTour = useUiStore((s) => s.closeTour)
  const location = useLocation()
  const driverRef = useRef<Driver | null>(null)

  useEffect(() => {
    if (!tourOpen) {
      driverRef.current?.destroy()
      driverRef.current = null
      return
    }

    const onDone = () => {
      closeTour()
      localStorage.setItem('fortnight_tour_seen', '1')
    }

    const pathname = location.pathname
    const tourFn =
      pathname.startsWith('/cuentas') ? createCuentasTour :
      pathname.startsWith('/plan')    ? createPlanTour :
      createResumenTour

    const d = tourFn(onDone)
    driverRef.current = d
    const t = window.setTimeout(() => d.drive(), 50)
    return () => window.clearTimeout(t)
  }, [tourOpen, closeTour, location.pathname])

  return null
}
