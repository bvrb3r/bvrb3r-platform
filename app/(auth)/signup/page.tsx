import { Suspense } from "react";
import { AuthEntryWorkspace } from "@/components/auth/auth-entry-workspace";

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <AuthEntryWorkspace mode="signup" />
    </Suspense>
  );
}
