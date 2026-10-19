import type { EditableColumn } from "@/lib/tableDdl";

export type TableTemplate = { name: string; columns: EditableColumn[] };

const KEY = "re-dbviewer:table-templates";

export function listTemplates(): TableTemplate[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(parsed) ? (parsed as TableTemplate[]) : [];
  } catch {
    return [];
  }
}

export function saveTemplates(list: TableTemplate[]) {
  localStorage.setItem(KEY, JSON.stringify(list));
}

/** Parse the column-defs JSON: [{name, dataType, nullable?, defaultValue?, isPk?}]. */
export function parseColumnDefs(text: string): EditableColumn[] {
  const data: unknown = JSON.parse(text);
  if (!Array.isArray(data) || data.length === 0)
    throw new Error("Column defs must be a non-empty JSON array.");
  return data.map((c, i) => {
    const o = c as Partial<EditableColumn> | null;
    if (!o || typeof o.name !== "string" || !o.name.trim())
      throw new Error(`Column ${i + 1}: "name" is required.`);
    return {
      name: o.name.trim(),
      dataType: String(o.dataType ?? "TEXT"),
      nullable: o.nullable ?? true,
      defaultValue: o.defaultValue ?? "",
      isPk: !!o.isPk,
    };
  });
}
