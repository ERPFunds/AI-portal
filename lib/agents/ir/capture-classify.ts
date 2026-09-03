// Sorting the New Contacts scan into something worth reading.
//
// The raw mailbox scan returns everyone the IR inboxes have ever exchanged a message with,
// which is thousands of addresses and mostly not people to add to a CRM: booking links,
// invoices, newsletters, portal notifications, conference organisers. Two things cut it down.
//
//  1. WHAT KIND OF ADDRESS IT IS — a service or automated sender is never a contact.
//  2. WHETHER ANYONE ACTUALLY TALKED — one inbound message is a stranger; a reply from ERP,
//     or several messages, is a relationship.

export type CaptureKind = "firm" | "individual" | "service";

/** Senders that exist to notify, bill, schedule or market. Never a CRM contact. */
const SERVICE_DOMAIN =
  /(^|\.)(calendly|docusign|hellosign|adobesign|eventbrite|mailchimp|constantcontact|hubspot|salesforce|zoom|zoominfo|linkedin|indeed|ziprecruiter|glassdoor|dropbox|box|slack|asana|monday|notion|atlassian|intuit|quickbooks|bill|expensify|concur|ramp|brex|stripe|squareup|paypal|venmo|adp|gusto|paychex|carta|angellist|substack|beehiiv|mailerlite|sendinblue|klaviyo|surveymonkey|typeform|eventable|meetup|zocdoc|ups|fedex|usps|amazon|godaddy|squarespace|wix|wordpress|shopify|apple|google|microsoft|okta|duosecurity|1password|lastpass|zendesk|freshdesk|intercom|twilio|ringcentral|8x8|vonage|grasshopper|dialpad|loom|vimeo|youtube|spotify|opentable|resy|marriott|hilton|hyatt|delta|united|aa|southwest|expedia|booking|airbnb|uber|lyft)\./i;

/** Local parts that mean "a system sent this", beyond the hard junk filter. */
const SERVICE_LOCAL =
  /^(info|support|help|admin|sales|marketing|team|hello|contact|billing|invoices?|accounts?|accounting|ar|ap|payments?|receipts?|orders?|service|customerservice|care|news|newsletter|updates?|alerts?|notify|notifications?|events?|rsvp|register|registration|webinars?|subscribe|unsubscribe|feedback|survey|careers|jobs|recruiting|hr|security|abuse|legal|compliance|privacy|dmarc|reports?)$/i;

/** Free/consumer mail — the person is an individual, not a firm. */
const CONSUMER_DOMAIN =
  /^(gmail|googlemail|yahoo|ymail|rocketmail|hotmail|outlook|live|msn|aol|icloud|me|mac|comcast|verizon|att|sbcglobal|bellsouth|cox|charter|earthlink|juno|protonmail|proton|pm|mail|gmx|zoho|fastmail|hushmail|tutanota|yandex)\./i;

/**
 * What sort of address this is. Service senders are the noise the team keeps seeing;
 * firm and individual are both worth a look, and the difference is useful for triage.
 */
export function classify(email: string): CaptureKind {
  const [local, domain] = (email || "").toLowerCase().split("@");
  if (!local || !domain) return "service";
  if (SERVICE_DOMAIN.test(domain + ".")) return "service";
  if (SERVICE_LOCAL.test(local)) return "service";
  // A local part that is mostly digits, or a long hex blob, is a ticket or tracking address.
  if (/^\d{4,}$/.test(local) || /^[0-9a-f]{16,}$/i.test(local)) return "service";
  return CONSUMER_DOMAIN.test(domain + ".") ? "individual" : "firm";
}

/**
 * Did a conversation actually happen? True when ERP wrote back, or when there have been
 * several messages either way. A single inbound email with no reply is not a lead yet.
 */
export function isTwoWay(sent = 0, received = 0): boolean {
  return (sent > 0 && received > 0) || sent + received >= 3;
}
