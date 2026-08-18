import React, { useState } from "react";
import { PlanData, RubricCriterion } from "../types";
import { AI_RULE_CHECKBOX_OPTIONS, DEFAULT_PERF_NOTE_TEXT } from "../constants";
import { getExpandedStdText } from "../utils/hwpParser";
import { formatDateRangeDisplay } from "../utils/dateUtils";
import { generateWithGemini } from "../utils/geminiApi";
import { Sparkles, Plus, Trash2, Loader2, AlertCircle, CheckCircle, Calendar } from "lucide-react";

interface Step3PerformanceDetailProps {
  data: PlanData;
  onChange: (updater: (prev: PlanData) => PlanData) => void;
  showToast: (msg: string) => void;
}

export const Step3PerformanceDetail: React.FC<Step3PerformanceDetailProps> = ({
  data,
  onChange,
  showToast,
}) => {
  const [activeTab, setActiveTab] = useState<number>(1);
  const [flowLoading, setFlowLoading] = useState<Record<number, boolean>>({});
  const [rubricLoading, setRubricLoading] = useState<Record<number, boolean>>({});

  const currentTab = Math.min(Math.max(1, activeTab), data.perfCount || 1);

  // Toggle AI option checkbox rule
  const handleToggleAiOption = (perfIndex: number, optionVal: string, isChecked: boolean) => {
    const aiKey = `perf${perfIndex}Ai` as keyof PlanData;
    let currentText = String(data[aiKey] || "");

    const phraseToInsert = "- " + optionVal;

    if (optionVal === "해당 없음" && isChecked) {
      currentText = "- 해당 없음";
    } else if (optionVal !== "해당 없음" && isChecked) {
      currentText = currentText.replace("- 해당 없음\n", "").replace("\n- 해당 없음", "").replace("- 해당 없음", "").trim();
      if (!currentText.includes(optionVal)) {
        currentText = currentText ? `${currentText}\n${phraseToInsert}` : phraseToInsert;
      }
    } else if (!isChecked) {
      currentText = currentText
        .replace(phraseToInsert + "\n", "")
        .replace("\n" + phraseToInsert, "")
        .replace(phraseToInsert, "")
        .replace(optionVal, "")
        .trim();
    }

    currentText = currentText.replace(/\n{2,}/g, "\n").trim();
    onChange((prev) => ({ ...prev, [aiKey]: currentText }));
  };

  // AI Recommendation for Task Flow
  const handleRecommendFlow = async (perfIndex: number) => {
    const nameKey = `perf${perfIndex}Name` as keyof PlanData;
    const methodKey = `perf${perfIndex}Method` as keyof PlanData;
    const stdKey = `perf${perfIndex}Std` as keyof PlanData;
    const flowKey = `perf${perfIndex}Flow` as keyof PlanData;

    const perfName = String(data[nameKey] || "");
    const perfMethod = String(data[methodKey] || "");
    const stdCodes = String(data[stdKey] || "");
    const stdText = getExpandedStdText(
      stdCodes,
      data.curriculumFullText,
      data.curriculumSubjects,
      data.curriculumSelectedOriginalIdx
    );

    if (!perfName.trim()) {
      showToast("먼저 2단계에서 수행평가명을 입력해주세요.");
      return;
    }

    setFlowLoading((prev) => ({ ...prev, [perfIndex]: true }));

    const prompt = `너는 고등학교 교사를 돕는 평가 설계 도우미야. 아래 정보를 참고해서 이 수행평가의 "수행 과제 흐름(단계별 절차)"을 4~5단계로 추천해줘.

- 과목명: ${data.subjectName || ""}
- 수행평가명: ${perfName}
- 평가 방법: ${perfMethod}
- 관련 성취기준(코드 및 내용):
${stdText || "(선택된 성취기준 없음)"}

출력 형식 규칙(반드시 지킬 것):
- 다른 설명이나 인사말 없이, 절차 목록만 텍스트로 바로 출력할 것
- 반드시 1), 2), 3), 4) 형식으로 시작할 것
- 각 단계는 한 줄로 짧게 작성하며, 불필요한 설명 없이 핵심 행동만 단답형/개조식으로 작성할 것 (한 단계당 15~25자 내외)
- 긴 문장형 서술 절대 금지 (예: "탐구 대상 분자를 선정하고..." (X) -> "대상 분자 선정" (O))
- 만약 평가 방법이나 수행평가명에 '보고서'가 포함되어 있다면 마지막 단계는 가능하면 "보고서 작성 및 제출" 형태로 마무리할 것
- 단계마다 한 줄씩 줄바꿈하여 출력할 것

예시 형식:
1) 입체 구조 모델링 주제 확정
2) 대상 분자 선정
3) 결합 극성 사전 이론 정리
4) 보고서 작성 및 제출`;

    try {
      const generated = await generateWithGemini({ prompt });
      onChange((prev) => ({ ...prev, [flowKey]: generated.trim() }));
      showToast(`수행평가 ${perfIndex}의 과제 흐름 AI 추천이 완료되었습니다.`);
    } catch (err: any) {
      console.error("AI Flow error:", err);
      showToast(`AI 추천 오류: ${err.message || err}`);
    } finally {
      setFlowLoading((prev) => ({ ...prev, [perfIndex]: false }));
    }
  };

  // AI Recommendation for Rubrics
  const handleRecommendRubric = async (perfIndex: number) => {
    const nameKey = `perf${perfIndex}Name` as keyof PlanData;
    const methodKey = `perf${perfIndex}Method` as keyof PlanData;
    const scoreKey = `perf${perfIndex}Score` as keyof PlanData;
    const stdKey = `perf${perfIndex}Std` as keyof PlanData;
    const flowKey = `perf${perfIndex}Flow` as keyof PlanData;
    const rubricKey = `perf${perfIndex}RubricCriteria` as keyof PlanData;

    const perfName = String(data[nameKey] || "");
    const perfMethod = String(data[methodKey] || "");
    const areaScore = Number(data[scoreKey] ?? 100);
    const flowText = String(data[flowKey] || "");
    const stdCodes = String(data[stdKey] || "");
    const stdText = getExpandedStdText(
      stdCodes,
      data.curriculumFullText,
      data.curriculumSubjects,
      data.curriculumSelectedOriginalIdx
    );

    if (!perfName.trim()) {
      showToast("먼저 2단계에서 수행평가명을 입력해주세요.");
      return;
    }

    setRubricLoading((prev) => ({ ...prev, [perfIndex]: true }));

    const prompt = `너는 고등학교 교사를 돕는 전문 평가 루브릭(채점 기준표) 설계 도우미야. 아래 정보를 참고하여 이 수행평가의 "평가요소 및 채점기준(루브릭)"을 4단계 수행수준 원칙에 따라 설계해줘.

[수행평가 정보]
- 과목명: ${data.subjectName || ""}
- 수행평가명: ${perfName}
- 평가 방법: ${perfMethod}
- 영역 만점: ${areaScore}점
- 관련 성취기준:
${stdText || "(선택된 성취기준 없음)"}
- 수행 과제 흐름(단계별 절차):
${flowText || "(작성되지 않음)"}

[핵심 루브릭 설계 원칙 - 반드시 준수]
1. 각 평가요소는 기본적으로 **4단계 수행수준(1단계: 매우 잘함, 2단계: 잘함, 3단계: 보통, 4단계: 미흡)**으로 설계할 것.
2. 최고점 바로 아래 단계부터 '부족하다/오류가 있다/미흡하다'고 평가하지 말 것. 학생이 실제로 보여준 수행의 수준을 **긍정적이고 관찰 가능한 행동 중심**으로 구분할 것.
   - **1단계(최고점, 매우 잘함)**: 정확성, 구체성, 논리성, 종합성이 높은 수준. (예: 분자의 구조와 성질의 관계를 정확하고 구체적으로 분석하고 과학적 근거를 바탕으로 논리적으로 설명함.)
   - **2단계(잘함)**: 핵심 내용을 대부분 적절하게 수행한 수준. **★주의: '다소 부족함', '오류가 있음', '미흡함' 등의 부정적 표현을 절대 사용하지 말고, 핵심 개념을 바탕으로 적절히 수행한 긍정적 행동을 기술할 것.** (예: 분자의 구조와 성질의 관계를 적절하게 분석하고, 주요 과학 개념을 활용하여 그 관계를 설명함.)
   - **3단계(보통)**: 기본적인 개념과 수행을 충족한 수준. 단순히 실패나 오류를 나열하지 말고, **학생이 실제로 수행한 내용이 무엇인지 먼저 기술할 것.** (예: 분자의 구조와 성질 사이의 기본적인 관계를 파악하고, 주요 특징을 중심으로 설명함.)
   - **4단계(최저점, 미흡)**: 최소한의 수행은 확인되지만 목표 도달이 충분하지 않은 수준. **가장 낮은 단계에서만 부족한 수행 특성이 구체적으로 드러나도록 작성할 것.** (예: 분자의 구조 또는 성질의 일부 특징을 제시하였으나, 두 요소의 관계를 충분히 설명하지 못함.)
3. 모든 단계의 문장은 서로 독립적으로 읽어도 해당 수준의 수행 특성을 판단할 수 있도록 완전한 문장으로 서술할 것.
4. **점수 및 배점 조건**:
   - 2~3개의 평가요소(criteria)로 구성할 것.
   - 모든 평가요소의 "최고점"의 합은 정확히 ${areaScore}점이 되어야 함.
   - 각 평가요소의 "최저점에서 1점을 뺀 값"들의 합은 반드시 40점 미만이어야 함 (예: 각 요소 최저점이 10점, 10점, 10점이면 (9+9+9)=27점 < 40점).

출력 형식: 다른 설명이나 코드블록 없이 JSON 배열만 출력할 것.
[
  {
    "name": "평가요소명1",
    "levels": [
      {"score": 40, "desc": "1단계(매우 잘함) 구체적 성취 기준 문장"},
      {"score": 32, "desc": "2단계(잘함) 긍정적/관찰 가능한 성취 기준 문장"},
      {"score": 24, "desc": "3단계(보통) 기본 개념 충족 성취 기준 문장"},
      {"score": 12, "desc": "4단계(미흡) 최소 수행 및 한계 기준 문장"}
    ]
  },
  {
    "name": "평가요소명2",
    "levels": [
      {"score": 30, "desc": "..."},
      {"score": 24, "desc": "..."},
      {"score": 18, "desc": "..."},
      {"score": 10, "desc": "..."}
    ]
  }
]`;

    try {
      const generated = await generateWithGemini({
        prompt,
        responseMimeType: "application/json",
      });

      let parsed: any;
      try {
        parsed = JSON.parse(generated.replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/```\s*$/, "").trim());
      } catch {
        throw new Error("AI 응답을 JSON으로 변환하지 못했습니다.");
      }

      if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error("올바른 루브릭 형식이 아닙니다.");
      }

      const normalized: RubricCriterion[] = parsed
        .map((c: any) => ({
          name: (c.name || "").toString(),
          levels: Array.isArray(c.levels)
            ? c.levels
                .map((lv: any) => ({
                  score: parseInt(lv.score, 10) || 0,
                  desc: (lv.desc || "").toString(),
                }))
                .sort((a: any, b: any) => b.score - a.score)
            : [],
        }))
        .filter((c) => c.levels.length > 0);

      onChange((prev) => ({ ...prev, [rubricKey]: normalized }));
      showToast(`수행평가 ${perfIndex}의 루브릭 AI 설계가 완료되었습니다.`);
    } catch (err: any) {
      console.error("AI Rubric error:", err);
      showToast(`AI 추천 오류: ${err.message || err}`);
    } finally {
      setRubricLoading((prev) => ({ ...prev, [perfIndex]: false }));
    }
  };

  // Rubric editing functions for a given perfIndex
  const getRubricCriteria = (perfIndex: number): RubricCriterion[] => {
    const key = `perf${perfIndex}RubricCriteria` as keyof PlanData;
    return (data[key] as RubricCriterion[]) || [];
  };

  const setRubricCriteria = (perfIndex: number, criteria: RubricCriterion[]) => {
    const key = `perf${perfIndex}RubricCriteria` as keyof PlanData;
    onChange((prev) => ({ ...prev, [key]: criteria }));
  };

  const updateCriterionName = (perfIndex: number, cIdx: number, val: string) => {
    const criteria = [...getRubricCriteria(perfIndex)];
    if (criteria[cIdx]) {
      criteria[cIdx] = { ...criteria[cIdx], name: val };
      setRubricCriteria(perfIndex, criteria);
    }
  };

  const updateLevelScore = (perfIndex: number, cIdx: number, lIdx: number, val: string) => {
    const criteria = [...getRubricCriteria(perfIndex)];
    if (criteria[cIdx] && criteria[cIdx].levels[lIdx]) {
      const newLevels = [...criteria[cIdx].levels];
      newLevels[lIdx] = { ...newLevels[lIdx], score: parseInt(val, 10) || 0 };
      criteria[cIdx] = { ...criteria[cIdx], levels: newLevels };
      setRubricCriteria(perfIndex, criteria);
    }
  };

  const updateLevelDesc = (perfIndex: number, cIdx: number, lIdx: number, val: string) => {
    const criteria = [...getRubricCriteria(perfIndex)];
    if (criteria[cIdx] && criteria[cIdx].levels[lIdx]) {
      const newLevels = [...criteria[cIdx].levels];
      newLevels[lIdx] = { ...newLevels[lIdx], desc: val };
      criteria[cIdx] = { ...criteria[cIdx], levels: newLevels };
      setRubricCriteria(perfIndex, criteria);
    }
  };

  const addCriterion = (perfIndex: number) => {
    const criteria = [...getRubricCriteria(perfIndex), { name: "", levels: [{ score: 0, desc: "" }] }];
    setRubricCriteria(perfIndex, criteria);
  };

  const removeCriterion = (perfIndex: number, cIdx: number) => {
    const criteria = getRubricCriteria(perfIndex).filter((_, i) => i !== cIdx);
    setRubricCriteria(perfIndex, criteria);
  };

  const addLevel = (perfIndex: number, cIdx: number) => {
    const criteria = [...getRubricCriteria(perfIndex)];
    if (criteria[cIdx]) {
      criteria[cIdx] = {
        ...criteria[cIdx],
        levels: [...criteria[cIdx].levels, { score: 0, desc: "" }],
      };
      setRubricCriteria(perfIndex, criteria);
    }
  };

  const removeLevel = (perfIndex: number, cIdx: number, lIdx: number) => {
    const criteria = [...getRubricCriteria(perfIndex)];
    if (criteria[cIdx]) {
      criteria[cIdx] = {
        ...criteria[cIdx],
        levels: criteria[cIdx].levels.filter((_, i) => i !== lIdx),
      };
      setRubricCriteria(perfIndex, criteria);
    }
  };

  return (
    <div className="space-y-5">
      <div className="border-b border-slate-200 pb-3 flex justify-between items-center gap-2">
        <div>
          <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">
              3
            </span>
            수행평가 세부 계획 작성
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            성취기준, 과제 절차, AI 활용 범위, 채점기준(루브릭)을 명확하게 설계합니다.
          </p>
        </div>
        <span className="text-xs bg-blue-50 text-blue-700 px-3 py-1 rounded-full border border-blue-200 font-medium whitespace-nowrap">
          3 / 5 단계
        </span>
      </div>

      {/* Performance Tabs (1~perfCount) */}
      <div className="flex flex-row flex-nowrap gap-2 border-b border-slate-200 pb-2 overflow-x-auto">
        {Array.from({ length: data.perfCount || 1 }).map((_, idx) => {
          const num = idx + 1;
          const isSelected = currentTab === num;
          const name = String(data[`perf${num}Name` as keyof PlanData] || `수행평가 ${num}`);

          return (
            <button
              key={num}
              type="button"
              onClick={() => setActiveTab(num)}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-all whitespace-nowrap shrink-0 ${
                isSelected
                  ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                  : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"
              }`}
            >
              수행평가 {num}: {name.slice(0, 14)}
              {name.length > 14 ? "..." : ""}
            </button>
          );
        })}
      </div>

      {/* Render active performance assessment detail panel */}
      {Array.from({ length: data.perfCount || 1 }).map((_, idx) => {
        const num = idx + 1;
        if (num !== currentTab) return null;

        const name = String(data[`perf${num}Name` as keyof PlanData] || "");
        const score = Number(data[`perf${num}Score` as keyof PlanData] ?? 100);
        const stdCodes = String(data[`perf${num}Std` as keyof PlanData] || "");
        const stdExpanded = getExpandedStdText(
          stdCodes,
          data.curriculumFullText,
          data.curriculumSubjects,
          data.curriculumSelectedOriginalIdx
        );
        const flow = String(data[`perf${num}Flow` as keyof PlanData] || "");
        const aiText = String(data[`perf${num}Ai` as keyof PlanData] || "");
        const note = String(data[`perf${num}Note` as keyof PlanData] ?? DEFAULT_PERF_NOTE_TEXT);
        const criteria = getRubricCriteria(num);

        // Validation sums for rubric
        let maxSum = 0;
        let minCheckSum = 0;
        criteria.forEach((c) => {
          if (!c.levels.length) return;
          const scores = c.levels.map((l) => Number(l.score) || 0);
          maxSum += Math.max(...scores);
          minCheckSum += Math.min(...scores) - 1;
        });
        const isMaxValid = maxSum === score;
        const isMinValid = minCheckSum < 40;

        const startDate = String(data[`perf${num}StartDate` as keyof PlanData] || "");
        const endDate = String(data[`perf${num}EndDate` as keyof PlanData] || "");
        const period = String(data[`perf${num}Period` as keyof PlanData] || "");
        const dateRange = formatDateRangeDisplay(startDate, endDate);

        return (
          <div key={num} className="p-4 border border-slate-200 rounded-lg space-y-4 bg-slate-50 shadow-sm">
            <div className="flex justify-between items-center border-b border-slate-200 pb-2 flex-wrap gap-2">
              <h3 className="font-bold text-xs text-blue-800 flex items-center gap-1.5">
                <span>✏️ [수행평가 {num}]</span>
                <span>{name || "세부 설계"}</span>
              </h3>
              <div className="flex items-center gap-2 flex-wrap">
                {period && (
                  <span className="text-xs text-emerald-800 font-semibold bg-emerald-50 px-2.5 py-0.5 rounded border border-emerald-300 flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-emerald-600" />
                    평가 시기: {period}
                  </span>
                )}
                <span className="text-xs text-slate-600 font-semibold bg-white px-2.5 py-0.5 rounded border border-slate-200">
                  영역 만점: {score}점
                </span>
              </div>
            </div>

            {/* Related Standards Display */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                관련 교육과정 성취기준{" "}
                <span className="font-normal text-slate-400">(2단계에서 선택한 내용이 자동 반영됩니다)</span>
              </label>
              <textarea
                rows={3}
                value={stdExpanded || "- 성취기준이 지정되지 않았습니다 -"}
                readOnly
                className="w-full text-xs p-2 border rounded border-slate-300 bg-slate-100 text-slate-700 leading-relaxed cursor-not-allowed font-medium"
              />
            </div>

            {/* Task Flow with AI Recommendation */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-[11px] font-semibold text-slate-700">수행 과제 흐름 (단계별 절차)</label>
                <button
                  type="button"
                  onClick={() => handleRecommendFlow(num)}
                  disabled={flowLoading[num]}
                  className="px-2.5 py-1 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-md text-[11px] font-bold transition-all shadow-sm flex items-center gap-1 cursor-pointer"
                >
                  {flowLoading[num] ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" /> 생성 중...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3 h-3" />
                      {flow ? "AI 다시 활용하기" : "AI 활용하기"}
                    </>
                  )}
                </button>
              </div>
              <textarea
                rows={3}
                value={flow}
                onChange={(e) =>
                  onChange((prev) => ({ ...prev, [`perf${num}Flow` as keyof PlanData]: e.target.value }))
                }
                placeholder="1) 주제 확정  2) 자료 조사  3) 결과 분석  4) 보고서 제출"
                className="w-full text-xs p-2 border rounded border-slate-300 bg-white focus:ring-2 focus:ring-blue-500 outline-none leading-relaxed"
              />
            </div>

            {/* AI Permission Guidelines Checkboxes */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">AI 활용 허용 범위 및 규칙</label>
              <div className="mb-2 space-y-1.5 bg-white p-2.5 border border-slate-200 rounded-md">
                {AI_RULE_CHECKBOX_OPTIONS.map((opt, i) => {
                  const isChecked = aiText.includes(opt);
                  return (
                    <label key={i} className="flex items-start gap-2 text-[11px] text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => handleToggleAiOption(num, opt, e.target.checked)}
                        className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="leading-tight">{opt}</span>
                    </label>
                  );
                })}
              </div>
              <textarea
                rows={3}
                value={aiText}
                onChange={(e) =>
                  onChange((prev) => ({ ...prev, [`perf${num}Ai` as keyof PlanData]: e.target.value }))
                }
                placeholder="직접 규칙을 수정하거나 추가 입력할 수 있습니다."
                className="w-full text-xs p-2 border rounded border-slate-300 bg-white focus:ring-2 focus:ring-blue-500 outline-none leading-relaxed"
              />
            </div>

            {/* Rubric Builder with AI Recommendation */}
            <div>
              <div className="flex justify-between items-center mb-1 flex-wrap gap-2">
                <label className="block text-[11px] font-semibold text-slate-700">
                  평가요소 및 채점기준 (루브릭)
                </label>
                <button
                  type="button"
                  onClick={() => handleRecommendRubric(num)}
                  disabled={rubricLoading[num]}
                  className="px-2.5 py-1 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-md text-[11px] font-bold transition-all shadow-sm flex items-center gap-1 cursor-pointer"
                >
                  {rubricLoading[num] ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" /> 설계 중...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3 h-3" />
                      {criteria.length ? "AI 다시 활용하기" : "AI 활용하기"}
                    </>
                  )}
                </button>
              </div>

              {/* Rubric Scoring Constraints Status */}
              <div className="text-[11px] mb-2 p-2 bg-white rounded border border-slate-200 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`flex items-center gap-1 font-semibold ${isMaxValid ? "text-emerald-700" : "text-red-600"}`}>
                    {isMaxValid ? <CheckCircle className="w-3.5 h-3.5 text-emerald-600" /> : <AlertCircle className="w-3.5 h-3.5 text-red-500" />}
                    최고점 합계: {maxSum}점 (영역 만점: {score}점)
                  </span>
                  <span className="text-slate-300">|</span>
                  <span className={`flex items-center gap-1 font-semibold ${isMinValid ? "text-emerald-700" : "text-red-600"}`}>
                    {isMinValid ? <CheckCircle className="w-3.5 h-3.5 text-emerald-600" /> : <AlertCircle className="w-3.5 h-3.5 text-red-500" />}
                    최하점-1점 합계: {minCheckSum}점 (40점 미만 준수)
                  </span>
                </div>
                {!isMaxValid && (
                  <p className="text-red-600 text-[10px]">
                    ⚠️ 최고점 합계가 영역 만점({score}점)과 일치해야 합니다.
                  </p>
                )}
                {!isMinValid && (
                  <p className="text-red-600 text-[10px]">
                    ⚠️ 각 평가요소의 최하점에서 1점씩 뺀 점수의 합이 40점 미만이어야 합니다. (현재 {minCheckSum}점)
                  </p>
                )}
              </div>

              {/* Dynamic Criteria List */}
              <div className="space-y-3">
                {criteria.length === 0 ? (
                  <div className="text-[11px] text-slate-400 italic py-2 text-center bg-white rounded border border-dashed border-slate-300">
                    작성된 평가요소가 없습니다. "AI 활용하기" 또는 "평가요소 추가" 버튼을 눌러주세요.
                  </div>
                ) : (
                  criteria.map((c, cIdx) => {
                    const maxLevelScore = c.levels.length
                      ? Math.max(...c.levels.map((l) => Number(l.score) || 0))
                      : 0;

                    return (
                      <div key={cIdx} className="p-3 bg-white border border-slate-200 rounded-lg space-y-2 shadow-xs">
                        <div className="flex gap-2 items-center">
                          <input
                            type="text"
                            value={c.name}
                            onChange={(e) => updateCriterionName(num, cIdx, e.target.value)}
                            placeholder="평가요소명 (예: 탐구 설계 및 수행)"
                            className="flex-1 p-1.5 border rounded text-xs font-semibold border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none"
                          />
                          <span className="text-xs font-bold text-blue-700 whitespace-nowrap bg-blue-50 px-2 py-1 rounded">
                            배점: {maxLevelScore}점
                          </span>
                          <button
                            type="button"
                            onClick={() => removeCriterion(num, cIdx)}
                            className="text-slate-400 hover:text-red-500 p-1"
                            title="평가요소 삭제"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Level scoring rows */}
                        <div className="space-y-1.5 pl-2 border-l-2 border-slate-200">
                          {c.levels.map((lv, lIdx) => (
                            <div key={lIdx} className="flex gap-1.5 items-start">
                              <div className="flex items-center gap-0.5">
                                <input
                                  type="number"
                                  value={lv.score}
                                  onChange={(e) => updateLevelScore(num, cIdx, lIdx, e.target.value)}
                                  className="w-12 p-1 border rounded text-xs text-right font-medium border-slate-300 focus:ring-1 focus:ring-blue-500 outline-none"
                                />
                                <span className="text-[10px] text-slate-400">점</span>
                              </div>
                              <textarea
                                rows={1}
                                value={lv.desc}
                                onChange={(e) => updateLevelDesc(num, cIdx, lIdx, e.target.value)}
                                placeholder="해당 점수의 구체적인 성취 채점 기준"
                                className="flex-1 p-1.5 border rounded text-xs leading-snug border-slate-300 focus:ring-1 focus:ring-blue-500 outline-none bg-slate-50/50"
                              />
                              <button
                                type="button"
                                onClick={() => removeLevel(num, cIdx, lIdx)}
                                className="text-slate-300 hover:text-red-500 text-xs mt-1 shrink-0 p-0.5"
                                title="단계 삭제"
                              >
                                ✕
                              </button>
                            </div>
                          ))}
                        </div>

                        <button
                          type="button"
                          onClick={() => addLevel(num, cIdx)}
                          className="text-[11px] text-blue-600 hover:text-blue-800 hover:underline font-medium"
                        >
                          + 단계 추가
                        </button>
                      </div>
                    );
                  })
                )}

                <button
                  type="button"
                  onClick={() => addCriterion(num)}
                  className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-blue-700 text-xs rounded-md font-semibold flex items-center gap-1 shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" /> 평가요소 추가
                </button>
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">유의 사항</label>
              <textarea
                rows={2}
                value={note}
                onChange={(e) =>
                  onChange((prev) => ({ ...prev, [`perf${num}Note` as keyof PlanData]: e.target.value }))
                }
                className="w-full text-xs p-2 border rounded border-slate-300 bg-white focus:ring-2 focus:ring-blue-500 outline-none leading-relaxed"
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};
