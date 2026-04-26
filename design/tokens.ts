export const bvrb3rTokens = {
  color: {
    night: {
      bgMain: "#050505",
      bgSoft: "#080808",
      bgPanel: "#0D0D0D",
      bgCard: "#111111",
      bgCardSoft: "#151515",
      textPrimary: "#FFFFFF",
      textSecondary: "#C7C7C7",
      textMuted: "#8A8A8A",
      textFaint: "#5E5E5E"
    },
    day: {
      bgMain: "#F6F7F5",
      bgPanel: "#FFFFFF",
      bgCard: "#FFFFFF",
      border: "rgba(0,0,0,0.08)",
      textPrimary: "#0A0A0A",
      textSecondary: "#4A4A4A",
      textMuted: "#777777"
    },
    green: {
      base: "#9BFF18",
      bright: "#A3FF12",
      dark: "#4D7F0B",
      soft: "rgba(163,255,18,0.14)",
      border: "rgba(163,255,18,0.35)",
      glow: "rgba(163,255,18,0.28)"
    },
    danger: "#FF4D4D"
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
    body: 'Inter, "SF Pro Display", "Helvetica Neue", Arial, sans-serif',
    display: 'Inter, "SF Pro Display", "Helvetica Neue", Arial, sans-serif'
  },
  shadow: {
    nightCard: "0 20px 60px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.05)",
    nightActive: "0 0 0 1px rgba(163,255,18,0.10), 0 20px 70px rgba(163,255,18,0.10)",
    dayCard: "0 12px 30px rgba(0,0,0,0.08)",
    greenAction: "0 12px 35px rgba(163,255,18,0.28)"
  }
} as const;

export type Bvrb3rTokens = typeof bvrb3rTokens;
