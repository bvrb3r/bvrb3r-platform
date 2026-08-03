import type { Metadata } from "next";
import { GroupSplitPaymentForm } from "@/components/group-booking/group-split-payment-form";
import { GroupSplitPaymentError, readGroupSplitPaymentLink } from "@/lib/group-booking/payment-links";

export const metadata: Metadata = {
  title: "Group Payment | BVRB3R",
  robots: { index: false, follow: false, nocache: true }
};

export const dynamic = "force-dynamic";

function money(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase()
  }).format(cents / 100);
}

export default async function GroupSplitPaymentPage({
  params,
  searchParams
}: {
  params: Promise<{ groupId: string; memberId: string }>;
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const [{ groupId, memberId }, query] = await Promise.all([params, searchParams]);
  const token = typeof query.token === "string" ? query.token : "";
  let payment: Awaited<ReturnType<typeof readGroupSplitPaymentLink>> | null = null;
  let error = "This secure group payment link is unavailable.";
  try {
    payment = await readGroupSplitPaymentLink({ groupId, memberId, token });
  } catch (cause) {
    if (cause instanceof GroupSplitPaymentError && cause.code !== "group_split_link_invalid") {
      error = cause.message;
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[#060708] px-4 py-10 text-[#F5F1E8]">
      <section className="w-full max-w-xl rounded-[30px] border border-white/10 bg-white/[0.025] p-6 sm:p-8">
        <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-[#C9A87C]">BVRB3R · group payment</p>
        {payment ? (
          <>
            <h1 className="mt-4 font-serif text-4xl font-normal">{payment.memberName}&apos;s service.</h1>
            <p className="mt-3 text-sm leading-7 text-white/58">One appointment · {money(payment.amountCents, payment.currency)} · server-bound to Stripe. Opening this page does not charge a card.</p>
            <GroupSplitPaymentForm
              payment={payment}
              returnUrl={`${process.env.NEXT_PUBLIC_APP_URL}/pay/group/${encodeURIComponent(groupId)}/${encodeURIComponent(memberId)}?token=${encodeURIComponent(token)}`}
            />
          </>
        ) : (
          <>
            <h1 className="mt-4 font-serif text-4xl font-normal">Payment link unavailable.</h1>
            <p role="alert" className="mt-4 rounded-[16px] border border-amber-300/25 bg-amber-300/5 p-4 text-sm leading-6 text-amber-100">{error} No charge was created by this page.</p>
          </>
        )}
      </section>
    </main>
  );
}
