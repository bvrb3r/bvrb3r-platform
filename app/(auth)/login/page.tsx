import { Suspense } from "react";
import { AuthEntryWorkspace } from "@/components/auth/auth-entry-workspace";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <AuthEntryWorkspace mode="login" />
    </Suspense>
  );
}
