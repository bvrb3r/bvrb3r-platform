export const bvrb3rTokens = {
  color: {
    night: {
      bgMain: "#0A0A0C",
      bgSoft: "#0E0E11",
      bgPanel: "#111114",
      bgCard: "#141418",
      bgCardSoft: "#17171B",
      textPrimary: "#F5F1E8",
      textSecondary: "rgba(245,241,232,0.64)",
      textMuted: "rgba(245,241,232,0.50)",
      textFaint: "rgba(245,241,232,0.34)"
    },
    day: {
      bgMain: "#F6F5F1",
      bgPanel: "#FFFFFF",
      bgCard: "#FFFFFF",
      border: "rgba(10,10,12,0.08)",
      textPrimary: "#0A0A0C",
      textSecondary: "#4A4A4A",
      textMuted: "#777777"
    },
    // Signal Green — the interactive / action / live accent (was lime #9BFF18)
    green: {
      base: "#C4F24E",
      bright: "#C4F24E",
      dark: "#8FBF2E",
      soft: "rgba(196,242,78,0.12)",
      border: "rgba(196,242,78,0.34)",
      glow: "rgba(196,242,78,0.14)"
    },
    // Gold — the luxury / editorial accent (kickers, rules, premium cards)
    gold: {
      base: "#C9A24D",
      bright: "#D9B461",
      dark: "#8C6F2E",
      soft: "rgba(201,162,77,0.14)",
      border: "rgba(201,162,77,0.38)",
      glow: "rgba(201,162,77,0.12)"
    },
    danger: "#F0563C"
  },
  radius: {
    sm: "10px",
    md: "14px",
    lg: "18px",
    xl: "22px",
    "2xl": "28px",
    pill: "999px"
  },
  spacing: {
    1: "4px",
    2: "8px",
    3: "12px",
    4: "16px",
    5: "20px",
    6: "24px",
    8: "32px",
    10: "40px",
    12: "48px",
    16: "64px"
  },
  font: {
    body: 'var(--font-inter), Inter, "SF Pro Display", "Helvetica Neue", Arial, sans-serif',
    display: 'var(--font-archivo), Archivo, "SF Pro Display", "Helvetica Neue", Arial, sans-serif',
    serif: 'var(--font-instrument-serif), "Instrument Serif", Georgia, "Times New Roman", serif',
    kicker: 'var(--font-space-mono), "Space Mono", ui-monospace, monospace'
  },
  shadow: {
    nightCard: "0 24px 60px rgba(0,0,0,0.50), inset 0 1px 0 rgba(255,255,255,0.05)",
    nightActive: "0 0 0 1px rgba(196,242,78,0.12), 0 20px 70px rgba(196,242,78,0.12)",
    dayCard: "0 12px 30px rgba(0,0,0,0.08)",
    greenAction: "0 12px 35px rgba(196,242,78,0.22)",
    goldAction: "0 12px 35px rgba(201,162,77,0.22)"
  }
} as const;

export type Bvrb3rTokens = typeof bvrb3rTokens;
