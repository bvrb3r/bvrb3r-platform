import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import LegalPage from "@/app/legal/page";
import { LEGAL_DOCUMENTS, REQUIRED_ACCOUNT_AGREEMENTS } from "@/lib/legal/documents";
import { LEGAL_HUB_DOCUMENTS, resolveLegalHubDocument } from "@/lib/legal/hub-documents";

describe("/legal hub", () => {
  it("opens a published Terms reader and exposes all four document choices", async () => {
    render(await LegalPage({}));

    expect(screen.getByRole("heading", { level: 1, name: /Terms of Service\s*\./ })).toBeInTheDocument();
    expect(screen.getByText(`Version ${LEGAL_DOCUMENTS.terms.version} · Effective ${LEGAL_DOCUMENTS.terms.effectiveDate}`)).toBeInTheDocument();
    expect(screen.getByText("Published")).toBeInTheDocument();

    const navigation = screen.getByRole("navigation", { name: "Legal documents" });
    expect(within(navigation).getAllByRole("link")).toHaveLength(4);
    expect(within(navigation).getByRole("link", { name: "Terms" })).toHaveAttribute("aria-current", "page");
    expect(within(navigation).getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/legal?document=privacy");
    expect(within(navigation).getByRole("link", { name: "Community" })).toHaveAttribute("href", "/legal?document=community-guidelines");
    expect(within(navigation).getByRole("link", { name: /Payment Terms/ })).toHaveAttribute("href", "/legal?document=payment-terms");
    expect(screen.getByRole("link", { name: /Open published document/ })).toHaveAttribute("href", "/terms");
  });

  it("shows Payment Terms as counsel-pending without publishing or accepting them", async () => {
    render(await LegalPage({
      searchParams: Promise.resolve({ document: "payment-terms" })
    }));

    expect(screen.getByRole("heading", { level: 1, name: /Payment Terms\s*\./ })).toBeInTheDocument();
    expect(screen.getByText("Counsel review required")).toBeInTheDocument();
    expect(screen.getByText("Not published · Not effective · Not eligible for acceptance")).toBeInTheDocument();
    expect(screen.getByText(/no click or continued use is treated as acceptance/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Acceptance unavailable" })).toBeDisabled();
    expect(screen.queryByRole("link", { name: /Open published document/ })).not.toBeInTheDocument();

    const article = document.querySelector("[data-legal-document='paymentTerms']");
    expect(article).toHaveAttribute("data-legal-status", "counsel_pending");
    expect(LEGAL_HUB_DOCUMENTS.paymentTerms.acceptanceEligible).toBe(false);
    expect(REQUIRED_ACCOUNT_AGREEMENTS.map((agreement) => agreement.key)).not.toContain("payment_terms");
  });

  it("fails safely to Terms for an unknown document key", () => {
    expect(resolveLegalHubDocument("not-a-real-document")).toMatchObject({
      key: "terms",
      document: { status: "published", sourceHref: "/terms" }
    });
  });
});
