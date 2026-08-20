import JSZip from "jszip";
import { EvaluationPlanExportJson, PlanData, RubricCriterion } from "../types";
import { isFirstGrade, isThreeTier } from "./achievementUtils";
import { getKoreanPrefix } from "../constants";

/**
 * Fills the school's official HWPX template (a real Hancom Office Open XML
 * document: ZIP + XML, NOT the legacy binary .hwp format) with data already
 * produced by buildEvaluationPlanExportJson.
 *
 * Safety model: we never touch table geometry, borders, fonts, merges, or
 * page setup. We only ever do one of three things to the template's own
 * Contents/section0.xml:
 *   1. Replace the display text of an existing "누름틀"(CLICK_HERE) form field.
 *   2. Insert text into an existing, genuinely empty <hp:run/> (no <hp:t>).
 *   3. Clone a self-contained, already-existing block (a whole <hp:tbl>, or a
 *      whole <hp:p> that hosts one) to grow repeatable sections (performance
 *      assessment 3/4) or remove one that doesn't apply (unused achievement
 *      scale variant). We never resize an existing table's rows/cols.
 * Every other byte of the template — including the pre-filled 20-week
 * calendar, holidays, exam dates and fixed boilerplate text — is preserved
 * untouched and re-zipped exactly as it was read.
 */

const HP_NS = "http://www.hancom.co.kr/hwpml/2011/paragraph";

export interface HwpxFillResult {
  blob: Blob;
  filename: string;
  warnings: string[];
}

function q(el: Element, tag: string): Element[] {
  return Array.from(el.getElementsByTagNameNS(HP_NS, tag));
}

function directChildren(el: Element, tag: string): Element[] {
  return Array.from(el.children).filter((c) => c.namespaceURI === HP_NS && c.localName === tag);
}

function firstDirectChild(el: Element, tag: string): Element | null {
  return directChildren(el, tag)[0] || null;
}

/**
 * header.xml (Contents/header.xml) holds the shared charPr (character
 * format, referenced by runs via `charPrIDRef`) and paraPr (paragraph
 * format, referenced by <hp:p> via `paraPrIDRef`) definitions. Some
 * templates give a placeholder cell's guide text a deliberately compressed
 * style (character ratio/장평 below 100%, non-zero spacing/자간, or a
 * line spacing/줄간격 other than our fixed output value) so a short sample
 * sentence visually fits one line. If we insert real (longer) text into a
 * run/paragraph that still points at that style, it renders squeezed or at
 * an inconsistent line height instead of wrapping cleanly at a uniform
 * 자간 0% / 장평 100% / 줄간격 160%. We never mutate a shared charPr/paraPr
 * in place (other, untouched text may reference the same id) — instead we
 * clone it, normalize the clone, and repoint only the runs/paragraphs we
 * actually fill.
 */
const FIXED_LINE_SPACING_PERCENT = "160";

interface HeaderCtx {
  doc: Document;
  charPrs: Map<string, Element>;
  normalizedCache: Map<string, string>; // original charPr id -> normalized clone id
  normalizedIds: Set<string>; // ids that are themselves already-normalized clones
  nextId: number;
  paraPrs: Map<string, Element>;
  normalizedParaCache: Map<string, string>; // original paraPr id -> normalized clone id
  normalizedParaIds: Set<string>; // ids that are themselves already-normalized clones
  nextParaId: number;
}

function loadHeaderCtx(headerXmlText: string | null): HeaderCtx | null {
  if (!headerXmlText) return null;
  const parser = new DOMParser();
  const doc = parser.parseFromString(headerXmlText, "application/xml");
  if (doc.getElementsByTagName("parsererror").length > 0) return null;

  const charPrs = new Map<string, Element>();
  let maxCharId = 0;
  for (const el of Array.from(doc.getElementsByTagNameNS("*", "charPr"))) {
    const id = el.getAttribute("id");
    if (id == null) continue;
    charPrs.set(id, el);
    const n = Number(id);
    if (Number.isFinite(n) && n > maxCharId) maxCharId = n;
  }

  const paraPrs = new Map<string, Element>();
  let maxParaId = 0;
  for (const el of Array.from(doc.getElementsByTagNameNS("*", "paraPr"))) {
    const id = el.getAttribute("id");
    if (id == null) continue;
    paraPrs.set(id, el);
    const n = Number(id);
    if (Number.isFinite(n) && n > maxParaId) maxParaId = n;
  }

  return {
    doc,
    charPrs,
    normalizedCache: new Map(),
    normalizedIds: new Set(),
    nextId: maxCharId + 1,
    paraPrs,
    normalizedParaCache: new Map(),
    normalizedParaIds: new Set(),
    nextParaId: maxParaId + 1,
  };
}

/** Forces character width ratio (장평) to exactly 100% and letter spacing
 * (자간) to exactly 0% on every script variant (hangul/latin/hanja/...),
 * regardless of what the template's own guide-text style specified. Font
 * size (height) and every other character attribute are left exactly as
 * they were. */
function normalizeCharPrElement(charPr: Element) {
  for (const child of Array.from(charPr.children)) {
    if (child.localName === "ratio") {
      for (const attr of Array.from(child.attributes)) {
        if (attr.value !== "100") child.setAttribute(attr.name, "100");
      }
    } else if (child.localName === "spacing") {
      for (const attr of Array.from(child.attributes)) {
        if (attr.value !== "0") child.setAttribute(attr.name, "0");
      }
    }
  }
}

function normalizeRunCharPr(headerCtx: HeaderCtx | null, run: Element) {
  if (!headerCtx) return;
  const origId = run.getAttribute("charPrIDRef");
  if (!origId || headerCtx.normalizedIds.has(origId)) return;
  let newId = headerCtx.normalizedCache.get(origId);
  if (!newId) {
    const origEl = headerCtx.charPrs.get(origId);
    if (!origEl || !origEl.parentNode) return;
    const clone = origEl.cloneNode(true) as Element;
    newId = String(headerCtx.nextId++);
    clone.setAttribute("id", newId);
    normalizeCharPrElement(clone);
    origEl.parentNode.insertBefore(clone, origEl.nextSibling);
    headerCtx.charPrs.set(newId, clone);
    headerCtx.normalizedCache.set(origId, newId);
    headerCtx.normalizedIds.add(newId);
    const parent = origEl.parentNode as Element;
    const itemCnt = parent.getAttribute("itemCnt");
    if (itemCnt != null && Number.isFinite(Number(itemCnt))) {
      parent.setAttribute("itemCnt", String(Number(itemCnt) + 1));
    }
  }
  run.setAttribute("charPrIDRef", newId);
}

/** Forces every lineSpacing (줄간격) definition inside this paraPr to a
 * fixed 160% — searched recursively (not just direct children) because
 * templates sometimes carry per-Hangul-version variants of paraPr fields
 * nested inside <hp:switch>/<hp:case> branches, and every variant must
 * agree so the paragraph renders the same regardless of which branch the
 * viewer's HWP version resolves to. */
function normalizeParaPrElement(paraPr: Element) {
  for (const lineSpacing of Array.from(paraPr.getElementsByTagNameNS("*", "lineSpacing"))) {
    lineSpacing.setAttribute("type", "PERCENT");
    lineSpacing.setAttribute("value", FIXED_LINE_SPACING_PERCENT);
  }
}

function normalizeParagraphParaPr(headerCtx: HeaderCtx | null, p: Element) {
  if (!headerCtx) return;
  const origId = p.getAttribute("paraPrIDRef");
  if (!origId || headerCtx.normalizedParaIds.has(origId)) return;
  let newId = headerCtx.normalizedParaCache.get(origId);
  if (!newId) {
    const origEl = headerCtx.paraPrs.get(origId);
    if (!origEl || !origEl.parentNode) return;
    const clone = origEl.cloneNode(true) as Element;
    newId = String(headerCtx.nextParaId++);
    clone.setAttribute("id", newId);
    normalizeParaPrElement(clone);
    origEl.parentNode.insertBefore(clone, origEl.nextSibling);
    headerCtx.paraPrs.set(newId, clone);
    headerCtx.normalizedParaCache.set(origId, newId);
    headerCtx.normalizedParaIds.add(newId);
    const parent = origEl.parentNode as Element;
    const itemCnt = parent.getAttribute("itemCnt");
    if (itemCnt != null && Number.isFinite(Number(itemCnt))) {
      parent.setAttribute("itemCnt", String(Number(itemCnt) + 1));
    }
  }
  p.setAttribute("paraPrIDRef", newId);
}

/** Removes any cached line-layout snapshot (computed for the old, shorter
 * text) and forces normal word-wrap instead of "fit to one line by
 * compressing" (lineWrap="SQUEEZE"), so HWP wraps long content across
 * multiple lines — and grows the row to fit — instead of squeezing it.
 * Also repoints the paragraph at a normalized paraPr clone so its line
 * spacing (줄간격) is always exactly 160%, regardless of what the
 * template's own paraPr specified. */
function normalizeParagraphFlow(p: Element, headerCtx: HeaderCtx | null = null) {
  for (const seg of directChildren(p, "linesegarray")) {
    p.removeChild(seg);
  }
  const pPr = firstDirectChild(p, "pPr");
  if (pPr && pPr.hasAttribute("lineWrap") && pPr.getAttribute("lineWrap") !== "BREAK") {
    pPr.setAttribute("lineWrap", "BREAK");
  }
  normalizeParagraphParaPr(headerCtx, p);
}

function setRunText(run: Element, value: string, headerCtx: HeaderCtx | null = null) {
  let t = firstDirectChild(run, "t");
  if (!t) {
    t = run.ownerDocument.createElementNS(HP_NS, "hp:t");
    run.appendChild(t);
  }
  t.textContent = value;
  normalizeRunCharPr(headerCtx, run);
}

function isFieldBeginRun(run: Element): boolean {
  const ctrl = firstDirectChild(run, "ctrl");
  if (!ctrl) return false;
  const fb = firstDirectChild(ctrl, "fieldBegin");
  return !!fb && fb.getAttribute("type") === "CLICK_HERE";
}

function isFieldEndRun(run: Element): boolean {
  const ctrl = firstDirectChild(run, "ctrl");
  return !!ctrl && !!firstDirectChild(ctrl, "fieldEnd");
}

/** Core rule used everywhere: given a paragraph's runs, either replace a
 * CLICK_HERE field's visible value run, or fill the first genuinely-empty
 * run (<hp:run/> with no <hp:t>). Never touches a run that already carries
 * real static text outside of those two patterns. */
function fillRunsValue(runs: Element[], value: string, headerCtx: HeaderCtx | null = null): boolean {
  for (let i = 0; i < runs.length; i++) {
    if (isFieldBeginRun(runs[i])) {
      const valueRun = runs[i + 1];
      if (valueRun && !isFieldEndRun(valueRun)) {
        setRunText(valueRun, value, headerCtx);
        return true;
      }
    }
  }
  for (const run of runs) {
    const hasCtrl = !!firstDirectChild(run, "ctrl");
    const t = firstDirectChild(run, "t");
    const isBlank = !t || !(t.textContent || "").trim();
    if (!hasCtrl && isBlank) {
      setRunText(run, value, headerCtx);
      return true;
    }
  }
  return false;
}

/** Clears a cell's existing content (whatever it is: guidance text, a
 * multi-paragraph note, a field) and writes `value` in its place, using the
 * cell's own first-paragraph formatting. Used only for the small,
 * explicitly-identified set of cells whose whole purpose IS the data we
 * insert even though the template ships them pre-filled with sample/
 * instructional text (e.g. "수행 과제 흐름", "AI 활용" guidance notes). */
function forceFillCellMultiline(tc: Element, value: string, headerCtx: HeaderCtx | null = null): boolean {
  const subList = firstDirectChild(tc, "subList");
  if (!subList) return false;
  const paras = directChildren(subList, "p");
  if (paras.length === 0) return false;
  const firstP = paras[0];
  for (let i = 1; i < paras.length; i++) subList.removeChild(paras[i]);

  const runs = directChildren(firstP, "run");
  if (runs.length === 0) return false;
  const ctrl = firstDirectChild(runs[0], "ctrl");
  if (ctrl) runs[0].removeChild(ctrl);
  for (let r = 1; r < runs.length; r++) runs[r].remove();

  normalizeParagraphFlow(firstP, headerCtx);
  const lines = value.split("\n");
  setRunText(runs[0], lines[0] ?? "", headerCtx);
  let anchor = firstP;
  for (let i = 1; i < lines.length; i++) {
    const clone = firstP.cloneNode(true) as Element;
    normalizeParagraphFlow(clone, headerCtx);
    const cloneRuns = directChildren(clone, "run");
    if (cloneRuns.length > 0) {
      setRunText(cloneRuns[0], lines[i], headerCtx);
      for (let r = 1; r < cloneRuns.length; r++) cloneRuns[r].remove();
    }
    anchor.parentNode!.insertBefore(clone, anchor.nextSibling);
    anchor = clone;
  }
  return true;
}

function fillParagraphValue(p: Element, value: string, headerCtx: HeaderCtx | null = null): boolean {
  normalizeParagraphFlow(p, headerCtx);
  return fillRunsValue(directChildren(p, "run"), value, headerCtx);
}

function fillCellFirstParagraph(tc: Element, value: string, headerCtx: HeaderCtx | null = null): boolean {
  const subList = firstDirectChild(tc, "subList");
  if (!subList) return false;
  const p = firstDirectChild(subList, "p");
  if (!p) return false;
  return fillParagraphValue(p, value, headerCtx);
}

/** Fills a cell that may need multiple lines: reuses the cell's first
 * paragraph for line 1, clones it (preserving paraPr/run formatting) for
 * each additional line. Table row/col count is never touched — only the
 * paragraph list *inside one cell* grows, which HWP handles natively.
 * Every paragraph we touch (first line and clones) has its cached line
 * layout dropped and word-wrap forced on, and every run we write into has
 * its character width/spacing normalized — so long content wraps across
 * rows at normal character size instead of being squeezed onto one line. */
function fillCellMultiline(tc: Element, value: string, headerCtx: HeaderCtx | null = null): boolean {
  const lines = value.split("\n");
  const subList = firstDirectChild(tc, "subList");
  if (!subList) return false;
  const firstP = firstDirectChild(subList, "p");
  if (!firstP) return false;

  const ok = fillCellFirstParagraph(tc, lines[0] ?? "", headerCtx);
  if (!ok) return false;

  let anchor = firstP;
  for (let i = 1; i < lines.length; i++) {
    const clone = firstP.cloneNode(true) as Element;
    normalizeParagraphFlow(clone, headerCtx);
    for (const run of directChildren(clone, "run")) {
      const ctrl = firstDirectChild(run, "ctrl");
      if (ctrl) run.removeChild(ctrl);
    }
    const runs = directChildren(clone, "run");
    if (runs.length > 0) {
      setRunText(runs[0], lines[i], headerCtx);
      for (let r = 1; r < runs.length; r++) runs[r].remove();
    }
    anchor.parentNode!.insertBefore(clone, anchor.nextSibling);
    anchor = clone;
  }
  return true;
}

function getCellAddr(tc: Element): { col: number; row: number } | null {
  const addr = firstDirectChild(tc, "cellAddr");
  if (!addr) return null;
  return { col: Number(addr.getAttribute("colAddr")), row: Number(addr.getAttribute("rowAddr")) };
}

function findTableById(doc: Document, id: string): Element | null {
  return q(doc.documentElement, "tbl").find((t) => t.getAttribute("id") === id) || null;
}

function findCell(tbl: Element, col: number, row: number): Element | null {
  for (const tc of q(tbl, "tc")) {
    const addr = getCellAddr(tc);
    if (addr && addr.col === col && addr.row === row) return tc;
  }
  return null;
}

interface FillCtx {
  doc: Document;
  warnings: string[];
  headerCtx: HeaderCtx | null;
}

function fillAt(ctx: FillCtx, tableId: string, col: number, row: number, value: string, multiline = false) {
  const tbl = findTableById(ctx.doc, tableId);
  if (!tbl) {
    ctx.warnings.push(`표(id=${tableId})를 템플릿에서 찾지 못했습니다.`);
    return;
  }
  const tc = findCell(tbl, col, row);
  if (!tc) {
    ctx.warnings.push(`표(id=${tableId})의 셀(${col},${row})을 찾지 못했습니다.`);
    return;
  }
  const ok = multiline ? fillCellMultiline(tc, value, ctx.headerCtx) : fillCellFirstParagraph(tc, value, ctx.headerCtx);
  if (!ok) {
    ctx.warnings.push(`표(id=${tableId})의 셀(${col},${row})은 채울 수 없는 형식이라 건너뛰었습니다.`);
  }
}

/** Overwrites a cell's existing content (single or multi-paragraph static
 * text, a guidance note, etc.) with `value`. Used only for the small,
 * explicitly-identified set of cells whose whole purpose IS the data we
 * insert even though the template ships them pre-filled (e.g. the
 * "고정/추정" split-score-method cells, or the "수행 과제 흐름"/"AI 활용"
 * instructional notes). */
function forceFillAt(ctx: FillCtx, tableId: string, col: number, row: number, value: string) {
  const tbl = findTableById(ctx.doc, tableId);
  if (!tbl) {
    ctx.warnings.push(`표(id=${tableId})를 템플릿에서 찾지 못했습니다.`);
    return;
  }
  const tc = findCell(tbl, col, row);
  if (!tc) {
    ctx.warnings.push(`표(id=${tableId})의 셀(${col},${row})을 찾지 못했습니다.`);
    return;
  }
  if (!forceFillCellMultiline(tc, value, ctx.headerCtx)) {
    ctx.warnings.push(`표(id=${tableId})의 셀(${col},${row})을 덮어쓰지 못했습니다.`);
  }
}

function overwriteAt(ctx: FillCtx, tableId: string, col: number, row: number, value: string) {
  const tbl = findTableById(ctx.doc, tableId);
  if (!tbl) return;
  const tc = findCell(tbl, col, row);
  if (!tc) return;
  const subList = firstDirectChild(tc, "subList");
  const p = subList && firstDirectChild(subList, "p");
  const run = p && directChildren(p, "run")[0];
  if (p) normalizeParagraphFlow(p, ctx.headerCtx);
  if (run) setRunText(run, value, ctx.headerCtx);
}

/** Fills every CLICK_HERE field in the whole document whose Direction hint
 * equals `direction`. Only safe when every field sharing that hint should
 * genuinely receive the same value (true for "과목명", which recurs
 * identically in 5 places). Do NOT use this for labels that repeat with
 * different intended values per position (e.g. "수행평가영역명"). */
function fillAllFieldsByDirection(ctx: FillCtx, direction: string, value: string) {
  let count = 0;
  for (const run of q(ctx.doc.documentElement, "run")) {
    if (!isFieldBeginRun(run)) continue;
    const ctrl = firstDirectChild(run, "ctrl")!;
    const fb = firstDirectChild(ctrl, "fieldBegin")!;
    const params = firstDirectChild(fb, "parameters");
    const dirParam = params && directChildren(params, "stringParam").find((p) => p.getAttribute("name") === "Direction");
    if (dirParam && dirParam.textContent === direction) {
      const valueRun = run.nextElementSibling;
      if (valueRun && valueRun.namespaceURI === HP_NS && valueRun.localName === "run" && !isFieldEndRun(valueRun)) {
        const hostP = closestHostParagraph(valueRun);
        if (hostP) normalizeParagraphFlow(hostP, ctx.headerCtx);
        setRunText(valueRun, value, ctx.headerCtx);
        count++;
      }
    }
  }
  if (count === 0) ctx.warnings.push(`"${direction}" 필드를 찾지 못했습니다.`);
}

/** Removes a whole <hp:tbl> and the <hp:p> that hosts it — a complete,
 * self-contained subtree removal, never a partial resize. */
function removeTableAndHostParagraph(ctx: FillCtx, tableId: string) {
  const tbl = findTableById(ctx.doc, tableId);
  if (!tbl) return;
  const hostP = closestHostParagraph(tbl);
  if (hostP && hostP.parentNode) hostP.parentNode.removeChild(hostP);
}

function closestHostParagraph(el: Element): Element | null {
  let node: Node | null = el;
  while (node) {
    if (node.nodeType === 1 && (node as Element).namespaceURI === HP_NS && (node as Element).localName === "p") return node as Element;
    node = node.parentNode;
  }
  return null;
}

/** The nearest preceding sibling <hp:p> that itself hosts a <hp:tbl>. */
function previousTableHostParagraph(p: Element): Element | null {
  let sib = p.previousElementSibling;
  while (sib) {
    if (sib.namespaceURI === HP_NS && sib.localName === "p" && q(sib, "tbl").length > 0) return sib;
    sib = sib.previousElementSibling;
  }
  return null;
}

/** The nearest preceding sibling <hp:p>, table or not. */
function previousBodyParagraph(p: Element): Element | null {
  let sib = p.previousElementSibling;
  while (sib) {
    if (sib.namespaceURI === HP_NS && sib.localName === "p") return sib;
    sib = sib.previousElementSibling;
  }
  return null;
}

function tableInParagraph(p: Element): Element | null {
  const run = firstDirectChild(p, "run");
  return (run && firstDirectChild(run, "tbl")) || null;
}

function bodyParagraphs(doc: Document): Element[] {
  return q(doc.documentElement, "p").filter((p) => {
    let a: Node | null = p.parentNode;
    while (a) {
      if (a.nodeType === 1 && (a as Element).namespaceURI === HP_NS && (a as Element).localName === "tbl") return false;
      a = a.parentNode;
    }
    return true;
  });
}

function paragraphText(p: Element): string {
  return Array.from(p.getElementsByTagNameNS(HP_NS, "t"))
    .map((t) => t.textContent || "")
    .join("");
}

function removeParagraphsMatching(ctx: FillCtx, predicate: (text: string) => boolean) {
  for (const p of bodyParagraphs(ctx.doc)) {
    if (predicate(paragraphText(p))) p.parentNode?.removeChild(p);
  }
}

/** Fills the "가./나./다./라." policy paragraphs (plain body paragraphs,
 * not table cells) that follow the "평가 목적 및 평가 방향, 평가 방침"
 * heading. Each paragraph's whole text is rebuilt as "{prefix}. {content}"
 * reusing its own first run — no paragraph is added or removed. */
function fillPolicyItems(ctx: FillCtx, items: string[]) {
  const paras = bodyParagraphs(ctx.doc);
  const target: Element[] = [];
  let collecting = false;
  for (const p of paras) {
    const text = paragraphText(p);
    if (!collecting && /평가\s*목적\s*및\s*평가\s*방향/.test(text)) {
      collecting = true;
      continue;
    }
    if (collecting) {
      if (/^\s*2\.\s*평가\s*개요/.test(text)) break;
      if (/^\s*[가나다라마바]\.?\s/.test(text)) target.push(p);
    }
  }

  if (target.length < items.length) {
    ctx.warnings.push(
      `평가 목적/방침 항목이 템플릿(${target.length}개)보다 앱 데이터(${items.length}개)가 더 많아 일부가 잘렸습니다.`
    );
  }

  target.forEach((p, idx) => {
    normalizeParagraphFlow(p, ctx.headerCtx);
    const runs = directChildren(p, "run");
    const content = idx < items.length ? items[idx] : "";
    const prefix = getKoreanPrefix(idx);
    const text = `  ${prefix}. ${content}`;
    if (runs.length > 0) {
      setRunText(runs[0], text, ctx.headerCtx);
      for (let r = 1; r < runs.length; r++) runs[r].remove();
    }
  });
}

const ACHIEVEMENT_SCALE_TABLE_IDS = {
  fiveTierFirstGrade: "2069170967",
  fiveTierRegular: "2058900167",
  threeTier: "1141462482",
};

const SEMESTER_LEVEL_TABLE_IDS = {
  fiveTierFirstGrade: "2069170997",
  fiveTierRegular: "2069170995",
  threeTier: "1141462486",
};

function pickVariant<T>(is1st: boolean, is3Tier: boolean, opts: { first: T; regular: T; three: T }): T {
  if (is3Tier) return opts.three;
  if (is1st) return opts.first;
  return opts.regular;
}

function removeUnusedVariants(ctx: FillCtx, ids: { fiveTierFirstGrade: string; fiveTierRegular: string; threeTier: string }, keep: string) {
  for (const id of Object.values(ids)) {
    if (id !== keep) removeTableAndHostParagraph(ctx, id);
  }
}

interface PerfFieldsSource {
  name: string;
  achievementStandards: string;
  taskFlow: string;
  aiUsagePolicy: string;
  rubrics: RubricCriterion[];
}

function perfSource(data: PlanData, num: number): PerfFieldsSource {
  const key = (suffix: string) => `perf${num}${suffix}` as keyof PlanData;
  return {
    name: String(data[key("Name")] || `수행평가 ${num}`),
    achievementStandards: String(data[key("Std")] || ""),
    taskFlow: String(data[key("Flow")] || ""),
    aiUsagePolicy: String(data[key("Ai")] || ""),
    rubrics: (data[key("RubricCriteria")] as RubricCriterion[]) || [],
  };
}

/** Fills one performance-assessment block: the heading paragraph (identified
 * explicitly, not by matching a repeated label) plus its info table and
 * rubric table. Table geometry is untouched — only existing cells/fields. */
/** headingP: pass the heading paragraph to fill it here, or `undefined` if
 * it was already filled elsewhere (e.g. at clone time) — `null` specifically
 * means "expected to exist but the lookup failed", which is warned about. */
function fillPerformanceBlock(
  ctx: FillCtx,
  headingP: Element | null | undefined,
  infoTableId: string,
  rubricTableId: string,
  data: PerfFieldsSource
) {
  if (headingP) {
    if (!fillParagraphValue(headingP, data.name, ctx.headerCtx)) {
      ctx.warnings.push(`"${data.name}" 수행평가 제목 필드를 채우지 못했습니다.`);
    }
  } else if (headingP === null) {
    ctx.warnings.push(`"${data.name}" 수행평가의 제목 문단을 찾지 못했습니다.`);
  }

  fillAt(ctx, infoTableId, 1, 0, data.achievementStandards, true);
  forceFillAt(ctx, infoTableId, 1, 1, data.taskFlow);
  forceFillAt(ctx, infoTableId, 1, 2, data.aiUsagePolicy);

  const criteria = data.rubrics.slice(0, 3);
  criteria.forEach((c, i) => {
    const base = 1 + i * 4;
    fillAt(ctx, rubricTableId, 0, base, c.name, true);
    const sorted = [...c.levels].sort((a, b) => b.score - a.score).slice(0, 3);
    sorted.forEach((lv, j) => {
      fillAt(ctx, rubricTableId, 1, base + j, String(lv.score));
      fillAt(ctx, rubricTableId, 2, base + j, lv.desc, true);
    });
  });
  if (data.rubrics.length > 3) {
    ctx.warnings.push(`"${data.name}" 루브릭 기준이 3개를 초과해 템플릿 표에 다 담지 못했습니다.`);
  }
}

let cloneIdCounter = 1_700_000_000 + Math.floor(Math.random() * 50_000_000);
function nextCloneId(): string {
  cloneIdCounter += 1;
  return String(cloneIdCounter);
}

/** Clones the "나" performance-assessment block (heading paragraph + info
 * table + rubric table) to make room for 수행평가 3/4. This is a pure
 * duplication of an existing, already-valid subtree — no new record types,
 * no changed row/col counts anywhere. Fresh ids are assigned to the cloned
 * tables and to the cloned field's fieldBegin/fieldEnd pair so nothing
 * collides with the original "나" block or with a previous clone. */
function cloneAndInsertPerformanceBlock(
  ctx: FillCtx,
  afterRubricTableId: string,
  koreanPrefix: string,
  name: string
): { infoTableId: string; rubricTableId: string } | null {
  const srcRubricTbl = findTableById(ctx.doc, afterRubricTableId);
  if (!srcRubricTbl) return null;
  const rubricHostP = closestHostParagraph(srcRubricTbl);
  if (!rubricHostP) return null;

  const infoHostP = previousTableHostParagraph(rubricHostP);
  if (!infoHostP) return null;
  const headingP = previousBodyParagraph(infoHostP);
  if (!headingP) return null;

  const newHeadingP = headingP.cloneNode(true) as Element;
  const newInfoHostP = infoHostP.cloneNode(true) as Element;
  const newRubricHostP = rubricHostP.cloneNode(true) as Element;

  // Re-id the cloned field's begin/end pair so it doesn't collide with the
  // original. Do this BEFORE filling, while the field structure is intact.
  const headingRuns = directChildren(newHeadingP, "run");
  const beginRun = headingRuns.find(isFieldBeginRun);
  if (beginRun) {
    const ctrl = firstDirectChild(beginRun, "ctrl")!;
    const fb = firstDirectChild(ctrl, "fieldBegin")!;
    const newId = nextCloneId();
    fb.setAttribute("id", newId);
    const endRun = headingRuns.find(isFieldEndRun);
    if (endRun) {
      const endCtrl = firstDirectChild(endRun, "ctrl")!;
      const fe = firstDirectChild(endCtrl, "fieldEnd")!;
      fe.setAttribute("beginIDRef", newId);
    }
  }
  fillParagraphValue(newHeadingP, name, ctx.headerCtx);
  // Relabel the ordinal prefix run ("나." -> "다."/"라.").
  for (const run of headingRuns) {
    const t = firstDirectChild(run, "t");
    if (t && /^\s*[가-힣]\.\s*$/.test(t.textContent || "")) {
      t.textContent = ` ${koreanPrefix}. `;
      normalizeRunCharPr(ctx.headerCtx, run);
    }
  }

  const newInfoTbl = tableInParagraph(newInfoHostP)!;
  const newRubricTbl = tableInParagraph(newRubricHostP)!;
  const newInfoId = nextCloneId();
  const newRubricId = nextCloneId();
  newInfoTbl.setAttribute("id", newInfoId);
  newRubricTbl.setAttribute("id", newRubricId);

  rubricHostP.parentNode!.insertBefore(newHeadingP, rubricHostP.nextSibling);
  rubricHostP.parentNode!.insertBefore(newInfoHostP, newHeadingP.nextSibling);
  rubricHostP.parentNode!.insertBefore(newRubricHostP, newInfoHostP.nextSibling);

  return { infoTableId: newInfoId, rubricTableId: newRubricId };
}

export async function fillHwpxTemplate(
  templateBuffer: ArrayBuffer,
  data: PlanData,
  exportJson: EvaluationPlanExportJson
): Promise<HwpxFillResult> {
  const zip = await JSZip.loadAsync(templateBuffer);
  const section0File = zip.file("Contents/section0.xml");
  if (!section0File) {
    throw new Error("이 파일은 유효한 HWPX 템플릿이 아닙니다 (Contents/section0.xml 없음).");
  }
  const xmlText = await section0File.async("string");

  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, "application/xml");
  if (doc.getElementsByTagName("parsererror").length > 0) {
    throw new Error("템플릿의 section0.xml을 파싱하지 못했습니다.");
  }

  // header.xml holds the shared character styles (장평/자간 등) that cell
  // runs reference. Loading it lets us normalize a run's style without
  // touching table/paragraph structure in section0.xml. Optional: if it's
  // missing or fails to parse, we still fill the document, just without
  // character-style normalization.
  const headerFile = zip.file("Contents/header.xml");
  const headerXmlText = headerFile ? await headerFile.async("string") : null;
  const headerCtx = loadHeaderCtx(headerXmlText);

  const ctx: FillCtx = { doc, warnings: [], headerCtx };
  if (!headerCtx) {
    ctx.warnings.push("header.xml을 찾지 못해 삽입한 글자의 자간/장평/줄간격을 정규화하지 못했습니다.");
  }
  const is1st = isFirstGrade(data.grade);
  const is3Tier = isThreeTier(data.gradeType);

  // 1. 과목명 (5곳: 제목 + 3개 섹션 제목 + 본문 문장 1곳 — 모두 같은 값)
  fillAllFieldsByDirection(ctx, "과목명", exportJson.basicInfo.subjectName || "과목명");

  // 2. 기본정보 표
  fillAt(ctx, "1766096127", 0, 1, exportJson.basicInfo.schoolName);
  fillAt(ctx, "1766096127", 1, 1, exportJson.basicInfo.grade);
  fillAt(ctx, "1766096127", 2, 1, exportJson.basicInfo.credit);
  fillAt(ctx, "1766096127", 3, 1, exportJson.basicInfo.achievementScale);
  fillAt(ctx, "1766096127", 4, 1, exportJson.basicInfo.targetClassAndDays);
  fillAt(ctx, "1766096127", 5, 1, exportJson.basicInfo.teacherName);

  // 3. 평가 목적 및 방침 (가/나/다/라 문단)
  fillPolicyItems(
    ctx,
    exportJson.evaluationPurposesAndPolicies.items.map((i) => i.content)
  );

  // 4. 평가 개요 표
  const OV = "1766096129";
  fillAt(ctx, OV, 1, 1, `${exportJson.evaluationOverview.regularExamRatio}`);
  fillAt(ctx, OV, 7, 1, `${exportJson.evaluationOverview.performanceAssessmentRatio}`);

  const [midExam, finalExam] = exportJson.evaluationOverview.regularExams;
  const [perf1Ov, perf2Ov] = exportJson.evaluationOverview.performanceAssessments;

  if (midExam) {
    fillAt(ctx, OV, 1, 5, `${midExam.selective.score}`);
    fillAt(ctx, OV, 3, 5, `${midExam.essay.score}`);
    fillAt(ctx, OV, 1, 6, `${midExam.selective.ratio}`);
    fillAt(ctx, OV, 3, 6, `${midExam.essay.ratio}`);
    fillAt(ctx, OV, 1, 7, midExam.achievementStandards, true);
    fillAt(ctx, OV, 1, 8, midExam.relatedUnits);
    fillAt(ctx, OV, 1, 9, midExam.period);
    fillAt(ctx, OV, 1, 10, midExam.tiedRankPriority);
  }
  if (finalExam) {
    fillAt(ctx, OV, 4, 5, `${finalExam.selective.score}`);
    fillAt(ctx, OV, 6, 5, `${finalExam.essay.score}`);
    fillAt(ctx, OV, 4, 6, `${finalExam.selective.ratio}`);
    fillAt(ctx, OV, 6, 6, `${finalExam.essay.ratio}`);
    fillAt(ctx, OV, 4, 7, finalExam.achievementStandards, true);
    fillAt(ctx, OV, 4, 8, finalExam.relatedUnits);
    fillAt(ctx, OV, 4, 9, finalExam.period);
    fillAt(ctx, OV, 4, 10, finalExam.tiedRankPriority);
  }
  // Row 10 ("동점자처리기준 순위") has no matching field for performance
  // assessments in PlanData/EvaluationPlanExportJson — left blank rather
  // than filling it with unrelated data (e.g. cutScoreMethod, which means
  // something else: "분할점수 처리 방법").
  if (perf1Ov) {
    fillAt(ctx, OV, 7, 3, perf1Ov.name);
    fillAt(ctx, OV, 7, 4, perf1Ov.method);
    fillAt(ctx, OV, 7, 6, `${perf1Ov.ratio}`);
    fillAt(ctx, OV, 7, 7, perf1Ov.achievementStandards, true);
    fillAt(ctx, OV, 7, 9, perf1Ov.period);
  }
  if (perf2Ov) {
    fillAt(ctx, OV, 8, 3, perf2Ov.name);
    fillAt(ctx, OV, 8, 4, perf2Ov.method);
    fillAt(ctx, OV, 8, 6, `${perf2Ov.ratio}`);
    fillAt(ctx, OV, 8, 7, perf2Ov.achievementStandards, true);
    fillAt(ctx, OV, 8, 9, perf2Ov.period);
  }
  overwriteAt(ctx, OV, 1, 11, data.splitTypeExam || "고정/추정");
  overwriteAt(ctx, OV, 7, 11, data.splitTypePerf || "고정/추정");

  // 5. 성취율표 (3종류 중 해당하는 것만 남기고 나머지는 표 전체 삭제)
  const keepScaleId = pickVariant(is1st, is3Tier, {
    first: ACHIEVEMENT_SCALE_TABLE_IDS.fiveTierFirstGrade,
    regular: ACHIEVEMENT_SCALE_TABLE_IDS.fiveTierRegular,
    three: ACHIEVEMENT_SCALE_TABLE_IDS.threeTier,
  });
  removeUnusedVariants(ctx, ACHIEVEMENT_SCALE_TABLE_IDS, keepScaleId);
  removeParagraphsMatching(ctx, (t) => /※\s*그\s*외\s*\(/.test(t));

  // 6. 수행평가 세부계획 — "가"/"나"는 항상 존재. 3/4번째가 필요하면 아직
  // 데이터가 채워지기 "전"의 깨끗한 "나" 블록을 먼저 복제해 둔 뒤에(그래야
  // 복제본이 필드/빈 run 상태를 그대로 물려받음), 가/나/복제블록을 한꺼번에 채운다.
  const perfCount = data.perfCount || 0;
  const clonedBlocks: { infoTableId: string; rubricTableId: string; num: number }[] = [];
  let lastRubricId = "2076274870";
  for (let num = 3; num <= Math.min(perfCount, 4); num++) {
    const clone = cloneAndInsertPerformanceBlock(ctx, lastRubricId, getKoreanPrefix(num - 1), perfSource(data, num).name);
    if (!clone) {
      ctx.warnings.push(`수행평가 ${num}번째 블록 복제에 실패해 출력에서 빠졌습니다.`);
      break;
    }
    clonedBlocks.push({ ...clone, num });
    lastRubricId = clone.rubricTableId;
  }

  const perf1TableInfo = findTableById(ctx.doc, "1766096131");
  const perf1Heading = perf1TableInfo && previousBodyParagraph(closestHostParagraph(perf1TableInfo)!);
  fillPerformanceBlock(ctx, perf1Heading || null, "1766096131", "1766096132", perfSource(data, 1));

  const perf2TableInfo = findTableById(ctx.doc, "2076274869");
  const perf2Heading = perf2TableInfo && previousBodyParagraph(closestHostParagraph(perf2TableInfo)!);
  fillPerformanceBlock(ctx, perf2Heading || null, "2076274869", "2076274870", perfSource(data, 2));

  for (const clone of clonedBlocks) {
    fillPerformanceBlock(ctx, undefined, clone.infoTableId, clone.rubricTableId, perfSource(data, clone.num));
  }

  // 7. 20주 진도표 (행/서식은 그대로, 빈 칸만 채움)
  // 시수누계 셀(1,21)은 원본에 내장된 한글 수식 필드(=SUM(?2:?21))라서
  // 건드리지 않는다 — 한글이 열 때 스스로 합계를 계산한다.
  const WK = "2085219916";
  exportJson.weeklyTeachingPlans.slice(0, 20).forEach((wk, idx) => {
    const row = idx + 1;
    fillAt(ctx, WK, 1, row, wk.hours || "");
    const topicLines = [wk.unitTitleAndTopic || ""];
    if (wk.keyIdea) topicLines.push(`[핵심 아이디어] ${wk.keyIdea}`);
    fillAt(ctx, WK, 2, row, topicLines.join("\n"), true);
    fillAt(ctx, WK, 3, row, wk.achievementStandards || "", true);
    fillAt(ctx, WK, 4, row, wk.evaluationType || "");
    fillAt(ctx, WK, 5, row, wk.teachingAndEvaluationDetails || "", true);
  });

  // 8. 학기 단위 성취수준 (3종류 중 해당하는 것만)
  const keepLevelId = pickVariant(is1st, is3Tier, {
    first: SEMESTER_LEVEL_TABLE_IDS.fiveTierFirstGrade,
    regular: SEMESTER_LEVEL_TABLE_IDS.fiveTierRegular,
    three: SEMESTER_LEVEL_TABLE_IDS.threeTier,
  });
  removeUnusedVariants(ctx, SEMESTER_LEVEL_TABLE_IDS, keepLevelId);
  removeParagraphsMatching(ctx, (t) => /표를\s*선택하고\s*나머지\s*표를\s*삭제/.test(t));
  removeParagraphsMatching(ctx, (t) => /1학년\s*공통과목\s*외\s*과목은\s*학기단위/.test(t));

  const levels = exportJson.semesterAchievementLevels.levels;
  levels.forEach((lvl, idx) => {
    fillAt(ctx, keepLevelId, 1, idx + 1, lvl.description || "", true);
  });
  if (keepLevelId === SEMESTER_LEVEL_TABLE_IDS.fiveTierFirstGrade && exportJson.semesterAchievementLevels.minimumCompetencyCharacteristics) {
    fillAt(ctx, keepLevelId, 0, 7, exportJson.semesterAchievementLevels.minimumCompetencyCharacteristics, true);
  }

  const serializer = new XMLSerializer();
  const newXml = serializer.serializeToString(doc);
  // Explicit per-file DEFLATE only for the files we rewrote; every other
  // entry (crucially "mimetype", which the HWPX/OPC spec requires to be
  // the first entry and stored *uncompressed*) keeps JSZip's STORE default
  // below, exactly matching the original archive's own convention.
  zip.file("Contents/section0.xml", newXml, { compression: "DEFLATE" });
  if (headerCtx && headerCtx.normalizedCache.size > 0) {
    const newHeaderXml = serializer.serializeToString(headerCtx.doc);
    zip.file("Contents/header.xml", newHeaderXml, { compression: "DEFLATE" });
  }

  const outBlob = await zip.generateAsync({
    type: "blob",
    mimeType: "application/hwp+zip",
    compression: "STORE",
  });

  const cleanSubject = (data.subjectName || "교과").replace(/[\s/]/g, "_");
  const filename = `${data.yearSemester || "2026학년도_2학기"}_${cleanSubject}_교수학습및평가운영계획.hwpx`;

  return { blob: outBlob, filename, warnings: ctx.warnings };
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
