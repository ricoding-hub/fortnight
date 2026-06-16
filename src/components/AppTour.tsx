import { useEffect, useRef } from 'react'
import type { Driver } from 'driver.js'
import { useUiStore } from '@/store/uiStore'
import { createAppTour } from '@/lib/tour'

export function AppTour() {
  const tourOpen = useUiStore((s) => s.tourOpen)
  const closeTour = useUiStore((s) => s.closeTour)
  const driverRef = useRef<Driver | null>(null)

  useEffect(() => {
    if (!tourOpen) {
      driverRef.current?.destroy()
      driverRef.current = null
      return
    }
    const d = createAppTour(() => {
      closeTour()
      localStorage.setItem('fortnight_tour_seen', '1')
    })
    driverRef.current = d
    const t = window.setTimeout(() => d.drive(), 50)
    return () => window.clearTimeout(t)
  }, [tourOpen, closeTour])

  return null
}
