"use client";

import type { ComponentProps, MouseEventHandler } from "react";
import { ClientActionLink } from "@/components/client-experience/client-action-link";
import { useMarketplaceAnalyticsMutation, type MarketplaceAnalyticsPayload } from "@/lib/marketplace/client";

type MarketplaceTrackedActionLinkProps = Omit<ComponentProps<typeof ClientActionLink>, "onClick"> & {
  analytics?: MarketplaceAnalyticsPayload;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
};

export function MarketplaceTrackedActionLink({
  analytics,
  onClick,
  ...props
}: MarketplaceTrackedActionLinkProps) {
  const analyticsMutation = useMarketplaceAnalyticsMutation();

  function handleClick(event: Parameters<NonNullable<typeof onClick>>[0]) {
    onClick?.(event);

    if (event.defaultPrevented || !analytics) {
      return;
    }

    analyticsMutation.mutate(analytics);
  }

  return <ClientActionLink {...props} onClick={handleClick} />;
}
