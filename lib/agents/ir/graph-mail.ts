import { getGraphToken } from "@/lib/agents/graph-token";

export interface DraftResult {
  draftId: string | null;
  success: boolean;
  message: string;
}

export async function saveDraftToOutlook(params: {
  toEmail: string;
  mailboxEmail: string;
  subject: string;
  htmlBody: string;
}): Promise<DraftResult> {
  let token: string | null;
  try {
    token = await getGraphToken();
  } catch (err) {
    return { draftId: null, success: false, message: `Auth failed: ${String(err)}` };
  }

  if (!token) {
    return { draftId: null, success: false, message: "AZURE credentials not configured" };
  }

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(params.mailboxEmail)}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        subject: params.subject,
        body: { contentType: "HTML", content: params.htmlBody },
        toRecipients: [{ emailAddress: { address: params.toEmail } }],
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    return { draftId: null, success: false, message: `Graph API ${res.status}: ${err}` };
  }

  const data = await res.json();
  return { draftId: data.id, success: true, message: "Draft saved to Outlook" };
}
