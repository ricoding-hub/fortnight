export interface Brand {
  id: string
  name: string
  color: string
  type: 'bank' | 'subscription' | 'other'
  initials: string
}

export const BRANDS: Brand[] = [
  // Mexican banks / fintechs
  { id: 'nu',          name: 'Nu',            color: '#820AD1', type: 'bank',         initials: 'Nu' },
  { id: 'bbva',        name: 'BBVA',          color: '#0066CC', type: 'bank',         initials: 'B'  },
  { id: 'santander',   name: 'Santander',     color: '#EC0000', type: 'bank',         initials: 'S'  },
  { id: 'banamex',     name: 'Banamex',       color: '#CC0000', type: 'bank',         initials: 'Bx' },
  { id: 'banorte',     name: 'Banorte',       color: '#003087', type: 'bank',         initials: 'Bn' },
  { id: 'hsbc',        name: 'HSBC',          color: '#DB0011', type: 'bank',         initials: 'H'  },
  { id: 'klar',        name: 'Klar',          color: '#7C3AED', type: 'bank',         initials: 'K'  },
  { id: 'plata',       name: 'Plata',         color: '#1E40AF', type: 'bank',         initials: 'P'  },
  { id: 'hey',         name: 'Hey Banco',     color: '#00BFB3', type: 'bank',         initials: 'Hy' },
  { id: 'stori',       name: 'Stori',         color: '#5B21B6', type: 'bank',         initials: 'St' },
  { id: 'spin',        name: 'Spin',          color: '#059669', type: 'bank',         initials: 'Sp' },
  { id: 'mercadopago', name: 'Mercado Pago',  color: '#009EE3', type: 'bank',         initials: 'MP' },
  { id: 'scotiabank',  name: 'Scotiabank',    color: '#EC111A', type: 'bank',         initials: 'Sc' },
  { id: 'inbursa',     name: 'Inbursa',       color: '#003A7A', type: 'bank',         initials: 'In' },
  { id: 'azteca',      name: 'Banco Azteca',  color: '#F97316', type: 'bank',         initials: 'Az' },
  // Subscriptions
  { id: 'netflix',     name: 'Netflix',       color: '#E50914', type: 'subscription', initials: 'N'  },
  { id: 'spotify',     name: 'Spotify',       color: '#1DB954', type: 'subscription', initials: 'S'  },
  { id: 'disney',      name: 'Disney+',       color: '#0063E5', type: 'subscription', initials: 'D+' },
  { id: 'hbo',         name: 'Max',           color: '#0B0CFF', type: 'subscription', initials: 'M'  },
  { id: 'prime',       name: 'Prime Video',   color: '#00A8E1', type: 'subscription', initials: 'P'  },
  { id: 'appletv',     name: 'Apple TV+',     color: '#555555', type: 'subscription', initials: 'TV' },
  { id: 'youtube',     name: 'YouTube',       color: '#FF0000', type: 'subscription', initials: 'YT' },
  { id: 'chatgpt',     name: 'ChatGPT Plus',  color: '#10A37F', type: 'subscription', initials: 'AI' },
  { id: 'icloud',      name: 'iCloud',        color: '#1C6EF2', type: 'subscription', initials: 'iC' },
  { id: 'gym',         name: 'Gimnasio',      color: '#F97316', type: 'subscription', initials: 'GY' },
  { id: 'microsoft',   name: 'Microsoft 365', color: '#D83B01', type: 'subscription', initials: 'M'  },
  { id: 'adobe',       name: 'Adobe CC',      color: '#FF0000', type: 'subscription', initials: 'Ai' },
  { id: 'canva',       name: 'Canva Pro',     color: '#00C4CC', type: 'subscription', initials: 'C'  },
  { id: 'notion',      name: 'Notion',        color: '#000000', type: 'subscription', initials: 'N'  },
  { id: 'duolingo',    name: 'Duolingo',      color: '#58CC02', type: 'subscription', initials: 'D'  },
]

export const BANK_BRANDS = BRANDS.filter((b) => b.type === 'bank')
export const SUBSCRIPTION_BRANDS = BRANDS.filter((b) => b.type === 'subscription')

export function findBrand(nameOrId: string): Brand | undefined {
  if (!nameOrId) return undefined
  const q = nameOrId.toLowerCase()
  return BRANDS.find((b) => b.id === q || b.name.toLowerCase().includes(q))
}
