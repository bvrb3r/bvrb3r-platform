import { CANONICAL_PLATFORM_ADMIN_EMAIL, resolveDemoUser } from "@/lib/auth/demo-auth";
import type { UserAccount } from "@/types/domain";

export function makePlatformAdminUser(overrides: Partial<UserAccount> = {}): UserAccount {
  return {
    ...resolveDemoUser("architect@bvrb3r.demo"),
    id: "a316409b-2395-4611-a2b4-dcff0a217ba1",
    email: CANONICAL_PLATFORM_ADMIN_EMAIL,
    name: "BVRB3R Architect",
    role: "platform_admin",
    primaryOnboardingRole: "platform_admin",
    platformAdmin: true,
    accountStatus: "active",
    ...overrides
  };
}
