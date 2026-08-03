import { RentOperationsWorkspace } from "@/components/rent/rent-operations-workspace";
import { getAuthorizedUser } from "@/lib/auth/guards";

export default async function BarberRentPage({
  searchParams
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const user = await getAuthorizedUser([
    "barber_user",
    "barber",
    "freelance_barber",
    "booth_rent_barber"
  ]);
  const { view } = await searchParams;
  const initialScreen = view === "autobooth"
    ? "autobooth"
    : view === "statement"
      ? "statement"
      : "lifecycle";

  void user;
  return (
    <div className="min-h-screen bg-[#060708] px-3 py-4 sm:px-6">
      <div className="mx-auto max-w-7xl">
        <RentOperationsWorkspace viewer="barber" initialScreen={initialScreen} />
      </div>
    </div>
  );
}
