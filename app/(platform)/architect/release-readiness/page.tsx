import { ArchitectRentConsole } from "@/components/rent/architect-rent-console";
import { getPlatformAdminUser } from "@/lib/auth/guards";

export default async function ArchitectReleaseReadinessPage() {
  const user = await getPlatformAdminUser();

  return (
    <main className="mx-auto max-w-7xl px-3 py-6 sm:px-5 lg:px-6">
      <div className="mb-5">
        <p className="surface-label">Architect · {user.name}</p>
        <h1 className="mt-3 text-3xl font-semibold text-white">PR22 Production Truth</h1>
        <p className="mt-2 text-sm text-white/56">Twelve checks, ledger reconciliation, gated certificate</p>
      </div>
      <ArchitectRentConsole />
    </main>
  );
}
