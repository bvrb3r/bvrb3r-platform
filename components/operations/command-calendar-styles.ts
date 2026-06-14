export const commandButtonBaseClassName =
  "inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[8px] px-4 text-xs font-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A3FF12]/70 disabled:cursor-not-allowed disabled:opacity-55";

export const commandButtonPrimaryClassName =
  `${commandButtonBaseClassName} bg-[#A3FF12] text-[#050505] shadow-[0_0_26px_rgba(163,255,18,0.20)] hover:bg-[#d7ffab]`;

export const commandButtonSecondaryClassName =
  `${commandButtonBaseClassName} border border-white/10 bg-white/[0.035] text-white/74 hover:border-[#A3FF12]/30 hover:text-white`;

export const commandButtonKioskClassName =
  `${commandButtonBaseClassName} border border-[#A3FF12]/24 bg-[#A3FF12]/10 text-[#d7ffab] hover:border-[#A3FF12]/40 hover:bg-[#A3FF12]/14`;

export const commandButtonIconAccentClassName = "h-4 w-4 text-[#A3FF12]";
export const commandButtonIconClassName = "h-4 w-4";
