/** Line-oriented pending DDL review (added / removed). */

export type DiffLine = { op: " " | "+" | "-"; text: string };

export function pendingDdlDiff(before: string, after: string): DiffLine[] {
  const a = before.split(/\r?\n/);
  const b = after.split(/\r?\n/);
  const out: DiffLine[] = [];
  const max = Math.max(a.length, b.length);
  // ponytail: line-align by index; upgrade to LCS if noisy diffs matter
  for (let i = 0; i < max; i++) {
    const L = a[i];
    const R = b[i];
    if (L === R) {
      if (L !== undefined) out.push({ op: " ", text: L });
    } else {
      if (L !== undefined) out.push({ op: "-", text: L });
      if (R !== undefined) out.push({ op: "+", text: R });
    }
  }
  return out;
}

export function formatDiff(lines: DiffLine[]): string {
  return lines.map((l) => `${l.op}${l.text}`).join("\n");
}
