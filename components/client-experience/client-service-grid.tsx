import Link from "next/link";
import { Baby, GraduationCap, Home, Package2, PenTool, Scissors, Sparkles } from "lucide-react";

export const clientServiceCategories = [
  { label: "Haircuts", query: "haircuts", icon: Scissors },
  { label: "Beard", query: "beard", icon: Sparkles },
  { label: "Kids Cuts", query: "kids cuts", icon: Baby },
  { label: "Hair Designs", query: "hair designs", icon: PenTool },
  { label: "House Calls", query: "house calls", icon: Home },
  { label: "Products", query: "products", icon: Package2 },
  { label: "Classes", query: "classes", icon: GraduationCap }
] as const;

export function ClientServiceGrid() {
  return (
    <div className="grid grid-cols-3 gap-3 lg:grid-cols-4 xl:grid-cols-7">
      {clientServiceCategories.map((category) => {
        const Icon = category.icon;

        return (
          <Link
            key={category.label}
            href={`/search?category=${encodeURIComponent(category.query)}`}
            className="group flex min-h-[7.4rem] min-w-0 flex-col items-center justify-center rounded-[26px] border border-white/8 bg-[linear-gradient(180deg,rgba(20,20,20,0.96),rgba(9,9,9,0.98))] px-3 py-4 text-center shadow-[0_14px_34px_rgba(0,0,0,0.16)] transition hover:-translate-y-0.5 hover:border-[#7CFF00]/18 hover:bg-black/30"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-[20px] border border-[#7CFF00]/16 bg-[linear-gradient(135deg,rgba(124,255,0,0.18),rgba(18,18,18,0.96))] text-[#d7ffab] shadow-[0_12px_28px_rgba(124,255,0,0.1)] transition group-hover:scale-[1.03]">
              <Icon className="h-6 w-6" />
            </div>
            <span className="mt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/82 sm:tracking-[0.18em]">{category.label}</span>
          </Link>
        );
      })}
    </div>
  );
}

