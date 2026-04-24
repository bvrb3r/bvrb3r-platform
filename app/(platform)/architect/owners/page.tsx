import { redirect } from "next/navigation";

export default function ArchitectOwnersRedirectPage() {
  redirect("/architect/users?role=shop_owner");
}
