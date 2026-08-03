import type { Metadata } from "next";
import Link from "next/link";
import { OwnerLaunchConsole } from "@/components/prelaunch/owner-launch-console";
import { getAuthorizedUser } from "@/lib/auth/guards";
import { Pr36PrelaunchServiceError, readPr36OwnerLaunchConsole } from "@/lib/shops/pr36-prelaunch-service";

export const metadata: Metadata = {
  title: "Shop Launch Console | BVRB3R",
  description: "Configure a real shop opening, review launch readiness, and schedule the 24-hour waitlist head start."
};

export const dynamic = "force-dynamic";

export default async function ShopLaunchPage() {
  const user = await getAuthorizedUser(["shop_owner_user"]);
  try {
    const launch = await readPr36OwnerLaunchConsole({ user });
    return <OwnerLaunchConsole initial={launch} />;
  } catch (error) {
    const message = error instanceof Pr36PrelaunchServiceError
      ? error.message
      : "Launch truth could not be verified.";
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#060708] p-6 text-[#F5F1E8]">
        <section className="w-full max-w-xl rounded-[24px] border border-amber-300/25 bg-amber-300/[0.055] p-7 text-center">
          <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-amber-100">Launch needs review</p>
          <h1 className="mt-4 font-serif text-4xl">No launch state was guessed<span className="text-[#C4F24E]">.</span></h1>
          <p className="mt-4 text-sm leading-7 text-white/56">{message}</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link href="/shop/home" className="inline-flex min-h-11 items-center rounded-full bg-[#C4F24E] px-5 text-sm font-extrabold text-black">Owner Home</Link>
            <a href="mailto:support@bvrb3r.app" className="inline-flex min-h-11 items-center rounded-full border border-white/14 px-5 text-sm font-bold text-white/68">Contact support</a>
          </div>
        </section>
      </main>
    );
  }
}
