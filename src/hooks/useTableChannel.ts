import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

export interface TablaEscuchada {
  table: string
  /** Filtro de PostgREST, p. ej. `user_id=eq.${user.id}`. */
  filter?: string
  schema?: string
}

/**
 * Suscripción de tiempo real a una o varias tablas.
 *
 * Existe por un fallo que tiró Inicio dos veces, y la segunda con la traza en
 * la mano:
 *
 *     cannot add `postgres_changes` callbacks for subs:<uid> after `subscribe()`
 *
 * `RealtimeClient.channel(topic)` **devuelve el canal que ya existe** si alguien
 * registró ese nombre antes — está así en su código, no es una suposición.
 * Cuatro hooks nombraban su canal `<algo>:${user.id}`, y con un solo consumidor
 * eso no se notaba. En cuanto dos componentes montaban el mismo hook a la vez,
 * el segundo recibía el canal que el primero ya había suscrito, llamaba a
 * `.on()` y lanzaba. Un throw dentro de un efecto se lleva el árbol entero: la
 * pantalla en blanco.
 *
 * Aquí el nombre del canal lo pone el hook, no quien lo llama, así que ya no hay
 * forma de elegirlo mal. Al aislamiento de datos no le afecta: quien filtra es
 * `filter`, no el nombre.
 *
 * Dos cosas más que también estaban mal repartidas por catorce hooks:
 *
 * - `onChange` va en un ref. Antes el efecto dependía de la función de fetch, y
 *   como esa función cambia de identidad cada vez que cambia una de sus
 *   dependencias, el canal se tiraba y se volvía a crear sin necesidad.
 * - Suscribirse va en try/catch. El tiempo real es una mejora: los datos llegan
 *   igual por la consulta. Que un fallo al suscribirse deje la app sin pantalla
 *   es desproporcionado.
 */
export function useTableChannel(
  prefijo: string,
  tablas: TablaEscuchada[] | null,
  onChange: () => void,
): void {
  // Único por instancia del hook, estable entre renders. Es lo que impide que
  // dos consumidores compartan canal.
  const [clave] = useState(() => crypto.randomUUID())

  // El ref se actualiza en un efecto, no en el render: tocar `current` mientras
  // se dibuja es justo lo que la regla de React prohíbe. Declarado antes que el
  // de la suscripción para que ya esté al día cuando aquél corra.
  const cb = useRef(onChange)
  useEffect(() => {
    cb.current = onChange
  })

  // Firma estable: sin esto el efecto se reengancharía en cada render, porque
  // quien llama construye el arreglo en línea.
  const firma = tablas
    ? tablas.map((t) => `${t.schema ?? 'public'}.${t.table}?${t.filter ?? ''}`).join('|')
    : ''

  useEffect(() => {
    if (!firma) return
    const lista: TablaEscuchada[] = firma.split('|').map((parte) => {
      const [ruta, filtro] = parte.split('?')
      const [schema, table] = ruta.split('.')
      return { schema, table, filter: filtro || undefined }
    })

    let canal: ReturnType<typeof supabase.channel> | null = null
    try {
      canal = supabase.channel(`${prefijo}:${clave}`)
      for (const t of lista) {
        canal = canal.on(
          'postgres_changes',
          { event: '*', schema: t.schema ?? 'public', table: t.table, filter: t.filter },
          () => cb.current(),
        )
      }
      canal.subscribe()
    } catch (e) {
      // Sin tiempo real la app funciona: los datos ya llegaron por la consulta,
      // sólo dejan de refrescarse solos. Eso no justifica tirar la pantalla.
      console.error('[Fortnight] no se pudo suscribir a', prefijo, e)
      canal = null
    }

    return () => {
      if (canal) void supabase.removeChannel(canal)
    }
  }, [prefijo, clave, firma])
}
