import { redirect } from "next/navigation";

export default async function ArchitectAccountsPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolved = searchParams ? await searchParams : undefined;
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(resolved ?? {})) {
    if (typeof value === "string" && value.length) {
      params.set(key, value);
    }
  }

  redirect(params.size ? `/architect/users?${params.toString()}` : "/architect/users");
}
