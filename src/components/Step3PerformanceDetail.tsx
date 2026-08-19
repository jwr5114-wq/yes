import React, { useState } from "react";
import { PlanData, RubricCriterion } from "../types";
import { AI_RULE_CHECKBOX_OPTIONS, DEFAULT_PERF_NOTE_TEXT } from "../constants";
import { getExpandedStdText } from "../utils/hwpParser";
import { formatDateRangeDisplay } from "../utils/dateUtils";
import { generateWithGemini } from "../utils/geminiApi";
import { Sparkles, Plus, Trash2, Loader2, AlertCircle, CheckCircle, Calendar, AlertTriangle } from "lucide-react";

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
  const [aiLoading, setAiLoading] = useState<Record<number, boolean>>({});
  const [aiStepText, setAiStepText] = useState<Record<number, string>>({});
  const [confirmModalPerfIndex, setConfirmModalPerfIndex] = useState<number | null>(null);

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

  // Rubric editing functions for a given perfIndex
  const getRubricCriteria = (perfIndex: number): RubricCriterion[] => {
    const key = `perf${perfIndex}RubricCriteria` as keyof PlanData;
    return (data[key] as RubricCriterion[]) || [];
  };

  const setRubricCriteria = (perfIndex: number, criteria: RubricCriterion[]) => {
    const key = `perf${perfIndex}RubricCriteria` as keyof PlanData;
    onChange((prev) => ({ ...prev, [key]: criteria }));
  };

  // Check if existing content exists for this performance assessment
  const hasExistingContent = (perfIndex: number): boolean => {
    const flow = String(data[`perf${perfIndex}Flow` as keyof PlanData] || "").trim();
    const criteria = getRubricCriteria(perfIndex);
    const hasRubric =
      criteria.length > 0 &&
      criteria.some(
        (c) => c.name.trim() !== "" || c.levels.some((l) => l.desc && l.desc.trim() !== "")
      );
    return flow.length > 0 || hasRubric;
  };

  // Two-Step Sequential AI Generation:
  // 1단계: 수행 과제 흐름 생성 -> 저장 및 화면 반영
  // 2단계: 방금 새로 생성된 수행 과제 흐름을 바탕으로 루브릭 생성 -> 저장 및 화면 반영
  const runUnifiedAi = async (perfIndex: number) => {
    const nameKey = `perf${perfIndex}Name` as keyof PlanData;
    const methodKey = `perf${perfIndex}Method` as keyof PlanData;
    const scoreKey = `perf${perfIndex}Score` as keyof PlanData;
    const stdKey = `perf${perfIndex}Std` as keyof PlanData;
    const flowKey = `perf${perfIndex}Flow` as keyof PlanData;
    const rubricKey = `perf${perfIndex}RubricCriteria` as keyof PlanData;
    const startKey = `perf${perfIndex}StartDate` as keyof PlanData;
    const endKey = `perf${perfIndex}EndDate` as keyof PlanData;
    const periodKey = `perf${perfIndex}Period` as keyof PlanData;

    const perfName = String(data[nameKey] || "");
    const perfMethod = String(data[methodKey] || "");
    const areaScore = Number(data[scoreKey] ?? 100);
    const stdCodes = String(data[stdKey] || "");
    const stdText = getExpandedStdText(
      stdCodes,
      data.curriculumFullText,
      data.curriculumSubjects,
      data.curriculumSelectedOriginalIdx
    );
    const startDate = String(data[startKey] || "");
    const endDate = String(data[endKey] || "");
    const period = String(data[periodKey] || "");
    const dateDisplay = formatDateRangeDisplay(startDate, endDate) || period;

    if (!perfName.trim()) {
      showToast("먼저 2단계에서 수행평가명을 입력해주세요.");
      return;
    }

    setAiLoading((prev) => ({ ...prev, [perfIndex]: true }));
    setAiStepText((prev) => ({ ...prev, [perfIndex]: "1단계: 수행 과제 흐름 생성 중..." }));

    let generatedFlow = "";

    try {
      // -----------------------------------------------------------------
      // [1단계] 수행 과제 흐름 생성
      // -----------------------------------------------------------------
      const step1Prompt = `너는 대한민국 2022 개정 교육과정 기반 고등학교 수업 및 평가 설계 전문가야.
아래 제공된 수행평가 기본 정보와 성취기준을 분석하여, 학생이 실제로 수행할 "수행 과제 흐름(단계별 절차)"을 4~5단계로 명확하게 작성해줘.

[수행평가 기본 정보]
- 과목명: ${data.subjectName || ""}
- 수행평가명: ${perfName}
- 평가 방법: ${perfMethod || "보고서/실기/서술형"}
- 영역 만점: ${areaScore}점
- 평가 실시일/시기: ${dateDisplay || "(시기 미지정)"}
- 관련 교육과정 성취기준 (코드 및 전체 원문):
${stdText || "(선택된 성취기준 없음)"}

[수행 과제 흐름 작성 규칙]
1. 반드시 4~5단계의 짧고 명확한 번호 매김 형식으로 작성할 것.
   예시:
   1) 대상 분자 선정
   2) 분자 구조 모델링
   3) 극성 및 물질의 성질 분석
   4) 결과 해석 및 보고서 작성
2. 각 단계는 불필요한 서술형 수식어 없이 학생의 구체적인 핵심 활동을 단답형 또는 개조식으로 짧게 작성할 것 (단계당 15~25자 내외).
3. 긴 문장형 서술 금지 (예: "탐구 대상 분자를 선정하고 조사한다" (X) -> "대상 분자 선정" (O)).
4. 평가 방법이나 명칭에 '보고서'가 포함되어 있다면 마지막 단계는 "결과 해석 및 보고서 작성" 또는 "보고서 작성 및 제출" 형태로 마무리할 것.

[출력 형식: 반드시 아래 JSON 구조로만 출력할 것]
{
  "flow": "1) 대상 분자 선정\\n2) 분자 구조 모델링\\n3) 극성 및 물질의 성질 분석\\n4) 결과 해석 및 보고서 작성"
}`;

      const flowRes = await generateWithGemini({
        prompt: step1Prompt,
        responseMimeType: "application/json",
      });

      let flowParsed: any;
      try {
        flowParsed = JSON.parse(
          flowRes.replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/```\s*$/, "").trim()
        );
      } catch {
        throw new Error("수행 과제 흐름 AI 응답을 JSON으로 변환하지 못했습니다.");
      }

      generatedFlow = (flowParsed.flow || "").toString().trim();
      if (!generatedFlow) {
        throw new Error("수행 과제 흐름이 생성되지 않았습니다.");
      }

      // 1단계 결과 즉시 상태에 반영하여 화면에 표시
      onChange((prev) => ({
        ...prev,
        [flowKey]: generatedFlow,
      }));

      // -----------------------------------------------------------------
      // [2단계] 방금 생성된 수행 과제 흐름을 기준으로 루브릭 생성
      // -----------------------------------------------------------------
      setAiStepText((prev) => ({ ...prev, [perfIndex]: "2단계: 과제 흐름 기반 루브릭 생성 중..." }));

      const step2Prompt = `너는 대한민국 2022 개정 교육과정 기반 고등학교 수업 및 평가 설계 전문가야.
아래 제공된 수행평가 기본 정보와 성취기준, 그리고 [방금 새로 생성된 수행 과제 흐름]을 바탕으로 학생의 실제 활동을 직접 평가할 수 있는 "평가요소 및 채점기준(루브릭)"을 설계해줘.

[수행평가 기본 정보]
- 과목명: ${data.subjectName || ""}
- 수행평가명: ${perfName}
- 평가 방법: ${perfMethod || "보고서/실기/서술형"}
- 영역 만점: ${areaScore}점
- 관련 교육과정 성취기준 (코드 및 전체 원문):
${stdText || "(선택된 성취기준 없음)"}

[★방금 새로 생성된 수행 과제 흐름 (반드시 이 흐름의 실제 활동들을 평가요소로 설계할 것)]
${generatedFlow}

[루브릭 설계 규칙]
1. 평가요소(criteria) 개수 및 구성 (★매우 중요):
   - 평가요소는 반드시 **최소 3개 이상** (과제 흐름이 다양하거나 복잡한 경우 4개 이상)으로 구성할 것.
   - 억지로 3개로 고정하지 말고, 수행 과제 흐름의 핵심 활동들이 루브릭에서 누락되지 않도록 충실하게 구성할 것.
   - 각 평가요소는 위 [방금 새로 생성된 수행 과제 흐름]의 실제 학생 활동 및 단계와 직접 긴밀하게 연결되어야 함.
   - 서로 유사한 평가요소를 이름만 바꾸어 중복 생성하지 말 것.
   - 예시 (과제 흐름: '1) 대상 분자 선정 2) 분자 구조 모델링 3) 극성 및 물질의 성질 분석 4) 결과 해석 및 보고서 작성'):
     * 평가요소 1: 분자 구조 모델링
     * 평가요소 2: 극성 및 물질의 성질 분석
     * 평가요소 3: 결과 해석 및 과학적 설명
     * 평가요소 4: 보고서 구성 및 표현

2. 4단계 수행수준(levels):
   - 각 평가요소는 반드시 4단계 수행수준(1단계: 매우 잘함, 2단계: 잘함, 3단계: 보통, 4단계: 미흡)으로 작성할 것.
   - ★핵심 규칙(매우 중요): 최고점 바로 아래 단계부터 '부족함', '오류가 있음', '미흡함' 같은 감점형/부정적 표현을 절대 사용하지 말 것! 학생이 실제로 보여준 성취를 긍정적이고 관찰 가능한 행동 중심으로 기술할 것.
     * 1단계(최고점, 매우 잘함): 높은 정확성, 구체성, 논리성, 종합적 수행을 갖춘 기준 문장.
     * 2단계(잘함): 핵심 내용을 대부분 적절하게 수행한 수준. ('다소 부족함', '오류가 있음' 등의 부정적 표현 절대 금지, 핵심 개념을 바탕으로 적절히 수행한 긍정적 행동 서술)
     * 3단계(보통): 기본 개념과 핵심 원리를 파악하여 수행한 기준 문장.
     * 4단계(최저점, 미흡): 최소한의 수행이 확인되나 목표 도달에 한계가 있는 특성을 마지막 단계에서만 구체적으로 기술.

3. 점수 및 배점 조건 (검증 규칙 준수):
   - 생성된 모든 평가요소의 "최고점"의 합은 정확히 ${areaScore}점이 되어야 함 (예: 3개 요소일 때 35+35+30=100점, 4개 요소일 때 25+25+25+25=100점 등).
   - 각 평가요소의 "최저점에서 1점을 뺀 값"들의 합은 반드시 40점 미만이어야 함 (예: 3개 요소일 때 최저점이 각 10점, 10점, 10점이면 (9+9+9)=27점 < 40점).

[출력 형식: 반드시 아래 JSON 구조로만 출력할 것 (최소 3개 이상의 평가요소 포함)]
{
  "rubric": [
    {
      "name": "평가요소명1",
      "levels": [
        {"score": 35, "desc": "1단계(매우 잘함) 성취 기준 문장"},
        {"score": 30, "desc": "2단계(잘함) 긍정적/관찰 가능한 성취 기준 문장"},
        {"score": 25, "desc": "3단계(보통) 기본 개념 충족 성취 기준 문장"},
        {"score": 10, "desc": "4단계(미흡) 최소 수행 기준 문장"}
      ]
    },
    {
      "name": "평가요소명2",
      "levels": [
        {"score": 35, "desc": "1단계(매우 잘함) 성취 기준 문장"},
        {"score": 30, "desc": "2단계(잘함) 긍정적/관찰 가능한 성취 기준 문장"},
        {"score": 25, "desc": "3단계(보통) 기본 개념 충족 성취 기준 문장"},
        {"score": 10, "desc": "4단계(미흡) 최소 수행 기준 문장"}
      ]
    },
    {
      "name": "평가요소명3",
      "levels": [
        {"score": 30, "desc": "1단계(매우 잘함) 성취 기준 문장"},
        {"score": 25, "desc": "2단계(잘함) 긍정적/관찰 가능한 성취 기준 문장"},
        {"score": 20, "desc": "3단계(보통) 기본 개념 충족 성취 기준 문장"},
        {"score": 10, "desc": "4단계(미흡) 최소 수행 기준 문장"}
      ]
    }
  ]
}`;

      const rubricRes = await generateWithGemini({
        prompt: step2Prompt,
        responseMimeType: "application/json",
      });

      let rubricParsed: any;
      try {
        rubricParsed = JSON.parse(
          rubricRes.replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/```\s*$/, "").trim()
        );
      } catch {
        throw new Error("루브릭 AI 응답을 JSON으로 변환하지 못했습니다.");
      }

      let normalizedRubric: RubricCriterion[] = [];
      if (Array.isArray(rubricParsed.rubric)) {
        normalizedRubric = rubricParsed.rubric
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
      }

      if (normalizedRubric.length === 0) {
        throw new Error("유효한 루브릭 평가요소가 생성되지 않았습니다.");
      }

      // 2단계 결과 즉시 상태에 반영하여 화면에 표시 (과제 흐름과 루브릭 최종 동기화)
      onChange((prev) => ({
        ...prev,
        [flowKey]: generatedFlow,
        [rubricKey]: normalizedRubric,
      }));

      showToast(`[수행평가 ${perfIndex}] 과제 흐름 및 연계 루브릭 AI 생성이 완료되었습니다.`);
    } catch (err: any) {
      console.error("Unified AI Error:", err);
      showToast(`AI 생성 오류: ${err.message || err}`);
    } finally {
      setAiLoading((prev) => ({ ...prev, [perfIndex]: false }));
      setAiStepText((prev) => ({ ...prev, [perfIndex]: "" }));
    }
  };

  // Trigger button handler with overwrite confirmation check
  const handleAiButtonClick = (perfIndex: number) => {
    if (aiLoading[perfIndex]) return;

    if (hasExistingContent(perfIndex)) {
      setConfirmModalPerfIndex(perfIndex);
    } else {
      runUnifiedAi(perfIndex);
    }
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
      {/* Overwrite Confirmation Modal */}
      {confirmModalPerfIndex !== null && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-5 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5" />
              </div>
              <div className="space-y-1.5">
                <h3 className="font-bold text-slate-900 text-sm">수행 과제 흐름 및 루브릭 작성 확인</h3>
                <p className="text-xs text-slate-800 font-medium leading-relaxed">
                  AI를 활용하면 수행 과제 흐름과 루브릭을 새로 작성합니다. 계속하시겠습니까?
                </p>
                <p className="text-[11px] text-purple-700 bg-purple-50 p-2 rounded border border-purple-200">
                  ※ 1단계 과제 흐름 생성 후, 그 결과를 기준으로 2단계 연계 루브릭이 순차적으로 자동 작성됩니다.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setConfirmModalPerfIndex(null)}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-all cursor-pointer"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => {
                  const targetIdx = confirmModalPerfIndex;
                  setConfirmModalPerfIndex(null);
                  if (targetIdx !== null) {
                    runUnifiedAi(targetIdx);
                  }
                }}
                className="px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 shadow-md shadow-purple-600/20 transition-all cursor-pointer flex items-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5" /> 계속하기
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
              className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-all whitespace-nowrap shrink-0 cursor-pointer ${
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
        const isLoading = aiLoading[num] || false;

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

        return (
          <div key={num} className="p-4 border border-slate-200 rounded-lg space-y-4 bg-slate-50 shadow-sm">
            {/* Assessment Title and Info Header */}
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

            {/* Compact Clean AI Action Bar */}
            <div className="bg-white border border-slate-200 rounded-lg p-3 sm:p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
              <div>
                <h4 className="text-xs sm:text-sm font-bold text-slate-800 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-purple-600" />
                  <span>수행평가 AI 작성</span>
                </h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  수행 과제 흐름을 먼저 생성하고, 이를 기준으로 루브릭을 작성합니다.
                </p>
              </div>

              <button
                type="button"
                onClick={() => handleAiButtonClick(num)}
                disabled={isLoading}
                className={`w-full sm:w-auto px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-lg font-bold text-xs shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer shrink-0 ${
                  isLoading
                    ? "bg-purple-400 text-purple-50 cursor-not-allowed"
                    : "bg-purple-600 hover:bg-purple-700 text-white shadow-purple-600/20 active:scale-[0.98]"
                }`}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>AI 작성 중...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>✨ AI 활용하기</span>
                  </>
                )}
              </button>
            </div>

            {/* Related Standards Display */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                관련 교육과정 성취기준{" "}
                <span className="font-normal text-slate-400">(2단계에서 선택한 코드의 전체 원문 문구가 자동 연동됩니다)</span>
              </label>
              <textarea
                rows={4}
                value={stdExpanded || "- 성취기준이 지정되지 않았습니다 -"}
                readOnly
                className="w-full text-xs p-2.5 border rounded-lg border-slate-300 bg-slate-100/90 text-slate-800 leading-relaxed cursor-not-allowed font-medium shadow-xs"
              />
            </div>

            {/* Task Flow (Manual editing preserved, separate AI button removed) */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-[11px] font-semibold text-slate-700">수행 과제 흐름 (단계별 절차)</label>
                <span className="text-[10px] text-purple-600 font-medium">교사 직접 수정 가능</span>
              </div>
              <textarea
                rows={4}
                value={flow}
                onChange={(e) =>
                  onChange((prev) => ({ ...prev, [`perf${num}Flow` as keyof PlanData]: e.target.value }))
                }
                placeholder="1) 대상 분자 선정&#10;2) 분자 구조 모델링&#10;3) 극성 및 물질의 성질 분석&#10;4) 보고서 작성 및 제출"
                className="w-full text-xs p-2.5 border rounded-lg border-slate-300 bg-white focus:ring-2 focus:ring-blue-500 outline-none leading-relaxed font-medium"
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

            {/* Rubric Builder (Manual editing preserved, separate AI button removed) */}
            <div>
              <div className="flex justify-between items-center mb-1 flex-wrap gap-2">
                <label className="block text-[11px] font-semibold text-slate-700">
                  평가요소 및 채점기준 (루브릭)
                </label>
                <span className="text-[10px] text-purple-600 font-medium">교사 직접 수정 가능</span>
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
                  <div className="text-[11px] text-slate-400 italic py-3 text-center bg-white rounded-lg border border-dashed border-slate-300 space-y-1">
                    <p>작성된 평가요소가 없습니다.</p>
                    <p className="text-[10px] text-purple-600">
                      상단의 <b>✨ AI 활용하기</b> 버튼을 누르거나 아래 <b>+ 평가요소 추가</b> 버튼으로 직접 입력해주세요.
                    </p>
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
                            className="text-slate-400 hover:text-red-500 p-1 cursor-pointer"
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
                                className="text-slate-300 hover:text-red-500 text-xs mt-1 shrink-0 p-0.5 cursor-pointer"
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
                          className="text-[11px] text-blue-600 hover:text-blue-800 hover:underline font-medium cursor-pointer"
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
                  className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-blue-700 text-xs rounded-md font-semibold flex items-center gap-1 shadow-xs cursor-pointer"
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

