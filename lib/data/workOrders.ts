export interface WorkOrder {
  id: number
  address: string
  tenant: string
  quicklook_last?: string | null
  hvac_last?: string | null
  fire_last?: string | null
  backflow_last?: string | null
  elevator_last?: string | null
  crane_last?: string | null
  has_crane?: boolean | null
  flag?: string | null
}
