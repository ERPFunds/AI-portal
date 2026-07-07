import { getIrQaReferenceText } from "@/lib/agents/ir/qa-reference";
import { getApprovedQaForPrompt } from "@/lib/agents/ir/qa-store";

/**
 * Combined IR answer grounding used by EVERY investor-facing draft — sweep replies, due-diligence
 * replies, and app outreach — so the responses in both Outlook and the app follow the same
 * approved sources:
 *   1. The team-maintained IR Q&A Reference doc (SOP section, human-curated).
 *   2. The approved Learned Q&A (the source of the auto-generated SOP doc).
 *
 * Returns "" if neither is available. Both lookups are non-fatal so a missing/unreadable source
 * never blocks a draft.
 */
export async function getIrQaGrounding(): Promise<string> {
  let out = "";
  try {
    const ref = await getIrQaReferenceText();
    if (ref) out += `\n\n=== IR Q&A Reference (authoritative — follow this when answering investor questions) ===\n${ref}`;
  } catch {
    /* non-fatal: fall back to whatever else is available */
  }
  try {
    const approved = await getApprovedQaForPrompt();
    if (approved) out += `\n\n=== Approved Learned Q&A (reviewed by the IR team — follow these answers) ===\n${approved}`;
  } catch {
    /* non-fatal */
  }
  return out;
}
