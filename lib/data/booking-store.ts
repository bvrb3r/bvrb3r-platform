"use client";

import { create } from "zustand";

interface BookingState {
  selectedLocationId: string;
  selectedBarberId: string;
  setLocation: (locationId: string) => void;
  setBarber: (barberId: string) => void;
}

export const useBookingStore = create<BookingState>((set) => ({
  selectedLocationId: "loc-ybor",
  selectedBarberId: "barber-wave",
  setLocation: (selectedLocationId) => set({ selectedLocationId }),
  setBarber: (selectedBarberId) => set({ selectedBarberId })
}));