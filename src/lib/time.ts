// أدوات الوقت — المنطقة الزمنية الافتراضية Asia/Hebron
export const RESTAURANT_TZ = "Asia/Hebron";

/** فرق المنطقة الزمنية بالدقائق لحظة معيّنة (يحسب DST) */
function offsetMinutesAt(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(date)) p[part.type] = part.value;
  const hour = Number(p.hour) % 24;
  const asIfUTC = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    hour,
    Number(p.minute),
    Number(p.second),
  );
  return (asIfUTC - date.getTime()) / 60000;
}

/**
 * يعيد حدود اليوم [start, end) بالـ UTC لتاريخ "YYYY-MM-DD" بتوقيت الخليل.
 * يُستخدم لتقارير "إقفال اليوم" المحاسبية.
 */
export function dayRangeHebron(
  dateStr: string,
  tz: string = RESTAURANT_TZ,
): { start: Date; end: Date } {
  const [y, m, d] = dateStr.split("-").map(Number);
  const utcMidnight = Date.UTC(y, m - 1, d);

  let off = offsetMinutesAt(new Date(utcMidnight), tz);
  let start = new Date(utcMidnight - off * 60000);
  const off2 = offsetMinutesAt(start, tz);
  if (off2 !== off) start = new Date(utcMidnight - off2 * 60000);

  const utcNext = utcMidnight + 86400_000;
  let offN = offsetMinutesAt(new Date(utcNext), tz);
  let end = new Date(utcNext - offN * 60000);
  const offN2 = offsetMinutesAt(end, tz);
  if (offN2 !== offN) end = new Date(utcNext - offN2 * 60000);

  return { start, end };
}

/** تاريخ اليوم الحالي بتوقيت الخليل بصيغة YYYY-MM-DD */
export function todayHebron(tz: string = RESTAURANT_TZ): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function isValidDateStr(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}

const timeFmt = new Intl.DateTimeFormat("ar-EG-u-nu-latn", {
  timeZone: RESTAURANT_TZ,
  hour: "2-digit",
  minute: "2-digit",
});

const dateTimeFmt = new Intl.DateTimeFormat("ar-EG-u-nu-latn", {
  timeZone: RESTAURANT_TZ,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function fmtTime(d: Date | string): string {
  return timeFmt.format(new Date(d));
}
export function fmtDateTime(d: Date | string): string {
  return dateTimeFmt.format(new Date(d));
}
