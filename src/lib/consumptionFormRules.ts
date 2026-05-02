import type { Rule } from "antd/es/form";

type LineWithProduct = { productId?: string };

/** Flags duplicate product selections across Form.List `lines` (red text under each affected field). */
export function duplicateLineProductRule(message: string): Rule {
  return ({ getFieldValue }) => ({
    validator(_: unknown, value: string | undefined) {
      const lines = (getFieldValue("lines") ?? []) as LineWithProduct[];
      const pid = (value ?? "").trim();
      if (!pid) return Promise.resolve();
      const n = lines.filter((l) => (l?.productId ?? "").trim() === pid).length;
      if (n > 1) return Promise.reject(new Error(message));
      return Promise.resolve();
    },
  });
}
