import React, { useState } from "react";
import { PlanData, ScheduleItem } from "../types";
import {
  CALENDAR_BLOCKED_DATES,
  KOREAN_WEEKDAYS,
  WEEKDAY_SUBSTITUTIONS,
} from "../constants";
import { getExpandedStdText, sortAchievementStandardCodes } from "../utils/hwpParser";
import { getOverlappingPerformancesForWeek, formatDateRangeDisplay } from "../utils/dateUtils";
import { generateWithGemini } from "../utils/geminiApi";
import { Sparkles, Plus, Trash2, BookOpen, Loader2, Lightbulb, Calendar, CheckCircle2 } from "lucide-react";

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
  const [detailChecks, setDetailChecks] = useState<Record<number, string[]>>({});
  const [detailLoading, setDetailLoading] = useState<Record<number, boolean>>({});
  const [distributeLoading, setDistributeLoading] = useState<boolean>(false);

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

  // Helper: parse date range "7.20. ~ 7.24."
  const parseWeekDateRange = (weekDateStr: string) => {
    if (!weekDateStr) return null;
    const parts = weekDateStr.split("~").map((s) => s.trim().replace(/\.$/, ""));
    if (parts.length !== 2) return null;
    const toDate = (s: string) => {
      const nums = s.split(".").map((v) => parseInt(v.trim(), 10)).filter((v) => !isNaN(v));
      if (nums.length < 2) return null;
      return new Date(2026, nums[0] - 1, nums[1]);
    };
    const start = toDate(parts[0]);
    const end = toDate(parts[1]);
    if (!start || !end) return null;
    return { start, end };
  };

  const toDateKey = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  const isDateBlockedForGrade = (d: Date, grade: number) => {
    const key = toDateKey(d);
    return CALENDAR_BLOCKED_DATES.some((ev) => {
      if (key < ev.start || key > ev.end) return false;
      return ev.grades === "all" || (Array.isArray(ev.grades) && ev.grades.includes(grade));
    });
  };

  const getEffectiveWeekday = (d: Date) => {
    const key = toDateKey(d);
    return WEEKDAY_SUBSTITUTIONS[key] || KOREAN_WEEKDAYS[d.getDay()];
  };

  const computeWeekHours = (weekDateStr: string, weekdaySet: Set<string>, grade: number) => {
    const range = parseWeekDateRange(weekDateStr);
    if (!range) return null;
    let count = 0;
    const cur = new Date(range.start);
    while (cur <= range.end) {
      if (!isDateBlockedForGrade(cur, grade)) {
        const wd = getEffectiveWeekday(cur);
        if (weekdaySet.has(wd)) count++;
      }
      cur.setDate(cur.getDate() + 1);
    }
    return count;
  };

  // Recompute hours for all weeks
  const recomputeAllHours = () => {
    const parsed = parseClassSchedule(data.classDays);
    if (!parsed) return;

    let cumulative = 0;
    const updated = data.schedules.map((item) => {
      if (!item.weekDate) return item;
      const h = computeWeekHours(item.weekDate, parsed.weekdays, parsed.grade);
      if (h === null) return item;
      cumulative += h;
      return {
        ...item,
        hours: String(h),
        cumulative,
      };
    });

    onChange((prev) => ({ ...prev, schedules: updated }));
    showToast("기준학급 시간표 및 2026 학사일정에 맞춰 주차별 시수가 자동 재계산되었습니다.");
  };

  // AI Auto-distribution of achievement standards across 20 weeks
  const handleAiDistributeStandards = () => {
    const parseCodes = (str: string) => {
      return ((str || "").match(/\[([^\]]+)\]/g) || []).map((s) => s.slice(1, -1));
    };

    // Sort strictly in numerical ascending order by ① Domain number and ② Item number
    const midCodes = sortAchievementStandardCodes(parseCodes(data.midStd));
    const finalCodes = sortAchievementStandardCodes(parseCodes(data.finalStd));

    if (midCodes.length === 0 && finalCodes.length === 0) {
      showToast("먼저 2단계 「평가 개요」에서 중간시험/기말시험 성취기준을 선택해주세요.");
      return;
    }

    const parsed = parseClassSchedule(data.classDays);
    if (!parsed) {
      showToast("1단계의 「기준학급」 정보를 확인해주세요. (예: 2A(월6, 화5, 수7, 목5))");
      return;
    }

    setDistributeLoading(true);

    const periods = { midStart: "2026-10-14", midEnd: "2026-10-19", finalStart: "2026-12-17", finalEnd: "2026-12-22" };
    const beforeMid: Array<{ idx: number; hours: number }> = [];
    const midToFinal: Array<{ idx: number; hours: number }> = [];

    data.schedules.forEach((item, idx) => {
      if (!item.weekDate) return;
      const range = parseWeekDateRange(item.weekDate);
      if (!range) return;
      const hours = parseInt(item.hours, 10) || 0;
      if (hours <= 0) return;

      const startKey = toDateKey(range.start);
      const endKey = toDateKey(range.end);

      if (endKey < periods.midStart) {
        beforeMid.push({ idx, hours });
      } else if (startKey > periods.midEnd && endKey < periods.finalStart) {
        midToFinal.push({ idx, hours });
      }
    });

    // Sequential forward distribution without looping backwards or duplicate skipping
    const distributeSequential = (sortedCodes: string[], weekPool: Array<{ idx: number; hours: number }>) => {
      const res: Record<number, string[]> = {};
      if (!sortedCodes.length || !weekPool.length) return res;

      const totalCodes = sortedCodes.length;
      const totalWeeks = weekPool.length;
      let codeCursor = 0;

      for (let wIdx = 0; wIdx < totalWeeks; wIdx++) {
        if (codeCursor >= totalCodes) break;

        const remainingCodes = totalCodes - codeCursor;
        const remainingWeeks = totalWeeks - wIdx;

        // If remaining codes exceed remaining available teaching weeks, assign 2 (or more) consecutive items
        const takeCount = Math.max(1, Math.ceil(remainingCodes / remainingWeeks));
        const assigned = sortedCodes.slice(codeCursor, codeCursor + takeCount);
        res[weekPool[wIdx].idx] = assigned;
        codeCursor += takeCount;
      }

      return res;
    };

    const midAssign = distributeSequential(midCodes, beforeMid);
    const finalAssign = distributeSequential(finalCodes, midToFinal);

    const updated = data.schedules.map((item, idx) => {
      const assignedMid = midAssign[idx];
      const assignedFinal = finalAssign[idx];

      if (assignedMid !== undefined || assignedFinal !== undefined) {
        const codes = (assignedMid || []).concat(assignedFinal || []);
        return {
          ...item,
          std: codes.length ? codes.map((c) => `[${c}]`).join(", ") : "",
        };
      }
      return item;
    });

    onChange((prev) => ({ ...prev, schedules: updated }));
    setDistributeLoading(false);
    showToast("성취기준이 교육과정 코드 순서(영역 및 번호 오름차순)대로 차례대로 배분되었습니다.");
  };

  // Helper to determine week number and default checked items (odd: idea+question, even: concept+question)
  const getWeekNumber = (idx: number, weekLabel?: string): number => {
    const m = (weekLabel || "").match(/(\d+)/);
    if (m) {
      return parseInt(m[1], 10);
    }
    return idx + 1;
  };

  const getDefaultChecksForWeek = (idx: number, weekLabel?: string): string[] => {
    const weekNum = getWeekNumber(idx, weekLabel);
    const isOdd = weekNum % 2 === 1;
    return isOdd ? ["idea", "question"] : ["concept", "question"];
  };

  const getSelectedChecks = (idx: number, weekLabel?: string): string[] => {
    if (detailChecks[idx] !== undefined) {
      return detailChecks[idx];
    }
    return getDefaultChecksForWeek(idx, weekLabel);
  };

  // Smart section merger: Preserves unselected existing sections and updates/adds newly selected sections
  const mergeDetailSections = (
    existingText: string,
    newGeneratedText: string,
    checkedKeys: string[]
  ): string => {
    if (!existingText || !existingText.trim()) {
      return newGeneratedText.trim();
    }

    const extractSections = (text: string) => {
      const regex = /\[(핵심\s*아이디어|핵심개념|핵심질문|수행지시어)\]([\s\S]*?)(?=\[(?:핵심\s*아이디어|핵심개념|핵심질문|수행지시어)\]|$)/g;
      const sections: Record<string, string> = {};
      let match;
      while ((match = regex.exec(text)) !== null) {
        const normKey = match[1].replace(/\s+/g, "");
        sections[normKey] = match[2].trim();
      }
      return sections;
    };

    const existingSections = extractSections(existingText);
    const newSections = extractSections(newGeneratedText);

    const keyToNorm: Record<string, string> = {
      idea: "핵심아이디어",
      concept: "핵심개념",
      question: "핵심질문",
      verb: "수행지시어",
    };

    // If existing text has no bracketed tags at all, safely append
    if (Object.keys(existingSections).length === 0) {
      return `${existingText.trim()}\n\n${newGeneratedText.trim()}`;
    }

    // Update or insert generated sections into existing
    checkedKeys.forEach((key) => {
      const norm = keyToNorm[key];
      if (norm && newSections[norm]) {
        existingSections[norm] = newSections[norm];
      }
    });

    const order = ["핵심아이디어", "핵심개념", "핵심질문", "수행지시어"];
    const resultParts: string[] = [];

    order.forEach((norm) => {
      if (existingSections[norm]) {
        const displayTag = norm === "핵심아이디어" ? "[핵심 아이디어]" : `[${norm}]`;
        resultParts.push(`${displayTag}\n${existingSections[norm]}`);
      }
    });

    return resultParts.length ? resultParts.join("\n\n") : newGeneratedText.trim();
  };

  // AI Recommendation for Lesson Detail Sections
  const handleRecommendDetail = async (idx: number) => {
    const item = data.schedules[idx];
    const hours = parseInt(item.hours, 10) || 0;
    if (hours <= 0) {
      showToast("시수가 0인 주차(휴업일/시험 등)에는 AI 작성을 진행하지 않습니다.");
      return;
    }

    const checked = getSelectedChecks(idx, item.weekLabel);
    if (checked.length === 0) {
      showToast("AI로 작성할 항목을 하나 이상 체크해주세요.");
      return;
    }

    if (!item.std || !item.std.trim()) {
      showToast("먼저 해당 주차의 성취기준을 지정해주세요.");
      return;
    }

    setDetailLoading((prev) => ({ ...prev, [idx]: true }));

    const stdText = getExpandedStdText(
      item.std,
      data.curriculumFullText,
      data.curriculumSubjects,
      data.curriculumSelectedOriginalIdx
    );

    const sectionInstructions: string[] = [];
    if (checked.includes("idea")) {
      sectionInstructions.push(
        `[핵심 아이디어] 해당 주차 성취기준 문구의 본질적 의미를 아우르는 일반화된 원리나 개념적 통찰을 1~2문장으로 기술`
      );
    }
    if (checked.includes("concept")) {
      sectionInstructions.push(`[핵심개념] 해당 주차 성취기준을 학습하는 데 필요한 본질적 핵심 개념 키워드 및 원리 명시`);
    }
    if (checked.includes("question")) {
      sectionInstructions.push(`[핵심질문] 학생의 탐구를 유도하고 고차원적 사고를 요구하는 질문 1~2개`);
    }
    if (checked.includes("verb")) {
      sectionInstructions.push(`[수행지시어] 성취기준 도달을 확인하기 위한 구체적인 수행 행동 동사 (예: 분석하다, 비교하다, 설명하다, 모델링하다)`);
    }

    const prompt = `너는 고등학교 교육과정 및 수업 설계 전문가야. 아래 정보를 바탕으로 "평가와 연계한 수업 세부 방법"의 요청된 항목들을 작성해줘.
반드시 제공된 성취기준 코드와 성취기준 전체 문구를 충실히 반영하여 작성해야 해.

[주차 및 수업 정보]
- 과목명: ${data.subjectName || ""}
- 주차: ${item.weekLabel}
- 시수: ${item.hours}시간
- 단원명: ${item.topic || "(단원 미지정)"}
- 해당 주차 성취기준 (코드 및 상세 문구):
${stdText}
- 평가 유형: ${item.type || "형성평가"}

[작성할 항목들]
${sectionInstructions.join("\n")}

[작성 규칙]
1. 요청된 항목([핵심 아이디어], [핵심개념], [핵심질문], [수행지시어] 중 요청된 것)만 정확히 작성할 것.
2. 각 항목은 "[항목명]" 형식으로 시작하고 줄바꿈 후 내용을 작성할 것.
3. 성취기준 내용과 직결된 정교하고 학술적인 문장으로 작성할 것.`;

    try {
      const generated = await generateWithGemini({ prompt });
      const merged = mergeDetailSections(item.detail || "", generated.trim(), checked);
      const updated = [...data.schedules];
      updated[idx] = { ...updated[idx], detail: merged };
      onChange((prev) => ({ ...prev, schedules: updated }));
      showToast(`${item.weekLabel} 수업 세부 방법 AI 작성이 완료되었습니다.`);
    } catch (err: any) {
      console.error("AI Detail error:", err);
      showToast(`AI 작성 오류: ${err.message || err}`);
    } finally {
      setDetailLoading((prev) => ({ ...prev, [idx]: false }));
    }
  };

  const toggleCheck = (idx: number, optKey: string, weekLabel?: string) => {
    setDetailChecks((prev) => {
      const current = prev[idx] !== undefined ? prev[idx] : getDefaultChecksForWeek(idx, weekLabel);
      const next = current.includes(optKey) ? current.filter((k) => k !== optKey) : [...current, optKey];
      return { ...prev, [idx]: next };
    });
  };

  const updateScheduleItem = (idx: number, field: keyof ScheduleItem, val: string) => {
    const updated = [...data.schedules];
    updated[idx] = { ...updated[idx], [field]: val };
    onChange((prev) => ({ ...prev, schedules: updated }));
  };

  const addScheduleRow = () => {
    const newWeek: ScheduleItem = {
      weekLabel: `${data.schedules.length + 1}주`,
      weekDate: "",
      weekEvent: "",
      hours: "4",
      topic: "신규 학습 주제",
      std: "",
      type: "형성평가",
      detail: "[핵심질문] 탐구 질문을 입력하세요.",
    };
    onChange((prev) => ({ ...prev, schedules: [...prev.schedules, newWeek] }));
  };

  const removeScheduleRow = (idx: number) => {
    onChange((prev) => ({ ...prev, schedules: prev.schedules.filter((_, i) => i !== idx) }));
  };

  return (
    <div className="space-y-5">
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

      {/* 안내 팁 박스 */}
      <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 text-xs text-indigo-900 space-y-1">
        <div className="font-bold flex items-center gap-1.5 text-indigo-950">
          <Lightbulb className="w-4 h-4 text-indigo-600 shrink-0" />
          <span>작성 꿀팁 가이드</span>
        </div>
        <p>• <b>핵심 아이디어</b>: 매주 넣을 필요 없음! 대단원별로 1개씩 작성</p>
        <p>• <b>핵심질문</b>: 학생의 탐구를 유도하는 질문 (성취기준별 1개 권장)</p>
        <p>• <b>수행지시어</b>: 학생이 도달할 행동 동사 (계산하다, 분석하다, 비교하다 등)</p>
      </div>

      {/* Top Action Bar */}
      <div className="flex justify-between items-center flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-800">주차별 진도표 목록 ({data.schedules.length}주)</span>
          <button
            type="button"
            onClick={recomputeAllHours}
            className="text-[11px] text-blue-600 hover:underline font-medium"
            title="기준학급 시간표에 맞춰 수업시수 재계산"
          >
            🔄 시수 재계산
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleAiDistributeStandards}
            disabled={distributeLoading}
            className="px-2.5 py-1 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-md text-xs font-bold transition-all shadow-xs flex items-center gap-1 cursor-pointer"
          >
            {distributeLoading ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" /> 배분 중...
              </>
            ) : (
              <>
                <Sparkles className="w-3 h-3" /> 성취기준 AI 자동 배분
              </>
            )}
          </button>
          <button
            type="button"
            onClick={addScheduleRow}
            className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded-md font-semibold flex items-center gap-1 shadow-xs"
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
              const range = formatDateRangeDisplay(start, end);

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
        {data.schedules.map((item, idx) => {
          const selectedChecks = getSelectedChecks(idx, item.weekLabel);
          const isDetailLoading = detailLoading[idx] || false;
          const weekNum = getWeekNumber(idx, item.weekLabel);
          const isOdd = weekNum % 2 === 1;
          const overlappingPerfs = getOverlappingPerformancesForWeek(item.weekDate, data);

          return (
            <div
              key={idx}
              className={`p-3 border rounded-lg space-y-2.5 text-xs shadow-xs relative transition-all ${
                overlappingPerfs.length > 0
                  ? "border-emerald-300 bg-emerald-50/20 ring-1 ring-emerald-200"
                  : "border-slate-200 bg-white"
              }`}
            >
              <button
                type="button"
                onClick={() => removeScheduleRow(idx)}
                className="absolute top-3 right-3 text-slate-400 hover:text-red-600 transition-colors"
                title="주차 삭제"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>

              {/* 수행평가 실시 주간 감지 알림 배너 */}
              {overlappingPerfs.length > 0 && (
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
                              const newType = currentType ? `${currentType}, ${perfTag}` : perfTag;
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
                  <input
                    type="text"
                    value={item.type}
                    onChange={(e) => updateScheduleItem(idx, "type", e.target.value)}
                    placeholder="형성평가/정기시험"
                    className="w-full p-1.5 border rounded border-slate-300 focus:ring-1 focus:ring-blue-500 outline-none font-medium"
                  />
                </div>
              </div>

              <div>
                <span className="text-[11px] text-slate-500 font-bold">단원명(주제) 및 [핵심아이디어]</span>
                <input
                  type="text"
                  value={item.topic}
                  onChange={(e) => updateScheduleItem(idx, "topic", e.target.value)}
                  placeholder="대단원 및 소단원 주제"
                  className="w-full p-1.5 border rounded border-slate-300 focus:ring-1 focus:ring-blue-500 outline-none font-medium"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[11px] text-slate-500 font-bold">성취기준</span>
                  <button
                    type="button"
                    onClick={() => onOpenStdModal(idx)}
                    className="text-[10px] text-blue-600 hover:underline font-semibold flex items-center gap-1"
                  >
                    <BookOpen className="w-3 h-3" /> 성취기준 선택
                  </button>
                </div>
                <textarea
                  rows={2}
                  value={item.std}
                  readOnly
                  placeholder="성취기준 선택 버튼을 눌러 지정하세요"
                  className="w-full p-1.5 border rounded bg-slate-100 text-slate-700 cursor-not-allowed text-[11px] font-medium leading-snug"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1 flex-wrap gap-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-slate-500 font-bold">평가와 연계한 수업 세부 방법</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded font-semibold ${
                      isOdd ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"
                    }`}>
                      {isOdd ? "홀수주: 아이디어+질문" : "짝수주: 개념+질문"}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRecommendDetail(idx)}
                    disabled={isDetailLoading}
                    className="px-2 py-0.5 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-md text-[10px] font-bold transition-all shadow-xs flex items-center gap-1 cursor-pointer"
                    title="선택한 항목을 AI로 작성하며, 기존 항목은 유지하고 추가 반영합니다"
                  >
                    {isDetailLoading ? (
                      <>
                        <Loader2 className="w-2.5 h-2.5 animate-spin" /> 생성 중...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-2.5 h-2.5" /> AI 활용하기
                      </>
                    )}
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-1.5 p-1.5 bg-slate-50 rounded border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-500">작성 항목:</span>
                  {[
                    { key: "idea", label: "핵심 아이디어" },
                    { key: "concept", label: "핵심개념" },
                    { key: "question", label: "핵심질문" },
                    { key: "verb", label: "수행지시어" },
                  ].map((opt) => (
                    <label key={opt.key} className="text-[10.5px] flex items-center gap-1 text-slate-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedChecks.includes(opt.key)}
                        onChange={() => toggleCheck(idx, opt.key, item.weekLabel)}
                        className="rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                      />
                      <span>{opt.label}</span>
                    </label>
                  ))}
                </div>

                <textarea
                  rows={4}
                  value={item.detail}
                  onChange={(e) => updateScheduleItem(idx, "detail", e.target.value)}
                  placeholder={isOdd ? "[핵심 아이디어] ...\n[핵심질문] ..." : "[핵심개념] ...\n[핵심질문] ..."}
                  className="w-full p-2 border rounded border-slate-300 text-[11px] leading-relaxed focus:ring-1 focus:ring-blue-500 outline-none bg-white"
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
