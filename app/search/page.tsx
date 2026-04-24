import type { Route } from "next";
import { redirect } from "next/navigation";

export default async function SearchPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const nextParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string" && value.length > 0) {
      nextParams.set(key, value);
    }
  }

  redirect((`/dashboard/client/search${nextParams.size ? `?${nextParams.toString()}` : ""}`) as Route);
}
