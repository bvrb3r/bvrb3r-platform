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
    expect(screen.getByRole("button", { name: "Manage Payment Method" })).toBeInTheDocument();
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
        fullName: "Jordan Ellis",
        email: "new@example.com",
        phone: "8135550202",
        publicUsername: "",
        cityLocation: "Tampa, FL",
        defaultPaymentMethodId: null
      });
    });
  });

  it("restricts client location to supported market options and keeps save visible", async () => {
    const onSave = vi.fn();

    render(
      <AccountQuickEditModal
        open
        variant="client"
        displayName="Jordan Ellis"
        email="jordan@example.com"
        phone="8135550190"
        cityLocation=""
        defaultPaymentMethodLabel="Visa ending in 4242"
        managePaymentHref="/dashboard/client/more?section=wallet"
        locationOptions={[{ label: "Tampa, FL", city: "Tampa", state: "FL" }]}
        requireLocationOption
        onClose={vi.fn()}
        onSave={onSave}
      />
    );

    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("City/location"), { target: { value: "Miami, FL" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Choose a supported barber-market city from the list.")).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("City/location"), { target: { value: "Tam" } });
    fireEvent.click(screen.getByRole("button", { name: "Tampa, FL" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ cityLocation: "Tampa, FL" }));
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

  it("routes payout/payment actions through a close-aware callback", () => {
    const onPaymentAction = vi.fn();

    render(
      <AccountQuickEditModal
        open
        variant="barber"
        displayName="Blaze King"
        email="blaze@example.com"
        phone="8135550190"
        cityLocation="Tampa, FL"
        defaultPaymentMethodLabel="Managed through payout and checkout settings"
        managePaymentHref="/dashboard/barber/more#barber-settings-payouts"
        onClose={vi.fn()}
        onPaymentAction={onPaymentAction}
      />
    );

    expect(screen.getByText("Default payment method & Payout")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Click here" }));
    expect(onPaymentAction).toHaveBeenCalledWith("/dashboard/barber/more#barber-settings-payouts");
  });
});
