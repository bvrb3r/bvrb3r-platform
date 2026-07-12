import { Capacitor, registerPlugin } from "@capacitor/core";

export type TerminalPaymentResult = {
  paymentIntentId: string;
  status: "succeeded" | "failed" | "canceled" | "processing";
  errorCode?: string;
};

export interface Bvrb3rTerminalPlugin {
  initialize(options: { connectionTokenUrl: string }): Promise<{ initialized: boolean }>;
  discoverAndConnectTapToPay(): Promise<{ connected: boolean; deviceLabel?: string }>;
  collectPayment(options: { paymentIntentId: string }): Promise<TerminalPaymentResult>;
  cancelCollectPayment(): Promise<{ canceled: boolean }>;
  disconnect(): Promise<{ disconnected: boolean }>;
}

const NativeTerminal = registerPlugin<Bvrb3rTerminalPlugin>("Bvrb3rTerminal");

export function isNativeTapToPayRuntime() {
  return Capacitor.isNativePlatform() && (Capacitor.getPlatform() === "ios" || Capacitor.getPlatform() === "android");
}

function nativeRequired(): never {
  throw new Error("native_terminal_required");
}

export const bvrb3rTerminal: Bvrb3rTerminalPlugin = {
  async initialize(options) {
    if (!isNativeTapToPayRuntime()) nativeRequired();
    return NativeTerminal.initialize(options);
  },
  async discoverAndConnectTapToPay() {
    if (!isNativeTapToPayRuntime()) nativeRequired();
    return NativeTerminal.discoverAndConnectTapToPay();
  },
  async collectPayment(options) {
    if (!isNativeTapToPayRuntime()) nativeRequired();
    return NativeTerminal.collectPayment(options);
  },
  async cancelCollectPayment() {
    if (!isNativeTapToPayRuntime()) nativeRequired();
    return NativeTerminal.cancelCollectPayment();
  },
  async disconnect() {
    if (!isNativeTapToPayRuntime()) nativeRequired();
    return NativeTerminal.disconnect();
  }
};