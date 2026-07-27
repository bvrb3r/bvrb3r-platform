import { describe, expect, it } from "vitest";
import {
  DEFAULT_KIOSK_LOCALE,
  KIOSK_COPY,
  KIOSK_LOCALES,
  KIOSK_LOCALE_NAME,
  resolveKioskLocale
} from "@/lib/kiosk/locale";

describe("kiosk locale resolution", () => {
  it("resolves the three supported kiosk languages from a ?lang= value", () => {
    expect(resolveKioskLocale("en")).toBe("en");
    expect(resolveKioskLocale("es")).toBe("es");
    expect(resolveKioskLocale("ht")).toBe("ht");
  });

  it("accepts region-qualified and cased tags", () => {
    expect(resolveKioskLocale("es-MX")).toBe("es");
    expect(resolveKioskLocale("ES")).toBe("es");
    expect(resolveKioskLocale("ht_HT")).toBe("ht");
    expect(resolveKioskLocale(" es ")).toBe("es");
  });

  it("accepts the language's own name and the KRE switch label", () => {
    expect(resolveKioskLocale("espanol")).toBe("es");
    expect(resolveKioskLocale("español")).toBe("es");
    expect(resolveKioskLocale("kreyol")).toBe("ht");
    expect(resolveKioskLocale("kre")).toBe("ht");
  });

  it("takes the first value when Next hands back a repeated query param", () => {
    expect(resolveKioskLocale(["es", "ht"])).toBe("es");
  });

  it("falls back to English rather than failing on junk input", () => {
    expect(resolveKioskLocale(undefined)).toBe(DEFAULT_KIOSK_LOCALE);
    expect(resolveKioskLocale(null)).toBe(DEFAULT_KIOSK_LOCALE);
    expect(resolveKioskLocale("")).toBe(DEFAULT_KIOSK_LOCALE);
    expect(resolveKioskLocale("klingon")).toBe(DEFAULT_KIOSK_LOCALE);
    expect(resolveKioskLocale([])).toBe(DEFAULT_KIOSK_LOCALE);
  });
});

describe("kiosk copy dictionary", () => {
  it("covers every key in every supported language", () => {
    const englishKeys = Object.keys(KIOSK_COPY.en).sort();

    for (const locale of KIOSK_LOCALES) {
      expect(Object.keys(KIOSK_COPY[locale]).sort(), `missing keys for ${locale}`).toEqual(englishKeys);
    }
  });

  it("actually translates the fallback-state copy instead of leaving English behind", () => {
    for (const locale of KIOSK_LOCALES.filter((item) => item !== "en")) {
      for (const key of ["denied", "offline", "recovery", "empty", "loading", "retry", "exit"] as const) {
        expect(KIOSK_COPY[locale][key], `${locale}.${key} is untranslated`).not.toBe(KIOSK_COPY.en[key]);
      }
    }
  });

  it("names each language in its own words for the picker", () => {
    expect(KIOSK_LOCALE_NAME).toEqual({ en: "English", es: "Español", ht: "Kreyòl" });
  });
});
