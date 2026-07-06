import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// iOS PWA: el navegador no verifica actualizaciones del SW cuando la app
// vuelve del background. Este listener lo fuerza en cada visita activa,
// y recarga la página cuando un nuevo SW toma control.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.ready.then((reg) => {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        reg.update()
      }
    })
  })

  // Reload only on genuine SW *updates*. With clientsClaim, controllerchange
  // also fires on the very first install (previous controller = null), which
  // used to flash-reload a user's first visit; and without the flag,
  // back-to-back updates could reload more than once.
  const hadController = !!navigator.serviceWorker.controller
  let refreshing = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || refreshing) return
    refreshing = true
    window.location.reload()
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
