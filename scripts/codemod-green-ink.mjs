// scripts/codemod-green-ink.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { globSync } from "glob";

// SOLID green fills only. The trailing (?!\/) rejects Tailwind opacity
// modifiers (bg-[#c4f24e]/12), so translucent soft-tint chips are left alone;
// (?!-soft) skips the translucent --bvr-green-soft surface variable.
const GREEN_FILL = /bg-\[(?:#c4f24e|#C4F24E|linear-gradient\([^\]]*(?:#c4f24e|#C4F24E)[^\]]*\)|var\(--bvr-green(?!-soft)[^)]*\))\](?!\/)/;
const WHITE_TEXT = /\btext-white\b|\btext-\[#fff(?:fff)?\]|\btext-\[#FFF(?:FFF)?\]/g;

const files = globSync("{app,components,design}/**/*.{tsx,ts}", { nodir: true });
let changed = 0;

for (const file of files) {
  const src = readFileSync(file, "utf8");
  // operate per className="..."/className={cn("...")} string literal
  const next = src.replace(/(["'`])((?:\\.|(?!\1).)*)\1/g, (full, q, body) => {
    if (!GREEN_FILL.test(body)) return full;          // only green-filled class strings
    if (!WHITE_TEXT.test(body)) return full;
    let b = body.replace(WHITE_TEXT, "text-[#050505]");
    if (!/\bbvr-on-green\b/.test(b)) b = `${b} bvr-on-green`;
    return `${q}${b}${q}`;
  });
  if (next !== src) { writeFileSync(file, next); changed++; }
}
console.log(`green-ink codemod: updated ${changed} file(s)`);
