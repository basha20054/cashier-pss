// تحديث بيانات الدخول حسب طلب المالك: مدير=1357، موظف=2468، وتعطيل الكاشير
import "dotenv/config";
import { db } from "../src/db";
import { sessions, users } from "../src/db/schema";
import { hashPin } from "../src/lib/pin";
import { eq } from "drizzle-orm";

async function main() {
  const all = await db.select().from(users);

  const manager = all.find((u) => u.role === "manager");
  const staff = all.find((u) => u.role === "staff");
  const cashier = all.find((u) => u.role === "cashier");

  if (manager) {
    await db
      .update(users)
      .set({ pinHash: hashPin("1357"), active: true })
      .where(eq(users.id, manager.id));
    console.log(`✓ المدير (id=${manager.id}) -> PIN 1357`);
  }
  if (staff) {
    await db
      .update(users)
      .set({ pinHash: hashPin("2468"), active: true })
      .where(eq(users.id, staff.id));
    console.log(`✓ الموظف (id=${staff.id}) -> PIN 2468`);
  }
  if (cashier) {
    await db.update(users).set({ active: false }).where(eq(users.id, cashier.id));
    console.log(`✓ الكاشير (id=${cashier.id}) عُطّل`);
  }

  // إنهاء كل الجلسات القائمة لفرض الدخول بالأرقام الجديدة
  await db.delete(sessions);
  console.log("✓ أُنهيت كل الجلسات السابقة");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
