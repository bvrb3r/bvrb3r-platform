export const PRODUCT_PR27_LEGAL_DRAFTS = {
  terms: {
    key: "terms",
    title: "Terms of Service",
    version: "draft-1-2026-07-26",
    fileName: "LEGAL-TERMS-DRAFT.md",
    sha256: "d528a0da49fbb5dce3f8d90dd64b3c63f3a75008a1017f9f605928c94d755754"
  },
  privacy: {
    key: "privacy",
    title: "Privacy Policy",
    version: "draft-1-2026-07-26",
    fileName: "LEGAL-PRIVACY-DRAFT.md",
    sha256: "a243d8056c85123ccf3e80577178ff5d6dbf59db771f6b9a296a035b4fa745e8"
  },
  refund: {
    key: "refund",
    title: "Refund Policy",
    version: "draft-1-2026-07-26",
    fileName: "LEGAL-REFUND-DRAFT.md",
    sha256: "3228f55382c82456c5fca7fa2be023e959bd99f02f5f715add9a075af848f1d3"
  },
  acceptableUse: {
    key: "acceptable_use",
    title: "Acceptable Use Policy",
    version: "draft-1-2026-07-26",
    fileName: "LEGAL-ACCEPTABLE-USE-DRAFT.md",
    sha256: "3f85574c709dbc1fe6780e332d75992df11876c3629d0e4c5e5bbf7d8dba875e"
  }
} as const;

export type ProductPr27LegalDraftName = keyof typeof PRODUCT_PR27_LEGAL_DRAFTS;

export function resolveProductPr27LegalDraft(value?: string | null) {
  if (value && value in PRODUCT_PR27_LEGAL_DRAFTS) {
    return {
      name: value as ProductPr27LegalDraftName,
      document: PRODUCT_PR27_LEGAL_DRAFTS[value as ProductPr27LegalDraftName]
    };
  }
  return { name: "terms" as const, document: PRODUCT_PR27_LEGAL_DRAFTS.terms };
}
