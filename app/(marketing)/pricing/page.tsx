import { Card } from "@/components/ui/card";

const tiers = [
  { name: "Launch", price: "$199/mo", body: "Single-location MVP stack for up to 6 barbers." },
  { name: "Scale", price: "$449/mo", body: "Multi-location control, expanded analytics, and advanced workflows." },
  { name: "Flagship", price: "Custom", body: "Franchise, school, mobile bus, and branded commerce expansion." }
];

export default function PricingPage() {
  return (
    <section className="page-shell safe-top-pad app-safe-bottom py-6 sm:py-8 lg:py-12">
      <div className="max-w-2xl">
        <p className="text-sm uppercase tracking-[0.28em] text-[#baff69]">Pricing placeholder</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl lg:text-5xl">Premium software pricing for a premium barbershop operation.</h1>
      </div>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:mt-10 lg:grid-cols-3">
        {tiers.map((tier) => (
          <Card key={tier.name} className="rounded-[30px] p-6">
            <p className="text-sm text-white/50">{tier.name}</p>
            <h2 className="mt-4 text-3xl font-semibold">{tier.price}</h2>
            <p className="mt-4 text-sm leading-6 text-white/65">{tier.body}</p>
          </Card>
        ))}
      </div>
    </section>
  );
}
