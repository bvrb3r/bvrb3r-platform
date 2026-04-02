import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

type ClientActionVariant = "primary" | "secondary" | "outline";
type ClientActionSize = "md" | "lg";

type ClientActionLinkProps = Omit<ComponentProps<typeof Link>, "className" | "children"> & {
  children: ReactNode;
  className?: string;
  size?: ClientActionSize;
  variant?: ClientActionVariant;
};

const baseClassName =
  "inline-flex min-w-0 items-center justify-center gap-2 rounded-full border font-semibold leading-none transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b7ff58] focus-visible:ring-offset-2 focus-visible:ring-offset-black";

const sizeClassNames = {
  md: "min-h-11 px-4 text-[13px] tracking-[-0.01em]",
  lg: "min-h-12 px-5 text-[14px] tracking-[-0.01em]"
} as const;

const variantClassNames = {
  primary:
    "border-[#c8f17f]/38 bg-[linear-gradient(180deg,#8ed62c_0%,#6fb61b_100%)] text-[#050b03] ring-1 ring-[#d4ff96]/18 shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_14px_30px_rgba(111,182,27,0.24)] hover:-translate-y-0.5 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_18px_36px_rgba(111,182,27,0.3)]",
  secondary:
    "border-white/12 bg-[linear-gradient(180deg,rgba(34,34,34,0.96),rgba(12,12,12,0.98))] text-white shadow-[0_14px_28px_rgba(0,0,0,0.22)] hover:border-[#7cff00]/24 hover:bg-[linear-gradient(180deg,rgba(38,38,38,0.98),rgba(14,14,14,0.99))] hover:text-white",
  outline:
    "border-[#9bff2f]/45 bg-transparent text-[#d7ffab] hover:border-[#b7ff58]/72 hover:bg-[#b7ff58]/8 hover:text-[#efffd4]"
} as const;

export function getClientActionClassName({
  className,
  size = "md",
  variant = "primary"
}: {
  className?: string;
  size?: ClientActionSize;
  variant?: ClientActionVariant;
}) {
  return cn(baseClassName, sizeClassNames[size], variantClassNames[variant], className);
}

export function ClientActionLink({
  children,
  className,
  size = "md",
  variant = "primary",
  ...props
}: ClientActionLinkProps) {
  return (
    <Link
      className={getClientActionClassName({ className, size, variant })}
      {...props}
    >
      {children}
    </Link>
  );
}
