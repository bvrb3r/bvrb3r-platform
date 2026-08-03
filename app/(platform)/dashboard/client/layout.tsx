import type { ReactNode } from "react";
import { getAuthorizedUser } from "@/lib/auth/guards";

export default async function ClientDashboardLayout({ children }: { children: ReactNode }) {
  await getAuthorizedUser(["client_user"]);
  return children;
}
