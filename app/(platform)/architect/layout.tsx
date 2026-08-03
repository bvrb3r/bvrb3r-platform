import { ArchitectLayoutChrome } from "@/components/architect-experience/architect-layout-chrome";
import { getPlatformAdminUser } from "@/lib/auth/guards";

export default async function ArchitectLayout({ children }: { children: React.ReactNode }) {
  const user = await getPlatformAdminUser();
  return <ArchitectLayoutChrome user={{ name: user.name, email: user.email }}>{children}</ArchitectLayoutChrome>;
}
