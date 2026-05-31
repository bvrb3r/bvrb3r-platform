import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { AccountQuickEditModal } from "@/components/dashboard/account/account-quick-edit-modal";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: ComponentProps<"a"> & { children?: ReactNode }) => (
    <a {...props} href={typeof href === "string" ? href : "#"}>{children}</a>
  )
}));

describe("AccountQuickEditModal", () => {
  it("validates required fields and keeps payment management on the saved wallet rail", async () => {
    const onClose = vi.fn();
    const onSave = vi.fn();

    render(
      <AccountQuickEditModal
        open
        variant="client"
        displayName="Jordan Ellis"
        email="jordan@example.com"
        phone="8135550190"
        cityLocation="Tampa, FL"
        defaultPaymentMethodLabel="Visa ending in 4242"
        managePaymentHref="/dashboard/client/more?section=wallet"
        emailVerified
        phoneVerified
        onClose={onClose}
        onSave={onSave}
      />
    );

    expect(screen.getByRole("dialog", { name: "Edit Account" })).toBeInTheDocument();
    expect(screen.getByText("Default payment method")).toBeInTheDocument();
    expect(screen.getByText("Visa ending in 4242")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Manage Payment Method" })).toHaveAttribute("href", "/dashboard/client/more?section=wallet");
    expect(screen.queryByLabelText(/card number/i)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Public display name"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Public display name is required.")).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Public display name"), { target: { value: "Jordan" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "new@example.com" } });
    fireEvent.change(screen.getByLabelText("Phone number"), { target: { value: "8135550202" } });
    expect(screen.getByText("Email changes require verification before this is marked verified.")).toBeInTheDocument();
    expect(screen.getByText("Phone changes require verification before this is marked verified.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({
        displayName: "Jordan",
        email: "new@example.com",
        phone: "8135550202",
        cityLocation: "Tampa, FL"
      });
    });
  });

  it("closes without saving from cancel and close controls", () => {
    const onClose = vi.fn();
    const onSave = vi.fn();
    const props = {
      open: true,
      variant: "owner" as const,
      displayName: "Owner",
      email: "owner@example.com",
      phone: "",
      cityLocation: "",
      defaultPaymentMethodLabel: null,
      managePaymentHref: "/dashboard/owner/money?view=fintech",
      onClose,
      onSave
    };

    const { rerender } = render(<AccountQuickEditModal {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();

    rerender(<AccountQuickEditModal {...props} />);
    fireEvent.click(screen.getByLabelText("Close account editor"));
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(onSave).not.toHaveBeenCalled();
  });
});
