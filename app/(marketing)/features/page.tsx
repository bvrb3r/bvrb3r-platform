import { FeatureGrid } from "@/components/marketing/feature-grid";
import { Card } from "@/components/ui/card";

export default function FeaturesPage() {
  return (
    <section className="app-safe-bottom pb-10 sm:pb-12 lg:pb-16">
      <div className="page-shell safe-top-pad py-6 sm:py-8 lg:py-10">
        <Card className="rounded-[34px] p-6 sm:p-8">
          <p className="text-sm uppercase tracking-[0.28em] text-[#baff69]">Features</p>
          <h1 className="mt-3 max-w-4xl text-3xl font-semibold tracking-[-0.03em] sm:text-4xl lg:text-5xl">Everything needed to run the chair, the floor, and the business.</h1>
          <p className="mt-4 max-w-2xl text-white/65">BVRB3R Platform combines the best operational patterns from modern appointment software with a sharper barbershop-first workflow model.</p>
        </Card>
      </div>
      <FeatureGrid />
    </section>
  );
}
