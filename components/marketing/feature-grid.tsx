import { Card } from "@/components/ui/card";

const features = [
  { title: "Booking and waitlist", body: "Mobile-first booking with deposits, add-ons, waitlist enrollment, and frictionless rebooking.", tag: "Client flow" },
  { title: "Front desk speed", body: "Live queue, check-in board, walk-in claim flow, chair assignment, and POS-lite checkout views.", tag: "Ops" },
  { title: "Dual compensation", body: "Support commission and booth-rent models in the same location with distinct dashboards and reporting.", tag: "Finance" },
  { title: "Ownership control", body: "Multi-location analytics, audit logs, and permission boundaries that protect core financial settings.", tag: "Governance" },
  { title: "Retention engine", body: "Review triggers, comeback campaigns, birthday offers, and loyalty placeholders scaffolded for launch.", tag: "Growth" },
  { title: "Expansion ready", body: "Architecture prepared for school operations, mobile bus units, franchise oversight, and branded experiences.", tag: "Future" }
];

export function FeatureGrid() {
  return (
    <section className="page-shell py-6 sm:py-8 lg:py-12">
      <div className="mb-8 grid gap-5 lg:mb-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-end">
        <div>
          <p className="editorial-kicker">Platform depth <span className="accent-rule" /></p>
          <h2 className="mt-4 max-w-3xl text-balance text-3xl font-semibold sm:text-5xl" data-display="true">An operating system designed to feel like the shop, not a template.</h2>
        </div>
        <p className="max-w-2xl text-base leading-7 text-white/65">The visual language stays black, charcoal, and neon green, while the workflows stay unmistakably barbershop-first: clean, quick, and elevated.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((feature, index) => (
          <Card key={feature.title} className="min-h-[15rem] rounded-[32px] p-6 sm:min-h-56">
            <div className="flex items-start justify-between gap-4">
              <p className="surface-label">{feature.tag}</p>
              <span className="text-4xl text-white/12" data-display="true">0{index + 1}</span>
            </div>
            <h3 className="mt-8 text-2xl font-semibold sm:mt-10 sm:text-3xl" data-display="true">{feature.title}</h3>
            <p className="mt-4 text-sm leading-7 text-white/65 sm:mt-5">{feature.body}</p>
          </Card>
        ))}
      </div>
    </section>
  );
}
