// نقطة دخول بنموذج HTML حقيقي (بدون JavaScript): تتحقق من PIN وتوجّه 303
import { NextResponse } from "next/server";
import {
  SESSION_COOKIE_NAME,
  createSessionToken,
  loginThrottled,
  verifyUserPin,
} from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  // Location نسبي وليس مطلقاً — ضروري خلف البروكسي حتى لا يهرب عنوان الخادم الداخلي 0.0.0.0
  const go = (path: string) =>
    new NextResponse(null, { status: 303, headers: { Location: path } });

  const form = await req.formData().catch(() => null);
  const pin = String(form?.get("pin") ?? "");
  const remember = form?.get("remember") === "1";
  const ip = req.headers.get("x-forwarded-for") ?? "local";
  const proto =
    req.headers.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "");
  const secureCookie = proto === "https";

  if (loginThrottled(ip)) return go("/login?err=2");
  if (!/^\d{4,8}$/.test(pin)) return go("/login?err=1");

  let user: Awaited<ReturnType<typeof verifyUserPin>>;
  try {
    user = await verifyUserPin(pin);
  } catch (e) {
    console.error("[form-login] db error", e);
    return go("/login?err=3");
  }
  if (!user) return go("/login?err=1");

  const { token, expiresAt } = await createSessionToken(user.id, remember);
  await logAudit(user.id, "login", "user", user.id);

  // نلحق الرمز بالرابط أيضاً — ضمانة للمتصفحات التي تحجب كوكيز الطرف الثالث؛
  // إن عملت الكوكي فالواجهة تحذفه من شريط العنوان تلقائياً
  const res = go(`/tables?sid=${token}`);
  res.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: secureCookie ? "none" : "lax",
    secure: secureCookie,
    path: "/",
    expires: expiresAt,
  });
  return res;
}
