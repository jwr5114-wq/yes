import { inflateRaw } from "pako";
import { AchievementStandard, CurriculumSubjectOption } from "../types";

// OLE2 (Compound File Binary) Parser for HWP 5.x files
export function parseOLE(buffer: ArrayBuffer) {
  const dv = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const sig = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
  for (let i = 0; i < 8; i++) {
    if (bytes[i] !== sig[i]) throw new Error("HWP(OLE2) 형식이 아닙니다.");
  }

  const sectorShift = dv.getUint16(30, true);
  const sectorSize = 1 << sectorShift;
  const miniSectorShift = dv.getUint16(32, true);
  const miniSectorSize = 1 << miniSectorShift;

  const firstDirSector = dv.getUint32(48, true);
  const miniStreamCutoff = dv.getUint32(56, true);
  const firstMiniFatSector = dv.getUint32(60, true);
  const firstDifatSector = dv.getUint32(68, true);

  let difat: number[] = [];
  for (let i = 0; i < 109; i++) difat.push(dv.getUint32(76 + i * 4, true));
  let sec = firstDifatSector;
  while (sec !== 0xfffffffe && sec !== 0xffffffff && sec !== 0xfffffffd) {
    const offset = 512 + sec * sectorSize;
    const entries: number[] = [];
    for (let i = 0; i < 128; i++) entries.push(dv.getUint32(offset + i * 4, true));
    difat = difat.concat(entries.slice(0, 127));
    sec = entries[127];
  }
  difat = difat.filter((d) => d !== 0xffffffff);

  function getSector(n: number) {
    const offset = 512 + n * sectorSize;
    return bytes.slice(offset, offset + sectorSize);
  }

  let fat: number[] = [];
  for (const secId of difat) {
    const s = getSector(secId);
    const sdv = new DataView(s.buffer, s.byteOffset, s.byteLength);
    for (let i = 0; i < sectorSize / 4; i++) fat.push(sdv.getUint32(i * 4, true));
  }

  function sectorChain(start: number) {
    const chain: number[] = [];
    let s = start;
    const seen = new Set<number>();
    while (s !== 0xfffffffe && s !== 0xffffffff && !seen.has(s)) {
      seen.add(s);
      chain.push(s);
      s = fat[s];
    }
    return chain;
  }

  function concatParts(parts: Uint8Array[]) {
    let total = 0;
    for (const p of parts) total += p.length;
    const buf = new Uint8Array(total);
    let off = 0;
    for (const p of parts) {
      buf.set(p, off);
      off += p.length;
    }
    return buf;
  }

  function readStreamFromFat(start: number, size?: number) {
    const chain = sectorChain(start);
    const buf = concatParts(chain.map((s) => getSector(s)));
    return size != null ? buf.slice(0, size) : buf;
  }

  // Directory entries
  const dirData = concatParts(sectorChain(firstDirSector).map((s) => getSector(s)));
  const nEntries = Math.floor(dirData.length / 128);
  const entries: Array<{
    name: string;
    type: number;
    left: number;
    right: number;
    child: number;
    start: number;
    size: number;
  }> = [];
  const decoder = new TextDecoder("utf-16le");
  for (let i = 0; i < nEntries; i++) {
    const e = dirData.slice(i * 128, (i + 1) * 128);
    const edv = new DataView(e.buffer, e.byteOffset, e.byteLength);
    const nameLen = edv.getUint16(64, true);
    const name = nameLen > 0 ? decoder.decode(e.slice(0, Math.max(nameLen - 2, 0))) : "";
    const objType = e[66];
    const left = edv.getUint32(68, true);
    const right = edv.getUint32(72, true);
    const child = edv.getUint32(76, true);
    const startSector = edv.getUint32(116, true);
    const sizeLow = edv.getUint32(120, true);
    const sizeHigh = edv.getUint32(124, true);
    const size = sizeHigh * 4294967296 + sizeLow;
    entries.push({ name, type: objType, left, right, child, start: startSector, size });
  }
  const root = entries[0];

  // MiniFAT / MiniStream
  let minifat: number[] = [];
  if (firstMiniFatSector !== 0xfffffffe && firstMiniFatSector !== 0xffffffff) {
    const buf = concatParts(sectorChain(firstMiniFatSector).map((s) => getSector(s)));
    const bdv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    for (let i = 0; i < buf.length / 4; i++) minifat.push(bdv.getUint32(i * 4, true));
  }
  const ministream = root.start !== 0xfffffffe ? readStreamFromFat(root.start, root.size) : new Uint8Array(0);

  function miniSectorChain(start: number) {
    const chain: number[] = [];
    let s = start;
    const seen = new Set<number>();
    while (s !== 0xfffffffe && s !== 0xffffffff && !seen.has(s)) {
      seen.add(s);
      chain.push(s);
      s = minifat[s];
    }
    return chain;
  }

  function readStream(entry: (typeof entries)[0]) {
    const size = entry.size;
    if (size < miniStreamCutoff) {
      const chain = miniSectorChain(entry.start);
      const parts = chain.map((s) => ministream.slice(s * miniSectorSize, (s + 1) * miniSectorSize));
      return concatParts(parts).slice(0, size);
    }
    return readStreamFromFat(entry.start, size);
  }

  const results: Array<{ name: string; entry: (typeof entries)[0] }> = [];
  function walk(entryIdx: number, prefix: string) {
    if (entryIdx === 0xffffffff) return;
    const stack = [entryIdx];
    while (stack.length) {
      const idx = stack.pop()!;
      if (idx === 0xffffffff) continue;
      const e = entries[idx];
      if (e.left !== 0xffffffff) stack.push(e.left);
      if (e.right !== 0xffffffff) stack.push(e.right);
      const fullname = prefix ? prefix + "/" + e.name : e.name;
      results.push({ name: fullname, entry: e });
      if (e.type === 1) walk(e.child, fullname);
    }
  }
  if (root.child !== 0xffffffff) walk(root.child, "");

  return { results, readStream };
}

const HWPTAG_PARA_TEXT = 0x43;

function parseHwpRecords(buf: Uint8Array) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const records: Array<{ tagId: number; data: Uint8Array }> = [];
  let pos = 0;
  const n = buf.length;
  while (pos + 4 <= n) {
    const header = dv.getUint32(pos, true);
    const tagId = header & 0x3ff;
    let size = (header >> 20) & 0xfff;
    pos += 4;
    if (size === 0xfff) {
      size = dv.getUint32(pos, true);
      pos += 4;
    }
    records.push({ tagId, data: buf.slice(pos, pos + size) });
    pos += size;
  }
  return records;
}

function extractParaText(data: Uint8Array) {
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const out: string[] = [];
  let i = 0;
  const n = data.length;
  while (i + 2 <= n) {
    const ch = dv.getUint16(i, true);
    i += 2;
    if (ch === 13) continue;
    else if (ch === 10) out.push("\n");
    else if (ch === 9) out.push("\t");
    else if (ch < 32) {
      i += 14;
      continue;
    } else out.push(String.fromCharCode(ch));
  }
  return out.join("");
}

function extractSectionText(buf: Uint8Array) {
  const paras: string[] = [];
  for (const r of parseHwpRecords(buf)) {
    if (r.tagId === HWPTAG_PARA_TEXT) paras.push(extractParaText(r.data));
  }
  return paras.join("\n");
}

export async function processHwpFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const ole = parseOLE(buffer);
  const sectionEntries = ole.results
    .filter((r) => /^BodyText\/Section\d+$/.test(r.name))
    .sort((a, b) => parseInt(a.name.match(/\d+/)![0]) - parseInt(b.name.match(/\d+/)![0]));

  if (sectionEntries.length === 0) throw new Error("본문(BodyText) 영역을 찾을 수 없습니다.");

  let fullText = "";
  for (const s of sectionEntries) {
    const raw = ole.readStream(s.entry);
    let dec: Uint8Array;
    try {
      dec = inflateRaw(raw);
    } catch {
      dec = raw;
    }
    fullText += extractSectionText(dec) + "\n";
  }
  return fullText;
}

export function findCurriculumSubjects(fullText: string): Array<{ name: string; headingIndex: number }> {
  const subjects: Array<{ name: string; headingIndex: number }> = [];
  const marker = "\n1. 성격 및 목표\n";
  let idx = 0;
  while (true) {
    const pos = fullText.indexOf(marker, idx);
    if (pos === -1) break;
    const before = fullText.slice(Math.max(0, pos - 200), pos);
    const lines = before
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    const name = lines.length ? lines[lines.length - 1] : null;
    if (
      name &&
      name.length <= 20 &&
      !name.includes("교육과정") &&
      !name.includes("선택 과목") &&
      !name.includes("차   례")
    ) {
      subjects.push({ name, headingIndex: pos });
    }
    idx = pos + marker.length;
  }
  return subjects;
}

export function extractGoalParagraph(
  fullText: string,
  subjects: Array<{ name: string; headingIndex: number }>,
  subjectIdx: number
): string | null {
  const subject = subjects[subjectIdx];
  if (!subject) return null;
  const start = subject.headingIndex;
  const end = subjectIdx + 1 < subjects.length ? subjects[subjectIdx + 1].headingIndex : fullText.length;
  const sectionText = fullText.slice(start, end);
  const goalMarkerIdx = sectionText.indexOf("나. 목표");
  if (goalMarkerIdx === -1) return null;
  const after = sectionText.slice(goalMarkerIdx + "나. 목표".length).replace(/^\n+/, "");
  const stopMatch = after.match(/\n\(1\)/);
  const para = stopMatch ? after.slice(0, stopMatch.index) : after.split("\n\n")[0];
  return para.trim();
}

export function extractAchievementStandards(
  fullText: string,
  subjects: Array<{ name: string; headingIndex: number }>,
  subjectIdx: number
): AchievementStandard[] {
  if (!fullText || !subjects || subjectIdx == null || !subjects[subjectIdx]) return [];
  const subject = subjects[subjectIdx];
  const start = subject.headingIndex;
  const end = subjectIdx + 1 < subjects.length ? subjects[subjectIdx + 1].headingIndex : fullText.length;
  const sectionText = fullText.slice(start, end);
  const lines = sectionText.split("\n");
  const seen = new Set<string>();
  const results: AchievementStandard[] = [];
  const re = /^\[([^\]]+)\]\s*(.+)$/;

  for (const line of lines) {
    const m = line.match(re);
    if (!m) continue;
    const code = m[1].trim();
    const text = m[2].trim();
    if (seen.has(code)) continue;
    seen.add(code);
    results.push({ code, text });
  }
  return results;
}

export function sortAchievementStandardCodes(codes: string[]): string[] {
  const unique = Array.from(
    new Set(
      codes
        .map((c) => c.replace(/^\[/, "").replace(/\]$/, "").trim())
        .filter(Boolean)
    )
  );

  return unique.sort((a, b) => {
    // E.g., "12화학02-01" -> prefix="12화학", domain=2, item=1
    // E.g., "10통과102-03" -> prefix="10통과1", domain=2, item=3
    const regex = /^(.*?)(?:(\d{1,3})[-_](\d{1,3}))$/;
    const matchA = a.match(regex);
    const matchB = b.match(regex);

    if (matchA && matchB) {
      const prefixA = matchA[1].trim();
      const prefixB = matchB[1].trim();
      if (prefixA !== prefixB) {
        return prefixA.localeCompare(prefixB, "ko-KR");
      }
      const domainA = parseInt(matchA[2], 10);
      const domainB = parseInt(matchB[2], 10);
      if (domainA !== domainB) {
        return domainA - domainB;
      }
      const itemA = parseInt(matchA[3], 10);
      const itemB = parseInt(matchB[3], 10);
      if (itemA !== itemB) {
        return itemA - itemB;
      }
      return 0;
    }

    return a.localeCompare(b, "ko-KR", { numeric: true });
  });
}

export function formatStdCodesForDisplay(rawStr: string): string {
  if (!rawStr || !rawStr.trim()) return "-";

  const codes = (rawStr.match(/\[([^\]]+)\]/g) || []).map((s) => s.slice(1, -1));
  if (codes.length === 0) return rawStr.trim();

  const parsed = codes.map((code) => {
    const m = code.match(/^(.*)-(\d+)$/);
    return m
      ? { raw: code, prefix: m[1], num: parseInt(m[2], 10) }
      : { raw: code, prefix: null, num: null };
  });

  const groups: Array<{ prefix: string | null; firstRaw: string; lastRaw: string; lastNum: number | null }> = [];
  for (const item of parsed) {
    const last = groups.length ? groups[groups.length - 1] : null;
    const canExtend =
      last &&
      item.prefix !== null &&
      item.prefix === last.prefix &&
      item.num !== null &&
      last.lastNum !== null &&
      item.num === last.lastNum + 1;
    if (canExtend) {
      last.lastNum = item.num;
      last.lastRaw = item.raw;
    } else {
      groups.push({ prefix: item.prefix, firstRaw: item.raw, lastRaw: item.raw, lastNum: item.num });
    }
  }

  return groups.map((g) => (g.firstRaw === g.lastRaw ? `[${g.firstRaw}]` : `[${g.firstRaw}]~[${g.lastRaw}]`)).join(", ");
}

export function getExpandedStdText(
  codesStr: string,
  fullText?: string,
  subjects?: Array<{ name: string; headingIndex: number }>,
  subjectIdx?: number | null
): string {
  if (!codesStr || !codesStr.trim()) return "";
  const codes = (codesStr.match(/\[([^\]]+)\]/g) || []).map((s) => s.slice(1, -1));
  if (codes.length === 0) return "";

  if (!fullText || subjects == null || subjectIdx == null || !subjects[subjectIdx]) {
    return codes.map((c) => `[${c}]`).join("\n");
  }

  const standards = extractAchievementStandards(fullText, subjects, subjectIdx);
  const map: Record<string, string> = {};
  standards.forEach((s) => {
    map[s.code] = s.text;
  });

  return codes.map((c) => (map[c] ? `[${c}] ${map[c]}` : `[${c}]`)).join("\n");
}
