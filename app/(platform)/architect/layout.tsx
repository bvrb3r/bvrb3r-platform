import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { LogoutButton } from "@/components/auth/logout-button";
import { Card } from "@/components/ui/card";
import { getPlatformAdminUser } from "@/lib/auth/guards";

const architectNav = [
  { href: "/architect", label: "Overview" },
  { href: "/architect/verifications", label: "Verifications" },
  { href: "/architect/accounts", label: "Accounts" }
] as const;

export default async function ArchitectLayout({ children }: { children: React.ReactNode }) {
  const user = await getPlatformAdminUser();

  return (
    <>
      <div className="px-2 pt-2 sm:px-3 sm:pt-3 lg:px-5 lg:pt-5">
        <div className="mx-auto max-w-7xl">
          <Card className="rounded-[30px] border border-white/8 bg-[linear-gradient(180deg,rgba(18,18,18,0.98),rgba(8,8,8,0.98))] p-4 sm:p-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-0">
                <div className="inline-flex items-center gap-2 rounded-full border border-[#7CFF00]/18 bg-[#7CFF00]/8 px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-[#d7ffab]">
                  <ShieldCheck className="h-4 w-4" />
                  Architect session
                </div>
                <div className="mt-3 min-w-0">
                  <p className="text-lg font-semibold text-white">{user.name}</p>
                  <p className="mt-1 truncate text-sm text-white/60">{user.email}</p>
                </div>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-white/58">
                  Shared BVRB3R auth session with platform-admin authorization enforced on top of canonical identity.
                </p>
              </div>

              <div className="flex flex-col gap-3 xl:min-w-[28rem] xl:items-end">
                <div className="flex flex-wrap gap-2">
                  {architectNav.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="inline-flex min-h-11 items-center rounded-full border border-white/10 bg-black/20 px-4 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/76 transition hover:border-[#7CFF00]/20 hover:text-white sm:text-[11px]"
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
                <div className="w-full xl:w-auto">
                  <LogoutButton compact className="xl:min-w-[11.5rem]" />
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
      {children}
    </>
  );
}
