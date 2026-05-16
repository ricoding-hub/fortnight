/**
 * Stable icon registry — maps DB-stored string keys (e.g. 'rent', 'food') to
 * Tabler icon components. Keep keys short and lowercase. Reused by Plan/Goals
 * to render icons stored as plain text in budget_items / goals.
 */
import {
  IconHome,
  IconToolsKitchen2,
  IconBolt,
  IconCar,
  IconSparkles,
  IconCreditCard,
  IconTarget,
  IconShield,
  IconRocket,
  IconFlame,
  IconHeartbeat,
  IconCash,
  IconTicket,
  IconGift,
  IconDots,
  IconUsers,
  IconWallet,
  IconCategory,
  type Icon,
} from '@tabler/icons-react'

const REGISTRY: Record<string, Icon> = {
  rent: IconHome,
  food: IconToolsKitchen2,
  bolt: IconBolt,
  car: IconCar,
  sparkles: IconSparkles,
  card: IconCreditCard,
  target: IconTarget,
  shield: IconShield,
  rocket: IconRocket,
  flame: IconFlame,
  heart: IconHeartbeat,
  cash: IconCash,
  ticket: IconTicket,
  gift: IconGift,
  dots: IconDots,
  users: IconUsers,
  wallet: IconWallet,
}

export function iconFor(key: string | null | undefined): Icon {
  if (!key) return IconCategory
  return REGISTRY[key] ?? IconCategory
}
