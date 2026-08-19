import React, { useState } from "react";
import { PlanData, CurriculumSubjectOption } from "../types";
import {
  FIXED_SCHOOL_NAME,
  FIXED_YEAR_SEMESTER,
  SUBJECT_GOALS_DB,
  getKoreanPrefix,
} from "../constants";
import {
  processHwpFile,
  findCurriculumSubjects,
  extractGoalParagraph,
  extractAchievementLevelsByStandard,
} from "../utils/hwpParser";
import { isThreeTier } from "../utils/achievementUtils";
import { Plus, Sparkles, X, Paperclip, CheckCircle2, AlertCircle } from "lucide-react";

interface Step1BasicInfoProps {
  data: PlanData;
  onChange: (updater: (prev: PlanData) => PlanData) => void;
  showToast: (msg: string) => void;
}

export const Step1BasicInfo: React.FC<Step1BasicInfoProps> = ({
  data,
  onChange,
  showToast,
}) => {
  const [hwpStatus, setHwpStatus] = useState<{ text: string; type: "info" | "success" | "error" | "loading" } | null>(
    data.curriculumFullText
      ? { text: `첨부된 교육과정에서 "${data.subjectName}" 과목이 적용 중입니다.`, type: "success" }
      : null
  );

  // Build subject options from cached curriculumSubjects
  const subjectOptions: CurriculumSubjectOption[] = [];
  if (data.curriculumSubjects) {
    data.curriculumSubjects.forEach((s, i) => {
      s.name
        .split(",")
        .map((part) => part.trim())
        .filter((part) => part.length > 0)
        .forEach((label) => subjectOptions.push({ label, originalIdx: i }));
    });
  }

  const selectedOptionIndex = subjectOptions.findIndex((o) => {
    if (data.curriculumSelectedOriginalIdx != null && data.subjectName) {
      return o.originalIdx === data.curriculumSelectedOriginalIdx && o.label === data.subjectName;
    }
    if (data.curriculumSelectedOriginalIdx != null) {
      return o.originalIdx === data.curriculumSelectedOriginalIdx;
    }
    if (data.subjectName) {
      return o.label === data.subjectName;
    }
    return false;
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    setHwpStatus({ text: "HWP 파일을 분석하고 있습니다...", type: "loading" });

    try {
      const fullText = await processHwpFile(file);
      const subjects = findCurriculumSubjects(fullText);

      if (subjects.length === 0) {
        setHwpStatus({
          text: "과목명을 찾지 못했습니다. 고등학교 교육과정 원문 파일을 확인해주세요.",
          type: "error",
        });
        return;
      }

      onChange((prev) => ({
        ...prev,
        curriculumFullText: fullText,
        curriculumSubjects: subjects,
        curriculumSelectedOriginalIdx: null,
      }));

      setHwpStatus({
        text: `${subjects.length}개 과목을 찾았습니다. 아래에서 과목을 선택해주세요.`,
        type: "success",
      });
      showToast("교육과정 파일 분석이 완료되었습니다.");
    } catch (err: any) {
      console.error("HWP parse error:", err);
      setHwpStatus({
        text: `파일 분석 오류: ${err.message || err}`,
        type: "error",
      });
    }
  };

  const handleSubjectSelect = (optIndexStr: string) => {
    if (!optIndexStr || !data.curriculumFullText || !data.curriculumSubjects) return;
    const optIdx = parseInt(optIndexStr, 10);
    const option = subjectOptions[optIdx];
    if (!option) return;

    const subjectName = option.label;
    const originalIdx = option.originalIdx;
    const isDifferentSubject =
      data.curriculumSelectedOriginalIdx !== originalIdx || data.subjectName !== subjectName;
    const para = extractGoalParagraph(data.curriculumFullText, data.curriculumSubjects, originalIdx);

    // If subject changes, check cache or re-extract achievement levels
    let reExtractedAchieve: {
      achieveA: string;
      achieveB: string;
      achieveC: string;
      achieveD: string;
      achieveE: string;
    } = { achieveA: "", achieveB: "", achieveC: "", achieveD: "", achieveE: "" };

    let updatedCache = data.achievementLevelsCache;

    if (isDifferentSubject) {
      if (data.achievementLevelsCache && data.achievementLevelsCache[subjectName]) {
        const cached = data.achievementLevelsCache[subjectName];
        reExtractedAchieve = {
          achieveA: cached.achieveA,
          achieveB: cached.achieveB,
          achieveC: cached.achieveC,
          achieveD: cached.achieveD,
          achieveE: cached.achieveE,
        };
      } else if (data.achievementLevelsFullText) {
        const is3Tier = isThreeTier(data.gradeType);
        const extracted = extractAchievementLevelsByStandard(
          data.achievementLevelsFullText,
          subjectName,
          is3Tier
        );
        if (extracted.achieveA || extracted.achieveB || extracted.achieveC) {
          reExtractedAchieve = {
            achieveA: extracted.achieveA,
            achieveB: extracted.achieveB,
            achieveC: extracted.achieveC,
            achieveD: extracted.achieveD,
            achieveE: extracted.achieveE,
          };
          updatedCache = {
            ...(data.achievementLevelsCache || {}),
            [subjectName]: {
              ...reExtractedAchieve,
              totalStandards: extracted.totalStandards,
              extractedStandards: extracted.extractedStandards,
            },
          };
        }
      }
    }

    onChange((prev) => {
      const newPolicies = [...prev.policyItems];
      if (para) {
        newPolicies[0] = para;
      }
      return {
        ...prev,
        subjectName,
        curriculumSelectedOriginalIdx: originalIdx,
        policyItems: newPolicies,
        ...(isDifferentSubject
          ? {
              midStd: "",
              finalStd: "",
              perf1Std: "",
              perf2Std: "",
              perf3Std: "",
              perf4Std: "",
              schedules: prev.schedules.map((s) => ({ ...s, topic: "", std: "", detail: "" })),
              achieveA: reExtractedAchieve.achieveA,
              achieveB: reExtractedAchieve.achieveB,
              achieveC: reExtractedAchieve.achieveC,
              achieveD: reExtractedAchieve.achieveD,
              achieveE: reExtractedAchieve.achieveE,
              achievementLevelsCache: updatedCache || prev.achievementLevelsCache,
              minCompetency: "",
            }
          : {}),
      };
    });

    if (para) {
      setHwpStatus({
        text: `"${subjectName}" 과목으로 설정되었고, 목표 문구가 「가.」 항목에 자동 반영되었습니다.`,
        type: "success",
      });
      showToast(`"${subjectName}" 과목 교육과정 목표가 반영되었습니다.`);
    } else {
      setHwpStatus({
        text: `"${subjectName}" 과목으로 설정되었습니다.`,
        type: "success",
      });
    }
  };

  const handleApplyStandardPolicy = () => {
    const currentSubj = data.subjectName || "화학";
    const officialGoal =
      SUBJECT_GOALS_DB[currentSubj] ||
      "자연 현상에 대한 흥미와 호기심을 가지고 핵심 개념을 이해하며 과학적 탐구 능력과 문제 해결력을 기른다.";

    const defaultItems = [
      officialGoal,
      "학습자의 실생활 맥락과 연계한 수행평가를 설계·실시하고 수업 과정에서 형성평가를 활용하여 학생의 학습 상태를 파악하며, 그 결과를 바탕으로 개별 학습 수준에 맞는 맞춤형 피드백과 지원을 제공하여 모든 학생이 학습 목표에 도달하도록 한다.",
      "평가 과정에 학생이 주체적으로 참여하도록 하고, 학습 목표와 수행 과정을 명확히 제시하며 현재 수준과 개선 방향에 대한 구체적인 피드백을 제공함으로써 성장 중심 평가를 구현한다.",
      "수행평가의 전 과정에서 학문적 정직성을 기반으로 학생의 성장을 지원하는 평가 환경을 조성한다. 평가 과정에서 타인의 결과물을 그대로 사용하는 행위 및 교사가 안내한 AI의 허용 범위를 벗어난 활용, 학생 간 공모 및 담합, 기존 제출물의 재사용 등 학문적 정직성 위반 행위에 대해 평소 지속적으로 교육하고, 평가 실시 전 이를 재안내한다.",
    ];

    onChange((prev) => ({
      ...prev,
      policyItems: defaultItems,
    }));
    showToast("2026학년도 표준 평가 방침 문구가 적용되었습니다.");
  };

  const addPolicyItem = () => {
    onChange((prev) => ({
      ...prev,
      policyItems: [...prev.policyItems, ""],
    }));
  };

  const removePolicyItem = (idx: number) => {
    onChange((prev) => ({
      ...prev,
      policyItems: prev.policyItems.filter((_, i) => i !== idx),
    }));
  };

  const updatePolicyItem = (idx: number, val: string) => {
    onChange((prev) => {
      const items = [...prev.policyItems];
      items[idx] = val;
      return { ...prev, policyItems: items };
    });
  };

  return (
    <div className="space-y-5">
      <div className="border-b border-slate-200 pb-3 flex justify-between items-center gap-2">
        <div>
          <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">
              1
            </span>
            기본 정보 및 교과 평가 방침
          </h2>
          <p className="text-xs text-slate-500 mt-1">개설 과목의 기본적인 사항과 평가 기본 방향을 설정합니다.</p>
        </div>
        <span className="text-xs bg-blue-50 text-blue-700 px-3 py-1 rounded-full border border-blue-200 font-medium whitespace-nowrap">
          1 / 5 단계
        </span>
      </div>

      {/* Fixed Read-Only Info Box */}
      <div className="bg-slate-100 border border-slate-300 rounded-lg p-3 text-xs grid grid-cols-2 gap-3 text-slate-700">
        <div className="flex items-center gap-2">
          <span className="text-blue-600">📅</span>
          <span className="font-bold text-slate-600">학년도·학기:</span>
          <span className="font-extrabold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200">
            {FIXED_YEAR_SEMESTER}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-blue-600">🏫</span>
          <span className="font-bold text-slate-600">학교명:</span>
          <span className="font-extrabold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200">
            {FIXED_SCHOOL_NAME}
          </span>
        </div>
      </div>

      {/* Curriculum HWP file attachment */}
      <div className="border border-dashed border-blue-300 bg-blue-50/40 rounded-lg p-3 space-y-2.5">
        <label className="block text-xs font-bold text-blue-900 flex items-center gap-1.5">
          <Paperclip className="w-3.5 h-3.5 text-blue-600" />
          <span>교육과정 파일 첨부 (HWP)</span>
        </label>
        <p className="text-[11px] text-slate-500">
          교육과정 원문(.hwp)을 첨부하면 문서 안의 고등학교 과목명 및 총괄 목표를 자동으로 찾아드립니다.
        </p>
        <div className="flex items-center gap-2">
          <input
            type="file"
            accept=".hwp"
            onChange={handleFileUpload}
            className="text-xs flex-1 file:mr-2 file:px-2.5 file:py-1.5 file:rounded-md file:border-0 file:bg-blue-600 file:text-white file:text-xs file:cursor-pointer bg-white border border-slate-300 rounded-md"
          />
        </div>

        {hwpStatus && (
          <div
            className={`text-[11px] flex items-center gap-1.5 ${
              hwpStatus.type === "success"
                ? "text-emerald-700 font-medium"
                : hwpStatus.type === "error"
                ? "text-red-600"
                : "text-blue-600"
            }`}
          >
            {hwpStatus.type === "success" && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
            {hwpStatus.type === "error" && <AlertCircle className="w-3.5 h-3.5 text-red-600" />}
            <span>{hwpStatus.text}</span>
          </div>
        )}

        {subjectOptions.length > 0 && (
          <div className="pt-1">
            <label className="block text-xs font-semibold text-slate-700 mb-1">인식된 과목 선택</label>
            <select
              value={selectedOptionIndex >= 0 ? String(selectedOptionIndex) : ""}
              onChange={(e) => handleSubjectSelect(e.target.value)}
              className="w-full text-xs p-2 border rounded-md border-slate-300 bg-white shadow-sm focus:ring-2 focus:ring-blue-500 outline-none font-medium text-slate-800"
            >
              <option value="">-- 과목을 선택하세요 --</option>
              {subjectOptions.map((opt, i) => (
                <option key={i} value={String(i)}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">교과 / 과목명</label>
          <input
            type="text"
            value={data.subjectName}
            onChange={(e) => {
              const newName = e.target.value;
              const matchedOpt = subjectOptions.find((o) => o.label === newName.trim());
              const isDiff = newName.trim() !== data.subjectName.trim();
              let reExtractedAchieve = { achieveA: "", achieveB: "", achieveC: "", achieveD: "", achieveE: "" };
              let updatedCache = data.achievementLevelsCache;
              if (isDiff && newName.trim()) {
                if (data.achievementLevelsCache && data.achievementLevelsCache[newName.trim()]) {
                  const cached = data.achievementLevelsCache[newName.trim()];
                  reExtractedAchieve = {
                    achieveA: cached.achieveA,
                    achieveB: cached.achieveB,
                    achieveC: cached.achieveC,
                    achieveD: cached.achieveD,
                    achieveE: cached.achieveE,
                  };
                } else if (data.achievementLevelsFullText) {
                  const is3Tier = isThreeTier(data.gradeType);
                  const extracted = extractAchievementLevelsByStandard(
                    data.achievementLevelsFullText,
                    newName.trim(),
                    is3Tier
                  );
                  if (extracted.subjectFound && (extracted.achieveA || extracted.achieveB || extracted.achieveC)) {
                    reExtractedAchieve = {
                      achieveA: extracted.achieveA,
                      achieveB: extracted.achieveB,
                      achieveC: extracted.achieveC,
                      achieveD: extracted.achieveD,
                      achieveE: extracted.achieveE,
                    };
                    updatedCache = {
                      ...(data.achievementLevelsCache || {}),
                      [newName.trim()]: {
                        ...reExtractedAchieve,
                        totalStandards: extracted.totalStandards,
                        extractedStandards: extracted.extractedStandards,
                      },
                    };
                  }
                }
              }

              onChange((prev) => ({
                ...prev,
                subjectName: newName,
                curriculumSelectedOriginalIdx: matchedOpt ? matchedOpt.originalIdx : prev.curriculumSelectedOriginalIdx,
                ...(isDiff
                  ? {
                      achieveA: reExtractedAchieve.achieveA,
                      achieveB: reExtractedAchieve.achieveB,
                      achieveC: reExtractedAchieve.achieveC,
                      achieveD: reExtractedAchieve.achieveD,
                      achieveE: reExtractedAchieve.achieveE,
                      achievementLevelsCache: updatedCache || prev.achievementLevelsCache,
                    }
                  : {}),
              }));
            }}
            placeholder="과목명을 입력하거나 상단 교육과정에서 선택하세요"
            title="상단 「인식된 과목 선택」에서 선택한 과목명이 자동으로 연동됩니다."
            className="w-full text-xs p-2 border rounded-md border-slate-300 bg-white text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none font-semibold shadow-xs"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">대상 학년 / 단위(학점)</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={data.grade}
              placeholder="학년 (예: 2)"
              onChange={(e) => onChange((prev) => ({ ...prev, grade: e.target.value }))}
              className="w-1/2 text-xs p-2 border rounded-md border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none"
            />
            <input
              type="text"
              value={data.credit}
              placeholder="학점 (예: 4)"
              onChange={(e) => onChange((prev) => ({ ...prev, credit: e.target.value }))}
              className="w-1/2 text-xs p-2 border rounded-md border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
        </div>

        {/* Box Single Select for Achievement Grade / Rank Grade */}
        <div className="col-span-2">
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">성취도(석차등급)</label>
          <div className="grid grid-cols-3 gap-2">
            {["5단계(5등급)", "3단계", "P/F"].map((opt) => {
              const isSelected = data.gradeType === opt;
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => onChange((prev) => ({ ...prev, gradeType: opt }))}
                  className={`flex items-center justify-center p-2.5 text-xs rounded-lg transition-all ${
                    isSelected
                      ? "font-bold border-2 border-blue-600 bg-blue-50 text-blue-700 shadow-sm"
                      : "font-medium border border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50"
                  }`}
                >
                  <span>{opt}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="col-span-2">
          <label className="block text-xs font-semibold text-slate-700 mb-1">기준학급 / 지도교사</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={data.classDays}
              placeholder="기준학급 (예: 2A(월6, 화5, 수7, 목5))"
              onChange={(e) => onChange((prev) => ({ ...prev, classDays: e.target.value }))}
              className="w-1/2 text-xs p-2 border rounded-md border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none"
            />
            <input
              type="text"
              value={data.teacher}
              placeholder="교사명 (예: 정예진)"
              onChange={(e) => onChange((prev) => ({ ...prev, teacher: e.target.value }))}
              className="w-1/2 text-xs p-2 border rounded-md border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
        </div>
      </div>

      <div className="pt-2">
        <div className="flex justify-between items-center mb-2 flex-wrap gap-2">
          <label className="block text-xs font-semibold text-slate-700">평가 목적 및 방향, 방침 문구 (항목별)</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleApplyStandardPolicy}
              className="text-xs text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1 font-medium"
            >
              <Sparkles className="w-3 h-3 text-blue-500" /> 2026 표준문구 채우기
            </button>
            <button
              type="button"
              onClick={addPolicyItem}
              className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded-md flex items-center gap-1 shadow-sm font-medium"
            >
              <Plus className="w-3 h-3" /> 항목 추가
            </button>
          </div>
        </div>

        <div className="space-y-2">
          {data.policyItems.map((item, idx) => {
            const prefix = getKoreanPrefix(idx);
            return (
              <div key={idx} className="flex gap-2 items-start bg-slate-50 p-2 rounded-lg border border-slate-200">
                <span className="font-bold text-xs text-blue-700 mt-2 shrink-0 w-5 text-right">{prefix}.</span>
                <textarea
                  rows={2}
                  value={item}
                  onChange={(e) => updatePolicyItem(idx, e.target.value)}
                  className="flex-1 text-xs p-2 border rounded border-slate-300 font-sans leading-relaxed bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                />
                <button
                  type="button"
                  onClick={() => removePolicyItem(idx)}
                  className="text-slate-400 hover:text-red-500 p-1.5 mt-1 transition-colors"
                  title="항목 삭제"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>

        <p className="text-[11px] text-slate-500 mt-1.5">
          ※ 항목 추가/삭제 시 (가, 나, 다...) 항목 번호가 문서에 자동으로 정렬되어 출력됩니다.
        </p>
      </div>
    </div>
  );
};
