/**
 * Qué categoría le toca a un gasto por su nombre.
 *
 * Elegir la categoría es lo que evita que el gasto se cuente dos veces — una en
 * el sobre del plan y otra como cargo real —, y dejarlo a que el usuario se
 * acuerde es dejarlo al azar. Al escribir "Renta" ya viene elegida; siempre se
 * puede cambiar.
 */
const CATEGORIA_POR_NOMBRE: { patron: RegExp; categoria: string }[] = [
  // Transporte va primero y las palabras cortas llevan \b: sin eso "Gasolina"
  // caía en Servicios, porque "gas" casa dentro de la palabra. Adivinar de más
  // es peor que no adivinar — mete el gasto en un sobre que no le toca y libera
  // dinero que sigue comprometido.
  { patron: /transporte|gasolina|uber|did[íi]|cami[óo]n|\bmetro\b|peaje|estacionamiento|verificaci[óo]n|tenencia/i, categoria: 'transporte' },
  { patron: /\brenta\b|alquiler|\bdepa\b|departamento|\bcasa\b|hipoteca|mantenimiento/i, categoria: 'renta' },
  { patron: /\bluz\b|\bcfe\b|\bagua\b|\bgas\b|internet|telmex|totalplay|izzi|megacable|\bcable\b|tel[ée]fon|servicio|predial/i, categoria: 'servicios' },
  { patron: /despensa|s[úu]per|mandado|comida|abarrotes|mercado/i, categoria: 'comida' },
  { patron: /colegiatura|escuela|universidad|\bcurso\b|gimnasio|\bgym\b|seguro|salud|doctor|m[ée]dic|dentista|farmacia/i, categoria: 'salud' },
]

export function adivinarCategoria(nombre: string, categorias: { id: string; name: string }[]): string | null {
  const limpio = nombre.trim()
  if (!limpio) return null
  for (const { patron, categoria } of CATEGORIA_POR_NOMBRE) {
    if (!patron.test(limpio)) continue
    const c = categorias.find((x) => x.name.toLowerCase() === categoria)
    if (c) return c.id
  }
  return null
}
