export interface WorkOrder {
  id: number
  address: string
  tenant: string
  quicklook_last?: string | null
  hvac_last?: string | null
  fire_last?: string | null
  flag?: string | null
}
