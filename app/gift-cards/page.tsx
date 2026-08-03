import type { Metadata } from "next";
import { GiftCardWorkspace } from "@/components/gift-cards/gift-card-workspace";
import { getVerifiedActor } from "@/lib/auth/permissions";
import { readGiftCardWallet } from "@/lib/gift-cards/service";

export const metadata: Metadata = {
  title: "Gift Cards | BVRB3R",
  description: "Buy, claim, redeem, and track Stripe-funded BVRB3R service gift cards."
};

export const dynamic = "force-dynamic";

export default async function GiftCardsPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [actor, query] = await Promise.all([getVerifiedActor(), searchParams]);
  let wallet = null;
  if (actor) {
    try {
      wallet = await readGiftCardWallet(actor.user.id);
    } catch {
      wallet = null;
    }
  }
  const claim = typeof query.claim === "string" ? query.claim : "";
  return <GiftCardWorkspace authenticated={Boolean(actor)} initialWallet={wallet} initialClaimToken={claim} />;
}
