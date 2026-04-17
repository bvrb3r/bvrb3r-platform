import { Suspense } from "react";
import { ForgotPasswordWorkspace } from "@/components/auth/password-reset-workspace";

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ForgotPasswordWorkspace />
    </Suspense>
  );
}
