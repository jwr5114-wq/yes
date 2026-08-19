import { inflateRaw } from "pako";
import { AchievementStandard, CurriculumSubjectOption } from "../types";
import { DEFAULT_STANDARDS_DB } from "../constants";

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

export function isStandardStopLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;

  // 1. Next standard code e.g. [12화학01-04]
  if (/^\[\s*[A-Za-z0-9가-힣]+[-_]\d+/.test(trimmed)) {
    return true;
  }

  // 2. Exploration activity headers (<탐구 활동>, <탐구활동>, 탐구 활동, 탐구 활동 예시 등)
  if (
    /^[<＜〈\[(]?\s*탐구\s*활동/i.test(trimmed) ||
    trimmed.startsWith("<탐구") ||
    trimmed.startsWith("＜탐구") ||
    trimmed.startsWith("〈탐구") ||
    trimmed.startsWith("[탐구") ||
    trimmed.startsWith("(탐구") ||
    trimmed === "탐구 활동" ||
    trimmed === "탐구활동" ||
    trimmed.startsWith("탐구 활동") ||
    trimmed.startsWith("탐구활동")
  ) {
    return true;
  }

  // 3. Bullet points (used for exploration tasks / activity lists: •, ◦, ▪, ▫, ∙, ·, ※, etc.)
  if (
    trimmed.startsWith("•") ||
    trimmed.startsWith("◦") ||
    trimmed.startsWith("▪") ||
    trimmed.startsWith("▫") ||
    trimmed.startsWith("※") ||
    trimmed.startsWith("∙") ||
    trimmed.startsWith("·") ||
    trimmed.startsWith(" - ") ||
    trimmed.startsWith("- ")
  ) {
    return true;
  }

  // 4. Considerations / Pedagogical / Evaluation / Commentary section headers
  if (
    trimmed.includes("성취기준 적용 시 고려 사항") ||
    trimmed.includes("성취기준 적용 시 고려사항") ||
    trimmed.includes("성취기준 적용시 고려사항") ||
    trimmed.includes("성취기준 적용시 고려 사항") ||
    trimmed.includes("성취기준 해설") ||
    trimmed.includes("성취기준별 해설") ||
    trimmed.includes("교수·학습 관련 설명") ||
    trimmed.includes("교수·학습 방향 및 방법") ||
    trimmed.includes("교수·학습 방향") ||
    trimmed.includes("교수·학습 방법") ||
    trimmed.includes("교수･학습") ||
    trimmed.includes("교수·학습") ||
    trimmed.includes("평가 관련 설명") ||
    trimmed.includes("평가 방향 및 방법") ||
    trimmed.includes("평가 방향") ||
    trimmed.includes("평가 방법") ||
    trimmed.includes("평가 유의점") ||
    trimmed.includes("학습 요소") ||
    trimmed.includes("핵심 아이디어") ||
    trimmed.includes("용어와 개념")
  ) {
    return true;
  }

  // 5. Numbered or indexed section markers
  if (
    /^(?:가|나|다|라|마|바|사|아|자|차)\./.test(trimmed) ||
    /^\([가나다라마바사아자차]\)/.test(trimmed) ||
    /^\(\d+\)/.test(trimmed) ||
    /^\d+\./.test(trimmed) ||
    /^[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩIVXLCDM]+\./.test(trimmed)
  ) {
    return true;
  }

  return false;
}

/**
 * Cleans an achievement standard text string, stripping out any trailing exploration/activity (<탐구 활동>),
 * bullet items (• ...), commentary, or subsequent section headers that may have been caught in extraction.
 * Preserves the exact original wording of the achievement standard without summarizing.
 */
export function cleanAchievementStandardText(rawText: string): string {
  if (!rawText) return "";

  let text = rawText.trim();

  // 1. Strip inline exploration activity marker and everything after it
  // Matches <탐구 활동>, <탐구활동>, [탐구 활동], (탐구 활동), 탐구 활동 :, etc.
  const explorationInlineMatch = text.match(/[\s\n]*[<＜〈\[(]?\s*탐구\s*활동\s*[>＞〉\])]?[\s\S]*$/i);
  if (explorationInlineMatch && explorationInlineMatch.index !== undefined) {
    text = text.slice(0, explorationInlineMatch.index).trim();
  }

  // 2. Strip explicit stop keywords
  const stopKeywords = [
    "<탐구",
    "＜탐구",
    "〈탐구",
    "[탐구",
    "성취기준 적용 시 고려 사항",
    "성취기준 적용 시 고려사항",
    "성취기준 적용시 고려사항",
    "성취기준 적용시 고려 사항",
    "성취기준 해설",
    "성취기준별 해설",
    "교수·학습 관련 설명",
    "교수·학습 방향",
    "교수·학습 방법",
    "교수･학습",
    "교수·학습",
    "평가 관련 설명",
    "평가 방향",
    "평가 방법",
    "학습 요소",
    "핵심 아이디어",
    "용어와 개념",
  ];

  for (const kw of stopKeywords) {
    const idx = text.indexOf(kw);
    if (idx !== -1) {
      text = text.slice(0, idx).trim();
    }
  }

  // 3. Process line-by-line: stop at the first line that is a stop line (e.g. bullet points)
  const lines = text.split("\n");
  const validLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (isStandardStopLine(line)) {
      break;
    }

    validLines.push(line);
  }

  text = validLines.join(" ").trim();

  // 4. Also check if trailing bullet item leaked in on the same line
  const inlineBulletMatch = text.match(/[\s\n]+[•◦▪▫※∙·]\s*[\s\S]*$/);
  if (inlineBulletMatch && inlineBulletMatch.index !== undefined && inlineBulletMatch.index > 0) {
    text = text.slice(0, inlineBulletMatch.index).trim();
  }

  // Normalize multiple spaces into single space while preserving exact wording
  text = text.replace(/\s{2,}/g, " ").trim();

  return text;
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
  const re = /^\s*\[([^\]]+)\]\s*(.+)$/;

  let currentStd: AchievementStandard | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const m = line.match(re);
    if (m) {
      if (currentStd && !seen.has(currentStd.code)) {
        const cleaned = cleanAchievementStandardText(currentStd.text);
        if (cleaned) {
          seen.add(currentStd.code);
          results.push({ code: currentStd.code, text: cleaned });
        }
      }
      const rawText = m[2].trim();
      const cleanedFirstLine = cleanAchievementStandardText(rawText);
      currentStd = { code: m[1].trim(), text: cleanedFirstLine };
    } else if (currentStd) {
      // Check if this line is a stop trigger
      if (isStandardStopLine(line)) {
        if (!seen.has(currentStd.code)) {
          const cleaned = cleanAchievementStandardText(currentStd.text);
          if (cleaned) {
            seen.add(currentStd.code);
            results.push({ code: currentStd.code, text: cleaned });
          }
        }
        currentStd = null;
      } else {
        // If not a stop trigger, append continuation line
        currentStd.text += " " + line;
        // Clean if inline stop marker exists on this continuation line
        currentStd.text = cleanAchievementStandardText(currentStd.text);
      }
    }
  }

  if (currentStd && !seen.has(currentStd.code)) {
    const cleaned = cleanAchievementStandardText(currentStd.text);
    if (cleaned) {
      seen.add(currentStd.code);
      results.push({ code: currentStd.code, text: cleaned });
    }
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

export function expandRangeCodes(codesStr: string): string[] {
  if (!codesStr || !codesStr.trim()) return [];

  // Match all patterns like [12화학01-01]~[12화학02-04] or individual [12화학02-02]
  const expandedList: string[] = [];
  const allKnownDbCodes = Object.keys(DEFAULT_STANDARDS_DB);
  sortAchievementStandardCodes(allKnownDbCodes);
  
  // First, check for range pairs like `[prefix-01]~[prefix-04]` or `[prefix-01] ~ [prefix-04]`
  const rangeRegex = /\[([^\]]+)\]\s*~\s*\[([^\]]+)\]/g;
  let match;
  while ((match = rangeRegex.exec(codesStr)) !== null) {
    const startCode = match[1].trim();
    const endCode = match[2].trim();

    // 1. Check if both exist in sorted known standards DB
    const idxStart = allKnownDbCodes.indexOf(startCode);
    const idxEnd = allKnownDbCodes.indexOf(endCode);
    if (idxStart !== -1 && idxEnd !== -1 && idxStart <= idxEnd) {
      expandedList.push(...allKnownDbCodes.slice(idxStart, idxEnd + 1));
      continue;
    }

    // 2. Universal pattern matching for same-domain ranges
    const mStart = startCode.match(/^(.*)[-_](\d+)$/);
    const mEnd = endCode.match(/^(.*)[-_](\d+)$/);

    if (mStart && mEnd && mStart[1].trim() === mEnd[1].trim()) {
      const prefix = mStart[1].trim();
      const startNum = parseInt(mStart[2], 10);
      const endNum = parseInt(mEnd[2], 10);
      const numPad = mStart[2].length;

      if (startNum <= endNum) {
        for (let n = startNum; n <= endNum; n++) {
          const numStr = String(n).padStart(numPad, "0");
          expandedList.push(`${prefix}-${numStr}`);
        }
        continue;
      }
    }

    expandedList.push(startCode, endCode);
  }

  // Remove the range parts already matched to find standalone codes
  const withoutRanges = codesStr.replace(/\[([^\]]+)\]\s*~\s*\[([^\]]+)\]/g, "");
  const singleCodes = (withoutRanges.match(/\[([^\]]+)\]/g) || []).map((s) => s.slice(1, -1).trim());
  expandedList.push(...singleCodes);

  // If no bracket matched but there's raw text
  if (expandedList.length === 0 && codesStr.trim()) {
    const rawTokens = codesStr.split(/[,\s]+/).map(t => t.replace(/^[\[\(]/, "").replace(/[\]\)]$/, "").trim()).filter(Boolean);
    expandedList.push(...rawTokens);
  }

  // Deduplicate preserving order
  return Array.from(new Set(expandedList));
}

export function formatStdCodesForDisplay(rawStr: string): string {
  if (!rawStr || !rawStr.trim()) return "";

  const codes = expandRangeCodes(rawStr);
  if (codes.length === 0) return rawStr.trim();

  // Sort standard codes in curriculum order
  const sortedCodes = sortAchievementStandardCodes(codes);

  const parsed = sortedCodes.map((code) => {
    const m = code.match(/^(.*)[-_](\d+)$/);
    return m
      ? { raw: code, prefix: m[1].trim(), num: parseInt(m[2], 10) }
      : { raw: code, prefix: null, num: null };
  });

  const groups: Array<{ prefix: string | null; firstRaw: string; lastRaw: string; lastNum: number | null }> = [];
  for (const item of parsed) {
    const last = groups.length ? groups[groups.length - 1] : null;
    const canExtend =
      last !== null &&
      item.prefix !== null &&
      last.prefix !== null &&
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
  const codes = expandRangeCodes(codesStr);
  if (codes.length === 0) return codesStr.trim();

  const map: Record<string, string> = {};

  // 1. From uploaded HWP curriculum text if available (specific subject first)
  if (fullText && subjects != null && subjectIdx != null && subjects[subjectIdx]) {
    const standards = extractAchievementStandards(fullText, subjects, subjectIdx);
    standards.forEach((s) => {
      map[s.code] = cleanAchievementStandardText(s.text);
    });
  }

  // 1-b. Search across entire fullText if any codes are still missing
  if (fullText) {
    const lines = fullText.split("\n");
    const re = /^\s*\[([^\]]+)\]\s*(.+)$/;
    for (const line of lines) {
      const m = line.match(re);
      if (m) {
        const code = m[1].trim();
        const text = m[2].trim();
        if (!map[code]) {
          map[code] = cleanAchievementStandardText(text);
        }
      }
    }
  }

  // 2. Fallback to standard DB if not found in HWP
  Object.keys(DEFAULT_STANDARDS_DB).forEach((code) => {
    if (!map[code]) {
      map[code] = cleanAchievementStandardText(DEFAULT_STANDARDS_DB[code]);
    }
  });

  return codes
    .map((c) => (map[c] ? `[${c}] ${map[c]}` : `[${c}]`))
    .join("\n");
}

/**
 * Checks whether a given line is a curriculum domain/unit title heading
 * and NOT a general section header, subsection marker, or standard continuation.
 */
export function isDomainOrUnitHeading(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 60) return false;

  // Exclude major document section titles and standard documentation sections
  if (
    trimmed.includes("성격 및 목표") ||
    trimmed.includes("내용 체계 및 성취기준") ||
    trimmed.includes("교수·학습 및 평가") ||
    trimmed.includes("교수･학습 및 평가") ||
    trimmed.includes("교수·학습 방법") ||
    trimmed.includes("평가 방향") ||
    trimmed.includes("성취기준 해설") ||
    trimmed.includes("성취기준 적용 시") ||
    trimmed.includes("성취기준별 해설") ||
    trimmed.includes("학습 요소") ||
    trimmed.includes("핵심 아이디어") ||
    trimmed.includes("탐구 활동 예시") ||
    trimmed.includes("용어와 개념") ||
    trimmed.includes("내용 체계") ||
    trimmed.includes("지식·이해") ||
    trimmed.includes("과정·기능") ||
    trimmed.includes("가치·태도")
  ) {
    return false;
  }

  // Exclude lines that are achievement standards themselves (e.g. [12생과01-01] ...)
  if (/^\[\s*[A-Za-z0-9가-힣]+[-_]\d+/.test(trimmed)) {
    return false;
  }

  // Subsections like 가. 성격, 나. 목표, 가. 내용 체계, 나. 성취기준
  if (/^[가-하]\.\s*(성격|목표|내용\s*체계|성취기준|교수|평가)/.test(trimmed)) {
    return false;
  }

  // 1. (1) 단원명 / (2) 단원명 / (가) 단원명
  if (/^\(\s*(\d+|[가-하])\s*\)\s*([^\[\n\r]+)$/.test(trimmed)) {
    const m = trimmed.match(/^\(\s*(\d+|[가-하])\s*\)\s*([^\[\n\r]+)$/);
    const content = m ? m[2].trim() : "";
    if (
      content.startsWith("성취기준") ||
      content.startsWith("교수") ||
      content.startsWith("평가") ||
      content.startsWith("학습") ||
      content.startsWith("고려")
    ) {
      return false;
    }
    return true;
  }

  // 2. Ⅰ. 단원명 / Ⅱ. 단원명 / I. 단원명
  if (/^([ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩIVXLCDM]+)\.\s*([^\[\n\r]+)$/.test(trimmed)) {
    return true;
  }

  // 3. 1. 단원명 / 2. 단원명 (when under standard section)
  if (/^\d+\.\s*([^\[\n\r]+)$/.test(trimmed)) {
    return true;
  }

  // 4. [영역: 단원명] / [단원: 단원명] / [대단원: 단원명]
  if (/^\[\s*(?:영역|단원|대단원|중단원)\s*[:：]?\s*([^\]\n\r]+)\]$/.test(trimmed)) {
    return true;
  }

  return false;
}

/**
 * Searches the official curriculum text to find the nearest parent domain/unit title
 * for a specific achievement standard code (e.g. "12생과01-01").
 */
export function getUnitTitleForStandardCode(
  code: string,
  fullText?: string,
  subjects?: Array<{ name: string; headingIndex: number }>,
  subjectIdx?: number | null
): string | null {
  if (!code || !code.trim() || !fullText) return null;

  const cleanCode = code.replace(/^[\[\(]/, "").replace(/[\]\)]$/, "").trim();
  if (!cleanCode) return null;

  // 1. First search in the specific subject's section if provided
  const searchTexts: string[] = [];
  if (subjects && subjectIdx != null && subjects[subjectIdx]) {
    const start = subjects[subjectIdx].headingIndex;
    const end = subjectIdx + 1 < subjects.length ? subjects[subjectIdx + 1].headingIndex : fullText.length;
    searchTexts.push(fullText.slice(start, end));
  }
  // 2. Fallback to search whole fullText
  searchTexts.push(fullText);

  for (const text of searchTexts) {
    // Find occurrence of code in text
    const codeIdx = text.indexOf(`[${cleanCode}]`);
    const fallbackIdx = codeIdx !== -1 ? codeIdx : text.indexOf(cleanCode);

    if (fallbackIdx === -1) continue;

    // Look backwards from fallbackIdx
    const beforeText = text.slice(0, fallbackIdx);
    const lines = beforeText.split("\n");

    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (!line) continue;

      if (isDomainOrUnitHeading(line)) {
        const cleaned = line
          .replace(/^\[\s*(?:영역|단원|대단원|중단원)\s*[:：]?\s*/, "")
          .replace(/\]$/, "")
          .trim();
        return cleaned;
      }
    }
  }

  return null;
}

/**
 * Given a codes string for a week (e.g. "[12생과01-01], [12생과01-02]"),
 * finds all unique parent domain/unit titles from the official curriculum data.
 */
export function getUnitTitlesForStandards(
  codesStr: string,
  fullText?: string,
  subjects?: Array<{ name: string; headingIndex: number }>,
  subjectIdx?: number | null
): string[] {
  if (!codesStr || !codesStr.trim() || !fullText) return [];

  const codes = expandRangeCodes(codesStr);
  if (codes.length === 0) return [];

  const titles: string[] = [];
  const seen = new Set<string>();

  for (const code of codes) {
    const title = getUnitTitleForStandardCode(code, fullText, subjects, subjectIdx);
    if (title && !seen.has(title)) {
      seen.add(title);
      titles.push(title);
    }
  }

  return titles;
}

export interface ExtractedAchievementLevels {
  achieveA: string;
  achieveB: string;
  achieveC: string;
  achieveD: string;
  achieveE: string;
  totalStandards: number;
  extractedStandards: string[];
  subjectFound: boolean;
  standardTableFound: boolean;
}

/**
 * Identifies structural headers, unit/chapter titles, sub-item markers,
 * or standalone cell/page numbers that do not belong to achievement level sentences.
 * Examples: "(2) 열과 에너지", "(3) 탄성과 소리", "1) 힘과 운동", "2. 생명 시스템", "2", "3", "(1)"
 */
export function isStructuralHeaderOrIndexLine(text: string): boolean {
  if (!text) return true;
  const t = text.trim();
  if (!t) return true;

  // Standalone level indicators (e.g. "A", "[A]") must NOT be treated as structural headers
  if (/^[A-Ea-e]$/.test(t) || /^\[[A-Ea-e]\]$/.test(t)) {
    return false;
  }

  // 1. Solitary numbers or bracketed numbers: e.g. "1", "2", "12", "(1)", "(2)", "[1]", "[2]"
  if (/^\(?\s*[0-9]{1,4}\s*\)?$/.test(t) || /^\[\s*[0-9]{1,4}\s*\]$/.test(t)) {
    return true;
  }

  // 2. Unit/Chapter/Domain headers: e.g. "(1) 물질과 규칙성", "(2) 열과 에너지", "1) 힘과 운동", "2. 생명 시스템", "Ⅰ. 물질의 규칙성", "【 열과 에너지 】"
  if (
    /^\(?\s*(?:[0-9]+|[가-하]|[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+)\s*[\)\.]\s*[가-힣A-Za-z0-9\s]{1,30}$/.test(t) ||
    /^【\s*[가-힣A-Za-z0-9\s]+\s*】$/.test(t) ||
    /^\[\s*(?:단원|영역|대단원|중단원|소단원|과목명)?\s*[:：]?\s*[가-힣A-Za-z0-9\s]+\]$/.test(t)
  ) {
    // If it's a standard code like [12생과01-01], that is a standard code (handled separately)
    if (/\[\s*[0-9]{2}[가-힣A-Za-z0-9\-_ⅠⅡⅢⅣ\s]+\s*\]/.test(t)) {
      return false;
    }
    return true;
  }

  return false;
}

/**
 * Checks if a line is an excluded dimension overview (지식·이해, 과정·기능, 가치·태도),
 * domain-level overview (영역별 성취수준), summary rubric, unit header, or general narrative
 * outside the individual standard-by-standard table.
 */
export function isExcludedNarrativeLine(text: string): boolean {
  if (!text) return true;
  const t = text.trim();
  if (!t) return true;

  // Standalone level indicators (e.g., "A", "[A]") must NOT be excluded
  if (/^[A-Ea-e]$/.test(t) || /^\[[A-Ea-e]\]$/.test(t)) {
    return false;
  }

  // Check structural headers, unit names, or standalone numbers
  if (isStructuralHeaderOrIndexLine(t)) {
    return true;
  }

  // 1. Exclude ALL domain and dimension overviews
  if (
    /영역별/.test(t) ||
    /영역명/.test(t) ||
    /^\[?\s*영역\s*[:：]/.test(t) ||
    /지식\s*[\·\-\s\:\/]\s*이해/.test(t) ||
    /과정\s*[\·\-\s\:\/]\s*기능/.test(t) ||
    /가치\s*[\·\-\s\:\/]\s*태도/.test(t)
  ) {
    return true;
  }

  // 2. Exclude summaries, narrative tables, rubrics, and non-standard descriptions
  if (
    /영역별\s*성취수준/.test(t) ||
    /영역별\s*종합/.test(t) ||
    /종합\s*진술/.test(t) ||
    /총괄\s*성취수준/.test(t) ||
    /학기\s*단위\s*(?:총괄|종합)?\s*성취수준/.test(t) ||
    /학기단위\s*(?:총괄|종합)?\s*성취수준/.test(t) ||
    /최소능력수행특성/.test(t) ||
    /최소\s*성취수준/.test(t) ||
    /성취수준\s*(?:의\s*)?기술/.test(t) ||
    /성취수준\s*진술/.test(t) ||
    /성취율/.test(t) ||
    /평가\s*기준/.test(t) ||
    /평가\s*방법/.test(t) ||
    /평가\s*방향/.test(t) ||
    /평가\s*도구/.test(t) ||
    /예시\s*평가/.test(t) ||
    /예시\s*문항/.test(t) ||
    /교수\s*[\·\-\s]\s*학습/.test(t) ||
    /교수\s*[\·\-\s]\s*평가/.test(t) ||
    /성취기준\s*해설/.test(t) ||
    /단원\s*별\s*성취수준/.test(t)
  ) {
    return true;
  }

  return false;
}

/**
 * Cleans extracted achievement text by removing any dimension narratives,
 * structural sub-item numbers (e.g. (1), (2)), trailing table cell/footnote numbers (.1, .2),
 * and whitespace normalization.
 */
export function cleanLevelText(text: string): string {
  if (!text) return "";
  const paragraphs = text.split(/\n+/);
  const validParas: string[] = [];

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed || trimmed.length < 4) continue;
    if (isExcludedNarrativeLine(trimmed)) continue;

    // 1. Remove dimension tags like [지식·이해], (지식·이해), etc.
    let cleaned = trimmed
      .replace(/(?:\[|\()?지식\s*[\·\-\s\:\/]\s*이해(?:\:\s*|\s*[\)\]]|\s+)[^.!?\n]*[.!?]?/gi, "")
      .replace(/(?:\[|\()?과정\s*[\·\-\s\:\/]\s*기능(?:\:\s*|\s*[\)\]]|\s+)[^.!?\n]*[.!?]?/gi, "")
      .replace(/(?:\[|\()?가치\s*[\·\-\s\:\/]\s*태도(?:\:\s*|\s*[\)\]]|\s+)[^.!?\n]*[.!?]?/gi, "")
      .trim();

    // 2. Remove structural sub-item numbers: e.g. "(1)", "(2)", "(3)", "1)", "2)"
    cleaned = cleaned
      .replace(/(?:^|\s)\([0-9]{1,2}\)\s*/g, " ")
      .replace(/(?:^|\s)[0-9]{1,2}\)\s*/g, " ")
      .trim();

    // 3. Remove trailing table cell/footnote numbers attached to sentence ends:
    // e.g. "가진다.2" -> "가진다.", "있다.1 " -> "있다. "
    cleaned = cleaned
      .replace(/([.!?])\s*[0-9]{1,2}(?=\s+[가-힣A-Za-z]|$)/g, "$1 ")
      .replace(/([.!?])\s*[0-9]{1,2}$/g, "$1")
      .replace(/([다요죠음함됨임])([0-9]{1,2})(?=\s+[가-힣A-Za-z]|$)/g, "$1. ")
      .replace(/\s+/g, " ")
      .trim();

    if (cleaned.length >= 4 && !isExcludedNarrativeLine(cleaned)) {
      validParas.push(cleaned);
    }
  }

  // Join all descriptors under the same level with a single space into one continuous paragraph
  return validParas
    .join(" ")
    .replace(/(?:^|\s)\([0-9]{1,2}\)\s*/g, " ")
    .replace(/(?:^|\s)[0-9]{1,2}\)\s*/g, " ")
    .replace(/([.!?])\s*[0-9]{1,2}(?=\s+[가-힣A-Za-z]|$)/g, "$1 ")
    .replace(/([.!?])\s*[0-9]{1,2}$/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Normalizes subject names for exact cross-matching without loose substring confusion.
 * E.g. "생명과학" -> "생명과학", "생명과학 Ⅰ" -> "생명과학1", "생명과학 실험" -> "생명과학실험"
 */
export function normalizeSubjectName(str: string): string {
  if (!str) return "";
  return str
    .replace(/[\s\t\r\n]+/g, "")
    .replace(/[\[\]\(\)【】<>«»〔〕■□◆◇▶▷●○#\*\-_\|:]/g, "")
    .replace(/[Ⅰ|I|1]/g, "1")
    .replace(/[Ⅱ|II|2]/g, "2")
    .replace(/[Ⅲ|III|3]/g, "3")
    .replace(/[Ⅳ|IV|4]/g, "4")
    .toLowerCase();
}

export interface SubjectBoundaryResult {
  subjectFound: boolean;
  startCharIndex: number;
  endCharIndex: number;
  subjectSection: string;
  matchedSubjectName: string;
  nextSubjectName?: string;
}

/**
 * Strictly isolates ONLY the target subject section from the full HWP text.
 * Starts from the exact target subject heading and ends immediately before the NEXT subject heading.
 */
export function findSubjectBoundariesInText(
  fullText: string,
  targetSubjectName: string
): SubjectBoundaryResult {
  if (!fullText || !fullText.trim() || !targetSubjectName || !targetSubjectName.trim()) {
    return {
      subjectFound: false,
      startCharIndex: -1,
      endCharIndex: -1,
      subjectSection: "",
      matchedSubjectName: "",
    };
  }

  const normTarget = normalizeSubjectName(targetSubjectName);
  const lines = fullText.split("\n");

  // Calculate cumulative character offsets for each line
  const lineOffsets: number[] = [];
  let currentOffset = 0;
  for (let i = 0; i < lines.length; i++) {
    lineOffsets.push(currentOffset);
    currentOffset += lines[i].length + 1; // +1 for the newline
  }

  interface HeaderCandidate {
    lineIndex: number;
    charOffset: number;
    rawText: string;
    cleanedName: string;
    normName: string;
    isExactTarget: boolean;
  }

  const allHeaders: HeaderCandidate[] = [];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i].trim();
    if (!rawLine || rawLine.length > 50) continue;

    // Filter out obvious non-subject headers
    if (
      rawLine.includes("성취기준 해설") ||
      rawLine.includes("평가 방향") ||
      rawLine.includes("교수·학습") ||
      rawLine.includes("교수･학습") ||
      rawLine.includes("평가방법") ||
      rawLine.includes("성취수준 기술") ||
      rawLine.includes("차   례") ||
      rawLine.includes("목   차") ||
      rawLine.includes("작성자") ||
      rawLine.includes("교육과정 총론") ||
      /^\[\s*[0-9]{2}[가-힣A-Za-z]/.test(rawLine)
    ) {
      continue;
    }

    // Clean leading bullets/numbering: e.g. "1. 생명과학", "Ⅰ. 생명과학", "【 생명과학 】", "[ 생명과학 ]"
    const cleaned = rawLine
      .replace(/^\s*(?:(?:\d+|[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+|[가-하])[\.\)]\s*|【|\[|<|■|□|◆|◇|▶|▷|#|\*|\-|\+)*\s*/, "")
      .replace(/\s*(?:】|\]|>|\*|\-|\+)*\s*$/, "")
      .trim();

    if (!cleaned || cleaned.length > 30) continue;

    const norm = normalizeSubjectName(cleaned);
    const isExact = norm === normTarget;

    // Identify subject headings: exact matches or pattern-based headings
    const isNumberedHeading =
      /^(?:\d+|[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+)[\.\)]\s*[가-힣A-Za-z0-9\s]{2,20}$/.test(rawLine) ||
      /^【\s*[가-힣A-Za-z0-9\s]{2,20}\s*】$/.test(rawLine) ||
      /^\[\s*과목명\s*[:：]?\s*[가-힣A-Za-z0-9\s]{2,20}\s*\]$/.test(rawLine);

    if (isExact || isNumberedHeading) {
      allHeaders.push({
        lineIndex: i,
        charOffset: lineOffsets[i],
        rawText: rawLine,
        cleanedName: cleaned,
        normName: norm,
        isExactTarget: isExact,
      });
    }
  }

  // Find headers matching target subject exactly
  const matchingHeaders = allHeaders.filter((h) => h.isExactTarget);

  if (matchingHeaders.length === 0) {
    // Direct scan fallback (strict exact match of cleaned line)
    let directFoundIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.length > 40) continue;
      const cleaned = line
        .replace(/^\s*(?:(?:\d+|[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+|[가-하])[\.\)]\s*|【|\[|<|■|□|◆|◇|▶|▷|#|\*|\-|\+)*\s*/, "")
        .replace(/\s*(?:】|\]|>|\*|\-|\+)*\s*$/, "")
        .trim();
      if (normalizeSubjectName(cleaned) === normTarget) {
        directFoundIdx = i;
        const nearby = lines.slice(i, i + 30).join("\n");
        if (
          nearby.includes("성취기준") ||
          nearby.includes("성취수준") ||
          nearby.includes("[A]") ||
          nearby.includes("\nA\n") ||
          nearby.includes("\nA\t")
        ) {
          break;
        }
      }
    }

    if (directFoundIdx === -1) {
      // STRICT REQUIREMENT: DO NOT FALLBACK TO FULL FILE
      return {
        subjectFound: false,
        startCharIndex: -1,
        endCharIndex: -1,
        subjectSection: "",
        matchedSubjectName: "",
      };
    }

    matchingHeaders.push({
      lineIndex: directFoundIdx,
      charOffset: lineOffsets[directFoundIdx],
      rawText: lines[directFoundIdx],
      cleanedName: targetSubjectName,
      normName: normTarget,
      isExactTarget: true,
    });
  }

  // Pick the best match that is followed by standard/achievement data
  let chosenHeader = matchingHeaders[0];
  for (const h of matchingHeaders) {
    const preview = fullText.slice(h.charOffset, h.charOffset + 4000);
    if (
      preview.includes("성취기준별 성취수준") ||
      preview.includes("성취기준별") ||
      preview.includes("성취기준") ||
      preview.includes("[A]") ||
      /\[\d{2}[가-힣A-Za-z]/.test(preview)
    ) {
      chosenHeader = h;
      break;
    }
  }

  const startCharIndex = chosenHeader.charOffset;

  // Find the end boundary: start of the next distinct subject header
  let endCharIndex = fullText.length;
  let nextSubjectName: string | undefined = undefined;

  for (const h of allHeaders) {
    if (h.charOffset > startCharIndex + 100 && h.normName !== normTarget) {
      endCharIndex = h.charOffset;
      nextSubjectName = h.cleanedName;
      break;
    }
  }

  // If not found in allHeaders, scan subsequent lines for any clear subject headers
  if (endCharIndex === fullText.length) {
    for (let i = chosenHeader.lineIndex + 10; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.length > 40) continue;

      const isNewSubjectHeading =
        /^(?:\d+|[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+)[\.\)]\s*[가-힣A-Za-z0-9\s]{2,20}$/.test(line) ||
        /^【\s*[가-힣A-Za-z0-9\s]{2,20}\s*】$/.test(line);

      if (isNewSubjectHeading) {
        const cleaned = line
          .replace(/^\s*(?:(?:\d+|[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+|[가-하])[\.\)]\s*|【|\[|<)*\s*/, "")
          .replace(/\s*(?:】|\]|>)*\s*$/, "")
          .trim();
        const norm = normalizeSubjectName(cleaned);
        if (
          norm !== normTarget &&
          !norm.includes("성취") &&
          !norm.includes("평가") &&
          !norm.includes("목표") &&
          !norm.includes("성격")
        ) {
          endCharIndex = lineOffsets[i];
          nextSubjectName = cleaned;
          break;
        }
      }
    }
  }

  const subjectSection = fullText.slice(startCharIndex, endCharIndex);

  return {
    subjectFound: true,
    startCharIndex,
    endCharIndex,
    subjectSection,
    matchedSubjectName: chosenHeader.cleanedName,
    nextSubjectName,
  };
}

export interface StandardTableSectionResult {
  standardTableFound: boolean;
  tableText: string;
  startIdx: number;
  endIdx: number;
}

/**
 * Precisely isolates the 「성취기준별 성취수준」 table block within the subjectSection.
 * Strictly excludes preceding or following 「영역별 성취수준」, 「예시 평가도구」, etc.
 */
export function isolateStandardAchievementTableSection(subjectText: string): StandardTableSectionResult {
  if (!subjectText || !subjectText.trim()) {
    return { standardTableFound: false, tableText: "", startIdx: -1, endIdx: -1 };
  }

  const lines = subjectText.split("\n");
  const lineOffsets: number[] = [];
  let currentOffset = 0;
  for (let i = 0; i < lines.length; i++) {
    lineOffsets.push(currentOffset);
    currentOffset += lines[i].length + 1;
  }

  // 1. Locate start of 「성취기준별 성취수준」 subsection (NOT 영역별)
  let startLineIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Skip any domain headings (영역별)
    if (line.includes("영역별")) continue;

    // Check for standard-by-standard achievement levels heading
    const isStandardHeading =
      /^(?:(?:\d+|[가-하]|\([0-9]+\)|\([가-하]\))\s*[\.\)]\s*)?성취기준별\s*성취\s*수준/.test(line) ||
      /^[■□◆◇▶▷【\[<*]\s*(?:(?:\d+|[가-하]|\([0-9]+\))\s*[\.\)]\s*)?성취기준별\s*성취\s*수준/.test(line) ||
      /^성취기준별\s*성취\s*수준/.test(line) ||
      (line.includes("성취기준별") && line.includes("성취수준") && !line.includes("영역별"));

    if (isStandardHeading) {
      startLineIdx = i;
      break;
    }
  }

  // If explicit heading is missing, find where the first real achievement standard code [12...-..] begins
  // that is NOT in an "영역별" block
  if (startLineIdx === -1) {
    let inDomainBlock = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      if (line.includes("영역별 성취수준") || line.includes("영역별성취수준")) {
        inDomainBlock = true;
        continue;
      }

      const isStdCode =
        /\[\s*[0-9]{2}[가-힣A-Za-z0-9\-_ⅠⅡⅢⅣ\s]+\s*\]/.test(line) ||
        /(?:^|\s)[0-9]{2}[가-힣A-Za-z0-9\s]*[-_]\d{1,3}[-_]\d{1,3}/.test(line);

      if (isStdCode) {
        // If we were in a domain block, seeing a standard code indicates standard section has started
        startLineIdx = i;
        break;
      }
    }
  }

  if (startLineIdx === -1) {
    return { standardTableFound: false, tableText: "", startIdx: -1, endIdx: -1 };
  }

  // 2. Locate end of the 「성취기준별 성취수준」 table block
  // The table ends when a new major subsection begins (e.g., 예시 평가도구, 3. 평가 방향, 영역별 성취수준, etc.)
  let endLineIdx = lines.length;

  for (let i = startLineIdx + 5; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Check for subsequent subsection markers
    const isNextSection =
      /^(?:\([3-9]\)|\([다-하]\)|[3-9]\.|\b[다-하]\.|\b[Ⅲ-Ⅹ]\.)\s*(?:예시|평가|교수|성격|목표|영역별)/.test(line) ||
      /^[■□◆◇▶▷【\[<*]?\s*(?:예시\s*평가도구|예시\s*문항|평가도구|교수·학습|교수･학습|평가\s*방향|평가\s*계획|영역별\s*성취수준|총괄\s*성취수준)/.test(line) ||
      /^【\s*(?:예시|평가|영역별)/.test(line);

    if (isNextSection) {
      endLineIdx = i;
      break;
    }
  }

  const startChar = lineOffsets[startLineIdx];
  const endChar = endLineIdx < lines.length ? lineOffsets[endLineIdx] : subjectText.length;
  const tableText = subjectText.slice(startChar, endChar);

  return {
    standardTableFound: true,
    tableText,
    startIdx: startChar,
    endIdx: endChar,
  };
}

/**
 * Extracts standard-by-standard achievement levels (A, B, C, D, E)
 * STRICTLY within the isolated current subject's 「성취기준별 성취수준」 table.
 * All domain overviews (영역별 성취수준), dimensions (지식·이해, 과정·기능, 가치·태도),
 * and other sections are completely excluded.
 */
export function extractAchievementLevelsByStandard(
  fullText: string,
  targetSubjectName?: string,
  isThreeTierScale: boolean = false
): ExtractedAchievementLevels {
  if (!fullText || !fullText.trim() || !targetSubjectName || !targetSubjectName.trim()) {
    return {
      achieveA: "",
      achieveB: "",
      achieveC: "",
      achieveD: "",
      achieveE: "",
      totalStandards: 0,
      extractedStandards: [],
      subjectFound: false,
      standardTableFound: false,
    };
  }

  // 1. First locate and strictly isolate the target subject section
  const boundary = findSubjectBoundariesInText(fullText, targetSubjectName);

  if (!boundary.subjectFound || !boundary.subjectSection || boundary.subjectSection.trim().length === 0) {
    console.log("=== [성취수준 추출 디버깅 정보] ===");
    console.log("현재 과목명:", targetSubjectName);
    console.log("성취기준별 성취수준 표 발견 여부: false (과목 미발견)");
    console.log("추출된 성취기준 개수: 0");
    console.log("A 문장 개수: 0");
    console.log("B 문장 개수: 0");
    console.log("C 문장 개수: 0");
    console.log("D 문장 개수: 0");
    console.log("E 문장 개수: 0");
    console.log("영역별 성취수준 문장 포함 여부: false (포함되지 않음)");
    console.log("================================");
    return {
      achieveA: "",
      achieveB: "",
      achieveC: "",
      achieveD: "",
      achieveE: "",
      totalStandards: 0,
      extractedStandards: [],
      subjectFound: false,
      standardTableFound: false,
    };
  }

  // 2. Inside the isolated subject section ONLY, isolate the exact 「성취기준별 성취수준」 table
  const tableResult = isolateStandardAchievementTableSection(boundary.subjectSection);

  if (!tableResult.standardTableFound || !tableResult.tableText.trim()) {
    console.log("=== [성취수준 추출 디버깅 정보] ===");
    console.log("현재 과목명:", targetSubjectName);
    console.log("성취기준별 성취수준 표 발견 여부: false (표 미발견)");
    console.log("추출된 성취기준 개수: 0");
    console.log("A 문장 개수: 0");
    console.log("B 문장 개수: 0");
    console.log("C 문장 개수: 0");
    console.log("D 문장 개수: 0");
    console.log("E 문장 개수: 0");
    console.log("영역별 성취수준 문장 포함 여부: false (포함되지 않음)");
    console.log("================================");
    return {
      achieveA: "",
      achieveB: "",
      achieveC: "",
      achieveD: "",
      achieveE: "",
      totalStandards: 0,
      extractedStandards: [],
      subjectFound: true,
      standardTableFound: false,
    };
  }

  const lines = tableResult.tableText.split("\n");

  const levelBuckets: { [level in "A" | "B" | "C" | "D" | "E"]: string[] } = {
    A: [],
    B: [],
    C: [],
    D: [],
    E: [],
  };

  const parsedStandardsList: string[] = [];
  const seenStdCodes = new Set<string>();

  let currentStdCode: string | null = null;
  let currentLevel: "A" | "B" | "C" | "D" | "E" | null = null;
  let currentLevelLines: string[] = [];

  const saveCurrentLevel = () => {
    // CRITICAL: An achievement level is ONLY valid if it belongs to an active standard code
    if (currentStdCode && currentLevel && currentLevelLines.length > 0) {
      const rawText = currentLevelLines.join(" ").replace(/\s+/g, " ").trim();
      if (rawText && rawText.length >= 4 && !isExcludedNarrativeLine(rawText)) {
        let cleanedText = rawText
          .replace(/^(?:\[?[A-Ea-e]\]?[\.\:\t\|\s]+)+/, "")
          .trim();
        cleanedText = cleanLevelText(cleanedText);
        if (cleanedText && cleanedText.length >= 4 && !isExcludedNarrativeLine(cleanedText)) {
          levelBuckets[currentLevel].push(cleanedText);
        }
      }
    }
    currentLevelLines = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // 1. Check if line contains an achievement standard code, e.g. [12생과01-01]
    const stdMatch =
      line.match(/\[\s*([0-9]{2}[A-Za-z0-9가-힣\-_ⅠⅡⅢⅣ\s]+)\s*\]/) ||
      line.match(/(?:^|\s)([0-9]{2}[가-힣A-Za-z0-9\s]*[-_]\d{1,3}[-_]\d{1,3})(?:$|\s|\.)/);

    if (stdMatch) {
      const rawCode = stdMatch[1].trim();
      const isRealStdCode =
        /\d{2}[가-힣A-Za-z0-9\s]*[-_]\d{1,3}[-_]\d{1,3}/.test(rawCode) ||
        /\d{2}[가-힣A-Za-z0-9\s]*\d{2}[-_]\d{2}/.test(rawCode) ||
        (/\d+[-_]\d+/.test(rawCode) && rawCode.length >= 5);

      if (isRealStdCode) {
        saveCurrentLevel();
        currentLevel = null;
        currentStdCode = rawCode;
        if (!seenStdCodes.has(rawCode)) {
          seenStdCodes.add(rawCode);
          parsedStandardsList.push(rawCode);
        }
        continue;
      }
    }

    // 2. Check for level indicators: "A", "[A]", "A.", "A:", "A\t...", "A  ..."
    // ONLY allowed when an achievement standard code is currently active
    if (currentStdCode) {
      const levelMatch =
        line.match(/^\[?([A-Ea-e])\]?$/) ||
        line.match(/^\[?([A-Ea-e])\]?(?:[\.\:\:\t\|\)]\s*|\s{1,})(.*)$/);

      if (levelMatch) {
        const matchedLevel = levelMatch[1].toUpperCase() as "A" | "B" | "C" | "D" | "E";
        saveCurrentLevel();
        currentLevel = matchedLevel;
        const rest = levelMatch[2] ? levelMatch[2].trim() : "";
        if (rest && !isExcludedNarrativeLine(rest)) {
          currentLevelLines.push(rest);
        }
        continue;
      }
    }

    // 3. Exclude narrative lines, domain overviews, unit headers, and section breaks
    if (isExcludedNarrativeLine(line)) {
      saveCurrentLevel();
      currentLevel = null;
      continue;
    }

    if (currentLevel && currentStdCode) {
      // Check for section breaks or non-level headers
      if (
        line.startsWith("※") ||
        line.startsWith("교수·학습") ||
        line.startsWith("평가 기준") ||
        line.startsWith("평가방법") ||
        line.startsWith("성취기준 해설") ||
        line.startsWith("단원") ||
        line.startsWith("대단원") ||
        line.startsWith("중단원") ||
        line.startsWith("영역") ||
        line.startsWith("Ⅰ.") ||
        line.startsWith("Ⅱ.") ||
        line.startsWith("Ⅲ.") ||
        line.startsWith("Ⅳ.") ||
        (line.startsWith("1.") && line.includes("성격")) ||
        isStructuralHeaderOrIndexLine(line)
      ) {
        saveCurrentLevel();
        currentLevel = null;
        continue;
      }

      currentLevelLines.push(line);
    }
  }

  saveCurrentLevel();

  const achieveA = cleanLevelText(levelBuckets.A.join(" "));
  const achieveB = cleanLevelText(levelBuckets.B.join(" "));
  const achieveC = cleanLevelText(levelBuckets.C.join(" "));
  const achieveD = isThreeTierScale ? "" : cleanLevelText(levelBuckets.D.join(" "));
  const achieveE = isThreeTierScale ? "" : cleanLevelText(levelBuckets.E.join(" "));

  const totalStandards =
    parsedStandardsList.length || Math.max(levelBuckets.A.length, levelBuckets.B.length);

  // Validation: Check if any domain summary text leaked into descriptors
  const hasDomainContamination = (str: string): boolean => {
    if (!str) return false;
    return /영역별|지식\s*[\·\-\s\:\/]\s*이해|과정\s*[\·\-\s\:\/]\s*기능|가치\s*[\·\-\s\:\/]\s*태도|영역별\s*종합|총괄\s*성취수준/.test(str);
  };

  const domainContaminated =
    hasDomainContamination(achieveA) ||
    hasDomainContamination(achieveB) ||
    hasDomainContamination(achieveC) ||
    hasDomainContamination(achieveD) ||
    hasDomainContamination(achieveE);

  // Required Debugging Log Output
  console.log("=== [성취수준 추출 디버깅 정보] ===");
  console.log("현재 과목명:", targetSubjectName);
  console.log("성취기준별 성취수준 표 발견 여부:", tableResult.standardTableFound);
  console.log("추출된 성취기준 개수:", totalStandards);
  console.log("A 문장 개수:", levelBuckets.A.length);
  console.log("B 문장 개수:", levelBuckets.B.length);
  console.log("C 문장 개수:", levelBuckets.C.length);
  console.log("D 문장 개수:", levelBuckets.D.length);
  console.log("E 문장 개수:", levelBuckets.E.length);
  console.log("영역별 성취수준 문장 포함 여부:", domainContaminated ? "true (오류 감지됨)" : "false (포함되지 않음)");
  console.log("================================");

  if (domainContaminated) {
    console.error("추출 결과에 영역별 성취수준이 포함되어 추출 실패로 처리합니다.");
    return {
      achieveA: "",
      achieveB: "",
      achieveC: "",
      achieveD: "",
      achieveE: "",
      totalStandards: 0,
      extractedStandards: [],
      subjectFound: true,
      standardTableFound: false,
    };
  }

  return {
    achieveA,
    achieveB,
    achieveC,
    achieveD,
    achieveE,
    totalStandards,
    extractedStandards: parsedStandardsList,
    subjectFound: true,
    standardTableFound: tableResult.standardTableFound,
  };
}

