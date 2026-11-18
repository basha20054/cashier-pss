import { db } from "@/db";
import { settings } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { fail, ok } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) return Response.json({ ok: false, error: "غير مسجل" }, { status: 401 });
    const [st] = await db.select().from(settings).limit(1);
    return ok({
      user,
      settings: st
        ? {
            restaurantName: st.restaurantName,
            currency: st.currency,
            taxBps: st.taxBps,
            timezone: st.timezone,
          }
        : null,
    });
  } catch (e) {
    return fail(e);
  }
}
