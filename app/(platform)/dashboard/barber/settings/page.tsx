import { redirect } from "next/navigation";

export default async function BarberSettingsPage({
  searchParams
}: {
  searchParams: Promise<{ section?: string }>;
}) {
  const params = await searchParams;
  const section = params.section ?? "settings";
  redirect(`/dashboard/barber/more?section=${encodeURIComponent(section)}`);
}
