import path from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname
});

const config = [
  {
    ignores: [
      ".next/**",
      ".gradle-user-home/**",
      ".tools/**",
      "android/**",
      "dist/**",
      "node_modules/**",
      "supabase/**",
      "next-env.d.ts"
    ]
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    files: ["components/kiosk/kiosk-parity-screen.tsx"],
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { "varsIgnorePattern": "^(CalendarDays|UserRound)$" }]
    }
  },
  {
    files: ["components/kiosk/priority1-state-screen.tsx"],
    rules: {
      "@next/next/no-page-custom-font": "off"
    }
  },
  {
    files: ["lib/kiosk/priority1-checkin.ts"],
    rules: {
      "prefer-const": "off"
    }
  },
  {
    files: ["lib/kiosk/priority1-service.ts"],
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { "varsIgnorePattern": "^(AppointmentSource|PaymentOwner)$" }]
    }
  }
];

export default config;
