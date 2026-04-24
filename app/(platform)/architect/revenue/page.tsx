import { redirect } from "next/navigation";

export default function ArchitectRevenueRedirectPage() {
  redirect("/architect/money?section=revenue");
}
