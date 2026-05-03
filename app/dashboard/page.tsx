import { redirect } from 'next/navigation'
import { createClient as createSupabaseServer } from '@/lib/supabase/server'
import DashboardClient from '@/components/DashboardClient'
import type { RoleKey } from '@/lib/data/roles'

export default async function DashboardPage() {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role_key')
    .eq('id', user.id)
    .single()

  const roleKey = (profile?.role_key as RoleKey) ?? 'meghan'

  return <DashboardClient roleKey={roleKey} userEmail={user.email ?? ''} />
}
