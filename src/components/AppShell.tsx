"use client";

import "@/lib/api-client";
import {
  Armchair,
  BookOpenText,
  ChartColumn,
  Coffee,
  LogOut,
  Menu,
  ReceiptText,
  Settings,
  Users,
  Wallet,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

type Props = {
  user: { id: number; name: string; role: "manager" | "cashier" | "staff" };
  restaurantName: string;
  children: ReactNode;
};

const ROLE_LABEL: Record<string, string> = {
  manager: "مدير",
  cashier: "كاشير",
  staff: "موظف",
};

export default function AppShell({ user, restaurantName, children }: Props) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  // تسجيل خدمة العمل بدون إنترنت (PWA)
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  // إغلاق لوحة المزيد عند تغيّر المسار — نمط التعديل أثناء التصيير بدل useEffect
  const [prevPath, setPrevPath] = useState(pathname);
  if (prevPath !== pathname) {
    setPrevPath(pathname);
    setMoreOpen(false);
  }

  // التقاط رمز الجلسة من الرابط (مسار المتصفحات التي تحجب الكوكيز).
  // ملاحظة حرجة: لا نحذف sid من الرابط إطلاقاً — بقاءه هو الضمانة الدائمة
  // للتنقل وطلبات الـAPI في البيئات المحجوبة للكوكيز والتخزين.
  useEffect(() => {
    const w = window;
    const u = new URL(w.location.href);
    const sidParam = u.searchParams.get("sid");
    if (sidParam) {
      try {
        localStorage.setItem("rc_token", sidParam);
      } catch {
        /* التخزين محجوب — الرابط يكفي */
      }
      w.__rcNav = true;
    }
    // اختبار الكوكي بالنسخة الأصلية فقط من fetch (غير المعدّلة)
    const orig = w.__rcOrigFetch;
    if (!orig) return;
    orig("/api/auth/me")
      .then((r) => {
        if (r.ok) w.__rcNav = false; // الكوكي تعمل — التنقل العادي يكفي
        else if (sidParam) w.__rcNav = true;
      })
      .catch(() => {
        if (sidParam) w.__rcNav = true;
      });
  }, []);

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    try {
      localStorage.removeItem("rc_token");
    } catch {
      /* ignore */
    }
    window.__rcNav = false;
    location.assign("/login");
  }

  const tabs = [
    { href: "/tables", label: "الطاولات", icon: Armchair },
    { href: "/invoices", label: "الفواتير", icon: ReceiptText },
    { href: "/reports", label: "التقرير", icon: ChartColumn, roles: ["manager", "cashier"] },
    { href: "/expenses", label: "المصروفات", icon: Wallet },
  ].filter((t) => !t.roles || t.roles.includes(user.role));

  const isMoreActive = ["/menu", "/users", "/settings"].some((p) => pathname.startsWith(p));

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-coffee/10 bg-coffee text-cream shadow-md shadow-coffee/20">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Link href="/tables" className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gold/20">
              <Coffee className="h-5 w-5 text-goldsoft" />
            </span>
            <span className="leading-tight">
              <span className="block text-base font-black">{restaurantName}</span>
              <span className="block text-[10px] font-semibold text-cream/60">نظام كاشير</span>
            </span>
          </Link>
          <div className="flex items-center gap-2 rounded-full bg-white/10 py-1 pe-3 ps-1">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gold text-sm font-black text-coffee">
              {user.name.slice(0, 1)}
            </span>
            <span className="text-xs font-bold">
              {user.name}
              <span className="block text-[10px] font-semibold text-cream/60">
                {ROLE_LABEL[user.role]}
              </span>
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-3 pb-28 pt-4 sm:px-4">{children}</main>

      {/* شريط تنقّل سفلي — مناسب للإبهام على الهاتف */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-coffee/10 bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-stretch justify-around px-2">
          {tabs.map((t) => {
            const active = pathname.startsWith(t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                className={`press relative flex w-16 flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-bold ${
                  active ? "text-golddeep" : "text-mocha/70"
                }`}
              >
                <t.icon className={`h-5 w-5 ${active ? "scale-110" : ""}`} strokeWidth={active ? 2.4 : 1.9} />
                {t.label}
                {active ? <span className="absolute -top-px h-1 w-8 rounded-b-full bg-gold" /> : null}
              </Link>
            );
          })}
          <button
            onClick={() => setMoreOpen(true)}
            className={`press relative flex w-16 flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-bold ${
              isMoreActive ? "text-golddeep" : "text-mocha/70"
            }`}
          >
            <Menu className="h-5 w-5" strokeWidth={isMoreActive ? 2.4 : 1.9} />
            المزيد
            {isMoreActive ? <span className="absolute -top-px h-1 w-8 rounded-b-full bg-gold" /> : null}
          </button>
        </div>
      </nav>

      {/* لوحة المزيد */}
      {moreOpen ? (
        <div className="fixed inset-0 z-40" role="dialog" aria-modal="true">
          <button
            className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]"
            onClick={() => setMoreOpen(false)}
            aria-label="إغلاق"
          />
          <div className="fade-up absolute inset-x-0 bottom-0 mx-auto max-w-md rounded-t-3xl border-t border-coffee/10 bg-paper p-4 pb-8 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-black">خيارات إضافية</h2>
              <button
                onClick={() => setMoreOpen(false)}
                className="press rounded-full bg-sand p-2 text-mocha"
                aria-label="إغلاق"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-2">
              {user.role === "manager" ? (
                <>
                  <SheetLink href="/menu" icon={BookOpenText} label="إدارة القائمة والأسعار" />
                  <SheetLink href="/users" icon={Users} label="إدارة المستخدمين والصلاحيات" />
                  <SheetLink href="/settings" icon={Settings} label="إعدادات المطعم والضريبة" />
                </>
              ) : (
                <p className="rounded-xl bg-cream px-4 py-3 text-xs font-bold text-mocha">
                  إدارة القائمة والمستخدمين والإعدادات متاحة للمدير فقط
                </p>
              )}
              <button
                onClick={signOut}
                className="press flex w-full items-center gap-3 rounded-2xl bg-terrasoft px-4 py-3.5 text-sm font-extrabold text-terra"
              >
                <LogOut className="h-5 w-5" />
                تسجيل الخروج
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SheetLink({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: typeof Users;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="press flex items-center gap-3 rounded-2xl bg-cream px-4 py-3.5 text-sm font-extrabold text-ink hover:bg-sand"
    >
      <Icon className="h-5 w-5 text-mocha" />
      {label}
    </Link>
  );
}
