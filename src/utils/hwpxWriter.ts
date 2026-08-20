import JSZip from "jszip";
import {
  FinalPreviewData,
  FinalPreviewPerformanceDetail,
  validateFinalPreviewData,
} from "./finalPreviewData";
import { getKoreanPrefix } from "../constants";

/**
 * Fills the school's official HWPX template (a real Hancom Office Open XML
 * document: ZIP + XML, NOT the legacy binary .hwp format) with data already
 * produced by buildFinalPreviewData.
 *
 * Core Principle:
 * The HWPX Writer NEVER recalculates, re-extracts, or re-generates any text.
 * It is purely a presentation renderer that inserts the exact final strings
 * from FinalPreviewData into the designated template cells.
 */

const HP_NS = "http://www.hancom.co.kr/hwpml/2011/paragraph";
const HH_NS = "http://www.hancom.co.kr/hwpml/2011/head";

export interface HwpxFillResult {
  blob: Blob;
  filename: string;
  warnings: string[];
}

export interface TypographyNormalizationReport {
  headerFilesFound: number;
  charPrCount: number;
  charPrRatioFixed: number;
  charPrRatioCreated: number;
  charPrSpacingFixed: number;
  charPrSpacingCreated: number;
  paraPrCount: number;
  paraPrLineSpacingFixed: number;
  paraPrLineSpacingCreated: number;
  sectionFilesFound: number;
  lineSegArraysStripped: number;
  verifiedUsedRuns: number;
  verifiedBadRatioRuns: number;
  verifiedBadSpacingRuns: number;
  verifiedUsedParagraphs: number;
  verifiedBadLineSpacingParagraphs: number;
  warnings: string[];
}

function directChildNS(el: Element, ns: string, tag: string): Element | null {
  return (Array.from(el.children).find((c) => c.namespaceURI === ns && c.localName === tag) as Element) || null;
}

function directChildrenNS(el: Element, ns: string, tag: string): Element[] {
  return Array.from(el.children).filter((c) => c.namespaceURI === ns && c.localName === tag);
}

/**
 * Resolves the real in-zip paths of the header/section parts via
 * Contents/content.hpf's OPF-style manifest (<opf:item href="...">) when
 * present, falling back to a filename-pattern scan of the zip so template
 * variants that don't ship (or use) a manifest still work.
 */
async function resolvePackagePaths(zip: JSZip): Promise<{ headerPaths: string[]; sectionPaths: string[] }> {
  const headerPaths = new Set<string>();
  const sectionPaths = new Set<string>();

  const manifestFile = zip.file("Contents/content.hpf") || zip.file("content.hpf");
  if (manifestFile) {
    try {
      const manifestXml = await manifestFile.async("string");
      const parser = new DOMParser();
      const manifestDoc = parser.parseFromString(manifestXml, "application/xml");
      if (manifestDoc.getElementsByTagName("parsererror").length === 0) {
        for (const item of Array.from(manifestDoc.getElementsByTagName("*"))) {
          if (item.localName !== "item") continue;
          const href = item.getAttribute("href");
          if (!href) continue;
          if (/header\d*\.xml$/i.test(href)) headerPaths.add(href);
          if (/section\d*\.xml$/i.test(href)) sectionPaths.add(href);
        }
      }
    } catch {
      // fall through to pattern-based discovery below
    }
  }

  for (const name of Object.keys(zip.files)) {
    if (/(^|\/)header\d*\.xml$/i.test(name)) headerPaths.add(name);
    if (/(^|\/)section\d*\.xml$/i.test(name)) sectionPaths.add(name);
  }

  return { headerPaths: Array.from(headerPaths), sectionPaths: Array.from(sectionPaths) };
}

/**
 * Learns the exact attribute-name set this document's own charPr entries use
 * for a given child tag (e.g. "ratio"/"spacing": hangul/latin/hanja/...), by
 * scanning sibling definitions that already have one. Never invents a name
 * that isn't already used elsewhere in the same header.xml.
 */
function learnAttributeNames(charPrs: Element[], tag: string): string[] | null {
  for (const cp of charPrs) {
    const el = directChildNS(cp, HH_NS, tag);
    if (el && el.attributes.length > 0) {
      return Array.from(el.attributes).map((a) => a.name);
    }
  }
  return null;
}

/**
 * HWPX TYPOGRAPHY NORMALIZATION
 *
 * HWPX runs/paragraphs never carry ratio(장평)/spacing(자간)/lineSpacing(줄간격)
 * inline — they only hold a charPrIDRef / paraPrIDRef pointing at a shared
 * <hh:charPr>/<hh:paraPr> definition inside Contents/header.xml. So the only
 * way to guarantee every used run/paragraph renders as 자간 0 / 장평 100 /
 * 줄간격 160 in Hangul is to normalize those *definitions* in place (Option A
 * from spec) — every charPrIDRef/paraPrIDRef in section*.xml, including ones
 * on template rows that get cloned for rubric/weekly-plan rows, already
 * resolves to an id defined in header.xml, so patching the definitions once
 * here covers all of them without having to trace individual references.
 *
 * All other attributes on charPr/paraPr (font, size, bold, color, align,
 * indent, border, etc.) are left completely untouched. If a definition is
 * missing its <hh:ratio>/<hh:spacing>/<hh:lineSpacing> child outright (not
 * seen in real Hancom-authored files, but handled defensively), one is
 * created using the exact attribute names already used by sibling
 * definitions in the same file (never invented).
 */
export async function normalizeHwpxTypography(
  zip: JSZip
): Promise<TypographyNormalizationReport> {
  const report: TypographyNormalizationReport = {
    headerFilesFound: 0,
    charPrCount: 0,
    charPrRatioFixed: 0,
    charPrRatioCreated: 0,
    charPrSpacingFixed: 0,
    charPrSpacingCreated: 0,
    paraPrCount: 0,
    paraPrLineSpacingFixed: 0,
    paraPrLineSpacingCreated: 0,
    sectionFilesFound: 0,
    lineSegArraysStripped: 0,
    verifiedUsedRuns: 0,
    verifiedBadRatioRuns: 0,
    verifiedBadSpacingRuns: 0,
    verifiedUsedParagraphs: 0,
    verifiedBadLineSpacingParagraphs: 0,
    warnings: [],
  };

  const { headerPaths, sectionPaths } = await resolvePackagePaths(zip);
  report.headerFilesFound = headerPaths.length;
  report.sectionFilesFound = sectionPaths.length;

  const parser = new DOMParser();
  const serializer = new XMLSerializer();

  // charPrIDRef/paraPrIDRef -> normalized-ness, filled in while patching
  // header.xml below and reused by the final section-wide verification pass.
  const charPrOk = new Map<string, { ratio: boolean; spacing: boolean }>();
  const paraPrOk = new Map<string, boolean>();

  for (const headerPath of headerPaths) {
    const headerFile = zip.file(headerPath);
    if (!headerFile) continue;
    const headerXmlText = await headerFile.async("string");
    const headerDoc = parser.parseFromString(headerXmlText, "application/xml");
    if (headerDoc.getElementsByTagName("parsererror").length > 0) {
      report.warnings.push(`${headerPath} 파싱에 실패해 정규화를 건너뛰었습니다.`);
      continue;
    }

    const charPrs = Array.from(headerDoc.getElementsByTagNameNS(HH_NS, "charPr"));
    const ratioAttrNames = learnAttributeNames(charPrs, "ratio");
    const spacingAttrNames = learnAttributeNames(charPrs, "spacing");

    for (const charPr of charPrs) {
      report.charPrCount++;
      const id = charPr.getAttribute("id") || "";
      const entry = charPrOk.get(id) || { ratio: false, spacing: false };

      let ratio = directChildNS(charPr, HH_NS, "ratio");
      if (ratio) {
        for (const attr of Array.from(ratio.attributes)) {
          ratio.setAttribute(attr.name, "100");
        }
        report.charPrRatioFixed++;
        entry.ratio = true;
      } else if (ratioAttrNames) {
        ratio = headerDoc.createElementNS(HH_NS, "hh:ratio");
        for (const name of ratioAttrNames) ratio.setAttribute(name, "100");
        const fontRef = directChildNS(charPr, HH_NS, "fontRef");
        charPr.insertBefore(ratio, fontRef ? fontRef.nextSibling : charPr.firstChild);
        report.charPrRatioCreated++;
        entry.ratio = true;
      } else {
        report.warnings.push(`charPr id=${id}: <hh:ratio> 정의를 찾을 수 없어 장평 정규화를 건너뛰었습니다.`);
      }

      let spacing = directChildNS(charPr, HH_NS, "spacing");
      if (spacing) {
        for (const attr of Array.from(spacing.attributes)) {
          spacing.setAttribute(attr.name, "0");
        }
        report.charPrSpacingFixed++;
        entry.spacing = true;
      } else if (spacingAttrNames) {
        spacing = headerDoc.createElementNS(HH_NS, "hh:spacing");
        for (const name of spacingAttrNames) spacing.setAttribute(name, "0");
        charPr.insertBefore(spacing, ratio ? ratio.nextSibling : charPr.firstChild);
        report.charPrSpacingCreated++;
        entry.spacing = true;
      } else {
        report.warnings.push(`charPr id=${id}: <hh:spacing> 정의를 찾을 수 없어 자간 정규화를 건너뛰었습니다.`);
      }

      charPrOk.set(id, entry);
    }

    const paraPrs = Array.from(headerDoc.getElementsByTagNameNS(HH_NS, "paraPr"));
    for (const paraPr of paraPrs) {
      report.paraPrCount++;
      const id = paraPr.getAttribute("id") || "";

      const lineSpacing = directChildNS(paraPr, HH_NS, "lineSpacing");
      if (lineSpacing) {
        lineSpacing.setAttribute("type", "PERCENT");
        lineSpacing.setAttribute("value", "160");
        report.paraPrLineSpacingFixed++;
        paraPrOk.set(id, true);
      } else {
        const newLineSpacing = headerDoc.createElementNS(HH_NS, "hh:lineSpacing");
        newLineSpacing.setAttribute("type", "PERCENT");
        newLineSpacing.setAttribute("value", "160");
        const margin = directChildNS(paraPr, HH_NS, "margin");
        const border = directChildNS(paraPr, HH_NS, "border");
        if (margin) {
          paraPr.insertBefore(newLineSpacing, margin.nextSibling);
        } else if (border) {
          paraPr.insertBefore(newLineSpacing, border);
        } else {
          paraPr.appendChild(newLineSpacing);
        }
        report.paraPrLineSpacingCreated++;
        paraPrOk.set(id, true);
      }
    }

    const newHeaderXml = serializer.serializeToString(headerDoc);
    zip.file(headerPath, newHeaderXml, { compression: "DEFLATE" });
  }

  // Strip cached line-layout metrics (<hp:linesegarray>/<hp:lineseg>) from
  // every paragraph in every section file. HWPX readers can cache computed
  // line height/spacing pixel metrics from when the template was last saved
  // in Hangul; if left in place, a viewer may keep showing that stale cached
  // layout instead of recomputing it from the now-160% paraPr on open. This
  // forces Hangul to lay the paragraph out fresh from the (now normalized)
  // paraPr every time, regardless of section/table nesting.
  for (const sectionPath of sectionPaths) {
    const sectionFile = zip.file(sectionPath);
    if (!sectionFile) continue;
    const sectionXmlText = await sectionFile.async("string");
    const sectionDoc = parser.parseFromString(sectionXmlText, "application/xml");
    if (sectionDoc.getElementsByTagName("parsererror").length > 0) {
      report.warnings.push(`${sectionPath} 파싱에 실패해 캐시된 줄 배치 정보 제거를 건너뛰었습니다.`);
      continue;
    }

    let changed = false;
    for (const p of Array.from(sectionDoc.getElementsByTagNameNS(HP_NS, "p"))) {
      for (const lineSegArray of directChildrenNS(p, HP_NS, "linesegarray")) {
        p.removeChild(lineSegArray);
        report.lineSegArraysStripped++;
        changed = true;
      }
    }

    if (changed) {
      const newSectionXml = serializer.serializeToString(sectionDoc);
      zip.file(sectionPath, newSectionXml, { compression: "DEFLATE" });
    }
  }

  // Final self-check: re-read what was actually written and confirm every
  // *used* run/paragraph anywhere in any section file (body text, table
  // cells, cloned rubric/weekly rows alike) now resolves — via its real
  // charPrIDRef/paraPrIDRef — to a normalized definition. Any leftover
  // mismatch is surfaced as a warning so it's visible in the export result
  // instead of silently assumed to have worked.
  for (const sectionPath of sectionPaths) {
    const sectionFile = zip.file(sectionPath);
    if (!sectionFile) continue;
    const sectionXmlText = await sectionFile.async("string");
    const sectionDoc = parser.parseFromString(sectionXmlText, "application/xml");
    if (sectionDoc.getElementsByTagName("parsererror").length > 0) continue;

    for (const run of Array.from(sectionDoc.getElementsByTagNameNS(HP_NS, "run"))) {
      const t = directChildNS(run, HP_NS, "t");
      const text = t ? (t.textContent || "").trim() : "";
      if (!text) continue;
      report.verifiedUsedRuns++;
      const ref = run.getAttribute("charPrIDRef") || "";
      const ok = charPrOk.get(ref);
      if (!ok || !ok.ratio) report.verifiedBadRatioRuns++;
      if (!ok || !ok.spacing) report.verifiedBadSpacingRuns++;
    }

    for (const p of Array.from(sectionDoc.getElementsByTagNameNS(HP_NS, "p"))) {
      const hasText = directChildrenNS(p, HP_NS, "run").some((run) => {
        const t = directChildNS(run, HP_NS, "t");
        return !!t && !!(t.textContent || "").trim();
      });
      if (!hasText) continue;
      report.verifiedUsedParagraphs++;
      const ref = p.getAttribute("paraPrIDRef") || "";
      if (!paraPrOk.get(ref)) report.verifiedBadLineSpacingParagraphs++;
    }
  }

  if (report.verifiedBadRatioRuns > 0 || report.verifiedBadSpacingRuns > 0) {
    report.warnings.push(
      `⚠️ 정규화 후에도 자간/장평이 정상화되지 않은 텍스트 run이 남아 있습니다 (자간 문제 ${report.verifiedBadSpacingRuns}개, 장평 문제 ${report.verifiedBadRatioRuns}개 / 전체 사용 run ${report.verifiedUsedRuns}개).`
    );
  }
  if (report.verifiedBadLineSpacingParagraphs > 0) {
    report.warnings.push(
      `⚠️ 정규화 후에도 줄간격이 160%가 아닌 문단이 남아 있습니다 (${report.verifiedBadLineSpacingParagraphs}개 / 전체 사용 문단 ${report.verifiedUsedParagraphs}개).`
    );
  }

  return report;
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

function setRunText(run: Element, value: string) {
  let t = firstDirectChild(run, "t");
  if (!t) {
    t = run.ownerDocument.createElementNS(HP_NS, "hp:t");
    run.appendChild(t);
  }
  t.textContent = value;
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

function fillRunsValue(runs: Element[], value: string): boolean {
  for (let i = 0; i < runs.length; i++) {
    if (isFieldBeginRun(runs[i])) {
      const valueRun = runs[i + 1];
      if (valueRun && !isFieldEndRun(valueRun)) {
        setRunText(valueRun, value);
        return true;
      }
    }
  }
  for (const run of runs) {
    const hasCtrl = !!firstDirectChild(run, "ctrl");
    const t = firstDirectChild(run, "t");
    const isBlank = !t || !(t.textContent || "").trim();
    if (!hasCtrl && isBlank) {
      setRunText(run, value);
      return true;
    }
  }
  return false;
}

function forceFillCellMultiline(tc: Element, value: string): boolean {
  let subList = firstDirectChild(tc, "subList");
  if (!subList) {
    subList = tc.ownerDocument.createElementNS(HP_NS, "hp:subList");
    tc.appendChild(subList);
  }
  const paras = directChildren(subList, "p");
  let firstP: Element;
  if (paras.length === 0) {
    firstP = tc.ownerDocument.createElementNS(HP_NS, "hp:p");
    subList.appendChild(firstP);
  } else {
    firstP = paras[0];
    for (let i = 1; i < paras.length; i++) subList.removeChild(paras[i]);
  }

  const runs = directChildren(firstP, "run");
  let firstRun: Element;
  if (runs.length === 0) {
    firstRun = tc.ownerDocument.createElementNS(HP_NS, "hp:run");
    firstP.appendChild(firstRun);
  } else {
    firstRun = runs[0];
    const ctrl = firstDirectChild(firstRun, "ctrl");
    if (ctrl) firstRun.removeChild(ctrl);
    for (let r = 1; r < runs.length; r++) runs[r].remove();
  }

  const lines = (value || "").split("\n");
  setRunText(firstRun, lines[0] ?? "");
  let anchor = firstP;
  for (let i = 1; i < lines.length; i++) {
    const clone = firstP.cloneNode(true) as Element;
    const cloneRuns = directChildren(clone, "run");
    if (cloneRuns.length > 0) {
      setRunText(cloneRuns[0], lines[i]);
      for (let r = 1; r < cloneRuns.length; r++) cloneRuns[r].remove();
    } else {
      const newRun = clone.ownerDocument.createElementNS(HP_NS, "hp:run");
      setRunText(newRun, lines[i]);
      clone.appendChild(newRun);
    }
    anchor.parentNode!.insertBefore(clone, anchor.nextSibling);
    anchor = clone;
  }
  return true;
}

function fillParagraphValue(p: Element, value: string): boolean {
  return fillRunsValue(directChildren(p, "run"), value);
}

function fillCellFirstParagraph(tc: Element, value: string): boolean {
  const subList = firstDirectChild(tc, "subList");
  if (!subList) return false;
  const p = firstDirectChild(subList, "p");
  if (!p) return false;
  return fillParagraphValue(p, value);
}

function fillCellMultiline(tc: Element, value: string): boolean {
  const lines = value.split("\n");
  const subList = firstDirectChild(tc, "subList");
  if (!subList) return false;
  const firstP = firstDirectChild(subList, "p");
  if (!firstP) return false;

  const ok = fillCellFirstParagraph(tc, lines[0] ?? "");
  if (!ok) return false;

  let anchor = firstP;
  for (let i = 1; i < lines.length; i++) {
    const clone = firstP.cloneNode(true) as Element;
    for (const run of directChildren(clone, "run")) {
      const ctrl = firstDirectChild(run, "ctrl");
      if (ctrl) run.removeChild(ctrl);
    }
    const runs = directChildren(clone, "run");
    if (runs.length > 0) {
      setRunText(runs[0], lines[i]);
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
  const ok = multiline ? fillCellMultiline(tc, value) : fillCellFirstParagraph(tc, value);
  if (!ok) {
    ctx.warnings.push(`표(id=${tableId})의 셀(${col},${row})은 채울 수 없는 형식이라 건너뛰었습니다.`);
  }
}

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
  if (!forceFillCellMultiline(tc, value)) {
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
  if (run) setRunText(run, value);
}

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
        setRunText(valueRun, value);
        count++;
      }
    }
  }
  if (count === 0) ctx.warnings.push(`"${direction}" 필드를 찾지 못했습니다.`);
}

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

function previousTableHostParagraph(p: Element): Element | null {
  let sib = p.previousElementSibling;
  while (sib) {
    if (sib.namespaceURI === HP_NS && sib.localName === "p" && q(sib, "tbl").length > 0) return sib;
    sib = sib.previousElementSibling;
  }
  return null;
}

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
    const runs = directChildren(p, "run");
    const content = idx < items.length ? items[idx] : "";
    const prefix = getKoreanPrefix(idx);
    const text = `  ${prefix}. ${content}`;
    if (runs.length > 0) {
      setRunText(runs[0], text);
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

function setupCell(
  tc: Element,
  col: number,
  row: number,
  rowSpan: number,
  colSpan: number,
  text: string
) {
  let addr = firstDirectChild(tc, "cellAddr");
  if (!addr) {
    addr = tc.ownerDocument.createElementNS(HP_NS, "hp:cellAddr");
    tc.insertBefore(addr, tc.firstChild);
  }
  addr.setAttribute("colAddr", String(col));
  addr.setAttribute("rowAddr", String(row));

  let span = firstDirectChild(tc, "cellSpan");
  if (!span) {
    span = tc.ownerDocument.createElementNS(HP_NS, "hp:cellSpan");
    tc.insertBefore(span, addr.nextSibling);
  }
  span.setAttribute("colSpan", String(colSpan));
  span.setAttribute("rowSpan", String(rowSpan));

  forceFillCellMultiline(tc, text);
}

function fillRubricTable(
  ctx: FillCtx,
  rubricTableId: string,
  perf: FinalPreviewPerformanceDetail
) {
  const tbl = findTableById(ctx.doc, rubricTableId);
  if (!tbl) {
    ctx.warnings.push(`루브릭 표(id=${rubricTableId})를 템플릿에서 찾지 못했습니다.`);
    return;
  }

  // Iterate over the exact full rubric array from finalPreviewData
  const rubric = perf.rubric || perf.rubrics || [];
  if (rubric.length === 0) {
    return;
  }

  const trList = directChildren(tbl, "tr");
  if (trList.length === 0) return;

  const headerTr = trList[0];

  // Find prototypes for 3-cell row (col 0, 1, 2) and 2-cell row (col 1, 2)
  let proto3CellRow: Element | null = null;
  let proto2CellRow: Element | null = null;

  for (let i = 1; i < trList.length; i++) {
    const tcs = directChildren(trList[i], "tc");
    if (tcs.length === 3 && !proto3CellRow) {
      proto3CellRow = trList[i].cloneNode(true) as Element;
    } else if (tcs.length === 2 && !proto2CellRow) {
      proto2CellRow = trList[i].cloneNode(true) as Element;
    }
  }

  if (!proto3CellRow) {
    proto3CellRow = headerTr.cloneNode(true) as Element;
  }
  if (!proto2CellRow) {
    proto2CellRow = proto3CellRow.cloneNode(true) as Element;
    const tcs = directChildren(proto2CellRow, "tc");
    if (tcs.length === 3) {
      proto2CellRow.removeChild(tcs[0]);
    }
  }

  // Remove existing template data rows (all rows after header)
  for (let i = 1; i < trList.length; i++) {
    tbl.removeChild(trList[i]);
  }

  let currentRow = 1;
  // Strict iteration over every criterion in rubric without skipping or slicing
  for (let i = 0; i < rubric.length; i++) {
    const criterion = rubric[i];
    const levels = criterion.levels || [];
    const numLevels = Math.max(levels.length, 1);
    const maxScore = criterion.maxScore;

    for (let j = 0; j < numLevels; j++) {
      const lv = levels[j] || { score: 0, desc: "" };
      const scoreStr = lv.score !== undefined ? `${lv.score}` : "";

      if (j === 0) {
        // First level of criterion: 3 cells (평가요소, 점수, 채점기준)
        const rowEl = proto3CellRow.cloneNode(true) as Element;
        const tcs = directChildren(rowEl, "tc");
        if (tcs.length >= 3) {
          const nameText = maxScore ? `${criterion.name}\n(${maxScore}점)` : criterion.name;
          setupCell(tcs[0], 0, currentRow, numLevels, 1, nameText);
          setupCell(tcs[1], 1, currentRow, 1, 1, scoreStr);
          setupCell(tcs[2], 2, currentRow, 1, 1, lv.desc || "");
        }
        tbl.appendChild(rowEl);
      } else {
        // Subsequent levels of criterion: 2 cells (점수, 채점기준)
        const rowEl = proto2CellRow.cloneNode(true) as Element;
        const tcs = directChildren(rowEl, "tc");
        if (tcs.length >= 2) {
          setupCell(tcs[0], 1, currentRow, 1, 1, scoreStr);
          setupCell(tcs[1], 2, currentRow, 1, 1, lv.desc || "");
        }
        tbl.appendChild(rowEl);
      }
      currentRow++;
    }
  }

  tbl.setAttribute("rowCnt", String(currentRow));
}

function fillPerformanceBlock(
  ctx: FillCtx,
  headingP: Element | null | undefined,
  infoTableId: string,
  rubricTableId: string,
  perf: FinalPreviewPerformanceDetail
) {
  if (headingP) {
    if (!fillParagraphValue(headingP, perf.name)) {
      ctx.warnings.push(`"${perf.name}" 수행평가 제목 필드를 채우지 못했습니다.`);
    }
  } else if (headingP === null) {
    ctx.warnings.push(`"${perf.name}" 수행평가의 제목 문단을 찾지 못했습니다.`);
  }

  fillAt(ctx, infoTableId, 1, 0, perf.achievementStandards, true);
  forceFillAt(ctx, infoTableId, 1, 1, perf.taskFlow);
  forceFillAt(ctx, infoTableId, 1, 2, perf.aiUsagePolicy);

  // Fill rubric table completely without truncating or skipping any criteria or levels
  fillRubricTable(ctx, rubricTableId, perf);
}

let cloneIdCounter = 1_700_000_000 + Math.floor(Math.random() * 50_000_000);
function nextCloneId(): string {
  cloneIdCounter += 1;
  return String(cloneIdCounter);
}

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
  fillParagraphValue(newHeadingP, name);
  for (const run of headingRuns) {
    const t = firstDirectChild(run, "t");
    if (t && /^\s*[가-힣]\.\s*$/.test(t.textContent || "")) {
      t.textContent = ` ${koreanPrefix}. `;
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

  void ctx;
  return { infoTableId: newInfoId, rubricTableId: newRubricId };
}

/**
 * Main export function: Takes the FinalPreviewData and writes it 1:1 into the HWPX template.
 */
export async function fillHwpxTemplate(
  templateBuffer: ArrayBuffer,
  previewData: FinalPreviewData
): Promise<HwpxFillResult> {
  // Pre-flight consistency validation
  const validation = validateFinalPreviewData(previewData);
  if (!validation.valid) {
    console.error("[HWPX 검증 오류] 미리보기 데이터와 불일치하는 항목이 발견되었습니다:", validation.errors);
  }

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

  const ctx: FillCtx = { doc, warnings: [] };
  const is1st = previewData.semesterAchievementLevels.isFirstGrade;
  const is3Tier = previewData.semesterAchievementLevels.isThreeTier;

  // 1. 과목명 (5곳: 제목 + 3개 섹션 제목 + 본문 문장 1곳)
  fillAllFieldsByDirection(ctx, "과목명", previewData.basicInfo.subjectName || "과목명");

  // 2. 기본정보 표 ("1766096127")
  fillAt(ctx, "1766096127", 0, 1, previewData.basicInfo.schoolName);
  fillAt(ctx, "1766096127", 1, 1, previewData.basicInfo.grade);
  fillAt(ctx, "1766096127", 2, 1, previewData.basicInfo.credit);
  fillAt(ctx, "1766096127", 3, 1, previewData.basicInfo.gradeType);
  fillAt(ctx, "1766096127", 4, 1, previewData.basicInfo.classDays);
  fillAt(ctx, "1766096127", 5, 1, previewData.basicInfo.teacher);

  // 3. 평가 목적 및 방침 (가/나/다/라 문단)
  fillPolicyItems(
    ctx,
    previewData.evaluationPolicy.items.map((i) => i.text)
  );

  // 4. 평가 개요 표 ("1766096129")
  const OV = "1766096129";
  fillAt(ctx, OV, 1, 1, `${previewData.evaluationOverview.examRatio}`);
  fillAt(ctx, OV, 7, 1, `${previewData.evaluationOverview.performanceRatio}`);

  const midExam = previewData.evaluationOverview.regularExams.find((e) => e.id === "midterm");
  const finalExam = previewData.evaluationOverview.regularExams.find((e) => e.id === "final");
  const perf1Ov = previewData.evaluationOverview.performanceAssessments.find((p) => p.num === 1);
  const perf2Ov = previewData.evaluationOverview.performanceAssessments.find((p) => p.num === 2);

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
  overwriteAt(ctx, OV, 1, 11, previewData.evaluationOverview.splitTypeExam || "고정/추정");
  overwriteAt(ctx, OV, 7, 11, previewData.evaluationOverview.splitTypePerf || "고정/추정");

  // 5. 성취율표 (3종류 중 해당하는 것만 남기고 나머지는 표 전체 삭제)
  const keepScaleId = pickVariant(is1st, is3Tier, {
    first: ACHIEVEMENT_SCALE_TABLE_IDS.fiveTierFirstGrade,
    regular: ACHIEVEMENT_SCALE_TABLE_IDS.fiveTierRegular,
    three: ACHIEVEMENT_SCALE_TABLE_IDS.threeTier,
  });
  removeUnusedVariants(ctx, ACHIEVEMENT_SCALE_TABLE_IDS, keepScaleId);
  removeParagraphsMatching(ctx, (t) => /※\s*그\s*외\s*\(/.test(t));

  // 6. 수행평가 세부계획
  const perfCount = previewData.performanceAssessments.length;
  const clonedBlocks: { infoTableId: string; rubricTableId: string; perf: FinalPreviewPerformanceDetail }[] = [];
  let lastRubricId = "2076274870";
  for (let num = 3; num <= Math.min(perfCount, 4); num++) {
    const perfDetail = previewData.performanceAssessments[num - 1];
    if (!perfDetail) break;
    const clone = cloneAndInsertPerformanceBlock(ctx, lastRubricId, perfDetail.prefix, perfDetail.name);
    if (!clone) {
      ctx.warnings.push(`수행평가 ${num}번째 블록 복제에 실패해 출력에서 빠졌습니다.`);
      break;
    }
    clonedBlocks.push({ ...clone, perf: perfDetail });
    lastRubricId = clone.rubricTableId;
  }

  const perf1Detail = previewData.performanceAssessments[0];
  if (perf1Detail) {
    const perf1TableInfo = findTableById(ctx.doc, "1766096131");
    const perf1Heading = perf1TableInfo && previousBodyParagraph(closestHostParagraph(perf1TableInfo)!);
    fillPerformanceBlock(ctx, perf1Heading || null, "1766096131", "1766096132", perf1Detail);
  }

  const perf2Detail = previewData.performanceAssessments[1];
  if (perf2Detail) {
    const perf2TableInfo = findTableById(ctx.doc, "2076274869");
    const perf2Heading = perf2TableInfo && previousBodyParagraph(closestHostParagraph(perf2TableInfo)!);
    fillPerformanceBlock(ctx, perf2Heading || null, "2076274869", "2076274870", perf2Detail);
  }

  for (const clone of clonedBlocks) {
    fillPerformanceBlock(ctx, undefined, clone.infoTableId, clone.rubricTableId, clone.perf);
  }

  // 7. 20주 진도표 (행/서식은 그대로, 빈 칸만 채움)
  const WK = "2085219916";
  previewData.weeklyPlan.slice(0, 20).forEach((wk, idx) => {
    const row = idx + 1;
    fillAt(ctx, WK, 1, row, wk.hours || "");
    fillAt(ctx, WK, 2, row, wk.topic, true);
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

  const levels = previewData.semesterAchievementLevels.levels;
  levels.forEach((lvl, idx) => {
    fillAt(ctx, keepLevelId, 1, idx + 1, lvl.description || "", true);
  });
  if (keepLevelId === SEMESTER_LEVEL_TABLE_IDS.fiveTierFirstGrade && previewData.semesterAchievementLevels.minCompetency) {
    fillAt(ctx, keepLevelId, 0, 7, previewData.semesterAchievementLevels.minCompetency, true);
  }

  // 9. 최종 루브릭 데이터 완전성 검증 (Strict Validation)
  // 미리보기의 마지막 평가요소명, 마지막 점수, 마지막 채점기준 문장이 HWPX 문서 내에 존재하는지 반드시 확인
  const allTextNodes = Array.from(doc.getElementsByTagNameNS(HP_NS, "t"))
    .map((t) => t.textContent || "")
    .join(" ");
  const normalize = (s: string) => s.replace(/\s+/g, "").trim();
  const normalizedDocText = normalize(allTextNodes);

  for (const perf of previewData.performanceAssessments) {
    const rubric = perf.rubric || perf.rubrics || [];
    if (rubric.length > 0) {
      const lastCriterion = rubric[rubric.length - 1];
      const lastCriterionName = (lastCriterion.name || "").trim();
      const levels = lastCriterion.levels || [];
      if (levels.length > 0) {
        const lastLevel = levels[levels.length - 1];
        const lastScore = String(lastLevel.score);
        const lastDesc = (lastLevel.desc || "").trim();

        const hasName = !lastCriterionName || normalizedDocText.includes(normalize(lastCriterionName));
        const hasScore = !lastScore || normalizedDocText.includes(normalize(lastScore));
        const hasDesc = !lastDesc || normalizedDocText.includes(normalize(lastDesc));

        if (!hasName || !hasScore || !hasDesc) {
          const missingItems: string[] = [];
          if (!hasName) missingItems.push(`마지막 평가요소명("${lastCriterionName}")`);
          if (!hasScore) missingItems.push(`마지막 점수("${lastScore}")`);
          if (!hasDesc) missingItems.push(`마지막 채점기준 문장("${lastDesc.slice(0, 30)}...")`);

          throw new Error(
            `[HWPX 출력 실패 - 루브릭 검증 미통과] 수행평가 "${perf.name}"의 필수 루브릭 항목 중 [${missingItems.join(", ")}]이(가) HWPX 문서에서 확인되지 않았습니다. 출력을 중단합니다.`
          );
        }
      }
    }
  }

  const serializer = new XMLSerializer();
  const newXml = serializer.serializeToString(doc);
  zip.file("Contents/section0.xml", newXml, { compression: "DEFLATE" });

  // ★ 전체 HWPX 글자/문단 속성 정규화 (모든 내용 작성이 끝난 뒤, ZIP 생성 직전 단 한 번)
  const typographyReport = await normalizeHwpxTypography(zip);
  if (typographyReport.headerFilesFound === 0) {
    ctx.warnings.push(
      "HWPX 헤더 스타일 정의 파일(header.xml)을 찾지 못해 자간/장평/줄간격 정규화를 적용하지 못했습니다."
    );
  }
  ctx.warnings.push(...typographyReport.warnings);

  const outBlob = await zip.generateAsync({
    type: "blob",
    mimeType: "application/hwp+zip",
    compression: "STORE",
  });

  const cleanSubject = (previewData.basicInfo.subjectName || "교과").replace(/[\s/]/g, "_");
  const filename = `${previewData.basicInfo.yearSemester}_${cleanSubject}_교수학습및평가운영계획.hwpx`;

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
