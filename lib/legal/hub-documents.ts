import { LEGAL_DOCUMENTS } from "@/lib/legal/documents";

type LegalHubSection = {
  title: string;
  body: string;
};

type PublishedLegalHubDocument = {
  status: "published";
  label: string;
  shortLabel: string;
  sourceHref: string;
  version: string;
  effectiveDate: string;
  acceptanceEligible: true;
  plainWords: string;
  sections: readonly LegalHubSection[];
};

type CounselPendingLegalHubDocument = {
  status: "counsel_pending";
  label: string;
  shortLabel: string;
  sourceHref: null;
  version: null;
  effectiveDate: null;
  acceptanceEligible: false;
  plainWords: string;
  sections: readonly LegalHubSection[];
};

export type LegalHubDocument = PublishedLegalHubDocument | CounselPendingLegalHubDocument;

export const LEGAL_HUB_DOCUMENTS = {
  terms: {
    status: "published",
    label: LEGAL_DOCUMENTS.terms.label,
    shortLabel: "Terms",
    sourceHref: LEGAL_DOCUMENTS.terms.href,
    version: LEGAL_DOCUMENTS.terms.version,
    effectiveDate: LEGAL_DOCUMENTS.terms.effectiveDate,
    acceptanceEligible: true,
    plainWords:
      "These terms explain how clients, barbers, shop owners, and BVRB3R use the platform, how bookings become real, and which responsibilities stay with each participant.",
    sections: [
      {
        title: "Platform role",
        body: "BVRB3R provides technology for discovery, booking, chair-business operations, and shop operations. Unless expressly stated otherwise, grooming services are provided by independent barbers or shops, not by BVRB3R."
      },
      {
        title: "Accounts and eligibility",
        body: "Account information must be accurate, credentials must be protected, and each person may use only the authority assigned to their role. Professional and business users remain responsible for their licenses, insurance, taxes, and other legal requirements."
      },
      {
        title: "Bookings and service policies",
        body: "Applicable prices, durations, deposits, cancellation, lateness, no-show, refund, and shop rules must be shown before confirmation. A booking is confirmed only when server and payment truth show that it is confirmed."
      },
      {
        title: "Payments, refunds, disputes, and payouts",
        body: "Disclosed processors handle payment activity, while processor, server, and database records control status. Payouts may depend on completed service, successful payment, valid routing, verification, and the absence of an active refund, dispute, or compliance hold."
      },
      {
        title: "Professional responsibilities",
        body: "Barbers and shop owners must keep profiles, services, pricing, availability, relationships, policies, and payout information accurate. They may not misuse client data, misrepresent credentials, manipulate bookings or reviews, or enter data outside their authorized scope."
      },
      {
        title: "Culture and prohibited conduct",
        body: "Content and messages must be lawful, authentic, respectful, and safe. Security bypasses, protected-data scraping, malicious code, payment or kiosk abuse, unlawful discrimination, impersonation, harassment, and fraudulent reviews are prohibited."
      },
      {
        title: "Subscriptions and account control",
        body: "Standard, Pro, and Elite are feature-access tiers, not account roles. Standard costs $0. Material legal updates are versioned and presented for acceptance when required, and account access may be restricted to protect users, money, platform integrity, or legal compliance."
      }
    ]
  },
  privacy: {
    status: "published",
    label: LEGAL_DOCUMENTS.privacy.label,
    shortLabel: "Privacy",
    sourceHref: LEGAL_DOCUMENTS.privacy.href,
    version: LEGAL_DOCUMENTS.privacy.version,
    effectiveDate: LEGAL_DOCUMENTS.privacy.effectiveDate,
    acceptanceEligible: true,
    plainWords:
      "This policy explains what BVRB3R collects, why the product needs it, who may see it, how it is protected, and the controls available to the person whose information it is.",
    sections: [
      {
        title: "Information collected",
        body: "BVRB3R may collect account, contact, verification, role, profile, service, availability, booking, receipt, message, review, device, consent, support, and security information needed to operate the platform. Sensitive payment-card and identity-verification data may be collected directly by a disclosed provider."
      },
      {
        title: "How information is used",
        body: "Information supports authentication, role-correct experiences, discovery, booking, payment, payout, kiosk, messaging, reviews, verification, fraud prevention, support, reliability, measurement, and legal compliance."
      },
      {
        title: "Role-based visibility",
        body: "Clients, barbers, shop owners, kiosk devices, and protected internal operators receive different views based on role, relationship, and permission. Private payout, tax, verification, contact, and operational records are not public-profile fields."
      },
      {
        title: "Sharing and service providers",
        body: "Information may be shared with the participants in a booking, providers that operate the product, authorities when law requires it, or a lawful business successor. BVRB3R does not sell payment credentials."
      },
      {
        title: "Retention and security",
        body: "Records are kept only as reasonably necessary for the service, user choices, security, fraud prevention, payment reconciliation, taxes, disputes, audits, legal holds, and applicable law. Protection includes authentication, authorization, row-level security, server validation, encryption in transit, provider controls, audit records, and restricted access."
      },
      {
        title: "Your choices and rights",
        body: "Depending on location, a user may request access, correction, deletion, export, restriction, or objection; manage notification and marketing choices; revoke optional permissions; and appeal certain decisions. Identity verification and lawful retention exceptions may apply."
      }
    ]
  },
  community: {
    status: "published",
    label: LEGAL_DOCUMENTS.community.label,
    shortLabel: "Community",
    sourceHref: LEGAL_DOCUMENTS.community.href,
    version: LEGAL_DOCUMENTS.community.version,
    effectiveDate: LEGAL_DOCUMENTS.community.effectiveDate,
    acceptanceEligible: true,
    plainWords:
      "Use a real identity, share real work, respect other people, protect private information, and do not manipulate the marketplace, reviews, bookings, payments, rewards, or queue.",
    sections: [
      {
        title: "Real people and real work",
        body: "Identity, profile, service, shop, portfolio, booking, and credential information must be accurate. Impersonation and fabricated appointments, qualifications, ratings, followers, or reviews are prohibited."
      },
      {
        title: "Respectful Culture",
        body: "Harassment, threats, hate, targeted abuse, sexual exploitation, doxxing, intimidation, and discriminatory conduct are prohibited. Criticism must not attack protected identity or personal safety."
      },
      {
        title: "Authentic marketplace trust",
        body: "Reviews must reflect genuine experiences. Retaliation, review manipulation, incentives conditioned on positive ratings, competitor attacks, and duplicate or automated reviews are prohibited."
      },
      {
        title: "Safe content and consent",
        body: "Only share content you have the right to use. Do not publish private client information, illegal or dangerous content, malicious links, or copyrighted work without permission. Messages must support legitimate workflows and required opt-outs must be honored."
      },
      {
        title: "Payment, referral, reward, and kiosk integrity",
        body: "Do not bypass platform rules, manipulate fees, create fake referrals, abuse rewards, submit fraudulent disputes, interfere with walk-in rotation, expose kiosk data, or use another person's payment or account information without authority."
      },
      {
        title: "Reporting and appeals",
        body: "BVRB3R may preserve evidence, limit visibility, remove content, restrict actions, suspend access, or refer matters when reasonably necessary for safety, legal compliance, fraud prevention, or platform integrity. Users may request review through Support."
      }
    ]
  },
  paymentTerms: {
    status: "counsel_pending",
    label: "Payment Terms",
    shortLabel: "Payment Terms",
    sourceHref: null,
    version: null,
    effectiveDate: null,
    acceptanceEligible: false,
    plainWords:
      "No Payment Terms are published or effective yet. This placeholder exists so the missing legal dependency stays visible instead of being presented as an agreement.",
    sections: [
      {
        title: "Current status",
        body: "Counsel review is still required. BVRB3R has not assigned an effective date or publishable version, and this surface cannot record acceptance."
      },
      {
        title: "What remains gated",
        body: "Any production capability that legally depends on separate Payment Terms must remain unavailable until a counsel-approved, dated document is published and the user receives the required review and acceptance flow."
      },
      {
        title: "Publication path",
        body: "After counsel approval, BVRB3R must publish the exact approved text with a version and effective date, update the acceptance contract, and preserve acceptance evidence. Until then, no click or continued use is treated as acceptance of Payment Terms."
      }
    ]
  }
} as const satisfies Record<string, LegalHubDocument>;

export type LegalHubDocumentKey = keyof typeof LEGAL_HUB_DOCUMENTS;

export function resolveLegalHubDocument(value?: string | null) {
  const aliases: Record<string, LegalHubDocumentKey> = {
    "terms-of-service": "terms",
    "privacy-policy": "privacy",
    "community-guidelines": "community",
    payment: "paymentTerms",
    payments: "paymentTerms",
    "payment-terms": "paymentTerms",
    payment_terms: "paymentTerms"
  };
  const resolvedValue = value ? aliases[value] ?? value : null;
  const key: LegalHubDocumentKey = resolvedValue
    && Object.prototype.hasOwnProperty.call(LEGAL_HUB_DOCUMENTS, resolvedValue)
    ? resolvedValue as LegalHubDocumentKey
    : "terms";

  return { key, document: LEGAL_HUB_DOCUMENTS[key] };
}
