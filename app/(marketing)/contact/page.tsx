import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function ContactPage() {
  return (
    <section className="page-shell safe-top-pad app-safe-bottom py-6 sm:py-8 lg:py-12">
      <div className="grid gap-5 lg:grid-cols-[0.92fr_1.08fr] lg:gap-6">
        <Card className="rounded-[34px] p-6 sm:p-8">
          <Badge>Book a demo</Badge>
          <h1 className="mt-5 max-w-3xl text-balance text-4xl font-semibold sm:text-5xl" data-display="true">Show me how BVRB3R Platform can run my shop.</h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-white/66">Founder-led rollout planning includes location setup, role mapping, service catalog design, and the polished operational experience the brand deserves.</p>
          <div className="mt-8 space-y-4 text-sm text-white/66">
            <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">Response target: within 1 business day</div>
            <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">Launch support: onboarding, seed import, and workflow design</div>
            <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">Expansion planning: school, franchise, and mobile bus readiness</div>
          </div>
        </Card>

        <Card className="rounded-[34px] p-6 sm:p-8">
          <p className="surface-label">Request a walkthrough</p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <Input placeholder="Your name" className="sm:col-span-1" />
            <Input placeholder="Work email" className="sm:col-span-1" />
            <Input placeholder="Business name" className="sm:col-span-1" />
            <Input placeholder="Phone" className="sm:col-span-1" />
            <textarea className="min-h-36 w-full min-w-0 rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(18,18,18,0.98),rgba(9,9,9,0.98))] px-4 py-3 text-base text-[#f5f1e8] outline-none placeholder:text-white/32 focus:border-[#7CFF00]/55 focus:shadow-[0_0_0_4px_rgba(124,255,0,0.10)] sm:col-span-2 sm:min-h-40 sm:text-sm" placeholder="Tell us about your shop, locations, and rollout goals." />
            <div className="flex flex-col gap-3 sm:col-span-2 sm:flex-row">
              <Button className="px-6">Request demo</Button>
              <Link href="/login" className="sm:w-auto">
                <Button variant="secondary" className="w-full px-6 sm:w-auto">Explore app</Button>
              </Link>
            </div>
          </div>
        </Card>
      </div>
    </section>
  );
}
