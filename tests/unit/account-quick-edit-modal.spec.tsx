import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { AccountQuickEditModal } from "@/components/dashboard/account/account-quick-edit-modal";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: ComponentProps<"a"> & { children?: ReactNode }) => (
    <a {...props} href={typeof href === "string" ? href : "#"}>{children}</a>
  )
}));

describe("AccountQuickEditModal", () => {
  function expectTextOrder(...labels: string[]) {
    const body = document.body.textContent ?? "";
    const positions = labels.map((label) => body.indexOf(label));
    positions.forEach((position, index) => {
      expect(position, `${labels[index]} should be rendered`).toBeGreaterThanOrEqual(0);
    });
    for (let index = 1; index < positions.length; index += 1) {
      expect(positions[index], `${labels[index]} should render after ${labels[index - 1]}`).toBeGreaterThan(positions[index - 1]);
    }
  }

  it("renders the kiosk-style account field order and private/public helper copy", () => {
    render(
      <AccountQuickEditModal
        open
        variant="client"
        displayName="Jordan Ellis"
        publicUsername="@Jordan.Ellis"
        email="jordan@example.com"
        phone="8135550190"
        cityLocation="Tampa, FL"
        defaultPaymentMethodLabel="Visa ending in 4242"
        managePaymentHref="/dashboard/client/more?section=wallet"
        emailVerified
        phoneVerified
        onClose={vi.fn()}
      />
    );

    expect(screen.getByRole("dialog", { name: "Edit Account" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Public display name")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Public username")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("City/location")).not.toBeInTheDocument();
    expect(screen.getByTestId("account-username-prefix")).toHaveTextContent("@");
    expect(screen.getByLabelText("BVRB3R Username")).toHaveValue("jordan.ellis");
    expectTextOrder("BVRB3R Username", "Full Name", "Phone Number", "Email", "Location", "Default Payment Method");
    expect(screen.getByText("Your BVRB3R username is public and appears across booking, profile, search, messages, and kiosk surfaces.")).toBeInTheDocument();
    expect(screen.getByText("Private. Used for account, booking, kiosk, support, and admin verification.")).toBeInTheDocument();
    expect(screen.getByText("Phone verified. Private. Used for verification, booking updates, kiosk check-in, and support.")).toBeInTheDocument();
    expect(screen.getByText("Email verified. Private. Used for account access, booking receipts, kiosk activation, and support.")).toBeInTheDocument();
    expect(screen.getByText("Choose a city where BVRB3R has active bookable supply.")).toBeInTheDocument();
    expect(screen.getByText("BVRB3R never collects raw card numbers in this account modal.")).toBeInTheDocument();
    expect(screen.getAllByDisplayValue("Tampa, FL")).toHaveLength(1);

    const dialog = screen.getByRole("dialog", { name: "Edit Account" });
    const body = screen.getByTestId("account-quick-edit-body");
    const footer = screen.getByTestId("account-quick-edit-footer");
    const sheet = screen.getByTestId("account-quick-edit-sheet");
    expect(dialog.parentElement).toBe(document.body);
    expect(dialog).toHaveClass("fixed", "inset-0", "z-[9999]");
    expect(sheet).toHaveClass("relative", "z-[10000]", "max-h-[calc(100dvh-1rem)]", "overflow-hidden");
    expect(body).toHaveClass("overflow-y-auto");
    expect(footer).toHaveClass("sticky", "bottom-0", "z-20", "pb-[calc(1.25rem+env(safe-area-inset-bottom))]");
    expect(within(footer).getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(within(footer).getByRole("button", { name: "Save Changes" })).toBeInTheDocument();
  });

  it("keeps the modal footer in a body-level layer above the mobile bottom nav", () => {
    render(
      <>
        <nav data-testid="mobile-bottom-nav" className="fixed inset-x-2 bottom-3 z-50">
          Bottom navigation
        </nav>
        <AccountQuickEditModal
          open
          variant="client"
          displayName="Jordan Ellis"
          publicUsername="@jordan"
          email="jordan@example.com"
          phone="8135550190"
          cityLocation="Tampa, FL"
          defaultPaymentMethodLabel="Visa ending in 4242"
          managePaymentHref="/dashboard/client/more?section=wallet"
          onClose={vi.fn()}
        />
      </>
    );

    const bottomNav = screen.getByTestId("mobile-bottom-nav");
    const dialog = screen.getByRole("dialog", { name: "Edit Account" });
    const footer = screen.getByTestId("account-quick-edit-footer");

    expect(bottomNav).toHaveClass("z-50");
    expect(dialog).toHaveClass("z-[9999]");
    expect(dialog.parentElement).toBe(document.body);
    expect(footer).toHaveClass("sticky", "bottom-0", "z-20");
    expect(within(footer).getByRole("button", { name: "Cancel" })).toBeVisible();
    expect(within(footer).getByRole("button", { name: "Save Changes" })).toBeVisible();
  });

  it("validates required fields, normalizes username, and keeps payment management on the saved wallet rail", async () => {
    const onClose = vi.fn();
    const onSave = vi.fn();

    render(
      <AccountQuickEditModal
        open
        variant="client"
        displayName="Jordan Ellis"
        publicUsername="@Jordan.Ellis"
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
    expect(screen.getByText("Default Payment Method")).toBeInTheDocument();
    expect(screen.getByText("Visa ending in 4242")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Manage Payment Method" })).toBeInTheDocument();
    expect(screen.getByText("Creator Payout Method")).toBeInTheDocument();
    expect(screen.getByText("Locked")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View Requirements" })).toBeInTheDocument();
    expect(screen.queryByLabelText(/card number/i)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("BVRB3R Username"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    expect(await screen.findByText("BVRB3R username is required.")).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("BVRB3R Username"), { target: { value: "@Jordan.Ellis" } });
    expect(screen.getByLabelText("BVRB3R Username")).toHaveValue("jordan.ellis");
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "new@example.com" } });
    fireEvent.change(screen.getByLabelText("Phone Number"), { target: { value: "8135550202" } });
    expect(screen.getByText("Email changes require verification before this is marked verified.")).toBeInTheDocument();
    expect(screen.getByText("Phone changes require verification before this is marked verified.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({
        displayName: "Jordan Ellis",
        fullName: "Jordan Ellis",
        email: "new@example.com",
        phone: "8135550202",
        publicUsername: "jordan.ellis",
        cityLocation: "Tampa, FL",
        defaultPaymentMethodId: null
      });
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows creator payout requirements instead of payout setup when the client rail is locked", () => {
    render(
      <AccountQuickEditModal
        open
        variant="client"
        displayName="Jordan Ellis"
        publicUsername="@jordan"
        email="jordan@example.com"
        phone="8135550190"
        cityLocation="Tampa, FL"
        defaultPaymentMethodLabel="Visa ending in 4242"
        managePaymentHref="/dashboard/client/more?section=wallet"
        managePayoutHref="/dashboard/client/more?section=payouts"
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText("Creator Payout Method")).toBeInTheDocument();
    expect(screen.getByText("Locked")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View Requirements" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Manage Payout Method" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "View Requirements" }));

    expect(screen.getByText("Creator payout requirements")).toBeInTheDocument();
    expect(screen.getByText("This setting is locked. No payout setup was started.")).toBeInTheDocument();
  });

  it("shows manage payout when the client creator payout rail is eligible", () => {
    const onPayoutAction = vi.fn();

    render(
      <AccountQuickEditModal
        open
        variant="client"
        displayName="Jordan Ellis"
        publicUsername="@jordan"
        email="jordan@example.com"
        phone="8135550190"
        cityLocation="Tampa, FL"
        defaultPaymentMethodLabel="Visa ending in 4242"
        payoutMethodLabel="Connected"
        managePaymentHref="/dashboard/client/more?section=wallet"
        managePayoutHref="/dashboard/client/more?section=payouts"
        creatorPayoutEligible
        onClose={vi.fn()}
        onPayoutAction={onPayoutAction}
      />
    );

    expect(screen.getByText("Creator Payout Method")).toBeInTheDocument();
    expect(screen.getByText("Connected")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Manage Payout Method" }));
    expect(onPayoutAction).toHaveBeenCalledWith("/dashboard/client/more?section=payouts");
  });

  it("shows saving state, prevents double submit, and closes after a successful save", async () => {
    const onClose = vi.fn();
    let resolveSave!: () => void;
    const onSave = vi.fn(() => new Promise<void>((resolve) => {
      resolveSave = resolve;
    }));

    render(
      <AccountQuickEditModal
        open
        variant="client"
        displayName="Jordan Ellis"
        publicUsername="@jordan"
        email="jordan@example.com"
        phone="8135550190"
        cityLocation="Tampa, FL"
        defaultPaymentMethodLabel="Visa ending in 4242"
        managePaymentHref="/dashboard/client/more?section=wallet"
        onClose={onClose}
        onSave={onSave}
      />
    );

    const saveButton = screen.getByRole("button", { name: "Save Changes" });
    fireEvent.click(saveButton);
    fireEvent.click(saveButton);

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("button", { name: "Saving..." })).toBeDisabled();
    resolveSave();

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it("blocks reserved usernames before saving", async () => {
    const onSave = vi.fn();

    render(
      <AccountQuickEditModal
        open
        variant="client"
        displayName="Jordan Ellis"
        publicUsername="@jordan"
        email="jordan@example.com"
        phone="8135550190"
        cityLocation="Tampa, FL"
        defaultPaymentMethodLabel="Visa ending in 4242"
        managePaymentHref="/dashboard/client/more?section=wallet"
        onClose={vi.fn()}
        onSave={onSave}
      />
    );

    fireEvent.change(screen.getByLabelText("BVRB3R Username"), { target: { value: "admin" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    expect(await screen.findByText("This BVRB3R username is reserved. Choose another username.")).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("keeps the modal open and shows an inline error when save fails", async () => {
    render(
      <AccountQuickEditModal
        open
        variant="client"
        displayName="Jordan Ellis"
        publicUsername="@jordan"
        email="jordan@example.com"
        phone="8135550190"
        cityLocation="Tampa, FL"
        defaultPaymentMethodLabel="Visa ending in 4242"
        managePaymentHref="/dashboard/client/more?section=wallet"
        onClose={vi.fn()}
        onSave={vi.fn(async () => {
          throw new Error("Unable to save account contact details.");
        })}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    expect(await screen.findByText("Unable to save account contact details.")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Edit Account" })).toBeInTheDocument();
  });

  it("restricts client location to supported market options and keeps save visible", async () => {
    const onSave = vi.fn();

    render(
      <AccountQuickEditModal
        open
        variant="client"
        displayName="Jordan Ellis"
        publicUsername="@jordan"
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

    expect(screen.getByRole("button", { name: "Save Changes" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Location"), { target: { value: "Miami, FL" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    expect(await screen.findByText("Choose a supported barber-market city from the list.")).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Location"), { target: { value: "Tam" } });
    fireEvent.click(screen.getByRole("button", { name: "Tampa, FL" }));
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ cityLocation: "Tampa, FL" }));
    });
  });

  it("allows freelance barber full service addresses without client market validation", async () => {
    const onSave = vi.fn();

    render(
      <AccountQuickEditModal
        open
        variant="barber"
        displayName="Blaze King"
        publicUsername="@blaze"
        email="blaze@example.com"
        phone="8135550190"
        cityLocation="8516 Island Breeze Ln - Temple Terrace, FL 33607"
        defaultPaymentMethodLabel="Managed through payout and checkout settings"
        managePaymentHref="/dashboard/barber/more#barber-settings-payouts"
        locationOptions={[{ label: "Tampa, FL", city: "Tampa", state: "FL" }]}
        onClose={vi.fn()}
        onSave={onSave}
      />
    );

    fireEvent.change(screen.getByLabelText("BVRB3R Username"), { target: { value: "@blaze.live" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
        publicUsername: "blaze.live",
        cityLocation: "8516 Island Breeze Ln - Temple Terrace, FL 33607"
      }));
    });
    expect(screen.queryByText("Choose a supported barber-market city from the list.")).not.toBeInTheDocument();
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

    expect(screen.getByText("Payout Method")).toBeInTheDocument();
    expect(screen.getByText("Default Payment Method")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Manage Payment Method" })).toBeInTheDocument();
    expect(screen.getByText("BVRB3R never collects raw bank or card numbers in this account modal.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Manage Payout Method" }));
    expect(onPaymentAction).toHaveBeenCalledWith("/dashboard/barber/more#barber-settings-payouts");
  });

  it("locks shop-linked barber location to the shop address", () => {
    render(
      <AccountQuickEditModal
        open
        variant="barber"
        displayName="Blaze King"
        publicUsername="@blaze"
        email="blaze@example.com"
        phone="8135550190"
        cityLocation="2172 University Square Mall - Tampa, FL 33612"
        defaultPaymentMethodLabel="Managed through payout and checkout settings"
        managePaymentHref="/dashboard/barber/more#barber-settings-payouts"
        locationLocked
        locationLockedCopy="Locked to shop address."
        onClose={vi.fn()}
      />
    );

    expect(screen.getByLabelText("Location")).toBeDisabled();
    expect(screen.getByText("Locked to shop address.")).toBeInTheDocument();
  });
});
