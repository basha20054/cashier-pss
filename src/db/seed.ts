// بيانات أولية — يُشغّل بـ: npx tsx src/db/seed.ts
// آمن لإعادة التشغيل: لا يكرر الإدخالات الموجودة
import "dotenv/config";
import { db } from "./index";
import {
  categories,
  diningTables,
  menuItems,
  seqCounters,
  settings,
  users,
} from "./schema";
import { hashPin } from "../lib/pin";

async function main() {
  // إعدادات المطعم
  const s = await db.select().from(settings).limit(1);
  if (s.length === 0) {
    await db.insert(settings).values({
      restaurantName: "Lord Cafe",
      currency: "ILS",
      taxBps: 0,
      timezone: "Asia/Hebron",
    });
    console.log("✓ settings");
  }

  // عدّاد أرقام الفواتير
  await db
    .insert(seqCounters)
    .values({ key: "invoice_number", value: 0 })
    .onConflictDoNothing();

  // مستخدمون افتراضيون (الأرقام يحددها المالك — مدير 1357 · موظف 2468)
  const existingUsers = await db.select().from(users).limit(1);
  if (existingUsers.length === 0) {
    await db.insert(users).values([
      { name: "المدير", role: "manager", pinHash: hashPin("1357") },
      { name: "الموظف", role: "staff", pinHash: hashPin("2468") },
    ]);
    console.log("✓ users (مدير 1357 · موظف 2468)");
  }

  // طاولات
  const existingTables = await db.select().from(diningTables).limit(1);
  if (existingTables.length === 0) {
    await db.insert(diningTables).values(
      Array.from({ length: 8 }, (_, i) => ({
        name: `طاولة ${i + 1}`,
        sortOrder: i + 1,
      })),
    );
    console.log("✓ 8 tables");
  }

  // التصنيفات والأصناف (الأسعار بالأجورات: 1200 = 12.00 ₪)
  const existingCats = await db.select().from(categories).limit(1);
  if (existingCats.length === 0) {
    const cats = await db
      .insert(categories)
      .values([
        { name: "مشروبات ساخنة", sortOrder: 1 },
        { name: "مشروبات باردة", sortOrder: 2 },
        { name: "حلويات", sortOrder: 3 },
        { name: "وجبات", sortOrder: 4 },
        { name: "أراكيل", sortOrder: 5 },
      ])
      .returning({ id: categories.id, name: categories.name });
    const byName = Object.fromEntries(cats.map((c) => [c.name, c.id]));

    const items: Array<[string, string, number, number]> = [
      // [الاسم, التصنيف, السعر, التكلفة]
      ["إسبريسو", "مشروبات ساخنة", 800, 250],
      ["قهوة تركية", "مشروبات ساخنة", 1000, 300],
      ["كابتشينو", "مشروبات ساخنة", 1400, 450],
      ["كافيه لاتيه", "مشروبات ساخنة", 1500, 500],
      ["شاي بالنعناع", "مشروبات ساخنة", 900, 200],
      ["هوت شوكليت", "مشروبات ساخنة", 1400, 550],
      ["سحلب", "مشروبات ساخنة", 1500, 500],
      ["عصير برتقال طازج", "مشروبات باردة", 1500, 600],
      ["ليمون بالنعناع", "مشروبات باردة", 1500, 500],
      ["آيس لاتيه", "مشروبات باردة", 1600, 550],
      ["ميلك شيك", "مشروبات باردة", 1800, 800],
      ["موهيتو", "مشروبات باردة", 1700, 600],
      ["مياه معدنية", "مشروبات باردة", 400, 150],
      ["كنافة نابلسية", "حلويات", 2000, 900],
      ["تشيز كيك", "حلويات", 1800, 750],
      ["براونيز", "حلويات", 1600, 600],
      ["أم علي", "حلويات", 1500, 650],
      ["شاورما دجاج", "وجبات", 2500, 1100],
      ["برغر لحم", "وجبات", 3000, 1400],
      ["بيتزا مارغريتا", "وجبات", 3500, 1300],
      ["سلطة سيزر", "وجبات", 2800, 1000],
      ["بطاطا مقلية", "وجبات", 1200, 400],
      ["صحن مقبلات مشكّل", "وجبات", 3500, 1500],
      ["أرجيلة تفاحتين", "أراكيل", 2500, 700],
      ["أرجيلة عنب نعناع", "أراكيل", 2500, 700],
      ["أرجيلة خوخ", "أراكيل", 2800, 800],
    ];
    await db.insert(menuItems).values(
      items.map(([name, cat, price, cost], i) => ({
        name,
        categoryId: byName[cat],
        priceMinor: price,
        costMinor: cost,
        sortOrder: i + 1,
      })),
    );
    console.log(`✓ ${items.length} menu items in ${cats.length} categories`);
  }

  console.log("Seed complete.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
