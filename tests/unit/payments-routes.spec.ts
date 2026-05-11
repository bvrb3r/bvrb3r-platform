import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveDemoUser } from "@/lib/auth/demo-auth";
import { PaymentServiceError } from "@/lib/payments/service";

const {
  getSessionUserMock,
  listClientPaymentMethodsMock,
  addClientPaymentMethodMock,
  setDefaultClientPaymentMethodMock,
  removeClientPaymentMethodMock,
  createAppointmentPaymentMock,
  capturePaymentMock,
  refundPaymentMock,
  createAppointmentTipMock
} = vi.hoisted(() => ({
  getSessionUserMock: vi.fn(),
  listClientPaymentMethodsMock: vi.fn(),
  addClientPaymentMethodMock: vi.fn(),
  setDefaultClientPaymentMethodMock: vi.fn(),
  removeClientPaymentMethodMock: vi.fn(),
  createAppointmentPaymentMock: vi.fn(),
  capturePaymentMock: vi.fn(),
  refundPaymentMock: vi.fn(),
  createAppointmentTipMock: vi.fn()
}));

vi.mock("@/lib/booking/route-auth", () => ({
  getSessionUser: getSessionUserMock
}));

vi.mock("@/lib/payments/service", async () => {
  const actual = await vi.importActual<typeof import("@/lib/payments/service")>("@/lib/payments/service");
  return {
    ...actual,
    listClientPaymentMethods: listClientPaymentMethodsMock,
    addClientPaymentMethod: addClientPaymentMethodMock,
    setDefaultClientPaymentMethod: setDefaultClientPaymentMethodMock,
    removeClientPaymentMethod: removeClientPaymentMethodMock,
    createAppointmentPayment: createAppointmentPaymentMock,
    capturePayment: capturePaymentMock,
    refundPayment: refundPaymentMock,
    createAppointmentTip: createAppointmentTipMock
  };
});

import { GET as getPaymentMethods, POST as postPaymentMethod } from "@/app/api/payments/methods/route";
import { DELETE as deletePaymentMethod } from "@/app/api/payments/methods/[id]/route";
import { POST as postDefaultPaymentMethod } from "@/app/api/payments/methods/[id]/default/route";
import { POST as postAppointmentPayment } from "@/app/api/payments/appointments/[appointmentId]/create/route";
import { POST as postCapturePayment } from "@/app/api/payments/[paymentId]/capture/route";
import { POST as postRefundPayment } from "@/app/api/payments/[paymentId]/refund/route";
import { POST as postAppointmentTip } from "@/app/api/payments/appointments/[appointmentId]/tip/route";

describe("phase 9 payment routes", () => {
  beforeEach(() => {
    getSessionUserMock.mockReset();
    listClientPaymentMethodsMock.mockReset();
    addClientPaymentMethodMock.mockReset();
    setDefaultClientPaymentMethodMock.mockReset();
    removeClientPaymentMethodMock.mockReset();
    createAppointmentPaymentMock.mockReset();
    capturePaymentMock.mockReset();
    refundPaymentMock.mockReset();
    createAppointmentTipMock.mockReset();
  });

  it("returns the signed-in client's payment methods", async () => {
    getSessionUserMock.mockResolvedValue(resolveDemoUser("client@bvrb3r.demo"));
    listClientPaymentMethodsMock.mockResolvedValue([
      {
        id: "pm-1",
        provider: "stripe",
        brand: "Visa",
        last4: "4242",
        expMonth: 8,
        expYear: 2028,
        isDefault: true,
        createdAt: "2026-03-19T18:00:00.000Z",
        label: "Visa ending in 4242"
      }
    ]);

    const response = await getPaymentMethods();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.methods[0].id).toBe("pm-1");
  });

  it("rejects invalid payment method payloads", async () => {
    getSessionUserMock.mockResolvedValue(resolveDemoUser("client@bvrb3r.demo"));
    const request = new NextRequest("https://bvrb3r.demo/api/payments/methods", {
      method: "POST",
      body: JSON.stringify({ provider: "manual" })
    });

    const response = await postPaymentMethod(request);

    expect(response.status).toBe(400);
  });

  it("creates a tokenized saved payment method", async () => {
    getSessionUserMock.mockResolvedValue(resolveDemoUser("client@bvrb3r.demo"));
    addClientPaymentMethodMock.mockResolvedValue({
      id: "pm-1",
      provider: "stripe",
      brand: "Visa",
      last4: "4242",
      expMonth: 8,
      expYear: 2028,
      isDefault: true,
      createdAt: "2026-03-19T18:00:00.000Z",
      label: "Visa ending in 4242"
    });
    const request = new NextRequest("https://bvrb3r.demo/api/payments/methods", {
      method: "POST",
      body: JSON.stringify({
        provider: "stripe",
        providerPaymentMethodId: "pm_stripe_1",
        brand: "Visa",
        last4: "4242"
      })
    });

    const response = await postPaymentMethod(request);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.method.label).toContain("4242");
  });

  it("sets a default payment method", async () => {
    getSessionUserMock.mockResolvedValue(resolveDemoUser("client@bvrb3r.demo"));
    setDefaultClientPaymentMethodMock.mockResolvedValue({
      id: "pm-2",
      provider: "stripe",
      brand: "Mastercard",
      last4: "4444",
      expMonth: 9,
      expYear: 2029,
      isDefault: true,
      createdAt: "2026-03-19T18:05:00.000Z",
      label: "Mastercard ending in 4444"
    });

    const response = await postDefaultPaymentMethod(new NextRequest("https://bvrb3r.demo/api/payments/methods/pm-2/default", {
      method: "POST"
    }), {
      params: Promise.resolve({ id: "pm-2" })
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.method.isDefault).toBe(true);
  });

  it("removes a saved payment method", async () => {
    getSessionUserMock.mockResolvedValue(resolveDemoUser("client@bvrb3r.demo"));
    removeClientPaymentMethodMock.mockResolvedValue({ ok: true });

    const response = await deletePaymentMethod(new NextRequest("https://bvrb3r.demo/api/payments/methods/pm-2", {
      method: "DELETE"
    }), {
      params: Promise.resolve({ id: "pm-2" })
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(removeClientPaymentMethodMock).toHaveBeenCalledWith(expect.anything(), "pm-2");
  });

  it("creates an appointment-linked payment record", async () => {
    getSessionUserMock.mockResolvedValue(resolveDemoUser("client@bvrb3r.demo"));
    createAppointmentPaymentMock.mockResolvedValue({
      payment: {
        id: "pay-1",
        appointmentId: "appt-1",
        amount: 55,
        currency: "usd",
        provider: "stripe",
        paymentStatus: "captured",
        paymentType: "booking",
        paidAt: "2026-03-19T18:10:00.000Z",
        createdAt: "2026-03-19T18:10:00.000Z"
      },
      summary: {
        appointmentId: "appt-1",
        outstandingBalance: 0,
        authorizedAmount: 0,
        capturedAmount: 55,
        refundedAmount: 0,
        tipAmount: 0,
        latestBookingPayment: null,
        defaultPaymentMethod: null
      }
    });

    const response = await postAppointmentPayment(new NextRequest("https://bvrb3r.demo/api/payments/appointments/appt-1/create", {
      method: "POST",
      body: JSON.stringify({})
    }), {
      params: Promise.resolve({ appointmentId: "appt-1" })
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.payment.paymentStatus).toBe("captured");
  });

  it("captures a payment through the route", async () => {
    getSessionUserMock.mockResolvedValue(resolveDemoUser("manager@bvrb3r.demo"));
    capturePaymentMock.mockResolvedValue({
      payment: {
        id: "pay-1",
        appointmentId: "appt-1",
        amount: 40,
        currency: "usd",
        provider: "stripe",
        paymentStatus: "captured",
        paymentType: "booking",
        paidAt: "2026-03-19T18:12:00.000Z",
        createdAt: "2026-03-19T18:10:00.000Z"
      },
      summary: null
    });

    const response = await postCapturePayment(new NextRequest("https://bvrb3r.demo/api/payments/pay-1/capture", {
      method: "POST"
    }), {
      params: Promise.resolve({ paymentId: "pay-1" })
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.payment.paymentStatus).toBe("captured");
  });

  it("rejects invalid refund payloads", async () => {
    getSessionUserMock.mockResolvedValue(resolveDemoUser("owner@bvrb3r.demo"));
    const request = new NextRequest("https://bvrb3r.demo/api/payments/pay-1/refund", {
      method: "POST",
      body: JSON.stringify({ amount: -5 })
    });

    const response = await postRefundPayment(request, {
      params: Promise.resolve({ paymentId: "pay-1" })
    });

    expect(response.status).toBe(400);
  });

  it("propagates refund access errors cleanly", async () => {
    getSessionUserMock.mockResolvedValue(resolveDemoUser("client@bvrb3r.demo"));
    refundPaymentMock.mockRejectedValue(new PaymentServiceError("Only owner, manager, or front desk can manage this payment action.", 403));

    const response = await postRefundPayment(new NextRequest("https://bvrb3r.demo/api/payments/pay-1/refund", {
      method: "POST",
      body: JSON.stringify({ amount: 10 })
    }), {
      params: Promise.resolve({ paymentId: "pay-1" })
    });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toMatch(/owner, manager, or front desk/i);
  });

  it("creates an appointment tip through the route", async () => {
    getSessionUserMock.mockResolvedValue(resolveDemoUser("client@bvrb3r.demo"));
    createAppointmentTipMock.mockResolvedValue({
      tip: {
        id: "tip-1",
        appointment_id: "appt-1",
        payment_id: "pay-tip-1",
        client_id: "client-1",
        barber_id: "barber-1",
        amount: 12,
        created_at: "2026-03-19T18:15:00.000Z"
      },
      summary: null
    });

    const response = await postAppointmentTip(new NextRequest("https://bvrb3r.demo/api/payments/appointments/appt-1/tip", {
      method: "POST",
      body: JSON.stringify({ amount: 12 })
    }), {
      params: Promise.resolve({ appointmentId: "appt-1" })
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.tip.amount).toBe(12);
  });
});
