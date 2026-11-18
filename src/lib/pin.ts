// تشفير أرقام PIN بـ scrypt — بدون أي اعتماد على Next.js (صالح للسكربتات)
import crypto from "node:crypto";

export function hashPin(pin: string, salt?: string): string {
  const s = salt ?? crypto.randomBytes(8).toString("hex");
  const hash = crypto.scryptSync(pin, s, 32).toString("hex");
  return `${s}:${hash}`;
}

export function verifyPin(pin: string, stored: string): boolean {
  const [s, h] = stored.split(":");
  if (!s || !h) return false;
  const calc = crypto.scryptSync(pin, s, 32);
  const ref = Buffer.from(h, "hex");
  return calc.length === ref.length && crypto.timingSafeEqual(calc, ref);
}
