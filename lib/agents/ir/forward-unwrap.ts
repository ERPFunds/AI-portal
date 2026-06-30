// Recover the ORIGINAL sender + body from a forwarded email, so IR triage classifies the
// real investor — not the internal person who forwarded it (e.g. into team@erpfunds.com).

export interface Unwrapped {
  originalFrom: string;
  content: string;
  isForward: boolean;
}

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

export function unwrapForward(params: { subject: string; body: string; from: string }): Unwrapped {
  const subject = params.subject || "";
  const body = params.body || "";

  const looksForward =
    /^\s*(fwd?|fw)\s*:/i.test(subject) ||
    /-{2,}\s*forwarded message\s*-{2,}/i.test(body) ||
    /\bbegin forwarded message\b/i.test(body) ||
    /^\s*From:\s.+(\n|\r)+\s*(Sent|Date|To)\s*:/im.test(body);

  if (!looksForward) return { originalFrom: params.from, content: body, isForward: false };

  // Prefer the "From:" line in the forwarded header block.
  let originalFrom = "";
  const fromLine = body.match(/^\s*From:\s*(.+)$/im);
  if (fromLine) {
    const m = fromLine[1].match(EMAIL_RE);
    if (m) originalFrom = m[0];
  }
  // Fall back to the first non-internal email address in the body.
  if (!originalFrom || /@erpfunds\.com$/i.test(originalFrom)) {
    const all = body.match(new RegExp(EMAIL_RE.source, "gi")) || [];
    const ext = all.find((e) => !/@erpfunds\.com$/i.test(e));
    if (ext) originalFrom = ext;
  }
  if (!originalFrom) originalFrom = params.from;

  return { originalFrom, content: body, isForward: true };
}
