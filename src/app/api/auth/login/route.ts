import {
  SESSION_COOKIE_NAME,
  createSessionToken,
  loginThrottled,
  verifyUserPin,
} from "@/lib/auth";
import { bad, fail, ok } from "@/lib/http";
import { logAudit } from "@/lib/audit";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

/** دخول JSON — يرجع رمز الجلسة أيضاً لمسار المتصفحات التي تحجب الكوكيز */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as { pin?: string; remember?: boolean } | null;
    const pin = body?.pin ?? "";
    const ip = req.headers.get("x-forwarded-for") ?? "local";
    if (loginThrottled(ip)) return bad("محاولات كثيرة، انتظر قليلاً ثم حاول", 429);
    const proto =
      req.headers.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "");
    const secureCookie = proto === "https";

    const user = await verifyUserPin(pin);
    if (!user) return bad("رقم الدخول غير صحيح", 401);

    const { token, expiresAt } = await createSessionToken(user.id, Boolean(body?.remember));
    const jar = await cookies();
    jar.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: secureCookie ? "none" : "lax",
      secure: secureCookie,
      // CHIPS — نفس خاصية مسار النموذج: يسمح بالحفظ داخل إطار المعاينة
      partitioned: secureCookie,
      path: "/",
      expires: expiresAt,
    });
    await logAudit(user.id, "login", "user", user.id);
    return ok({ user, token });
  } catch (e) {
    return fail(e);
  }
}
