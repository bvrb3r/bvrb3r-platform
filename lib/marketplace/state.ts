import { createInitialMarketplaceState, MarketplaceState } from "@/lib/marketplace/engine";

declare global {
  var __bvrb3rMarketplaceState: MarketplaceState | undefined;
}

function cloneState<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function getMarketplaceState() {
  if (!globalThis.__bvrb3rMarketplaceState) {
    globalThis.__bvrb3rMarketplaceState = createInitialMarketplaceState();
  }

  return globalThis.__bvrb3rMarketplaceState;
}

export function setMarketplaceState(nextState: MarketplaceState) {
  globalThis.__bvrb3rMarketplaceState = cloneState(nextState);
  return globalThis.__bvrb3rMarketplaceState;
}