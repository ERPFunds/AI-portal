import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Record a Salesforce addition/change so it surfaces in the AI Command Center activity feed
 * (the `recent_activity` RPC renders agent_id='salesforce' rows with a ☁️ Salesforce label).
 * Best-effort — never throws into the caller.
 */
export async function logSalesforceActivity(action: string, detail: string, status: "success" | "error" = "success"): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from("agent_runs").insert({
      agent_id: "salesforce",
      workflow_id: action.slice(0, 120),
      status,
      summary: (detail || "").slice(0, 200),
    });
  } catch { /* best-effort logging */ }
}
