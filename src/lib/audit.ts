// سجل التدقيق — يقبل معاملة اختيارية ليسجل ضمن نفس الوحدة الذرّية
import { db } from "@/db";
import { auditLog } from "@/db/schema";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function logAudit(
  actorId: number | null,
  action: string,
  entity: string,
  entityId?: string | number | null,
  meta?: Record<string, unknown>,
  tx?: Tx,
) {
  const exec = tx ?? db;
  await exec.insert(auditLog).values({
    actorId,
    action,
    entity,
    entityId: entityId == null ? null : String(entityId),
    meta: meta ?? null,
  });
}
