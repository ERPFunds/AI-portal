// Sorting the New Contacts scan into something worth reading.
//
// The raw mailbox scan returns everyone the IR inboxes have ever exchanged a message with,
// which is thousands of addresses and mostly not people to add to a CRM. Two things cut it
// down: what sort of address it is, and whether anyone actually talked.
//
// Nothing is thrown away — everything gets a kind, and the tab decides what to show. That
// way a filter that reaches too far can be spotted and corrected rather than silently
// hiding a real prospect.

export type CaptureKind =
  | "firm"          // a business address, worth a look
  | "individual"    // gmail and the like — a person, worth a look
  | "service"       // notifications, billing, scheduling, marketing platforms
  | "platform"      // investment platforms whose mail is account/offering notices
  | "contractor"    // trades and property services — the property desk's world, not IR's
  | "legal"         // law firms
  | "education"     // schools, universities, alumni offices
  | "event"         // conferences, expos, industry bodies' event mail
  | "research"      // sell-side market commentary and research distribution
  | "utility"       // power, gas, water and telecoms suppliers to the portfolio
  | "receipt"       // purchase confirmations, shipping and delivery notices
  | "blocked";      // a domain the team has excluded by hand

/**
 * "No reply" ANYWHERE in the address, not just as the whole local part. The anchored lists
 * below miss things like reply+noreply@, noreply-billing@ and bounces.noreply.example.com,
 * which is exactly what kept turning up.
 */
const NOREPLY_ANYWHERE = /no.?reply|do.?not.?reply|donotreply|unsubscribe|mailer.?daemon/i;

/** Senders that exist to notify, bill, schedule or market. */
const SERVICE_DOMAIN =
  /(^|\.)(calendly|docusign|hellosign|adobesign|mailchimp|constantcontact|hubspot|salesforce|zoom|zoominfo|linkedin|indeed|ziprecruiter|glassdoor|dropbox|box|slack|asana|monday|notion|atlassian|intuit|quickbooks|bill|expensify|concur|ramp|brex|stripe|squareup|paypal|venmo|adp|gusto|paychex|carta|angellist|substack|beehiiv|mailerlite|sendinblue|klaviyo|surveymonkey|typeform|zocdoc|ups|fedex|usps|amazon|godaddy|squarespace|wix|wordpress|shopify|apple|google|microsoft|okta|duosecurity|1password|lastpass|zendesk|freshdesk|intercom|twilio|ringcentral|8x8|vonage|grasshopper|dialpad|loom|vimeo|youtube|spotify|opentable|resy|marriott|hilton|hyatt|delta|united|southwest|expedia|booking|airbnb|uber|lyft)\./i;

/** Local parts that mean "a system sent this", beyond the hard junk filter. */
const SERVICE_LOCAL =
  /^(info|support|help|admin|sales|marketing|team|hello|contact|billing|invoices?|accounts?|accounting|ar|ap|payments?|receipts?|orders?|service|customerservice|care|news|newsletter|updates?|alerts?|notify|notifications?|events?|rsvp|register|registration|webinars?|subscribe|unsubscribe|feedback|survey|careers|jobs|recruiting|hr|security|abuse|legal|compliance|privacy|dmarc|reports?|noreply|no-reply|donotreply|mail|email|inbox|office|general|enquiries|inquiries)$/i;

/**
 * Investment platforms and portals. Their mail is account statements, offering notices and
 * document alerts, not a person starting a conversation — FlexNet and iCapital are the two
 * the team kept seeing.
 */
const PLATFORM_DOMAIN =
  /(^|\.)(flexnet|flexnetportal|icapital|icapitalnetwork|altigo|realized1031|yieldstreet|cais|caisgroup|ipreo|dstvision|phxa|phoenixamerican|sscinc|ssctech|alps|ultimusfundsolutions|juniperssquare|junipersquare|appfolio|yardi|entrata|realpage|northcapital|dealmaker|crowdstreet|fundrise|equitymultiple|arborcrowd|rialtomarkets|tzeropartners|vertalo|securitize)\./i;

/**
 * Trades and property services. These are the property desk's suppliers, not investor
 * relations contacts, and they arrive constantly on inboxes that also handle leasing.
 */
const CONTRACTOR_DOMAIN =
  /(roofing|roofers?|plumbing|plumbers?|hvac|heating|cooling|electric(al|ians?)?|construction|contracting|contractors?|builders?|paving|asphalt|concrete|masonry|landscap(e|ing)|lawncare|irrigation|fencing|fence|glass|glazing|doors?|overheaddoor|garagedoor|striping|sweeping|snowremoval|janitorial|cleaning|restoration|remediation|abatement|pest(control)?|exterminat|fireprotection|firesafety|sprinkler|alarm|security(systems)?|surveying|survey(ors?)?|engineering|environmental|geotech|inspections?|appraisals?|welding|fabrication|millwork|flooring|painting|drywall|insulation|scaffold|crane|excavat|grading|utilit(y|ies)|septic|waste|disposal|dumpster|hauling|towing|equipmentrental|toolrental)/i;

/** Law firms. Most announce themselves in the domain. */
const LEGAL_DOMAIN =
  /(^|\.)(law|lawfirm|lawgroup|lawoffices?|attorneys?|attorneysatlaw|legal|counsel|llp)\.|(law|legal|attorney|llp)\.(com|net|org|us)$/i;

/** Schools, universities and their alumni and development offices. */
const EDUCATION_DOMAIN =
  /(\.edu|\.edu\.[a-z]{2}|\.ac\.[a-z]{2})$|(^|\.)(school|schools|academy|isd|usd|university|college|highschool|k12|pta|pto|alumni)\./i;

/**
 * Conferences, expos and the event side of industry bodies. Note this is only the EVENT
 * mail — a named person at ADISA or the FEA is a real contact and is not caught here,
 * because the pattern needs an event-ish domain or local part.
 */
const EVENT_DOMAIN =
  /(^|\.)(eventbrite|cvent|hopin|whova|bizzabo|swoogo|eventmobi|attendify|regonline|eventsquid|conferences?|conference|summit|expo|tradeshow|meetup|eventable|adisaevents|ipaevents)\./i;
const EVENT_LOCAL =
  /^(conference|conferences|summit|expo|tradeshow|attendees?|speakers?|exhibitors?|sponsorship|sponsors?|agenda|badge|badges|checkin|check-in|abstracts?)$/i;

/**
 * Sell-side research and market commentary. These arrive as broadcast distribution from a
 * named analyst or a research alias, which reads like a person writing to you but is a
 * mailing list. Jefferies is the one the team kept seeing.
 *
 * Deliberately NOT here: CBRE, JLL, Cushman, Colliers, Newmark, Marcus & Millichap. They
 * publish research too, but a named broker at one of them emailing about a listing is a real
 * contact — JLL is already a Broker in the PE prospect book. Only pure research, data and
 * media publishers belong in this list.
 */
const RESEARCH_DOMAIN =
  /(^|\.)(jefferies|jefferiesresearch|greenstreet|greenstreetadvisors|costar|reis|msci|moodys|moodysanalytics|spglobal|fitchratings|morningstar|bloomberg|refinitiv|pitchbook|preqin|hfmweek|withintelligence|institutionalinvestor|pensionsandinvestments|globest|bisnow|therealdeal|commercialobserver|connectcre|wealthmanagement|investmentnews|barrons|wsj|nytimes|economist)\./i;
const RESEARCH_LOCAL =
  /^(research|insights?|commentary|economics|strategy|marketupdates?|marketcommentary|dailybrief|morningbrief|weekly|daily|digest|editor|editorial|press|media|pr)$/i;

/**
 * Utilities and energy retailers. These serve the PROPERTIES, so a named account rep at one
 * is a property-side supplier contact and never an investor relations one. Vistra is the
 * portfolio's electricity retailer, which is why its people kept appearing.
 */
const UTILITY_DOMAIN =
  /(^|\.)(vistra|txu|reliant|nrg|oncor|centerpointenergy|atmosenergy|xcelenergy|duke-?energy|fpl|entergy|aep|pge|pgande|sce|sdge|dominionenergy|conedison|nationalgrid|elpasoelectric|swepco|tnmp|greenmountain|directenergy|gexaenergy|constellation|spectrum|comcastbusiness|coxbusiness|frontier|centurylink|lumen|windstream)\./i;

/** Purchase confirmations, shipping and delivery notices. */
const RECEIPT_LOCAL =
  /^(your)?(purchase|purchases|receipt|receipts|order|orders|shipping|shipment|delivery|deliveries|tracking|confirmation|confirm|itinerary|booking|reservations?)$/i;

/** Free/consumer mail — the person is an individual, not a firm. */
const CONSUMER_DOMAIN =
  /^(gmail|googlemail|yahoo|ymail|rocketmail|hotmail|outlook|live|msn|aol|icloud|me|mac|comcast|verizon|att|sbcglobal|bellsouth|cox|charter|earthlink|juno|protonmail|proton|pm|mail|gmx|zoho|fastmail|hushmail|tutanota|yandex)\./i;

/**
 * What sort of address this is. The order matters: the specific exclusions are tested before
 * the generic firm/individual split, so a law firm or a roofer is labelled as such rather
 * than landing in "firm".
 */
export function classify(email: string, excludedDomains?: Set<string>): CaptureKind {
  const [local, domain] = (email || "").toLowerCase().split("@");
  if (!local || !domain) return "service";
  const dot = domain + ".";                        // so (^|\.)x\. matches a bare TLD-less end

  // The hand-maintained list wins over everything: it is a decision, not a heuristic.
  // Matches the domain itself or any subdomain of it.
  if (excludedDomains?.size) {
    for (const d of excludedDomains) {
      if (domain === d || domain.endsWith("." + d)) return "blocked";
    }
  }

  // Anything announcing itself as unanswerable, wherever it appears in the address.
  if (NOREPLY_ANYWHERE.test(email)) return "service";

  // A local part that is mostly digits, or a long hex blob, is a ticket or tracking address.
  if (/^\d{4,}$/.test(local) || /^[0-9a-f]{16,}$/i.test(local)) return "service";

  if (UTILITY_DOMAIN.test(dot)) return "utility";
  if (RECEIPT_LOCAL.test(local)) return "receipt";
  if (RESEARCH_DOMAIN.test(dot) || RESEARCH_LOCAL.test(local)) return "research";
  if (PLATFORM_DOMAIN.test(dot)) return "platform";
  if (EDUCATION_DOMAIN.test(domain)) return "education";
  if (EVENT_DOMAIN.test(dot) || EVENT_LOCAL.test(local)) return "event";
  if (LEGAL_DOMAIN.test(dot)) return "legal";
  if (CONTRACTOR_DOMAIN.test(domain)) return "contractor";
  if (SERVICE_DOMAIN.test(dot)) return "service";
  if (SERVICE_LOCAL.test(local)) return "service";

  return CONSUMER_DOMAIN.test(dot) ? "individual" : "firm";
}

/** The kinds the New Contacts tab shows by default. Everything else is filtered, not deleted. */
export const CAPTURE_SHOWN: CaptureKind[] = ["firm", "individual"];

/**
 * Did a conversation actually happen? True when ERP wrote back, or when there have been
 * several messages either way. A single inbound email with no reply is not a lead yet.
 */
export function isTwoWay(sent = 0, received = 0): boolean {
  return (sent > 0 && received > 0) || sent + received >= 3;
}
