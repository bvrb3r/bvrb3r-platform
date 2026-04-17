import { Suspense } from "react";
import { ResetPasswordWorkspace } from "@/components/auth/password-reset-workspace";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordWorkspace />
    </Suspense>
  );
}
