import { getGraphToken } from "@/lib/agents/graph-token";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function markdownToHtmlParagraphs(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((para) => {
      const trimmed = para.trim();
      if (!trimmed) return "";
      const withBold = trimmed.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
      const withBullets = withBold.replace(/^[•\-]\s/gm, "· ");
      return `<p style="line-height:1.7;color:#374151;margin:0 0 14px;font-size:14px;">${withBullets}</p>`;
    })
    .join("");
}

export async function sendReplyEmail(params: {
  to: string;
  originalSubject: string;
  workflowId: string;
  projectContext: string;
  summary: string;
  oneDriveUrl?: string | null;
  outputContent?: string | null;
  isError?: boolean;
}) {
  const statusColor = params.isError ? "#dc2626" : "#16a34a";
  const statusLabel = params.isError ? "Error" : "Complete";

  const driveSection = params.oneDriveUrl
    ? `<tr><td style="padding:0 24px 16px;">
        <a href="${escapeHtml(params.oneDriveUrl)}"
           style="display:inline-block;background:#0f172a;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600;">
          View in Shared Drive →
        </a>
      </td></tr>`
    : "";

  const contentSection = params.outputContent
    ? `<tr><td style="padding:0 24px 20px;">
        <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#6b7280;margin-bottom:10px;">Output</div>
        <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:6px;padding:20px 24px;font-family:Georgia,serif;font-size:14px;line-height:1.8;color:#1f2937;white-space:pre-wrap;overflow-wrap:break-word;">
          ${markdownToHtmlParagraphs(params.outputContent)}
        </div>
      </td></tr>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:24px 16px;">
  <tr><td align="center">
    <table width="100%" style="max-width:640px;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">

      <tr><td style="background:#0f172a;padding:22px 24px;">
        <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#94a3b8;margin-bottom:5px;">
          ERP Industrials · Agent 1 · LP Market Intelligence
        </div>
        <div style="font-size:18px;font-weight:700;color:#fff;line-height:1.3;">
          ${escapeHtml(params.originalSubject)}
        </div>
        <div style="margin-top:8px;">
          <span style="font-size:11px;color:${statusColor};font-weight:600;background:rgba(255,255,255,0.08);padding:3px 10px;border-radius:12px;border:1px solid ${statusColor};">
            ${statusLabel}
          </span>
          <span style="font-size:12px;color:#94a3b8;margin-left:8px;">${escapeHtml(params.workflowId)} · ${escapeHtml(params.projectContext)}</span>
        </div>
      </td></tr>

      <tr><td style="padding:20px 24px 12px;">
        <p style="margin:0;font-size:14px;color:#374151;line-height:1.6;">${escapeHtml(params.summary)}</p>
      </td></tr>

      ${driveSection}
      ${contentSection}

      <tr><td style="padding:16px 24px;background:#f8fafc;border-top:1px solid #e5e7eb;">
        <p style="margin:0;font-size:12px;color:#9ca3af;">
          Open the portal for Step 5 — manual refinement with Claude. Questions: ask Meghan or Michele Parad.
        </p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;

  // Send via Microsoft Graph API (same as newsletter send — no SMTP auth required)
  const token = await getGraphToken();
  if (!token) {
    throw new Error("Graph token unavailable — AZURE credentials not configured");
  }

  const senderMailbox = process.env.SMTP_USER ?? "mparad@erpfunds.com";

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(senderMailbox)}/sendMail`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          subject: `[Agent 1] Re: ${params.originalSubject}`,
          body: { contentType: "HTML", content: html },
          toRecipients: [{ emailAddress: { address: params.to } }],
        },
        saveToSentItems: true,
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Graph sendMail failed ${res.status}: ${err}`);
  }
}
