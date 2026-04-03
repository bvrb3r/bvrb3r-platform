"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useActivationStatus } from "@/lib/onboarding/client";

export function ActivationStatusWorkspace() {
  const query = useActivationStatus();

  return (
    <section className="page-shell safe-top-pad app-safe-bottom flex min-h-[100svh] min-h-[100dvh] items-start py-6 sm:items-center sm:py-10">
      <Card className="w-full rounded-[34px] p-6 sm:p-8 lg:p-10">
        <Badge>Activation</Badge>
        <h1 className="mt-5 text-balance text-4xl font-semibold sm:text-5xl" data-display="true">
          Your lane is open. Trust, approval, and verification still control what goes fully live.
        </h1>
        <p className="mt-5 max-w-3xl text-sm leading-7 text-white/66 sm:text-base">
          This screen reads the canonical activation state for each lane. It keeps verification, provider readiness, and approval posture in one place without exposing sensitive internals.
        </p>
        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          {(query.data?.lanes ?? []).map((lane) => (
            <Card key={lane.role} className="rounded-[28px] border border-white/8 bg-black/20 p-5">
              <p className="surface-label">{lane.role.replace("_", " ")}</p>
              <h2 className="mt-3 text-2xl font-semibold text-white">
                {lane.activationState === "active" ? "Live" : "Waiting on trust checks"}
              </h2>
              <p className="mt-3 text-sm leading-7 text-white/62">
                {lane.verificationProfile
                  ? `Overall status: ${lane.verificationProfile.overallStatus}.`
                  : "Verification state is still initializing."}
              </p>
              {lane.appApprovalStatus && lane.appApprovalStatus !== "not_required" ? (
                <p className="mt-2 text-sm leading-7 text-white/58">
                  App approval: {lane.appApprovalStatus.replaceAll("_", " ")}.
                </p>
              ) : null}
              {lane.shopApprovalStatus && lane.shopApprovalStatus !== "not_required" ? (
                <p className="mt-2 text-sm leading-7 text-white/58">
                  Shop approval: {lane.shopApprovalStatus.replaceAll("_", " ")}.
                </p>
              ) : null}
              {lane.requirements.length ? (
                <div className="mt-4 rounded-[22px] border border-white/8 bg-black/30 p-4 text-sm text-white/62">
                  {lane.requirements.join(" • ")}
                </div>
              ) : null}
              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <Link href={lane.resumePath}>
                  <Button variant="secondary" className="h-12 px-6">Open lane</Button>
                </Link>
                <Link href={lane.dashboardPath}>
                  <Button className="h-12 px-6">{lane.isActive ? "Open dashboard" : "Open dashboard anyway"}</Button>
                </Link>
              </div>
            </Card>
          ))}
        </div>
        {query.data?.warnings?.length ? (
          <div className="mt-5 rounded-[22px] border border-[#cfff93]/18 bg-[#7cff00]/[0.08] p-4 text-sm leading-7 text-[#ddffb8]">
            {query.data.warnings.join(" ")}
          </div>
        ) : null}
      </Card>
    </section>
  );
}
