"use client";

import { create } from "zustand";
import { CheckoutRecord } from "@/lib/utils/operations";

interface OperationsUiState {
  selectedAppointmentId: string;
  tipAmount: string;
  paymentMethod: CheckoutRecord["paymentMethod"];
  pendingAppointmentIds: string[];
  conflictMessage?: string;
  conflictAppointmentId?: string;
  setSelectedAppointmentId: (appointmentId: string) => void;
  setTipAmount: (value: string) => void;
  setPaymentMethod: (value: CheckoutRecord["paymentMethod"]) => void;
  setPending: (appointmentId: string, pending: boolean) => void;
  setConflict: (message?: string, appointmentId?: string) => void;
  resetCheckoutPanel: () => void;
}

export const useOperationsStore = create<OperationsUiState>((set) => ({
  selectedAppointmentId: "",
  tipAmount: "15",
  paymentMethod: "tap_to_pay",
  pendingAppointmentIds: [],
  conflictMessage: undefined,
  conflictAppointmentId: undefined,
  setSelectedAppointmentId: (selectedAppointmentId) => set({ selectedAppointmentId }),
  setTipAmount: (tipAmount) => set({ tipAmount }),
  setPaymentMethod: (paymentMethod) => set({ paymentMethod }),
  setPending: (appointmentId, pending) =>
    set((state) => ({
      pendingAppointmentIds: pending
        ? Array.from(new Set([...state.pendingAppointmentIds, appointmentId]))
        : state.pendingAppointmentIds.filter((entry) => entry !== appointmentId)
    })),
  setConflict: (conflictMessage, conflictAppointmentId) => set({ conflictMessage, conflictAppointmentId }),
  resetCheckoutPanel: () =>
    set({
      selectedAppointmentId: "",
      tipAmount: "15",
      paymentMethod: "tap_to_pay",
      conflictMessage: undefined,
      conflictAppointmentId: undefined
    })
}));