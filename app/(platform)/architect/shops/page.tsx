import { redirect } from "next/navigation";

export default function ArchitectShopsRedirectPage() {
  redirect("/architect/users?role=shop_owner");
}
