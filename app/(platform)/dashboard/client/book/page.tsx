import { redirect } from "next/navigation";

// The standalone instant-book surface now lives inside Account as the "Book" section.
// Keep this deep link resolving so existing links don't 404 — redirect into Account.
export default function ClientBookRedirectPage() {
  redirect("/dashboard/client/more?section=book");
}
