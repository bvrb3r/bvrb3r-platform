import { redirect } from "next/navigation";

export default function ArchitectShopOwnersRedirectPage() {
  redirect("/architect/users?role=shop_owner");
}
