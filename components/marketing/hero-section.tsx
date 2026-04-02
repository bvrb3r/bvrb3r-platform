import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { demoLocations, demoServices, ownerKpis } from "@/lib/data/demo";

export function HeroSection() {
  return (
    <section className="page-shell pb-10 pt-4 sm:pb-12 lg:pb-20 lg:pt-8">
      <div className="grid gap-4 lg:grid-cols-[1.08fr_0.92fr]">
        <Card className="overflow-hidden rounded-[38px] bg-[linear-gradient(135deg,rgba(24,24,24,0.98),rgba(7,7,7,0.98))] p-6 sm:p-8 lg:p-10">
          <div className="fade-rise flex flex-wrap items-center gap-4">
            <Badge>The BVRB3R Shop(TM)</Badge>
            <div className="accent-rule" />
            <span className="surface-label">Luxury barber operations, reimagined</span>
          </div>
          <p className="mt-8 text-[11px] uppercase tracking-[0.34em] text-[#d7ffa8]">Premium urban software</p>
          <h1 className="mt-4 max-w-4xl text-balance text-[2.65rem] font-semibold sm:text-[4rem] lg:text-[5.5rem]" data-display="true">
            Run the chair, the floor, and the brand with one sharp system.
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-7 text-white/70 sm:text-lg">
            BVRB3R Platform gives The BVRB3R Shop(TM) a premium client-facing booking flow, faster front-desk operations, cleaner owner controls, and a visual identity that feels as elevated as the shop itself.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/booking/new"><Button className="h-12 px-6">Open booking flow</Button></Link>
            <Link href="/login"><Button variant="secondary" className="h-12 px-6">Enter the platform</Button></Link>
          </div>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {ownerKpis.slice(0, 3).map((metric) => (
              <Card key={metric.label} className="rounded-[26px] bg-[linear-gradient(180deg,rgba(34,34,34,0.88),rgba(10,10,10,0.95))] p-4">
                <p className="surface-label">{metric.label}</p>
                <p className="mt-3 text-3xl font-semibold" data-display="true">{metric.value}</p>
                <p className="mt-2 text-sm text-[#cfff93]">{metric.delta}</p>
              </Card>
            ))}
          </div>
        </Card>
        <div className="grid gap-4">
          <Card className="rounded-[38px] p-0">
            <div className="border-b border-white/8 px-6 py-5 sm:px-7">
              <p className="surface-label">Flagship floor pulse</p>
              <h2 className="mt-3 text-3xl font-semibold sm:text-4xl" data-display="true">Centro Ybor in motion.</h2>
            </div>
            <div className="grid gap-3 p-6 sm:p-7">
              {demoLocations.map((location) => (
                <div key={location.id} className="rounded-[26px] border border-white/8 bg-[linear-gradient(180deg,rgba(28,28,28,0.9),rgba(10,10,10,0.96))] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-semibold">{location.name}</p>
                      <p className="mt-1 text-sm text-white/55">{location.neighborhood}, {location.city}</p>
                    </div>
                    <div className="rounded-full border border-[#7CFF00]/20 bg-[#7CFF00]/10 px-3 py-1 text-[10px] uppercase tracking-[0.24em] text-[#cfff93]">{location.chairs} chairs</div>
                  </div>
                  <p className="mt-4 text-sm text-white/60">Open rhythm: {location.hours}</p>
                </div>
              ))}
            </div>
          </Card>
          <div className="grid gap-4 sm:grid-cols-2">
            {demoServices.slice(0, 4).map((service) => (
              <Card key={service.id} className="rounded-[30px] bg-[linear-gradient(180deg,rgba(21,21,21,0.98),rgba(9,9,9,0.98))] p-5">
                <p className="surface-label">{service.category}</p>
                <p className="mt-3 text-2xl font-semibold" data-display="true">{service.name}</p>
                <p className="mt-4 text-sm text-white/60">{service.durationMin} min</p>
                <div className="mt-5 flex items-center justify-between border-t border-white/8 pt-4 text-sm">
                  <span className="text-white/55">Deposit</span>
                  <span className="text-[#cfff93]">${service.deposit || 0}</span>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}




