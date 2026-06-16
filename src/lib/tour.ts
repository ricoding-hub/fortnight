import { driver } from 'driver.js'
import type { Driver, DriveStep, PopoverDOM } from 'driver.js'

function injectRicheto(popover: PopoverDOM) {
  if (popover.title.querySelector('.richeto-icon')) return
  const img = document.createElement('img')
  img.src = '/richeto.png'
  img.className = 'richeto-icon'
  img.alt = ''
  img.setAttribute('aria-hidden', 'true')
  img.style.cssText = [
    'width:28px',
    'height:28px',
    'object-fit:contain',
    'flex-shrink:0',
    'filter:drop-shadow(0 3px 6px rgba(42,75,255,0.45))',
    'animation:fn-bob 3.6s ease-in-out infinite',
  ].join(';')
  popover.title.insertBefore(img, popover.title.firstChild)
}

function makeDriver(steps: DriveStep[], onDone: () => void): Driver {
  const d = driver({
    showProgress: true,
    nextBtnText: 'Siguiente →',
    prevBtnText: '← Anterior',
    doneBtnText: '¡Listo!',
    animate: true,
    smoothScroll: true,
    onPopoverRender: injectRicheto,
    onDestroyStarted: () => {
      d.destroy()
      onDone()
    },
  })
  d.setSteps(steps)
  return d
}

export function createResumenTour(onDone: () => void): Driver {
  return makeDriver(
    [
      {
        popover: {
          title: '¡Hola! Tu resumen financiero',
          description:
            'Este panel te muestra tu situación en un vistazo. Te explico cada número.',
          side: 'over',
          align: 'center',
        },
      },
      {
        element: '#tour-hero',
        popover: {
          title: 'Lo que debes pagar este mes',
          description:
            'Es la suma de los pagos mínimos de todas tus tarjetas: el porcentaje mínimo de tu saldo libre más las mensualidades de tus planes a meses. No es tu deuda total.',
          side: 'bottom',
          align: 'center',
        },
      },
      {
        element: '#tour-con-costo',
        popover: {
          title: 'Saldo libre (con interés)',
          description:
            'La parte de tu deuda que NO está en un plan de meses. Si no la pagas completa, el banco te cobra intereses.',
          side: 'top',
          align: 'start',
        },
      },
      {
        element: '#tour-score',
        popover: {
          title: 'Score financiero',
          description:
            'Tu salud financiera del 1 al 10. Combina cuánto de tu límite usas, tu liquidez, tu ahorro y tu racha de registro.',
          side: 'bottom',
          align: 'center',
        },
      },
      {
        element: '#tour-pet',
        popover: {
          title: '¡Aquí siempre estaré!',
          description:
            'Tócame cuando quieras consejos o para repetir este tour.',
          side: 'left',
          align: 'end',
        },
      },
    ],
    onDone,
  )
}

export function createCuentasTour(onDone: () => void): Driver {
  return makeDriver(
    [
      {
        popover: {
          title: 'Cómo llevar tus cuentas',
          description:
            'Aquí registras débito, tarjetas de crédito y tus compras a meses. Te explico en 4 pasos.',
          side: 'over',
          align: 'center',
        },
      },
      {
        element: '#tour-cuentas-credito',
        popover: {
          title: 'Tus tarjetas de crédito',
          description:
            'Cada tarjeta muestra "pago mín." (lo que el banco exige este mes) y "libre" (el saldo que genera intereses si no pagas todo). Toca el monto para actualizarlo.',
          side: 'bottom',
          align: 'center',
        },
      },
      {
        element: '#tour-cuentas-msi',
        popover: {
          title: '¿Compraste algo a meses sin interés?',
          description:
            'Regístralo aquí. El app calcula tu mensualidad fija y la resta del saldo libre de la tarjeta, para que los números sean precisos.',
          side: 'top',
          align: 'center',
        },
      },
      {
        element: '#tour-cuentas-debito',
        popover: {
          title: 'Cuentas de débito',
          description:
            'Tu efectivo disponible. Toca el número de cualquier cuenta para actualizarlo — el app anota el ajuste automáticamente y lo refleja en tu balance neto.',
          side: 'bottom',
          align: 'center',
        },
      },
    ],
    onDone,
  )
}

export function createPlanTour(onDone: () => void): Driver {
  return makeDriver(
    [
      {
        popover: {
          title: 'Tu proyección financiera',
          description:
            'Aquí ves cuándo terminas de pagar tus deudas y cuánto margen tendrás cada mes.',
          side: 'over',
          align: 'center',
        },
      },
      {
        element: '#tour-plan-chart',
        popover: {
          title: 'Gráfica de deuda',
          description:
            'Muestra cómo baja tu deuda mes a mes con tu ingreso disponible actual. Desliza para ver cada mes.',
          side: 'bottom',
          align: 'center',
        },
      },
      {
        element: '#tour-plan-colchon',
        popover: {
          title: 'Compromisos y colchón',
          description:
            'Cuánto se llevan tus planes a meses cada mes (va bajando cuando terminan) y cuánto te sobra de tu disponible.',
          side: 'top',
          align: 'center',
        },
      },
    ],
    onDone,
  )
}
