import React, { useState, useEffect } from "react";
import { PlanData, ScheduleItem } from "../types";
import {
  CALENDAR_BLOCKED_DATES,
  KOREAN_WEEKDAYS,
  WEEKDAY_SUBSTITUTIONS,
} from "../constants";
import {
  getExpandedStdText,
  getAchievementStandardsWithText,
  expandRangeCodes,
  formatStdCodesForDisplay,
  sortAchievementStandardCodes,
  getUnitTitlesForStandards,
} from "../utils/hwpParser";
import { getOverlappingPerformancesForWeek, getOverlappingRegularExamForWeek, formatDateRangeDisplay, checkPerformanceWeekOverlap } from "../utils/dateUtils";
import { generateWithGemini } from "../utils/geminiApi";
import { Sparkles, Plus, Trash2, BookOpen, Loader2, Calendar, CheckCircle2, RotateCw, AlertTriangle } from "lucide-react";

interface ParsedWeekDetail {
  coreIdea: string;
  coreQuestions: string[];
  coreConcept: string;
  inquiryActivity: string;
  formativeAssessment: string;
  feedbackStrategy: string;
  individualStrategy: string;
  perfContent: string;
  perfDirectives: string;
}

// Helper to extract bracketed sections preserving multiple questions
function parseWeekDetailSections(rawText: string): ParsedWeekDetail {
  const result: ParsedWeekDetail = {
    coreIdea: "",
    coreQuestions: [],
    coreConcept: "",
    inquiryActivity: "",
    formativeAssessment: "",
    feedbackStrategy: "",
    individualStrategy: "",
    perfContent: "",
    perfDirectives: "",
  };

  if (!rawText) return result;

  const regex = /\[(핵심\s*아이디어|핵심개념|핵심질문|수행평가\s*내용|수행평가|수행지시어|탐구\s*활동|학습\s*활동|수업\s*활동|형성\s*평가|형성평가|피드백\s*전략|피드백|학생\s*맞춤형\s*개별화\s*전략|개별화\s*전략|개별화)\]([\s\S]*?)(?=\[(?:핵심\s*아이디어|핵심개념|핵심질문|수행평가\s*내용|수행평가|수행지시어|탐구\s*활동|학습\s*활동|수업\s*활동|형성\s*평가|형성평가|피드백\s*전략|피드백|학생\s*맞춤형\s*개별화\s*전략|개별화\s*전략|개별화)\]|$)/g;

  let match;
  while ((match = regex.exec(rawText)) !== null) {
    const rawTag = match[1].replace(/\s+/g, "");
    const body = match[2].trim();

    if (rawTag === "핵심아이디어") {
      result.coreIdea = body;
    } else if (rawTag === "핵심질문") {
      if (body) result.coreQuestions.push(body);
    } else if (rawTag === "핵심개념") {
      result.coreConcept = body;
    } else if (rawTag === "탐구활동" || rawTag === "학습활동" || rawTag === "수업활동") {
      result.inquiryActivity = body;
    } else if (rawTag === "형성평가") {
      result.formativeAssessment = body;
    } else if (rawTag === "피드백전략" || rawTag === "피드백") {
      result.feedbackStrategy = body;
    } else if (rawTag === "학생맞춤형개별화전략" || rawTag === "개별화전략" || rawTag === "개별화") {
      result.individualStrategy = body;
    } else if (rawTag === "수행평가내용" || rawTag === "수행평가") {
      result.perfContent = body;
    } else if (rawTag === "수행지시어") {
      result.perfDirectives = body;
    }
  }

  return result;
}

// Backward-compatible parseSections
function parseSections(text: string) {
  const parsed = parseWeekDetailSections(text);
  return {
    "핵심아이디어": parsed.coreIdea,
    "핵심질문": parsed.coreQuestions.join("\n\n"),
    "핵심개념": parsed.coreConcept,
    "탐구활동": parsed.inquiryActivity,
    "형성평가": parsed.formativeAssessment,
    "피드백전략": parsed.feedbackStrategy,
    "학생맞춤형개별화전략": parsed.individualStrategy,
    "수행평가내용": parsed.perfContent,
    "수행지시어": parsed.perfDirectives,
  };
}

// Helper to format bulleted lines cleanly under an explicit section
function formatBulletItems(content: string, tagToClean?: string): string {
  if (!content) return "";
  let clean = content.trim();
  if (tagToClean) {
    const cleanRegex = new RegExp(`^(\\[${tagToClean}\\]|-?\\s*\\[${tagToClean}\\])\\s*`, "i");
    clean = clean.replace(cleanRegex, "").trim();
  }
  const lines = clean.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  const formatted = lines.map((line) => {
    if (line.startsWith("-") || line.startsWith("•") || /^\d+[\.\)]/.test(line)) {
      return line;
    }
    return `- ${line}`;
  });
  return formatted.join("\n");
}

// Helper to extract core idea from existing topic string
export function extractCoreIdea(topic: string): string {
  if (!topic) return "";
  const ideaSplitRegex = /\[핵심\s*아이디어\]/i;
  if (ideaSplitRegex.test(topic)) {
    return topic.split(ideaSplitRegex)[1].trim();
  }
  return "";
}

// Helper to extract base topic/unit without [핵심 아이디어]
export function extractBaseTopic(topic: string): string {
  if (!topic) return "";
  const ideaSplitRegex = /\[핵심\s*아이디어\]/i;
  if (ideaSplitRegex.test(topic)) {
    return topic.split(ideaSplitRegex)[0].trim();
  }
  return topic.trim();
}

// Function to safely inject or update [핵심 아이디어] in topic column while preserving base unit name
export function updateTopicWithIdea(existingTopic: string, newIdea: string): string {
  const cleanIdea = newIdea.trim();
  if (!cleanIdea) return existingTopic;

  const ideaSplitRegex = /\[핵심\s*아이디어\]/i;
  let baseTopic = "";
  if (ideaSplitRegex.test(existingTopic)) {
    baseTopic = existingTopic.split(ideaSplitRegex)[0].trim();
  } else {
    baseTopic = existingTopic.trim();
  }

  if (baseTopic && baseTopic !== "-") {
    return `${baseTopic}\n\n[핵심 아이디어]\n${cleanIdea}`;
  }
  return `[핵심 아이디어]\n${cleanIdea}`;
}

// Function to migrate any misplaced [핵심 아이디어] from detail into topic
export function migrateScheduleItem(item: ScheduleItem): { item: ScheduleItem; changed: boolean } {
  const detail = item.detail || "";
  const ideaRegex = /\[핵심\s*아이디어\]([\s\S]*?)(?=\[(?:핵심\s*아이디어|핵심개념|핵심질문|수행평가\s*내용|수행평가|수행지시어)\]|$)/i;
  const match = detail.match(ideaRegex);

  if (!match) {
    return { item, changed: false };
  }

  const ideaContent = match[1].trim();
  const cleanDetail = detail
    .replace(ideaRegex, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  let newTopic = item.topic || "";
  if (ideaContent) {
    newTopic = updateTopicWithIdea(newTopic, ideaContent);
  }

  return {
    item: {
      ...item,
      topic: newTopic,
      detail: cleanDetail,
    },
    changed: true,
  };
}

// Helper to build default or updated performance detail text for a week with [수행평가 내용] and [수행지시어]
export function buildDefaultPerfWeekDetail(
  matchedPerfs: ReturnType<typeof getOverlappingPerformancesForWeek>,
  data: PlanData
): string {
  if (!matchedPerfs || matchedPerfs.length === 0) return "";

  const perf = matchedPerfs[0];
  const perfName = perf.name || "";
  const flow = perf.flow || "";
  const method = perf.method || "";

  let summary = "";
  if (flow && flow.trim() && flow !== "-") {
    const cleanedSteps = flow
      .split(/(?:\d+\)|단계\s*\d*[:\.]?|\n|-)/)
      .map((s) => s.trim())
      .filter((s) => s.length > 2);

    if (cleanedSteps.length > 0) {
      summary = `${cleanedSteps.slice(0, 4).join(" → ")} 과정을 단계별로 수행하고 탐구 결과를 종합 분석하여 보고서로 작성함.`;
    }
  }

  if (!summary) {
    if (perfName.includes("분자") || perfName.includes("입체 구조")) {
      summary = "분자의 3차원 입체 구조를 모델링하고 결합의 극성과 분자의 기하학적 대칭성을 종합하여 극성 유무 및 물리적 성질과의 관계를 분석한 보고서를 작성한다.";
    } else if (perfName.includes("중화") || perfName.includes("농도") || perfName.includes("적정")) {
      summary = "중화 반응의 양적 관계와 적정 원리를 바탕으로 표준용액을 활용한 실험을 정밀하게 수행하고 미지 농도를 산출 및 오차를 분석하여 보고서로 작성한다.";
    } else {
      summary = `${perfName || "수행평가"} 과제를 단계별로 수행하여 관련 개념을 적용하고 탐구 결과를 분석하여 정리한다.`;
    }
  }

  // Action verbs based on method & performance
  let selectedVerbs = ["모델링하다", "분석하다", "추론하다", "설명하다"];
  if (method.includes("실험") || method.includes("탐구") || perfName.includes("실험") || perfName.includes("적정")) {
    selectedVerbs = ["설계하다", "측정하다", "계산하다", "분석하다", "도출하다", "설명하다"];
  } else if (method.includes("서술") || method.includes("논술") || perfName.includes("보고서")) {
    selectedVerbs = ["모델링하다", "분석하다", "추론하다", "설명하다"];
  }

  const parts: string[] = [];
  parts.push(`[수행평가 내용]\n${summary}`);
  parts.push(`[수행지시어]\n${selectedVerbs.join(", ")}`);

  return parts.join("\n\n");
}

// Helper to build default formative assessment detail for pre-performance week
export function buildDefaultFormativeWeekDetail(
  upcomingPerf: MatchedPerfItem | undefined,
  data: PlanData,
  isEven = false
): string {
  const perfName = upcomingPerf?.name || `수행평가 ${upcomingPerf?.perfIndex || ""}`.trim();
  const parts: string[] = [];

  parts.push(`[핵심질문]\n다음 주 실시될 [${perfName}]의 성공적 수행과 성취기준 도달을 위해 학습한 핵심 개념과 원리를 어떻게 종합하고 점검할 것인가?`);
  if (isEven) {
    parts.push(`[핵심개념]\n관련 단원 주요 개념 원리 및 형성평가 점검 요소`);
  }

  parts.push(`[형성평가]\n- 다음 주 [${perfName}] 대비 사전 실험 절차 및 핵심 탐구 요소를 점검하는 모의 탐구 활동을 수행함.`);
  parts.push(`[피드백 전략]\n- 성취기준 핵심 개념 형성평가 문항을 풀이하고 오개념 진단 체크리스트를 통한 교사 즉각 피드백을 제공함.`);
  parts.push(`[학생 맞춤형 개별화 전략]\n- 탐구 설계 및 계산에 어려움이 있는 학생에게 단계별 힌트 카드 및 동료 멘토링을 지원함.`);
  parts.push(`[수행지시어]\n비교하다, 유추하다, 적용하다, 확인하다`);

  return parts.join("\n\n");
}

export interface MatchedPerfItem {
  perfIndex: number;
  name: string;
  startDate: string;
  endDate: string;
  period: string;
  std: string;
  flow: string;
  ai: string;
  method: string;
  rubricCriteria: any[];
}

// Helper to identify performance weeks and their preceding formative assessment weeks
export function getScheduleAssessmentContext(
  schedules: ScheduleItem[],
  data: PlanData
): {
  formativeWeekIndices: Set<number>;
  formativeNextPerfMap: Map<number, MatchedPerfItem>;
  perfWeekIndicesMap: Map<number, number>;
} {
  const perfWeekIndicesMap = new Map<number, number>();
  const formativeWeekIndices = new Set<number>();
  const formativeNextPerfMap = new Map<number, MatchedPerfItem>();

  const maxPerf = data.perfCount || 0;
  for (let pIdx = 1; pIdx <= maxPerf; pIdx++) {
    const startDate = String(data[`perf${pIdx}StartDate` as keyof PlanData] || "");
    const endDate = String(data[`perf${pIdx}EndDate` as keyof PlanData] || "");
    if (!startDate && !endDate) continue;

    const name = String(data[`perf${pIdx}Name` as keyof PlanData] || `수행평가 ${pIdx}`);
    const period = String(data[`perf${pIdx}Period` as keyof PlanData] || "");
    const std = String(data[`perf${pIdx}Std` as keyof PlanData] || "");
    const flow = String(data[`perf${pIdx}Flow` as keyof PlanData] || "");
    const ai = String(data[`perf${pIdx}Ai` as keyof PlanData] || "");
    const method = String(data[`perf${pIdx}Method` as keyof PlanData] || "");
    const rubricCriteria = (data[`perf${pIdx}RubricCriteria` as keyof PlanData] as any[]) || [];

    const perfItem: MatchedPerfItem = {
      perfIndex: pIdx,
      name,
      startDate,
      endDate,
      period,
      std,
      flow,
      ai,
      method,
      rubricCriteria,
    };

    for (let wIdx = 0; wIdx < schedules.length; wIdx++) {
      if (checkPerformanceWeekOverlap(schedules[wIdx].weekDate, startDate, endDate)) {
        if (!perfWeekIndicesMap.has(pIdx)) {
          perfWeekIndicesMap.set(pIdx, wIdx);
          if (wIdx > 0) {
            formativeWeekIndices.add(wIdx - 1);
            formativeNextPerfMap.set(wIdx - 1, perfItem);
          }
        }
      }
    }
  }

  return { formativeWeekIndices, formativeNextPerfMap, perfWeekIndicesMap };
}

// Helper to determine the week indices for regular exams
export function getExamWeekIndices(
  schedules: ScheduleItem[],
  data: PlanData
): {
  midExamWeekIndex: number | null;
  finalExamWeekIndex: number | null;
} {
  let midExamWeekIndex: number | null = null;
  let finalExamWeekIndex: number | null = null;

  for (let idx = 0; idx < schedules.length; idx++) {
    const item = schedules[idx];
    if (item.weekDate) {
      const exam = getOverlappingRegularExamForWeek(item.weekDate, data);
      if (exam) {
        if (exam.type === "mid" && midExamWeekIndex === null) {
          midExamWeekIndex = idx;
        } else if (exam.type === "final" && finalExamWeekIndex === null) {
          finalExamWeekIndex = idx;
        }
      }
    }
  }

  // If midterm exam week wasn't found by exact overlap, search by midStartDate
  if (midExamWeekIndex === null && data.midStartDate) {
    for (let idx = 0; idx < schedules.length; idx++) {
      const parts = (schedules[idx].weekDate || "").split("~");
      if (parts[0] && parts[0].includes(".")) {
        const match = parts[0].match(/(\d+)\.(\d+)/);
        if (match) {
          const m = parseInt(match[1], 10);
          const d = parseInt(match[2], 10);
          const [midY, midM, midD] = data.midStartDate.split("-").map(Number);
          if (m === midM && Math.abs(d - midD) <= 6) {
            midExamWeekIndex = idx;
            break;
          }
        }
      }
    }
  }

  // If final exam week wasn't found by exact overlap, search by finalStartDate
  if (finalExamWeekIndex === null && data.finalStartDate) {
    for (let idx = 0; idx < schedules.length; idx++) {
      const parts = (schedules[idx].weekDate || "").split("~");
      if (parts[0] && parts[0].includes(".")) {
        const match = parts[0].match(/(\d+)\.(\d+)/);
        if (match) {
          const m = parseInt(match[1], 10);
          const d = parseInt(match[2], 10);
          const [finY, finM, finD] = data.finalStartDate.split("-").map(Number);
          if (m === finM && Math.abs(d - finD) <= 6) {
            finalExamWeekIndex = idx;
            break;
          }
        }
      }
    }
  }

  // Fallback: if midterm exam week still not determined, default to 7th week (idx: 6)
  if (midExamWeekIndex === null) {
    midExamWeekIndex = Math.min(6, Math.max(0, Math.floor(schedules.length / 2) - 1));
  }

  // Fallback: if final exam week still not determined, default to second-to-last week
  if (finalExamWeekIndex === null) {
    finalExamWeekIndex = Math.max((midExamWeekIndex ?? 6) + 1, schedules.length - 2);
  }

  return { midExamWeekIndex, finalExamWeekIndex };
}

// Automatic achievement standard distribution algorithm:
// Priority 1: Actual regular exam weeks -> Full exam standards (code only, range-abbreviated)
// Priority 2: Performance assessment weeks -> Performance-specific selected standards
// Priority 3: General lesson & formative assessment weeks -> Sequentially allocated midterm/final standards
export function computeDistributedStandards(
  schedules: ScheduleItem[],
  data: PlanData
): string[] {
  const result: string[] = new Array(schedules.length).fill("");

  const midCodes = expandRangeCodes(data.midStd || "");
  sortAchievementStandardCodes(midCodes);

  const finalCodes = expandRangeCodes(data.finalStd || "");
  sortAchievementStandardCodes(finalCodes);

  const { midExamWeekIndex, finalExamWeekIndex } = getExamWeekIndices(schedules, data);

  // Identify which weeks are actual regular exam weeks and which are performance assessment weeks
  const actualExamWeekMap = new Map<number, { type: "mid" | "final"; std?: string }>();
  const perfWeekStandardsMap = new Map<number, string[]>();

  schedules.forEach((item, idx) => {
    if (item.weekDate) {
      const examInfo = getOverlappingRegularExamForWeek(item.weekDate, data);
      if (examInfo) {
        actualExamWeekMap.set(idx, { type: examInfo.type, std: examInfo.std });
      } else {
        const perfs = getOverlappingPerformancesForWeek(item.weekDate, data);
        if (perfs.length > 0) {
          const perfRaw = perfs.map((p) => p.std).filter(Boolean).join(", ");
          const pCodes = expandRangeCodes(perfRaw);
          sortAchievementStandardCodes(pCodes);
          if (pCodes.length > 0) {
            perfWeekStandardsMap.set(idx, pCodes);
          }
        }
      }
    }
  });

  // [규칙 1] 중간시험 성취기준 배분:
  // 학기 시작부터 「실제 중간시험 실시 전」까지의 수업 주차에 성취기준 코드 순서대로 차례대로 배분
  const preMidGeneralIndices: number[] = [];
  const midExamCutoff = midExamWeekIndex !== null ? midExamWeekIndex : Math.min(6, schedules.length);
  for (let idx = 0; idx < midExamCutoff; idx++) {
    if (!actualExamWeekMap.has(idx)) {
      preMidGeneralIndices.push(idx);
    }
  }

  if (midCodes.length > 0 && preMidGeneralIndices.length > 0) {
    const N = preMidGeneralIndices.length;
    const K = midCodes.length;
    preMidGeneralIndices.forEach((wIdx, pos) => {
      const startIdx = Math.floor((pos * K) / N);
      const endIdx = Math.max(startIdx, Math.floor(((pos + 1) * K) / N) - 1);
      const assigned = midCodes.slice(startIdx, Math.min(K, endIdx + 1));
      if (assigned.length > 0) {
        result[wIdx] = assigned.map((c) => `[${c}]`).join(", ");
      }
    });
  }

  // [규칙 2] 기말시험 성취기준 배분:
  // 실제 중간시험 이후 수업 주차부터 「실제 기말시험 실시 전」까지 차례대로 배분
  const postMidGeneralIndices: number[] = [];
  const finExamCutoff = finalExamWeekIndex !== null ? finalExamWeekIndex : schedules.length;
  for (let idx = midExamCutoff + 1; idx < finExamCutoff; idx++) {
    if (!actualExamWeekMap.has(idx)) {
      postMidGeneralIndices.push(idx);
    }
  }

  if (finalCodes.length > 0 && postMidGeneralIndices.length > 0) {
    const N = postMidGeneralIndices.length;
    const K = finalCodes.length;
    postMidGeneralIndices.forEach((wIdx, pos) => {
      const startIdx = Math.floor((pos * K) / N);
      const endIdx = Math.max(startIdx, Math.floor(((pos + 1) * K) / N) - 1);
      const assigned = finalCodes.slice(startIdx, Math.min(K, endIdx + 1));
      if (assigned.length > 0) {
        result[wIdx] = assigned.map((c) => `[${c}]`).join(", ");
      }
    });
  }

  // 기말시험 이후 주차 (예: 20주차)
  if (finalCodes.length > 0 && finalExamWeekIndex !== null) {
    for (let idx = finalExamWeekIndex + 1; idx < schedules.length; idx++) {
      if (!actualExamWeekMap.has(idx) && !result[idx]) {
        result[idx] = `[${finalCodes[finalCodes.length - 1]}]`;
      }
    }
  }

  // [규칙 3 (2순위)] 수행평가 실시 주차: 해당 수행평가 계획에서 선택한 성취기준을 최우선 적용
  perfWeekStandardsMap.forEach((pCodes, wIdx) => {
    result[wIdx] = pCodes.map((c) => `[${c}]`).join(", ");
  });

  // [규칙 4 (1순위)] 실제 중간/기말시험 실시 주차: 해당 시험 성취기준 전체를 범위 축약 코드만 표시
  actualExamWeekMap.forEach((exam, wIdx) => {
    if (exam.type === "mid") {
      result[wIdx] = formatStdCodesForDisplay(data.midStd || exam.std || "");
    } else {
      result[wIdx] = formatStdCodesForDisplay(data.finalStd || exam.std || "");
    }
  });

  // 안전장치: 성취기준 칸에 빈칸이나 "-"가 남지 않도록 보완
  schedules.forEach((item, idx) => {
    if (!result[idx] || !result[idx].trim()) {
      if (item.std && item.std.trim() && item.std.trim() !== "-") {
        result[idx] = item.std.trim();
      } else if (idx <= midExamCutoff && midCodes.length > 0) {
        result[idx] = `[${midCodes[0]}]`;
      } else if (finalCodes.length > 0) {
        result[idx] = `[${finalCodes[0]}]`;
      }
    }
  });

  return result;
}

// Function to auto-sync schedule items with exam standards (mid/final), performance assessments, and pre-performance formative assessments
export function syncScheduleWithPerformances(
  schedules: ScheduleItem[],
  data: PlanData
): { schedules: ScheduleItem[]; changed: boolean } {
  let changed = false;

  const { midExamWeekIndex } = getExamWeekIndices(schedules, data);
  const { formativeWeekIndices, formativeNextPerfMap } = getScheduleAssessmentContext(schedules, data);
  const distributedStandards = computeDistributedStandards(schedules, data);

  const newSchedules = schedules.map((item, idx) => {
    // 1. Run migration for core idea first
    const migRes = migrateScheduleItem(item);
    let curItem = migRes.item;
    if (migRes.changed) {
      changed = true;
    }

    // [우선순위 1] 실제 중간/기말시험 실시 주차 확인
    const actualExamInfo = curItem.weekDate
      ? getOverlappingRegularExamForWeek(curItem.weekDate, data)
      : null;

    if (actualExamInfo) {
      const examType = actualExamInfo.type === "mid" ? "정기시험(중간시험)" : "정기시험(기말시험)";
      const examStd = distributedStandards[idx] || (actualExamInfo.type === "mid"
        ? formatStdCodesForDisplay(data.midStd || actualExamInfo.std || "")
        : formatStdCodesForDisplay(data.finalStd || actualExamInfo.std || ""));

      const normCurType = (curItem.type || "").trim();
      const normCurTopic = (curItem.topic || "").trim();
      const normCurDetail = (curItem.detail || "").trim();
      const normCurStd = (curItem.std || "").trim();

      if (
        normCurType !== examType ||
        normCurTopic !== "-" ||
        normCurDetail !== "-" ||
        normCurStd !== examStd
      ) {
        changed = true;
      }

      return {
        ...curItem,
        type: examType,
        topic: "-",
        detail: "-",
        std: examStd,
      };
    }

    // 2. 일반 수업 주차 (실제 시험 주차가 아닌 주차)
    // A. 기본 정기시험 평가유형 결정
    // midExamWeekIndex 이전 주차: "정기시험(중간시험)"
    // midExamWeekIndex 이후 주차: "정기시험(기말시험)"
    const isBeforeMidExam = midExamWeekIndex !== null ? idx < midExamWeekIndex : idx < 7;
    const baseRegularExamType = isBeforeMidExam ? "정기시험(중간시험)" : "정기시험(기말시험)";

    // B. 수행평가 실시 여부 확인
    const matchedPerfs = curItem.weekDate
      ? getOverlappingPerformancesForWeek(curItem.weekDate, data)
      : [];
    const isPerfWeek = matchedPerfs.length > 0;

    // C. 형성평가 주차 (수행평가 실시 바로 전 주) 여부 확인
    const isFormativeWeek = !isPerfWeek && formativeWeekIndices.has(idx);

    // D. 최종 평가 유형 결정
    let expectedType = baseRegularExamType;
    if (isPerfWeek) {
      expectedType = `${baseRegularExamType}, 수행평가`;
    } else if (isFormativeWeek) {
      expectedType = `${baseRegularExamType}, 형성평가`;
    }

    if ((curItem.type || "").trim() !== expectedType.trim()) {
      changed = true;
      curItem = { ...curItem, type: expectedType };
    }

    // E. 성취기준 자동 배분 반영 (우선순위 2 & 3)
    const expectedStd = distributedStandards[idx];
    if (expectedStd && (curItem.std || "").trim() !== expectedStd.trim()) {
      changed = true;
      curItem = { ...curItem, std: expectedStd };
    }

    // E-2. 단원명(주제) 자동 연결 (공식 교육과정 기반)
    const effectiveStd = curItem.std || expectedStd || "";
    const officialUnitTitles = getUnitTitlesForStandards(
      effectiveStd,
      data.curriculumFullText,
      data.curriculumSubjects,
      data.curriculumSelectedOriginalIdx
    );
    const officialBaseTopic = officialUnitTitles.join("\n").trim();
    const existingIdea = extractCoreIdea(curItem.topic || "");

    let expectedTopic = curItem.topic || "";
    if (officialBaseTopic) {
      if (existingIdea) {
        expectedTopic = `${officialBaseTopic}\n\n[핵심 아이디어]\n${existingIdea}`;
      } else {
        expectedTopic = officialBaseTopic;
      }
    } else {
      // If official curriculum title cannot be found (e.g. no HWP or standard not in HWP)
      // Clean up any residual unit titles from previous subject (e.g. Chemistry sample text if subject is not Chemistry)
      const curTopic = curItem.topic || "";
      const baseTopic = curTopic.split(/\[핵심\s*아이디어\]/i)[0].trim();
      const isChemistryResidual =
        (baseTopic.includes("물질의 상태") || baseTopic.includes("기체와 액체") || baseTopic.includes("반응엔탈피") || baseTopic.includes("화학 평형")) &&
        data.subjectName &&
        !data.subjectName.includes("화학");

      if (isChemistryResidual) {
        expectedTopic = existingIdea ? `[핵심 아이디어]\n${existingIdea}` : "";
      }
    }

    if ((curItem.topic || "").trim() !== expectedTopic.trim()) {
      changed = true;
      curItem = { ...curItem, topic: expectedTopic };
    }

    // F. 수업 세부 방법 (detail) 정리
    let updatedDetail = curItem.detail || "";
    if (isPerfWeek) {
      // 수행평가 실시 주차:
      // - 핵심질문, 핵심개념, 일반 수업 방법, AI 활용 방안 등 제외
      // - 오직 [수행평가 내용]과 [수행지시어]만 포함
      const hasCoreQuestion = updatedDetail.includes("[핵심질문]") || updatedDetail.includes("[핵심개념]");
      const hasPerfContent = updatedDetail.includes("[수행평가 내용]") || updatedDetail.includes("[수행평가]");
      const hasDirective = updatedDetail.includes("[수행지시어]");

      if (hasCoreQuestion || !hasPerfContent || !hasDirective || !updatedDetail.trim()) {
        const cleanPerfDetail = buildDefaultPerfWeekDetail(matchedPerfs, data);
        if (cleanPerfDetail !== updatedDetail) {
          updatedDetail = cleanPerfDetail;
          changed = true;
        }
      }
    } else {
      // 일반 수업 주차 및 형성평가 주차:
      // 혹시 남아있을 수 있는 잘못된 [수행평가 주간의 수업 세부 방법]이나 ■ [수행평가...] 잔재 정리
      if (
        updatedDetail.includes("■ [수행평가") ||
        updatedDetail.includes("■[수행평가") ||
        updatedDetail.includes("[수행평가 주간") ||
        updatedDetail.includes("[AI 활용 방안]")
      ) {
        let cleaned = updatedDetail
          .replace(/\[수행평가\s*주간의\s*수업\s*세부\s*방법\]\s*/gi, "")
          .replace(/■\s*\[수행평가\s*\d*\][^\n]*\n(?:-\s*[^\n]*\n?)*(?:\[AI\s*활용\s*방안\]\s*\n?(?:-\s*[^\n]*\n?)*)?/gi, "")
          .replace(/\n{3,}/g, "\n\n")
          .trim();

        const weekNum = idx + 1;
        const isEven = weekNum % 2 === 0;

        if (isFormativeWeek) {
          const upcoming = formativeNextPerfMap.get(idx);
          cleaned = buildDefaultFormativeWeekDetail(upcoming, data, isEven);
        } else if (!cleaned.includes("[핵심질문]") && !cleaned.includes("[핵심개념]")) {
          cleaned = `[핵심질문]\n성취기준 도달을 위한 탐구 및 평가 활동을 통해 무엇을 설명할 수 있는가?${isEven ? `\n\n[핵심개념]\n주요 학습 원리 및 핵심 개념` : ""}`;
        }

        if (cleaned !== updatedDetail) {
          updatedDetail = cleaned;
          changed = true;
        }
      }
    }

    return {
      ...curItem,
      detail: updatedDetail,
    };
  });

  return { schedules: newSchedules, changed };
}

interface Step4WeeklyScheduleProps {
  data: PlanData;
  onChange: (updater: (prev: PlanData) => PlanData) => void;
  onOpenStdModal: (weekIndex: number) => void;
  showToast: (msg: string) => void;
}

export const Step4WeeklySchedule: React.FC<Step4WeeklyScheduleProps> = ({
  data,
  onChange,
  onOpenStdModal,
  showToast,
}) => {
  const [detailLoading, setDetailLoading] = useState<Record<number, boolean>>({});
  const [allLoading, setAllLoading] = useState<boolean>(false);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);

  // Helper: parse class schedule string "2A(월6, 화5, 수7, 목5)"
  const parseClassSchedule = (str: string) => {
    if (!str) return null;
    const m = str.match(/^(\d+)[^(]*\(([^)]*)\)/);
    if (!m) return null;
    const grade = parseInt(m[1], 10);
    const weekdays = new Set<string>();
    m[2].split(",").forEach((token) => {
      const t = token.trim();
      if (t.length > 0 && KOREAN_WEEKDAYS.includes(t[0])) weekdays.add(t[0]);
    });
    if (weekdays.size === 0) return null;
    return { grade, weekdays };
  };

  // Helper: get base hours for a week given date range and grade/weekdays
  const computeBaseHoursForWeek = (
    weekDateStr: string,
    grade: number,
    weekdays: Set<string>
  ): number => {
    if (!weekDateStr) return weekdays.size;

    const parts = weekDateStr.split("~").map((s) => s.trim());
    if (parts.length < 2) return weekdays.size;

    const startMatch = parts[0].match(/(\d+)\.(\d+)/);
    const endMatch = parts[1].match(/(\d+)\.(\d+)/);
    if (!startMatch || !endMatch) return weekdays.size;

    const startM = parseInt(startMatch[1], 10);
    const startD = parseInt(startMatch[2], 10);
    const endM = parseInt(endMatch[1], 10);
    const endD = parseInt(endMatch[2], 10);

    const year = 2026;
    const startDate = new Date(year, startM - 1, startD);
    const endDate = new Date(year, endM - 1, endD);

    if (endDate < startDate) {
      endDate.setFullYear(year + 1);
    }

    let count = 0;
    const cur = new Date(startDate);
    while (cur <= endDate) {
      const m = cur.getMonth() + 1;
      const d = cur.getDate();
      const dateKey = `${m}.${d}.`;
      const dayOfWeekIdx = cur.getDay();

      const koreanDayNames = ["일", "월", "화", "수", "목", "금", "토"];
      const effectiveDay = WEEKDAY_SUBSTITUTIONS[dateKey] || koreanDayNames[dayOfWeekIdx];

      const isBlocked =
        CALENDAR_BLOCKED_DATES[dateKey] &&
        (CALENDAR_BLOCKED_DATES[dateKey].grades.includes("all") ||
          CALENDAR_BLOCKED_DATES[dateKey].grades.includes(grade));

      if (weekdays.has(effectiveDay) && !isBlocked) {
        count++;
      }
      cur.setDate(cur.getDate() + 1);
    }
    return count;
  };

  // Recompute all hours and cumulative
  const recomputeAllHours = () => {
    const classInfo = parseClassSchedule(data.classSchedule);
    if (!classInfo) {
      showToast("시간표 형식을 확인할 수 없어 기본 시수를 유지합니다.");
      return;
    }

    let runningSum = 0;
    const updated = data.schedules.map((item) => {
      const calcHours = computeBaseHoursForWeek(item.weekDate, classInfo.grade, classInfo.weekdays);
      runningSum += calcHours;
      return {
        ...item,
        hours: String(calcHours),
        cumulative: runningSum,
      };
    });

    onChange((prev) => ({ ...prev, schedules: updated }));
    showToast("모든 주차의 시수와 누계가 재계산되었습니다.");
  };

  // Auto-migrate misplaced [핵심 아이디어] and auto-sync exam standards (mid/final) & performance assessments
  useEffect(() => {
    const { schedules: syncedSchedules, changed } = syncScheduleWithPerformances(data.schedules, data);
    if (changed) {
      onChange((prev) => ({ ...prev, schedules: syncedSchedules }));
    }
  }, [
    data.schedules,
    data.midStd,
    data.finalStd,
    data.midStartDate,
    data.midEndDate,
    data.finalStartDate,
    data.finalEndDate,
    data.examCount,
    data.perfCount,
    data.perf1Name,
    data.perf1StartDate,
    data.perf1EndDate,
    data.perf1Std,
    data.perf1Flow,
    data.perf1Method,
    data.perf2Name,
    data.perf2StartDate,
    data.perf2EndDate,
    data.perf2Std,
    data.perf2Flow,
    data.perf2Method,
    data.perf3Name,
    data.perf3StartDate,
    data.perf3EndDate,
    data.perf3Std,
    data.perf3Flow,
    data.perf3Method,
    data.perf4Name,
    data.perf4StartDate,
    data.perf4EndDate,
    data.perf4Std,
    data.perf4Flow,
    data.perf4Method,
    data.curriculumFullText,
    data.curriculumSubjects,
    data.curriculumSelectedOriginalIdx,
    data.subjectName,
    onChange,
  ]);

  // Helper to determine week number (1-based)
  const getWeekNumber = (idx: number, weekLabel?: string): number => {
    const str = weekLabel || data.schedules[idx]?.weekLabel || "";
    const m = str.match(/(\d+)/);
    if (m) {
      return parseInt(m[1], 10);
    }
    return idx + 1;
  };

  // Check if any schedule already has AI generated content
  const hasExistingAiContent = (): boolean => {
    return data.schedules.some((s) => {
      const topicHasIdea = /\[핵심\s*아이디어\]/i.test(s.topic || "");
      const detailHasSections =
        /\[핵심질문\]/i.test(s.detail || "") ||
        /\[핵심개념\]/i.test(s.detail || "") ||
        /\[수행지시어\]/i.test(s.detail || "") ||
        /■\s*\[수행평가/i.test(s.detail || "");
      return topicHasIdea || detailHasSections;
    });
  };

  // Batch Multi-Week AI Generator function
  const generateBatchWeeksContent = async (
    itemsWithIdx: { idx: number; item: ScheduleItem }[]
  ): Promise<Record<number, { topic: string; detail: string }>> => {
    const { formativeWeekIndices, formativeNextPerfMap } = getScheduleAssessmentContext(data.schedules, data);

    const weekBlocksPrompt = itemsWithIdx
      .map(({ idx, item }) => {
        const weekNum = getWeekNumber(idx, item.weekLabel);
        const isEven = weekNum % 2 === 0;
        const overlappingPerfs = item.weekDate ? getOverlappingPerformancesForWeek(item.weekDate, data) : [];
        const isPerfWeek = overlappingPerfs.length > 0;
        const isFormativeWeek = !isPerfWeek && formativeWeekIndices.has(idx);
        const upcomingPerf = formativeNextPerfMap.get(idx);

        let weekTypeDesc = `[일반 수업 주간] (${isEven ? "짝수주: 성취기준별 핵심질문(각 하위 학습활동 포함), 핵심개념, 탐구활동, 피드백 전략, 학생 맞춤형 개별화 전략 포함" : "홀수주: 성취기준별 핵심질문(각 하위 학습활동 포함), 탐구활동, 피드백 전략, 학생 맞춤형 개별화 전략 포함 / 핵심개념 제외"})`;
        if (isPerfWeek) {
          weekTypeDesc = `[수행평가 실시 주간] (평가명: ${overlappingPerfs.map((p) => p.name).join(", ")} / ★핵심질문·핵심개념 제외하고 [수행평가 내용]과 [수행지시어]만 작성)`;
        } else if (isFormativeWeek && upcomingPerf) {
          weekTypeDesc = `[형성평가 주간 - 다음 주 수행평가 대비] (다음 주 평가명: ${upcomingPerf.name}, 흐름: ${upcomingPerf.flow} / 핵심질문, ${isEven ? "핵심개념, " : ""}형성평가, 피드백 전략, 학생 맞춤형 개별화 전략, 수행지시어 포함)`;
        }

        const rawTopic = extractBaseTopic(item.topic || "");

        // Extract structured achievement standards with code & full text
        const stdItems = getAchievementStandardsWithText(
          item.std,
          data.curriculumFullText,
          data.curriculumSubjects,
          data.curriculumSelectedOriginalIdx
        );

        // Requirement 8: Warn in console if topic name might conflict with achievement standards
        if (rawTopic && stdItems.length > 0) {
          console.warn("주차 단원명과 성취기준의 내용 불일치 가능성 검토:", {
            week: weekNum,
            topic: rawTopic,
            standards: stdItems.map((s) => `[${s.code}] ${s.text}`),
          });
        }

        const stdLines =
          stdItems.length > 0
            ? stdItems
                .map((s, sIdx) => `  [성취기준 ${sIdx + 1}] 코드: [${s.code}], 원문: "${s.text}"`)
                .join("\n")
            : `  [성취기준] 코드: ${item.std || "미지정"}`;

        return `<<<WEEK_${weekNum}>>>
- 주차 번호 (weekNumber): ${weekNum}주차 (${item.weekLabel})
- 주간 유형: ${weekTypeDesc}
- 단원/주제 참고: ${rawTopic || "미지정"} (※ 단원명과 성취기준 원문이 상충될 경우 무조건 성취기준 원문이 최우선)
- 배정된 성취기준 원문 (achievementStandards - ★수업 설계의 유일하고 절대적인 내용 근거):
${stdLines}
<<<END_WEEK_${weekNum}>>>`;
      })
      .join("\n\n");

    const prompt = `너는 대한민국 2022 개정 교육과정 기반 고등학교 수업 및 평가 설계 전문가야.
오직 아래 주차별로 제공된 [배정된 성취기준 원문]만을 단독 내용 근거로 삼아, 각 주차의 [핵심 아이디어]와 [평가와 연계한 수업 세부 방법]을 작성해줘.

★ [가장 중요한 원칙 - 성취기준 최우선 원칙] ★
각 주차의 수업 세부 방법은 반드시 「그 주차에 배정된 성취기준 코드 + 성취기준 원문」을 유일한 출발점으로 작성해야 합니다.
생성 순서: 현재 주차 성취기준 확인 → 성취기준 원문의 핵심 학습목표 분석 → 그 성취기준에 맞는 핵심질문 생성 → 그 성취기준을 달성하기 위한 학생 활동 생성 → 그 활동에 대한 피드백 전략 생성 → 탐구활동/개별화 전략 생성.

1. 성취기준이 모든 내용의 최우선 기준:
   - 첨부 예시 계획서나 다른 단원, 과거 작성 내용, 이전 교육과정의 수업 내용(예: 화학의 경우 성취기준과 무관한 반응속도, 엔탈피, 몰농도, 화학평형 등의 개념)을 절대 가져오지 마세요.
   - 오직 해당 주차의 성취기준 원문에 기재된 학습목표, 핵심 개념, 용어, 행동 동사만을 꼼꼼히 분석하여 수업과 탐구, 피드백을 설계해야 합니다.
   - 단원명이나 외부 지식보다 성취기준 원문이 항상 우선합니다.

2. 성취기준별 핵심질문 (1:1 대응 원칙):
   - 해당 주차에 배정된 성취기준이 1개이면 -> [핵심질문] 1개 작성
   - 해당 주차에 배정된 성취기준이 2개이면 -> [핵심질문] 2개 작성
   - 해당 주차에 배정된 성취기준이 3개이면 -> [핵심질문] 3개 작성
   - 각 질문은 반드시 해당 성취기준 원문에서 직접 도출하고, 여러 성취기준을 하나의 질문으로 합치지 마세요.
   - 각 [핵심질문] 바로 아래에는 해당 성취기준을 실제로 달성하기 위한 구체적인 학생 학습활동을 1~2개 (- 로 시작) 작성하세요. 성취기준 원문의 동사(예: 추론하다, 모형으로 나타내다, 계산하다, 비교하다, 예측하다 등)를 적극 활용하세요.

3. [피드백 전략]도 성취기준 기반 작성:
   - 일반적인 상투적 문장("추가 자료 제공", "피드백 제공")을 반복하지 마세요.
   - 현재 주차 성취기준 개념 학습이나 탐구 활동 과정에서 학생이 어려워하거나 혼동할 수 있는 구체적인 오개념, 오류, 취약 지점을 명시하고 즉각적인 교사 피드백 환류 방안을 작성 (- 로 시작).

4. [학생 맞춤형 개별화 전략]도 성취기준 기반 작성:
   - 단순히 "추가 자료 제공"만 반복하지 말고, 현재 성취기준을 학습하기 어려운 학생에게 실질적으로 도움이 되는 방식(단계별 계산 자료, 구조 모형 자료, 시각화 자료, 개념 확인 문제, 심화 탐구 문제 등)으로 성취기준에 맞춤 작성 (- 로 시작).

5. [핵심개념] 격주 작성 원칙:
   - 짝수 주차(2, 4, 6, 8...): [핵심개념] 항목 작성 (성취기준에서 도출된 핵심 용어 2~4개 쉼표 구분)
   - 홀수 주차(1, 3, 5, 7...): [핵심개념] 항목을 작성하지 않고 생략

6. [수행평가 실시 주간] 및 [형성평가 주간]:
   - [수행평가 실시 주간]: 핵심질문, 핵심개념은 제외하고 [수행평가 내용]과 [수행지시어]만 작성.
   - [형성평가 주간 - 수행평가 전주]: 다음 주 수행평가 성공적 완수를 위한 사전 점검 주간으로, [핵심질문], (짝수주인 경우 [핵심개념]), [형성평가], [피드백 전략], [학생 맞춤형 개별화 전략], [수행지시어] 작성.

[과목명]
${data.subjectName || "과목"}

[주차별 요청 목록]
${weekBlocksPrompt}

[출력 형식 예시]

<<<WEEK_1>>> (※ 홀수주 일반 수업 / 성취기준 1개 예시)
[핵심 아이디어]
원자의 전자 배치와 오비탈 구조는 주기율과 화학 결합의 성질을 결정한다.

[핵심질문]
공유 전자쌍과 비공유 전자쌍의 배치는 분자의 구조에 어떤 영향을 미칠까?
- 원자와 분자를 루이스 전자점식으로 표현하기
- 전자쌍 반발 이론을 이용하여 분자의 입체 구조 추론하기

[탐구활동]
- 여러 분자의 전자쌍 배치와 입체 구조의 관계를 분자 모형으로 비교·분석함.

[피드백 전략]
- 전자쌍 수와 분자 구조를 연결하는 과정에서 나타나는 오개념을 확인하고 개별 피드백 제공함.

[학생 맞춤형 개별화 전략]
- 구조 추론이 어려운 학생에게 전자쌍 배치 모형 및 시각화 카드를 단계적으로 제공함.
<<<END_WEEK_1>>>

<<<WEEK_2>>> (※ 짝수주 일반 수업 / 성취기준 2개 예시)
[핵심 아이디어]
분자의 구조와 결합의 극성은 물질의 물리적 성질과 분자 간 인력을 결정한다.

[핵심질문]
분자의 입체 구조와 대칭성은 분자의 극성 유무를 어떻게 결정하는가?
- 분자의 결합 극성과 입체 구조를 결합하여 분자의 쌍극자 모멘트 유무 판단하기
- 무극성 분자와 극성 분자의 구조적 특징 비교하기

[핵심질문]
분자 사이에 작용하는 인력의 종류는 물질의 끓는점과 어떤 상관관계를 가지는가?
- 분자량과 극성에 따른 분산력 및 쌍극자-쌍극자 힘의 크기 비교하기
- 다양한 물질의 끓는점 데이터를 분석하여 분자 간 힘의 세기 추론하기

[핵심개념]
결합의 극성, 쌍극자 모멘트, 분산력, 수소 결합

[탐구활동]
- 분자 모형 프로그램과 물질 데이터 시트를 활용하여 구조에 따른 분자 간 인력과 끓는점의 관계를 도출함.

[피드백 전략]
- 결합의 극성과 분자의 극성을 혼동하는 학생에게 벡터 합 개념을 적용한 개별 첨삭 피드백을 실시함.

[학생 맞춤형 개별화 전략]
- 분자 구조 공간 지각이 미흡한 학생에게 3D 분자 모형 교구를 제공하고, 심화 학생에게는 수소 결합의 비정상적 끓는점 해석 과제를 부여함.
<<<END_WEEK_2>>>

<<<WEEK_3>>> (※ 수행평가 전주 형성평가 주간 예시)
[핵심 아이디어]
화학 반응에서 물질의 양적 관계와 농도는 반응의 효율성을 결정한다.

[핵심질문]
다음 주 실시될 중화 적정 수행평가에 대비하여 표준용액 조제 및 중화 반응의 양적 관계를 어떻게 점검할 것인가?
- 표준용액 제조 절차 및 몰농도 계산 점검하기

[형성평가]
- 다음 주 실시될 [수행평가 2: 중화 적정]에 대비하여 표준용액 제조 절차 및 양적 관계(nV=n'V') 계산을 모의 점검함.

[피드백 전략]
- 실험 기구(뷰렛, 피펫)의 조작법 및 종말점 변색 판정 기준에 대한 자기 점검 체크리스트를 실시하고 교사 피드백을 제공함.

[학생 맞춤형 개별화 전략]
- 농도 환산 및 적정 공식 적용이 미숙한 학생에게 단계별 힌트 시트를 제공함.

[수행지시어]
비교하다, 유추하다, 적용하다, 확인하다
<<<END_WEEK_3>>>

<<<WEEK_4>>> (※ 수행평가 실시 주간 예시)
[핵심 아이디어]
분자의 기하학적 구조와 전하 분포는 물질의 화학적·물리적 성질을 지배한다.

[수행평가 내용]
분자의 3차원 입체 구조를 모델링하고 결합의 극성과 분자의 기하학적 대칭성을 종합하여 극성 유무 및 물리적 성질과의 관계를 분석한 보고서를 작성한다.

[수행지시어]
모델링하다, 분석하다, 추론하다, 설명하다
<<<END_WEEK_4>>>

(위와 동일하게 각 주차별 <<<WEEK_번호>>> ... <<<END_WEEK_번호>>> 태그로 정확히 감싸서 출력)`;

    const results: Record<number, { topic: string; detail: string }> = {};

    try {
      const generated = await generateWithGemini({ prompt });

      itemsWithIdx.forEach(({ idx, item }) => {
        const weekNum = getWeekNumber(idx, item.weekLabel);
        const isEven = weekNum % 2 === 0;
        const overlappingPerfs = item.weekDate ? getOverlappingPerformancesForWeek(item.weekDate, data) : [];
        const isPerfWeek = overlappingPerfs.length > 0;
        const isFormativeWeek = !isPerfWeek && formativeWeekIndices.has(idx);
        const upcomingPerf = formativeNextPerfMap.get(idx);

        const stdItems = getAchievementStandardsWithText(
          item.std,
          data.curriculumFullText,
          data.curriculumSubjects,
          data.curriculumSelectedOriginalIdx
        );

        const weekTagRegex = new RegExp(`<<<WEEK_${weekNum}>>>([\\s\\S]*?)<<<END_WEEK_${weekNum}>>>`, "i");
        const match = generated.match(weekTagRegex);
        const weekContent = match ? match[1].trim() : "";

        if (weekContent) {
          const parsed = parseWeekDetailSections(weekContent);
          const generatedIdea = parsed.coreIdea || "";

          let updatedTopic = item.topic || "";
          if (generatedIdea) {
            updatedTopic = updateTopicWithIdea(updatedTopic, generatedIdea);
          }

          const parts: string[] = [];

          if (isPerfWeek) {
            // [수행평가 실시 주간]: 핵심질문/개념 제외, 수행평가 내용 + 수행지시어만 포함
            let perfSummary = parsed.perfContent;
            if (!perfSummary) {
              const defaultPerfDetail = buildDefaultPerfWeekDetail(overlappingPerfs, data);
              const matchSummary = defaultPerfDetail.match(/\[수행평가 내용\]([\s\S]*?)(?=\[수행지시어\]|$)/i);
              perfSummary = matchSummary
                ? matchSummary[1].trim()
                : `${overlappingPerfs[0]?.name || "수행평가"} 과제를 단계별로 수행하고 결과를 분석하여 보고서로 작성한다.`;
            }
            parts.push(`[수행평가 내용]\n${perfSummary}`);

            const actionVerbs = parsed.perfDirectives || "모델링하다, 분석하다, 추론하다, 설명하다";
            parts.push(`[수행지시어]\n${actionVerbs}`);
          } else if (isFormativeWeek) {
            // [형성평가 주간]: 핵심질문 + (짝수주 핵심개념) + 형성평가 + 피드백 전략 + 학생 맞춤형 개별화 전략 + 수행지시어
            if (parsed.coreQuestions.length > 0) {
              parsed.coreQuestions.forEach((q) => {
                parts.push(`[핵심질문]\n${q}`);
              });
            } else {
              parts.push(`[핵심질문]\n다음 주 실시될 수행평가의 성공적 수행과 성취기준 도달을 위해 핵심 개념과 원리를 어떻게 점검할 것인가?`);
            }

            if (isEven) {
              if (parsed.coreConcept) {
                parts.push(`[핵심개념]\n${parsed.coreConcept}`);
              } else {
                parts.push(`[핵심개념]\n관련 단원 주요 개념 및 형성평가 점검 요소`);
              }
            }

            const formativeContent = parsed.formativeAssessment || parsed.inquiryActivity;
            if (formativeContent) {
              parts.push(`[형성평가]\n${formatBulletItems(formativeContent, "형성평가")}`);
            }

            if (parsed.feedbackStrategy) {
              parts.push(`[피드백 전략]\n${formatBulletItems(parsed.feedbackStrategy, "피드백")}`);
            }

            if (parsed.individualStrategy) {
              parts.push(`[학생 맞춤형 개별화 전략]\n${formatBulletItems(parsed.individualStrategy, "개별화")}`);
            }

            const actionVerbs = parsed.perfDirectives || "비교하다, 유추하다, 적용하다, 확인하다";
            parts.push(`[수행지시어]\n${actionVerbs}`);
          } else {
            // [일반 수업 주간]:
            // 1. 성취기준별 핵심질문들 (각 핵심질문 아래 학생 활동 목록 포함)
            if (parsed.coreQuestions.length > 0) {
              parsed.coreQuestions.forEach((q) => {
                parts.push(`[핵심질문]\n${q}`);
              });
            } else {
              if (stdItems.length > 0) {
                stdItems.forEach((std) => {
                  parts.push(
                    `[핵심질문]\n[${std.code}] 성취기준 도달을 위해 주요 개념과 원리를 어떻게 탐구하고 설명할 수 있는가?\n- 성취기준 관련 개념 탐구 및 자료 분석하기`
                  );
                });
              } else {
                parts.push(`[핵심질문]\n성취기준 도달을 위한 탐구 활동을 통해 주요 개념과 원리를 어떻게 도출하고 설명할 수 있는가?\n- 단원 핵심 탐구 및 모둠별 분석 활동 수행하기`);
              }
            }

            // 2. 짝수주 핵심개념
            if (isEven) {
              if (parsed.coreConcept) {
                parts.push(`[핵심개념]\n${parsed.coreConcept}`);
              } else {
                parts.push(`[핵심개념]\n관련 단원의 주요 개념 및 원리`);
              }
            }

            // 3. 탐구활동 (필요 시)
            if (parsed.inquiryActivity) {
              parts.push(`[탐구활동]\n${formatBulletItems(parsed.inquiryActivity, "탐구활동")}`);
            }

            // 4. 피드백 전략 (성취기준 기반)
            if (parsed.feedbackStrategy) {
              parts.push(`[피드백 전략]\n${formatBulletItems(parsed.feedbackStrategy, "피드백")}`);
            }

            // 5. 학생 맞춤형 개별화 전략 (성취기준 기반)
            if (parsed.individualStrategy) {
              parts.push(`[학생 맞춤형 개별화 전략]\n${formatBulletItems(parsed.individualStrategy, "개별화")}`);
            }
          }

          const updatedDetail = parts.join("\n\n");
          results[idx] = { topic: updatedTopic, detail: updatedDetail };
        } else {
          // Fallback if parsing specific week tag failed
          let fallbackDetail = "";
          if (isPerfWeek) {
            fallbackDetail = buildDefaultPerfWeekDetail(overlappingPerfs, data);
          } else if (isFormativeWeek) {
            fallbackDetail = buildDefaultFormativeWeekDetail(upcomingPerf, data, isEven);
          } else {
            const fallbackQuestions =
              stdItems.length > 0
                ? stdItems
                    .map(
                      (std) =>
                        `[핵심질문]\n[${std.code}] 성취기준 도달을 위해 주요 개념과 원리를 어떻게 탐구하고 설명할 수 있는가?\n- ${std.text.slice(0, 30)} 관련 탐구 활동 수행하기`
                    )
                    .join("\n\n")
                : `[핵심질문]\n성취기준 도달을 위한 핵심 탐구 질문\n- 성취기준 관련 개념 탐구 활동 및 모둠별 데이터 분석을 수행함.`;

            fallbackDetail = `${fallbackQuestions}${isEven ? `\n\n[핵심개념]\n단원 핵심 개념 및 원리` : ""}\n\n[피드백 전략]\n- 성취기준 관련 오개념 점검 및 맞춤형 피드백을 제공함.\n\n[학생 맞춤형 개별화 전략]\n- 개별 맞춤형 보조자료 및 힌트 카드를 지원함.`;
          }
          results[idx] = {
            topic: item.topic || "",
            detail: fallbackDetail,
          };
        }
      });
    } catch (err) {
      console.error("Batch Gemini generation error:", err);
      throw err;
    }

    return results;
  };

  // Run full batch generation for all 1~20 weeks (in smart chunks of 4-5 weeks to prevent rate limits)
  const runAllAiGeneration = async () => {
    setAllLoading(true);
    setBatchProgress(null);
    showToast("전체 주차 AI 작성을 시작합니다...");

    try {
      const updatedSchedules = [...data.schedules];
      // Progress denominator is always the full 1~20주 plan, never just the
      // subset that actually needs an AI call (exam weeks don't call AI but
      // still count as a processed week).
      const totalWeeks = updatedSchedules.length;

      // Separate actual exam weeks and active lesson weeks
      const activeWeeks: { idx: number; item: ScheduleItem }[] = [];
      let completedCount = 0;
      updatedSchedules.forEach((item, idx) => {
        const actualExam = item.weekDate ? getOverlappingRegularExamForWeek(item.weekDate, data) : null;
        if (actualExam) {
          // Rule for Actual Exam Week: topic: "-", detail: "-", type: examLabel, std: examStd (code-only range)
          const examStd = actualExam.std
            ? formatStdCodesForDisplay(actualExam.std)
            : (item.std ? formatStdCodesForDisplay(item.std) : "-");
          updatedSchedules[idx] = {
            ...updatedSchedules[idx],
            topic: "-",
            detail: "-",
            type: actualExam.label,
            std: examStd,
          };
          completedCount++;
          return;
        }

        const hours = parseInt(item.hours, 10) || 0;
        if (hours > 0) {
          activeWeeks.push({ idx, item: updatedSchedules[idx] });
        } else {
          // No hours assigned and not an exam week: nothing to generate,
          // but it's still a processed week for progress purposes.
          completedCount++;
        }
      });

      setBatchProgress({ current: completedCount, total: totalWeeks });

      if (activeWeeks.length === 0) {
        onChange((prev) => ({ ...prev, schedules: updatedSchedules }));
        showToast("정기시험 주차 외에 시수가 배정된 일반 수업 주차가 없습니다.");
        setAllLoading(false);
        setBatchProgress(null);
        return;
      }

      // Chunk into groups of 4 weeks (ensuring at most 4-5 API calls for 20 weeks)
      const chunkSize = 4;
      const chunks: { idx: number; item: ScheduleItem }[][] = [];
      for (let i = 0; i < activeWeeks.length; i += chunkSize) {
        chunks.push(activeWeeks.slice(i, i + chunkSize));
      }

      for (let c = 0; c < chunks.length; c++) {
        const chunk = chunks[c];
        
        try {
          const chunkResults = await generateBatchWeeksContent(chunk);
          
          Object.entries(chunkResults).forEach(([idxStr, res]) => {
            const idx = parseInt(idxStr, 10);
            if (updatedSchedules[idx]) {
              updatedSchedules[idx] = {
                ...updatedSchedules[idx],
                topic: res.topic,
                detail: res.detail,
              };
              completedCount++;
            }
          });

          setBatchProgress({ current: completedCount, total: totalWeeks });
          // Progress state update in real-time
          onChange((prev) => ({ ...prev, schedules: [...updatedSchedules] }));

          // Gentle pause between chunks to stay well under RPM limits
          if (c < chunks.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 800));
          }
        } catch (chunkErr: any) {
          console.error(`Chunk ${c + 1} failed:`, chunkErr);
          // Apply fallback for failed chunk's performance weeks and formative weeks
          const { formativeWeekIndices, formativeNextPerfMap } = getScheduleAssessmentContext(data.schedules, data);
          chunk.forEach(({ idx, item }) => {
            const weekNum = getWeekNumber(idx, item.weekLabel);
            const isEven = weekNum % 2 === 0;
            const overlappingPerfs = item.weekDate ? getOverlappingPerformancesForWeek(item.weekDate, data) : [];
            const isFormative = formativeWeekIndices.has(idx);
            const upcoming = formativeNextPerfMap.get(idx);
            if (overlappingPerfs.length > 0 && !updatedSchedules[idx].detail) {
              updatedSchedules[idx] = {
                ...updatedSchedules[idx],
                detail: buildDefaultPerfWeekDetail(overlappingPerfs, data),
              };
            } else if (isFormative && !updatedSchedules[idx].detail) {
              updatedSchedules[idx] = {
                ...updatedSchedules[idx],
                detail: buildDefaultFormativeWeekDetail(upcoming, data, isEven),
              };
            }
          });
        }
      }

      onChange((prev) => ({ ...prev, schedules: updatedSchedules }));
      showToast(`전체 ${completedCount}개 주차의 AI 작성이 완료되었습니다.`);
    } catch (err: any) {
      console.error("All AI Generation Error:", err);
      showToast(`전체 AI 적용 오류: ${err.message || err}`);
    } finally {
      setAllLoading(false);
      setBatchProgress(null);
    }
  };

  // Trigger button click handler
  const handleAllAiButtonClick = () => {
    if (allLoading) return;

    if (hasExistingAiContent()) {
      setShowConfirmModal(true);
    } else {
      runAllAiGeneration();
    }
  };

  // Single Week Re-generate Handler
  const handleRegenerateSingleWeek = async (idx: number) => {
    const item = data.schedules[idx];

    // Check if actual regular exam week
    const actualExam = item.weekDate ? getOverlappingRegularExamForWeek(item.weekDate, data) : null;
    if (actualExam) {
      const examStd = actualExam.std
        ? formatStdCodesForDisplay(actualExam.std)
        : (item.std ? formatStdCodesForDisplay(item.std) : "-");
      const updated = [...data.schedules];
      updated[idx] = {
        ...updated[idx],
        topic: "-",
        detail: "-",
        type: actualExam.type === "mid" ? "정기시험(중간시험)" : "정기시험(기말시험)",
        std: examStd,
      };
      onChange((prev) => ({ ...prev, schedules: updated }));
      showToast(`${item.weekLabel}은 실제 정기시험(${actualExam.type === "mid" ? "중간시험" : "기말시험"}) 주차로 '-'가 적용되었습니다.`);
      return;
    }

    const hours = parseInt(item.hours, 10) || 0;
    if (hours <= 0) {
      showToast("시수가 0인 주차(휴업일/시험 등)에는 AI 작성을 진행하지 않습니다.");
      return;
    }

    setDetailLoading((prev) => ({ ...prev, [idx]: true }));
    try {
      const resMap = await generateBatchWeeksContent([{ idx, item }]);
      const res = resMap[idx];
      if (res) {
        const updated = [...data.schedules];
        updated[idx] = {
          ...updated[idx],
          topic: res.topic,
          detail: res.detail,
        };
        onChange((prev) => ({ ...prev, schedules: updated }));
        showToast(`${item.weekLabel} 다시 생성이 완료되었습니다.`);
      } else {
        showToast(`${item.weekLabel} 생성에 실패하였습니다.`);
      }
    } catch (err: any) {
      showToast(`오류 발생: ${err.message || err}`);
    } finally {
      setDetailLoading((prev) => ({ ...prev, [idx]: false }));
    }
  };

  const updateScheduleItem = (idx: number, field: keyof ScheduleItem, val: string) => {
    const updated = [...data.schedules];
    updated[idx] = { ...updated[idx], [field]: val };
    onChange((prev) => ({ ...prev, schedules: updated }));
  };

  const addScheduleRow = () => {
    const newIdx = data.schedules.length;
    const { midExamWeekIndex } = getExamWeekIndices(data.schedules, data);
    const isBeforeMid = midExamWeekIndex !== null ? newIdx < midExamWeekIndex : newIdx < 7;
    const defaultType = isBeforeMid ? "정기시험(중간시험)" : "정기시험(기말시험)";

    const newWeek: ScheduleItem = {
      weekLabel: `${newIdx + 1}주`,
      weekDate: "",
      weekEvent: "",
      hours: "4",
      topic: "신규 학습 주제",
      std: "",
      type: defaultType,
      detail: "[핵심질문]\n탐구 질문을 입력하세요.",
    };
    onChange((prev) => ({ ...prev, schedules: [...prev.schedules, newWeek] }));
  };

  const removeScheduleRow = (idx: number) => {
    onChange((prev) => ({ ...prev, schedules: prev.schedules.filter((_, i) => i !== idx) }));
  };

  return (
    <div className="space-y-5">
      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-5 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="font-bold text-slate-900 text-base">전체 AI 다시 생성 확인</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  기존에 작성된 진도/수업 AI 내용이 있습니다.<br />
                  <strong className="text-slate-800">전체 내용을 다시 생성하시겠습니까?</strong>
                </p>
                <p className="text-[11px] text-amber-700 mt-1 bg-amber-50 p-2 rounded border border-amber-200">
                  ※ 교사가 직접 수정한 [핵심 아이디어], [핵심질문/개념/지시어]가 새로 생성된 내용으로 덮어씌워집니다.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-all cursor-pointer"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowConfirmModal(false);
                  runAllAiGeneration();
                }}
                className="px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 shadow-md shadow-purple-600/20 transition-all cursor-pointer flex items-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5" /> 다시 생성하기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="border-b border-slate-200 pb-3 flex justify-between items-center gap-2">
        <div>
          <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">
              4
            </span>
            주차별 교수·학습 및 평가 계획
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            학기별 수업 흐름, 핵심질문, 피드백 및 개별화 전략을 설계합니다.
          </p>
        </div>
        <span className="text-xs bg-blue-50 text-blue-700 px-3 py-1 rounded-full border border-blue-200 font-medium whitespace-nowrap">
          4 / 5 단계
        </span>
      </div>

      {/* Compact Clean AI Action Bar */}
      <div className="bg-white border border-slate-200 rounded-lg p-3 sm:p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
        <div>
          <h3 className="text-xs sm:text-sm font-bold text-slate-800 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-purple-600" />
            <span>진도/수업 AI 작성</span>
          </h3>
          <p className="text-[11px] text-slate-500 mt-0.5">
            성취기준·시수·평가계획을 기준으로 1~20주를 자동 작성합니다.
          </p>
        </div>

        <button
          type="button"
          onClick={handleAllAiButtonClick}
          disabled={allLoading}
          className={`w-full sm:w-auto px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-lg font-bold text-xs shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer shrink-0 ${
            allLoading
              ? "bg-purple-400 text-purple-50 cursor-not-allowed"
              : "bg-purple-600 hover:bg-purple-700 text-white shadow-purple-600/20 active:scale-[0.98]"
          }`}
        >
          {allLoading ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>
                AI 작성 중... {batchProgress ? `${batchProgress.current}/${batchProgress.total}주` : ""}
              </span>
            </>
          ) : (
            <>
              <Sparkles className="w-3.5 h-3.5" />
              <span>✨ 전체 AI 작성</span>
            </>
          )}
        </button>
      </div>

      {/* Top Action Bar */}
      <div className="flex justify-between items-center flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-800">주차별 진도표 목록 ({data.schedules.length}주)</span>
          <button
            type="button"
            onClick={recomputeAllHours}
            className="text-[11px] text-blue-600 hover:underline font-medium cursor-pointer"
            title="기준학급 시간표에 맞춰 수업시수 재계산"
          >
            🔄 시수 재계산
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={addScheduleRow}
            className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded-md font-semibold flex items-center gap-1 shadow-xs cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" /> 주차 추가
          </button>
        </div>
      </div>

      {/* 수행평가 실시 일정 요약 배너 */}
      {data.perfCount > 0 && (
        <div className="bg-emerald-50/70 border border-emerald-200 rounded-lg p-2.5 text-xs text-emerald-900 space-y-1.5">
          <div className="font-bold flex items-center gap-1.5 text-emerald-950 text-[11px]">
            <Calendar className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
            <span>수행평가 실시 일정 연동 안내</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: data.perfCount }).map((_, i) => {
              const num = i + 1;
              const name = String(data[`perf${num}Name` as keyof PlanData] || `수행평가 ${num}`);
              const start = String(data[`perf${num}StartDate` as keyof PlanData] || "");
              const end = String(data[`perf${num}EndDate` as keyof PlanData] || "");
              const period = String(data[`perf${num}Period` as keyof PlanData] || "");

              return (
                <div
                  key={num}
                  className="bg-white border border-emerald-300 rounded px-2 py-1 text-[11px] flex items-center gap-1.5 shadow-xs"
                >
                  <span className="font-bold text-emerald-800">수행평가 {num}</span>
                  <span className="text-slate-600 truncate max-w-[140px]">{name}</span>
                  {period ? (
                    <span className="bg-emerald-100 text-emerald-900 px-1.5 py-0.2 rounded font-semibold text-[10px]">
                      {period}
                    </span>
                  ) : (
                    <span className="text-slate-400 text-[10px]">(시기 미지정)</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Weekly Schedule List */}
      <div className="space-y-3">
        {(() => {
          const { formativeWeekIndices, formativeNextPerfMap } = getScheduleAssessmentContext(data.schedules, data);

          return data.schedules.map((item, idx) => {
            const isDetailLoading = detailLoading[idx] || false;
            const weekNum = getWeekNumber(idx, item.weekLabel);
            const isOdd = weekNum % 2 === 1;
            const actualExamInfo = item.weekDate ? getOverlappingRegularExamForWeek(item.weekDate, data) : null;
            const isActualExamWeek = actualExamInfo !== null;
            const overlappingPerfs = !isActualExamWeek ? getOverlappingPerformancesForWeek(item.weekDate, data) : [];
            const isFormativeWeek = !isActualExamWeek && formativeWeekIndices.has(idx);
            const upcomingPerf = !isActualExamWeek ? formativeNextPerfMap.get(idx) : undefined;
            const hoursNum = parseInt(item.hours, 10) || 0;

            // Expand achievement standard code(s) to code + full curriculum text, or code-only for exam weeks
            let expandedStd = "";
            if (isActualExamWeek) {
              expandedStd = formatStdCodesForDisplay(item.std || actualExamInfo.std || "");
            } else {
              expandedStd = getExpandedStdText(
                item.std,
                data.curriculumFullText,
                data.curriculumSubjects,
                data.curriculumSelectedOriginalIdx
              ) || item.std || "";
            }
            const stdLineCount = expandedStd ? expandedStd.split("\n").length : 1;
            const stdRows = Math.max(2, Math.min(8, stdLineCount > 1 ? stdLineCount + 1 : 2));

            return (
              <div
                key={idx}
                className={`p-3 border rounded-lg space-y-2.5 text-xs shadow-xs relative transition-all ${
                  isActualExamWeek
                    ? "border-amber-300 bg-amber-50/20 ring-1 ring-amber-200"
                    : overlappingPerfs.length > 0
                    ? "border-emerald-300 bg-emerald-50/20 ring-1 ring-emerald-200"
                    : isFormativeWeek && upcomingPerf
                    ? "border-blue-300 bg-blue-50/15 ring-1 ring-blue-100"
                    : "border-slate-200 bg-white"
                }`}
              >
                <button
                  type="button"
                  onClick={() => removeScheduleRow(idx)}
                  className="absolute top-3 right-3 text-slate-400 hover:text-red-600 transition-colors cursor-pointer"
                  title="주차 삭제"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>

                {/* 실제 정기시험 실시 주간 감지 알림 배너 */}
                {isActualExamWeek && (
                  <div className="bg-amber-100/90 border border-amber-300/90 rounded-md px-2.5 py-1.5 flex items-center justify-between flex-wrap gap-2 text-amber-950 pr-8">
                    <div className="flex items-center gap-1.5 text-[11px] font-bold">
                      <Calendar className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                      <span>📝 실제 정기시험({actualExamInfo.type === "mid" ? "중간시험" : "기말시험"}) 실시 주간:</span>
                      <span className="font-medium text-amber-900">
                        성취기준 범위 코드만 표시 ([코드] 형태) · 수업 세부 방법 및 핵심 아이디어 생략 (-)
                      </span>
                    </div>
                    <span className="bg-amber-200 text-amber-900 text-[10px] px-2 py-0.5 rounded font-bold border border-amber-300">
                      {actualExamInfo.label}
                    </span>
                  </div>
                )}

                {/* 수행평가 실시 주간 감지 알림 배너 */}
                {!isActualExamWeek && overlappingPerfs.length > 0 && (
                  <div className="bg-emerald-100/90 border border-emerald-300/90 rounded-md px-2.5 py-1.5 flex items-center justify-between flex-wrap gap-2 text-emerald-950 pr-8">
                    <div className="flex items-center gap-1.5 text-[11px] font-bold">
                      <Calendar className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                      <span>🎯 수행평가 실시 주간:</span>
                      <div className="flex flex-wrap gap-1">
                        {overlappingPerfs.map((p) => (
                          <span
                            key={p.perfIndex}
                            className="bg-white text-emerald-900 border border-emerald-300 px-1.5 py-0.2 rounded font-semibold text-[10px]"
                          >
                            수행평가 {p.perfIndex} ({p.name || `수행평가 ${p.perfIndex}`}){p.period ? ` · ${p.period}` : ""}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      {overlappingPerfs.map((p) => {
                        const perfTag = `수행평가 ${p.perfIndex}`;
                        const isAlreadyTagged = item.type.includes(perfTag);
                        return (
                          <button
                            key={p.perfIndex}
                            type="button"
                            onClick={() => {
                              const currentType = item.type || "";
                              if (!isAlreadyTagged) {
                                const newType = currentType ? `${currentType}\n${perfTag}` : perfTag;
                                updateScheduleItem(idx, "type", newType);
                              }
                              if (p.std && !item.std) {
                                updateScheduleItem(idx, "std", p.std);
                              }
                              showToast(`${item.weekLabel}에 [수행평가 ${p.perfIndex}] 평가 유형이 설정되었습니다.`);
                            }}
                            className={`text-[10px] px-2 py-0.5 rounded font-bold border transition-all flex items-center gap-1 cursor-pointer ${
                              isAlreadyTagged
                                ? "bg-emerald-600 text-white border-emerald-700"
                                : "bg-white hover:bg-emerald-50 text-emerald-800 border-emerald-400"
                            }`}
                          >
                            {isAlreadyTagged ? (
                              <>
                                <CheckCircle2 className="w-3 h-3" /> 수행평가 {p.perfIndex} 적용됨
                              </>
                            ) : (
                              <>+ 수행평가 {p.perfIndex} 유형 적용</>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 형성평가 주간 감지 알림 배너 (수행평가 전주 자동 연동) */}
                {!isActualExamWeek && isFormativeWeek && upcomingPerf && overlappingPerfs.length === 0 && (
                  <div className="bg-blue-50/90 border border-blue-200 rounded-md px-2.5 py-1.5 flex items-center justify-between flex-wrap gap-2 text-blue-950 pr-8">
                    <div className="flex items-center gap-1.5 text-[11px] font-bold">
                      <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                      <span>📝 형성평가 주간 (수행평가 전주 자동 연동):</span>
                      <span className="font-medium text-blue-900">
                        다음 주 [수행평가 {upcomingPerf.perfIndex}: {upcomingPerf.name}] 대비 학습 점검 및 형성평가
                      </span>
                    </div>
                    <span className="bg-blue-100 text-blue-800 text-[10px] px-2 py-0.5 rounded font-semibold border border-blue-200">
                      평가 유형 자동 반영됨
                    </span>
                  </div>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pr-6">
                  <div>
                    <span className="text-[11px] text-slate-500 font-bold">주차</span>
                    <input
                      type="text"
                      value={item.weekLabel}
                      onChange={(e) => updateScheduleItem(idx, "weekLabel", e.target.value)}
                      className="w-full p-1.5 border rounded font-bold text-center border-slate-300 focus:ring-1 focus:ring-blue-500 outline-none"
                    />
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-500 font-bold">날짜</span>
                    <input
                      type="text"
                      value={item.weekDate}
                      onChange={(e) => updateScheduleItem(idx, "weekDate", e.target.value)}
                      placeholder="예: 9.1. ~ 9.4."
                      className="w-full p-1.5 border rounded border-slate-300 focus:ring-1 focus:ring-blue-500 outline-none font-medium"
                    />
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-500 font-bold">
                      시수 <span className="text-blue-600 font-normal">{item.weekDate ? "(자동계산)" : ""}</span>
                    </span>
                    <input
                      type="text"
                      value={item.hours}
                      onChange={(e) => updateScheduleItem(idx, "hours", e.target.value)}
                      className={`w-full p-1.5 border rounded border-slate-300 font-medium text-center ${
                        item.weekDate ? "bg-slate-100 text-slate-600" : ""
                      }`}
                    />
                    {item.cumulative !== undefined && (
                      <span className="text-[10px] text-slate-400 block text-center">
                        누계 {item.cumulative}시간
                      </span>
                    )}
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-500 font-bold">평가 유형</span>
                    <textarea
                      rows={item.type && item.type.includes("\n") ? 2 : 1}
                      value={item.type}
                      onChange={(e) => updateScheduleItem(idx, "type", e.target.value)}
                      placeholder="형성평가/정기시험"
                      className="w-full p-1.5 border rounded border-slate-300 focus:ring-1 focus:ring-blue-500 outline-none font-medium text-xs resize-none"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[11px] text-slate-700 font-bold">단원명(주제) [핵심 아이디어]</span>
                    {isActualExamWeek ? (
                      <span className="text-[10px] text-amber-700 font-semibold bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
                        정기시험 주간 (-)
                      </span>
                    ) : (
                      <span className="text-[10px] text-purple-600 font-medium">교사 직접 수정 가능</span>
                    )}
                  </div>
                  <textarea
                    rows={isActualExamWeek ? 1 : 3}
                    value={item.topic}
                    onChange={(e) => updateScheduleItem(idx, "topic", e.target.value)}
                    placeholder={isActualExamWeek ? "-" : `Ⅰ. 물질의 구조와 성질\n1. 화학 결합\n\n[핵심 아이디어]\n분자의 구조는 구성 원자의 종류와 결합 방식에 따라 달라지며 물질의 성질과 밀접하게 관련된다.`}
                    className="w-full p-2 border rounded border-slate-300 focus:ring-1 focus:ring-blue-500 outline-none font-medium text-xs leading-relaxed bg-white"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-slate-700 font-bold">성취기준</span>
                      {isActualExamWeek && (
                        <span className="text-[10px] text-amber-700 font-medium bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
                          정기시험 범위 코드만 표시
                        </span>
                      )}
                    </div>
                    {!isActualExamWeek && (
                      <button
                        type="button"
                        onClick={() => onOpenStdModal(idx)}
                        className="text-[10px] text-blue-600 hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        <BookOpen className="w-3 h-3" /> 성취기준 선택
                      </button>
                    )}
                  </div>
                  <textarea
                    rows={stdRows}
                    value={expandedStd}
                    readOnly
                    placeholder={isActualExamWeek ? "-" : "성취기준 선택 버튼을 눌러 지정하세요"}
                    className="w-full p-2 border rounded border-slate-300 bg-slate-50 text-slate-800 cursor-not-allowed text-xs font-medium leading-relaxed"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1 flex-wrap gap-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] text-slate-700 font-bold">평가와 연계한 수업 세부 방법</span>
                      {isActualExamWeek ? (
                        <span className="bg-amber-100 text-amber-800 text-[10px] px-2 py-0.5 rounded font-bold border border-amber-200">
                          정기시험({actualExamInfo.type === "mid" ? "중간" : "기말"}) 주간: - 적용
                        </span>
                      ) : overlappingPerfs.length > 0 ? (
                        <span className="bg-purple-100 text-purple-800 text-[10px] px-2 py-0.5 rounded font-bold border border-purple-200">
                          {overlappingPerfs.map((p) => `■ 수행평가 ${p.perfIndex}`).join(" & ")} 실시 주차 (자동 연동)
                        </span>
                      ) : isFormativeWeek && upcomingPerf ? (
                        <span className="bg-blue-100 text-blue-800 text-[10px] px-2 py-0.5 rounded font-bold border border-blue-200">
                          형성평가 주차 (수행평가 {upcomingPerf.perfIndex} 전주 연동)
                        </span>
                      ) : (
                        <span className={`text-[10px] px-1.5 py-0.2 rounded font-semibold ${
                          isOdd ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"
                        }`}>
                          {isOdd ? "홀수주: 핵심질문" : "짝수주: 핵심개념+핵심질문"}
                        </span>
                      )}
                    </div>

                    {/* Single Week Re-generate button */}
                    <button
                      type="button"
                      onClick={() => handleRegenerateSingleWeek(idx)}
                      disabled={isDetailLoading || allLoading || (!isActualExamWeek && hoursNum <= 0)}
                      className="px-2 py-0.8 bg-slate-100 hover:bg-purple-50 text-slate-700 hover:text-purple-700 border border-slate-300 hover:border-purple-200 rounded text-[10px] font-semibold transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      title={isActualExamWeek ? "정기시험 주차 규칙(-)을 다시 적용합니다" : "해당 주차만 AI로 다시 생성합니다"}
                    >
                      {isDetailLoading ? (
                        <>
                          <Loader2 className="w-2.5 h-2.5 animate-spin text-purple-600" /> 생성 중...
                        </>
                      ) : (
                        <>
                          <RotateCw className="w-2.5 h-2.5" /> 다시 생성
                        </>
                      )}
                    </button>
                  </div>

                  <textarea
                    rows={isActualExamWeek ? 1 : 4}
                    value={item.detail}
                    onChange={(e) => updateScheduleItem(idx, "detail", e.target.value)}
                    placeholder={
                      isActualExamWeek
                        ? "-"
                        : overlappingPerfs.length > 0
                        ? `[핵심질문]\n수행 과제 탐구 질문\n\n[수행평가 내용]\n수행평가 과제 요약\n\n[수행지시어]\n모델링하다, 분석하다, 설명하다, 추론하다`
                        : isFormativeWeek
                        ? `[핵심질문]\n수행평가 대비 핵심 질문\n\n[수행지시어]\n비교하다, 유추하다, 적용하다, 확인하다`
                        : `[핵심질문]\n탐구 유도 질문\n\n[핵심개념]\n주요 개념 키워드 (짝수주)`
                    }
                    className="w-full p-2 border rounded border-slate-300 text-[11px] leading-relaxed focus:ring-1 focus:ring-blue-500 outline-none bg-white font-medium"
                  />
                </div>
              </div>
            );
          });
        })()}
      </div>
    </div>
  );
};
