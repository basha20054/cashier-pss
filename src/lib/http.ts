// مساعدات استجابات API موحّدة
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function ok<T>(data: T, init?: ResponseInit) {
  return Response.json({ ok: true, ...data }, init);
}

export function bad(message: string, status = 400) {
  return Response.json({ ok: false, error: message }, { status });
}

/** معالج أخطاء موحّد: ApiError -> رمزه، وغيره -> 500 مع تسجيل */
export function fail(e: unknown) {
  if (e instanceof ApiError) return bad(e.message, e.status);
  console.error("[api error]", e);
  return bad("حدث خطأ في الخادم، حاول مجدداً", 500);
}

/** يتحقق أن القيمة عدد صحيح ضمن مجال */
export function intIn(v: unknown, min: number, max: number): number | null {
  if (typeof v !== "number" || !Number.isInteger(v)) return null;
  if (v < min || v > max) return null;
  return v;
}

/**
 * استخراج رمز خطأ PostgreSQL — Drizzle يغلّف خطأ السائق داخل .cause
 * 23505 = unique_violation · 23503 = foreign_key_violation
 */
export function pgErrorCode(e: unknown): string | undefined {
  const err = e as { code?: unknown; cause?: { code?: unknown } } | null;
  const code = err?.code ?? err?.cause?.code;
  return typeof code === "string" ? code : undefined;
}

export function pgConstraint(e: unknown): string | undefined {
  const err = e as { constraint?: unknown; cause?: { constraint?: unknown } } | null;
  const c = err?.constraint ?? err?.cause?.constraint;
  return typeof c === "string" ? c : undefined;
}
