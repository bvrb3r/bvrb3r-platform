import { Card } from "@/components/ui/card";

export function StatCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <Card className="group min-w-0 rounded-[28px] bg-[linear-gradient(180deg,rgba(24,24,24,0.98),rgba(10,10,10,0.98))] p-4 sm:p-5 transition hover:-translate-y-0.5 hover:border-[#7CFF00]/14">
      <div className="flex items-start justify-between gap-3">
        <p className="surface-label">{label}</p>
        <span className="mt-1 h-2.5 w-2.5 rounded-full bg-[#7CFF00]/70 shadow-[0_0_16px_rgba(124,255,0,0.35)]" />
      </div>
      <p className="mt-4 text-[1.95rem] font-semibold tracking-[-0.04em] sm:mt-5 sm:text-[2.4rem]" data-display="true">{value}</p>
      <p className="mt-3 max-w-xs text-sm leading-6 text-white/62 sm:mt-4">{detail}</p>
    </Card>
  );
}


