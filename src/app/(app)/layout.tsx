import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/db";
import { settings } from "@/db/schema";
import AppShell from "@/components/AppShell";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  // الحارس الموحّد: كوكي -> Authorization Bearer -> x-session-id (من middleware)
  // جميعها تتحقق مقابل جدول sessions في قاعدة البيانات
  const user = await getSessionUser();
  if (!user) redirect("/login");

  let restaurantName = "Lord Cafe";
  try {
    const [st] = await db.select().from(settings).limit(1);
    restaurantName = st?.restaurantName ?? restaurantName;
  } catch {
    // لا نسقط الصفحة إن تعذّر قراءة الإعدادات — الاسم الافتراضي يكفي
  }
  return (
    <AppShell user={user} restaurantName={restaurantName}>
      {children}
    </AppShell>
  );
}
