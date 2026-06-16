import { driver } from 'driver.js'
import type { Driver } from 'driver.js'

export function createAppTour(onDone: () => void): Driver {
  const d = driver({
    showProgress: true,
    nextBtnText: 'Siguiente →',
    prevBtnText: '← Anterior',
    doneBtnText: '¡Listo!',
    animate: true,
    smoothScroll: true,
    onDestroyStarted: () => {
      d.destroy()
      onDone()
    },
  })

  d.setSteps([
    {
      popover: {
        title: '¡Hola, soy Richeto! 👋',
        description:
          'En 30 segundos te enseño cómo leer tu situación financiera aquí.',
        side: 'over',
        align: 'center',
      },
    },
    {
      element: '#tour-hero',
      popover: {
        title: 'A pagar este mes',
        description:
          'Esta cifra es la suma de los pagos mínimos exigibles de todas tus tarjetas: el mínimo del saldo revolvente más las mensualidades MSI activas. No es tu deuda total, sino lo que el banco te pide este corte.',
        side: 'bottom',
        align: 'center',
      },
    },
    {
      element: '#tour-con-costo',
      popover: {
        title: 'Deuda con costo',
        description:
          'Saldo revolvente que genera intereses (tarjetas marcadas "Con costo"). Aquí se calcula tu pago mínimo porcentual.',
        side: 'top',
        align: 'start',
      },
    },
    {
      element: '#tour-msi',
      popover: {
        title: 'MSI 0%',
        description:
          'Principal pendiente de tus compras a meses sin interés. No genera costo, pero es un compromiso fijo mensual.',
        side: 'top',
        align: 'end',
      },
    },
    {
      element: '#tour-score',
      popover: {
        title: 'Score financiero',
        description:
          'Tu salud financiera del 1 al 10. Combina utilización de crédito, liquidez, tasa de ahorro y racha de registro. Toca la tarjeta para ver el desglose.',
        side: 'bottom',
        align: 'center',
      },
    },
    {
      element: '#tour-nav-cuentas',
      popover: {
        title: 'Tus cuentas',
        description:
          'Agrega cuentas de débito y crédito. Edita saldos con un toque. Registra tus planes de MSI aquí mismo.',
        side: 'top',
        align: 'center',
      },
    },
    {
      element: '#tour-nav-plan',
      popover: {
        title: 'Plan y proyección',
        description:
          'Ve cuándo terminas de pagar tus deudas, gestiona tu presupuesto por buckets y proyecta tu colchón mes a mes.',
        side: 'top',
        align: 'center',
      },
    },
    {
      element: '#tour-pet',
      popover: {
        title: '¡Siempre estoy aquí!',
        description:
          'Tócame cuando quieras para ver consejos o repetir este tour.',
        side: 'left',
        align: 'end',
      },
    },
  ])

  return d
}
