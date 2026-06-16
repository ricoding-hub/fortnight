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

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.location.reload()
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
