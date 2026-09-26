// Size cell parser used by the quotation / invoice editors, the PDF renderer,
// and the backend copy in electron/database.js.
//
// Accepts:
//   Simple dimensions:   "4x4"        → 16       (area)
//                        "4x4x6"      → 96       (volume)
//   Multi-face sums:     "4x4 + 3x3"  → 25       (each group is a product; sum of groups)
//   Any arithmetic:      "10-2"       → 8
//                        "(5+3)/2"    → 4
//                        "5*5-3*3"    → 16
//   Scalar:              "16"         → 16
//   Blank:               ""           → 1        (no multiplier)
//
// Separators x / X / × / * inside a "group" all mean multiplication.
// The parser accepts full arithmetic (+, -, *, /, parentheses); anything that
// evaluates to a positive finite number wins. If evaluation fails, we fall
// back to the legacy "sum of products" behaviour so old data keeps working.

function tryEval(expr) {
  // Whitelist: digits, dot, arithmetic ops, parens, whitespace.
  if (!/^[0-9.+\-*/()\s]+$/.test(expr)) return null;
  try {
    // eslint-disable-next-line no-new-func
    const val = Function(`"use strict"; return (${expr});`)();
    if (typeof val !== 'number' || !Number.isFinite(val)) return null;
    return val;
  } catch (_e) {
    return null;
  }
}

export function parseSize(size) {
  if (size == null || size === '') return 1;
  const raw = String(size).trim().toLowerCase();
  if (!raw) return 1;

  // Normalize the various "times" glyphs to `*` so Function() can evaluate.
  const normalized = raw.replace(/[x×]/g, '*');

  // Primary path: treat the whole cell as an arithmetic expression.
  const expr = tryEval(normalized);
  if (expr != null && expr > 0) return expr;

  // Legacy fallback: sum-of-products across '+', for backwards compat with
  // any edge case the general evaluator rejects.
  const groups = raw.split('+').map((g) => g.trim()).filter(Boolean);
  let sum = 0;
  let anyGroupParsed = false;
  for (const g of groups) {
    const parts = g.split(/\s*[x*×]\s*/).filter(Boolean);
    if (parts.length >= 1 && parts.every((p) => /^\d+(?:\.\d+)?$/.test(p))) {
      sum += parts.reduce((prod, p) => prod * Number(p), 1);
      anyGroupParsed = true;
    }
  }
  if (anyGroupParsed && sum > 0) return sum;

  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 1;
}
