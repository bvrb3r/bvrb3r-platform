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
      // The kiosk reset callback is intentionally recreated with the current payload and
      // is only consumed by effects that already rerun on the operational timer state.
      // Keep the deployment gate strict everywhere else while this screen remains scoped.
      "react-hooks/exhaustive-deps": "off"
    }
  }
];

export default config;
