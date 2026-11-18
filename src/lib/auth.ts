// المصادقة والصلاحيات — PIN مشفّر بـ scrypt + جلسات بكوكي httpOnly
// كل فحوصات الأدوار تتم في الخادم فقط
import crypto from "node:crypto";
import { appendFile } from "node:fs/promises";
import { cookies, headers } from "next/headers";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { sessions, users, type Role } from "@/db/schema";
import { ApiError } from "./http";
import { hashPin, verifyPin } from "./pin";

export { hashPin, verifyPin };

const SESSION_COOKIE = "rc_session";
export const SESSION_COOKIE_NAME = SESSION_COOKIE;
const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export type SessionUser = {
  id: number;
  name: string;
  role: Role;
};

// حدّ معدل بسيط لمحاولات الدخول (ذاكرة العملية)
const attempts = new Map<string, { count: number; resetAt: number }>();
export function loginThrottled(key: string): boolean {
  const now = Date.now();
  const rec = attempts.get(key);
  if (!rec || rec.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + 5 * 60_000 });
    return false;
  }
  rec.count += 1;
  return rec.count > 30; // أكثر من 30 محاولة خلال 5 دقائق — حماية من التخمين دون إزعاج الاستخدام/الاختبار
}

/** التحقق من PIN مقابل المستخدمين النشطين — يرجع المستخدم أو null */
export async function verifyUserPin(pin: string): Promise<SessionUser | null> {
  if (!/^\d{4,8}$/.test(pin)) return null;
  const active = await db.select().from(users).where(eq(users.active, true));
  const user = active.find((u) => verifyPin(pin, u.pinHash));
  if (!user) return null;
  return { id: user.id, name: user.name, role: user.role };
}

/** إنشاء رمز جلسة — «تذكّر هذا الجهاز» يمتد إلى 90 يوماً ليدخل مباشرة */
export async function createSessionToken(userId: number, remember = false) {
  const token = crypto.randomBytes(32).toString("hex");
  const ttl = remember ? 90 * 24 * 60 * 60 * 1000 : SESSION_TTL_MS;
  const expiresAt = new Date(Date.now() + ttl);
  await db.insert(sessions).values({ token, userId, expiresAt });
  return { token, expiresAt };
}

export async function loginWithPin(
  pin: string,
  secureTransport = false,
): Promise<SessionUser | null> {
  const user = await verifyUserPin(pin);
  if (!user) return null;
  const { token, expiresAt } = await createSessionToken(user.id);
  const jar = await cookies();
  // عبر HTTPS (المعاينة المضمّنة داخل إطار iframe) نحتاج SameSite=None+Secure
  // كي يحفظ المتصفح الكوكي داخل الإطار؛ على HTTP المحلي نبقي Lax الافتراضي الآمن
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: secureTransport ? "none" : "lax",
    secure: secureTransport,
    path: "/",
    expires: expiresAt,
  });
  return user;
}

export async function logout(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.delete(sessions).where(eq(sessions.token, token));
  }
  jar.delete(SESSION_COOKIE);
}

/** يجلب المستخدم من رمز جلسة خام (يُستخدم للكوكي ولترويسة Bearer معاً) */
export async function getUserBySessionToken(token: string): Promise<SessionUser | null> {
  if (!token || token.length > 200) return null;
  const rows = await db
    .select({ id: users.id, name: users.name, role: users.role })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.token, token), gt(sessions.expiresAt, new Date()), eq(users.active, true)))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * يقرأ الجلسة الحالية — بالترتيب: كوكي httpOnly، ثم ترويسة Authorization: Bearer
 * (المسار الثاني يجعل التطبيق يعمل حتى لو حجب المتصفح كوكيز الطرف الثالث داخل إطار المعاينة)
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const hdrs = await headers();
  // نجرّب كل مصادر الجلسة حتى ينجح أحدها — الكوكي القديم (غير صالح)
  // لا يمنعنا من قبول Bearer أو x-session-id الصحيحين (إصلاح جوهري)
  const candidates: string[] = [];
  const cookieToken = jar.get(SESSION_COOKIE)?.value;
  if (cookieToken) candidates.push(cookieToken);
  const auth = hdrs.get("authorization");
  if (auth?.startsWith("Bearer ")) candidates.push(auth.slice(7).trim());
  const sidHeader = hdrs.get("x-session-id");
  if (sidHeader) candidates.push(sidHeader);

  // سجل تشخيصي: ما الذي وصل فعلاً للخادم؟ (يُقرأ من /tmp/resto-auth.log)
  const via = ["cookie", "bearer", "xsid"];
  const path = hdrs.get("x-matched-path") ?? hdrs.get("referer") ?? "-";
  const brief = candidates.map((c, i) => `${via[i]}:${c.slice(0, 6)}`).join(",") || "لا شيء";
  let result: SessionUser | null = null;
  let okVia = "";
  for (let i = 0; i < candidates.length; i++) {
    const user = await getUserBySessionToken(candidates[i]);
    if (user) {
      result = user;
      okVia = via[i];
      break;
    }
  }
  authLog(
    result
      ? `OK ${okVia} path=${path}`
      : `FAIL path=${path} وصل=[${brief}]`,
  );
  return result;
}

function authLog(line: string) {
  appendFile("/tmp/resto-auth.log", `${new Date().toISOString()} ${line}\n`).catch(() => {});
}

/** يرمي 401 إن لم توجد جلسة — للاستخدام داخل API routes */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new ApiError(401, "يجب تسجيل الدخول");
  return user;
}

/** يفرض دوراً معيناً — يرمي 403 عند المخالفة */
export async function requireRole(roles: Role[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) {
    throw new ApiError(403, "ليست لديك صلاحية لهذه العملية");
  }
  return user;
}
