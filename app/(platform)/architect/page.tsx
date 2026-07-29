import { renderArchitectCityMapHome } from "@/app/(platform)/architect/_mission-control-page";

export default async function ArchitectPage({
  searchParams
}: {
  searchParams?: Promise<{ date?: string }>;
} = {}) {
  const resolved = await searchParams;
  return renderArchitectCityMapHome(resolved?.date);
}
