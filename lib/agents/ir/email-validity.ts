// Guard against non-real addresses ever becoming a Salesforce contact or a logged note:
//  - inline-image content-IDs (Outlook embeds images as image001.png@01dd203f… — not an address)
//  - no-reply / automated senders and system notifications (Skype voicemail, mailer-daemon, bounces)
// Used before find-or-create in logReplyNote / logCorrespondence and when picking sent-mail targets.

const IMAGE_CID = /\.(png|jpe?g|gif|bmp|tiff?|svg|webp)@/i;          // image001.png@01dd203f.dc
const JUNK_LOCAL = /^(no-?reply|do-?not-?reply|postmaster|mailer-daemon|bounce|bounces|notification|notifications|donotreply)$/i;
const JUNK_DOMAIN = /(voicemail|skype|calendar-server|bounces?\.|mailer-daemon|sendgrid\.net|mailgun\.|amazonses\.com|sparkpostmail|\.microsoft\.com)$/i;
const CID_DOMAIN = /^[0-9a-f]{8}[.-]/i;                              // @01dd203f.<junk>

/** True only for a plausibly real, reachable person's email — safe to write to the CRM. */
export function isRealContactEmail(email: string): boolean {
  const e = (email || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return false;          // basic shape
  if (IMAGE_CID.test(e)) return false;                             // inline-image content-id
  const [local, domain] = e.split("@");
  if (JUNK_LOCAL.test(local)) return false;                        // no-reply, mailer-daemon, …
  if (JUNK_DOMAIN.test(domain)) return false;                      // voicemail / skype / *.microsoft.com …
  if (CID_DOMAIN.test(domain)) return false;                       // content-id host
  return true;
}
