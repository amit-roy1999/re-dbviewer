/** Detect binary / hex / image-ish cell values for richer previews. */

export type CellPreviewKind = "hex" | "image" | null;

function asBytes(value: unknown): Uint8Array | null {
  if (value == null) return null;
  if (value instanceof Uint8Array) return value;
  if (Array.isArray(value) && value.every((n) => typeof n === "number")) {
    return Uint8Array.from(value as number[]);
  }
  if (typeof value === "object" && value !== null && "type" in value) {
    const o = value as { type?: string; data?: number[] };
    if (o.type === "Buffer" && Array.isArray(o.data)) {
      return Uint8Array.from(o.data);
    }
  }
  if (typeof value === "string") {
    const t = value.trim();
    // data URL
    const dataUrl = /^data:([^;]+);base64,(.+)$/i.exec(t);
    if (dataUrl) {
      try {
        const bin = atob(dataUrl[2]);
        const out = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        return out;
      } catch {
        return null;
      }
    }
    // pure base64 blob (≥16 chars, typical alphabet)
    if (/^[A-Za-z0-9+/]+=*$/.test(t) && t.length >= 16 && t.length % 4 === 0) {
      try {
        const bin = atob(t);
        // Heuristic: mostly non-printable → treat as binary
        let nonPrint = 0;
        for (let i = 0; i < Math.min(bin.length, 64); i++) {
          const c = bin.charCodeAt(i);
          if (c < 9 || (c > 13 && c < 32)) nonPrint++;
        }
        if (nonPrint < 4 && bin.length > 8) return null;
        const out = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        return out;
      } catch {
        return null;
      }
    }
  }
  return null;
}

function imageMime(bytes: Uint8Array): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 6 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46
  ) {
    return "image/gif";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

export function classifyCellPreview(value: unknown): CellPreviewKind {
  const bytes = asBytes(value);
  if (!bytes || bytes.length === 0) return null;
  if (imageMime(bytes)) return "image";
  if (bytes.length >= 4) return "hex";
  return null;
}

export function bytesToHexDump(value: unknown, maxBytes = 512): string | null {
  const bytes = asBytes(value);
  if (!bytes) return null;
  const slice = bytes.slice(0, maxBytes);
  const lines: string[] = [];
  for (let i = 0; i < slice.length; i += 16) {
    const chunk = slice.slice(i, i + 16);
    const hex = [...chunk].map((b) => b.toString(16).padStart(2, "0")).join(" ");
    const ascii = [...chunk]
      .map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : "."))
      .join("");
    lines.push(`${i.toString(16).padStart(4, "0")}  ${hex.padEnd(47)}  ${ascii}`);
  }
  if (bytes.length > maxBytes) {
    lines.push(`… (${bytes.length} bytes total)`);
  }
  return lines.join("\n");
}

export function bytesToImageDataUrl(value: unknown): string | null {
  const bytes = asBytes(value);
  if (!bytes) return null;
  const mime = imageMime(bytes);
  if (!mime) return null;
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return `data:${mime};base64,${btoa(binary)}`;
}
