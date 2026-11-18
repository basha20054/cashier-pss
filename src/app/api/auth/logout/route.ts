import { logout } from "@/lib/auth";
import { fail, ok } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    await logout();
    return ok({});
  } catch (e) {
    return fail(e);
  }
}
