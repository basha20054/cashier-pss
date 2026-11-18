// أدوات المال — كل المبالغ أعداد صحيحة بالأجورات (minor units)
export const CURRENCY_SYMBOL = "₪";
export const CURRENCY_CODE = "ILS";

const nf = new Intl.NumberFormat("ar-EG-u-nu-latn", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 1250 -> "12.50 ₪" */
export function formatMinor(minor: number): string {
  return `${nf.format(minor / 100)} ${CURRENCY_SYMBOL}`;
}

/** 1250 -> "12.50" (بدون رمز العملة) */
export function formatMinorPlain(minor: number): string {
  return nf.format(minor / 100);
}

const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";

/**
 * يحوّل إدخال المستخدم ("12.5", "12,50", أرقام عربية) إلى أجورات.
 * يرجع null إن كان الإدخال غير صالح.
 */
export function parseToMinor(input: string): number | null {
  if (!input) return null;
  const norm = input
    .trim()
    .replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)))
    .replace(/[٬,\s]/g, "")
    .replace("٫", ".");
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(norm)) return null;
  return Math.round(Number(norm) * 100);
}
