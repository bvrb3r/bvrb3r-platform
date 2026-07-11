export const LEGAL_DOCUMENTS = {
  terms: {
    key: "terms",
    version: "2026-07-10",
    effectiveDate: "July 10, 2026",
    href: "/terms",
    label: "Terms of Service"
  },
  privacy: {
    key: "privacy",
    version: "2026-07-10",
    effectiveDate: "July 10, 2026",
    href: "/privacy",
    label: "Privacy Policy"
  },
  community: {
    key: "community_guidelines",
    version: "2026-07-11",
    effectiveDate: "July 11, 2026",
    href: "/community-guidelines",
    label: "Community Guidelines"
  },
  dataRights: {
    key: "data_rights",
    version: "2026-07-11",
    effectiveDate: "July 11, 2026",
    href: "/data-rights",
    label: "Data Rights"
  }
} as const;

export type LegalDocumentKey = keyof typeof LEGAL_DOCUMENTS;
export type LegalAgreementKey = (typeof LEGAL_DOCUMENTS)[LegalDocumentKey]["key"];

export const REQUIRED_ACCOUNT_AGREEMENTS = [
  LEGAL_DOCUMENTS.terms,
  LEGAL_DOCUMENTS.privacy,
  LEGAL_DOCUMENTS.community
] as const;

export function currentLegalVersions() {
  return Object.fromEntries(
    Object.values(LEGAL_DOCUMENTS).map((document) => [document.key, document.version])
  );
}
