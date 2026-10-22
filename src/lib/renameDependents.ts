import type { TableDetails } from "@/types";
import { quoteIdent } from "@/lib/dbApi";

/** Generate ALTER scripts that mention dependents when renaming a table (preview only). */
export function renameWithDependentsSql(
  engine: string,
  oldRef: string,
  newName: string,
  detailsByTable: Record<string, TableDetails>,
): string {
  const q = (s: string) => quoteIdent(engine, s);
  const oldName = oldRef.includes(".") ? oldRef.split(".").pop()! : oldRef;
  const lines = [
    `-- Rename ${oldRef} → ${newName} (review before run)`,
    `ALTER TABLE ${q(oldRef)} RENAME TO ${q(newName)};`,
  ];
  for (const [ref, d] of Object.entries(detailsByTable)) {
    if (ref === oldRef) continue;
    for (const fk of d.foreignKeys) {
      const bare = fk.refTable.includes(".")
        ? fk.refTable.split(".").pop()!
        : fk.refTable;
      if (
        fk.refTable.toLowerCase() === oldRef.toLowerCase() ||
        bare.toLowerCase() === oldName.toLowerCase()
      ) {
        lines.push(
          `-- Dependent FK ${fk.name || "(unnamed)"} on ${ref}: references ${fk.refTable} — update / recreate after rename`,
        );
      }
    }
  }
  return lines.join("\n") + "\n";
}
