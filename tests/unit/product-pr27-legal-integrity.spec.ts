import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PRODUCT_PR27_LEGAL_DRAFTS } from "@/lib/legal/product-pr27-drafts";

describe("Product PR27 legal draft integrity", () => {
  it.each(Object.values(PRODUCT_PR27_LEGAL_DRAFTS))(
    "keeps $title byte-identical and non-published",
    (document) => {
      const file = fs.readFileSync(path.join(process.cwd(), "content/legal", document.fileName));
      const sha256 = createHash("sha256").update(file).digest("hex");
      const text = file.toString("utf8");

      expect(sha256).toBe(document.sha256);
      expect(text).toContain("Status: DRAFT — requires attorney review before publication.");
      expect(text).toContain("Effective:** _pending_");
    }
  );
});
