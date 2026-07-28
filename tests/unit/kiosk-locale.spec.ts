import { describe, expect, it } from "vitest";
import {
  DEFAULT_KIOSK_LOCALE,
  KIOSK_COPY,
  KIOSK_LOCALES,
  KIOSK_LOCALE_NAME,
  kioskAttractSlides,
  kioskBarberWaitChip,
  kioskDoneWhenWalkIn,
  kioskFromPriceChip,
  kioskHowPayTitle,
  kioskPayChip,
  kioskQueueChip,
  kioskServiceRailLabel,
  kioskSmsBody,
  kioskTipTitle,
  kioskWaitLabel,
  kioskWaitLabelCapitalized,
  resolveKioskLocale,
  type KioskLocale
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

  it("translates every step of the booking flow, not just the chrome", () => {
    const flowKeys = [
      "welcomeTo", "pickSub", "fastest", "nextChair", "atChair", "bookWith",
      "walkTitle", "schedTitle", "whenYours", "almost", "yourName", "consent",
      "lastStep", "cardEye", "cashEye", "beforeReader", "tipNote",
      "follow", "waiting", "apptSet", "yourBarber", "doneNext",
      "smsPreview", "scanSave", "tapBegin", "resets", "pinTitleShop"
    ] as const;

    for (const locale of KIOSK_LOCALES.filter((item) => item !== "en")) {
      for (const key of flowKeys) {
        expect(KIOSK_COPY[locale][key], `${locale}.${key} is untranslated`).not.toBe(KIOSK_COPY.en[key]);
        expect(KIOSK_COPY[locale][key].trim().length, `${locale}.${key} is empty`).toBeGreaterThan(0);
      }
    }
  });

  it("never leaves a placeholder token in shipped copy", () => {
    for (const locale of KIOSK_LOCALES) {
      for (const [key, value] of Object.entries(KIOSK_COPY[locale])) {
        expect(value, `${locale}.${key} looks unfinished`).not.toMatch(/\bTODO\b|\{\{|\}\}|undefined/);
      }
    }
  });
});

describe("kiosk composed copy", () => {
  const locales: KioskLocale[] = ["en", "es", "ht"];

  it("says no wait rather than ~0 min when a chair is free", () => {
    expect(kioskWaitLabel("en", 0)).toBe("no wait");
    expect(kioskWaitLabel("es", 0)).toBe("sin espera");
    expect(kioskWaitLabel("ht", 0)).toBe("san tann");
    expect(kioskWaitLabelCapitalized("en", 0)).toBe("No wait");
  });

  it("collapses a long wait instead of printing an exact hour count", () => {
    expect(kioskWaitLabel("en", 65)).toBe("over 1 hour");
    expect(kioskWaitLabel("es", 90)).toBe("más de 1 hora");
    expect(kioskWaitLabel("ht", 60)).toBe("plis pase 1 èdtan");
    expect(kioskWaitLabel("en", 35)).toBe("~35 min");
    expect(kioskWaitLabelCapitalized("en", 35)).toBe("About 35 min");
  });

  it("falls back to a live estimate when no wait is known", () => {
    for (const locale of locales) {
      expect(kioskWaitLabel(locale, null)).not.toContain("null");
      expect(kioskWaitLabel(locale, undefined)).not.toContain("undefined");
    }
  });

  it("builds the queue and barber chips in every language", () => {
    expect(kioskQueueChip("en", 0, 0)).toBe("No wait right now");
    expect(kioskQueueChip("en", 2, 35)).toBe("2 ahead · ~35 min");
    expect(kioskQueueChip("es", 2, 35)).toBe("2 delante · ~35 min");
    expect(kioskQueueChip("ht", 2, 35)).toBe("2 devan · ~35 min");
    expect(kioskBarberWaitChip("en", 0, 0)).toBe("No wait");
    expect(kioskBarberWaitChip("en", 2, 35)).toBe("2 ahead · ~35 min");
  });

  it("prefixes the From chip in each language", () => {
    expect(kioskFromPriceChip("en", "$20")).toBe("From $20");
    expect(kioskFromPriceChip("es", "$20")).toBe("Desde $20");
    expect(kioskFromPriceChip("ht", "$20")).toBe("Apati $20");
  });

  it("addresses the client by name on the payment step in every language", () => {
    expect(kioskHowPayTitle("en", "Jordan")).toBe("How would you like to pay, Jordan?");
    expect(kioskHowPayTitle("es", "Jordan")).toContain("Jordan");
    expect(kioskHowPayTitle("ht", "Jordan")).toContain("Jordan");
  });

  it("names the barber in the service rail and the tip prompt", () => {
    for (const locale of locales) {
      expect(kioskServiceRailLabel(locale, "tashacuts")).toContain("tashacuts");
      expect(kioskTipTitle(locale, "tashacuts")).toContain("tashacuts");
    }
  });

  it("never claims the kiosk collected money", () => {
    for (const locale of locales) {
      expect(kioskPayChip(locale, "cash", "$45", null)).not.toMatch(/paid|pagado|peye \$/i);
      const card = kioskPayChip(locale, "card", "$54", "$9");
      expect(card).toContain("$54");
      expect(card).toContain("$9");
      // "after the service", never "Paid".
      expect(card).not.toMatch(/^Paid|^Pagado/);
    }
  });

  it("composes the confirmation text in the client's own language", () => {
    const input = {
      firstName: "Jordan",
      serviceName: "Precision Cut",
      handle: "tashacuts",
      whenLabel: "2 ahead of you · ~35 min",
      reference: "BVR-4821"
    };

    for (const locale of locales) {
      const body = kioskSmsBody(locale, input);
      expect(body.startsWith("BVRB3R:")).toBe(true);
      expect(body).toContain("Jordan");
      expect(body).toContain("Precision Cut");
      expect(body).toContain("tashacuts");
      expect(body).toContain("BVR-4821");
    }
    expect(kioskSmsBody("es", input)).toContain("¡Listo, Jordan!");
    expect(kioskSmsBody("ht", input)).toContain("Ou pare, Jordan!");
  });

  it("writes the walk-in position line per language", () => {
    expect(kioskDoneWhenWalkIn("en", 2, 35)).toBe("2 ahead of you · ~35 min");
    expect(kioskDoneWhenWalkIn("es", 2, 35)).toBe("2 delante de ti · ~35 min");
    expect(kioskDoneWhenWalkIn("ht", 2, 35)).toBe("2 devan ou · ~35 min");
  });

  it("gives each scope four attract slides in every language", () => {
    for (const locale of locales) {
      for (const scope of ["shop", "barber"] as const) {
        const slides = kioskAttractSlides(locale, scope, {
          displayName: "The BVRB3R Shop",
          barberCount: 3,
          fastestHandle: "tashacuts",
          fastestWaitMinutes: 0
        });

        expect(slides).toHaveLength(4);
        for (const slide of slides) {
          expect(slide.eyebrow.trim().length).toBeGreaterThan(0);
          expect(slide.big.trim().length).toBeGreaterThan(0);
          expect(slide.sub.trim().length).toBeGreaterThan(0);
        }
      }
    }
  });

  it("keeps the shop attract deck distinct from the barber deck", () => {
    const args = { displayName: "The BVRB3R Shop", barberCount: 3, fastestHandle: "tashacuts", fastestWaitMinutes: 10 };
    const shop = kioskAttractSlides("en", "shop", args);
    const barber = kioskAttractSlides("en", "barber", args);

    expect(shop[0].eyebrow).toBe("Welcome to");
    expect(barber[0].eyebrow).toBe("You’re at the chair of");
    expect(shop[1].sub).toContain("tashacuts");
  });
});
