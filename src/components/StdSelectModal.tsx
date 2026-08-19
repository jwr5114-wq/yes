import React, { useState, useEffect } from "react";
import { AchievementStandard } from "../types";
import { extractAchievementStandards, sortAchievementStandardCodes, expandRangeCodes } from "../utils/hwpParser";
import { BookOpen, X, CheckSquare, Square } from "lucide-react";

interface StdSelectModalProps {
  isOpen: boolean;
  target: "mid" | "final" | "perf1" | "perf2" | "perf3" | "perf4" | number | null;
  curriculumFullText?: string;
  curriculumSubjects?: Array<{ name: string; headingIndex: number }>;
  curriculumSelectedOriginalIdx?: number | null;
  initialValue: string;
  onClose: () => void;
  onConfirm: (selectedCodesString: string) => void;
}

export const StdSelectModal: React.FC<StdSelectModalProps> = ({
  isOpen,
  target,
  curriculumFullText,
  curriculumSubjects,
  curriculumSelectedOriginalIdx,
  initialValue,
  onClose,
  onConfirm,
}) => {
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set());

  const standards: AchievementStandard[] =
    curriculumFullText && curriculumSubjects && curriculumSelectedOriginalIdx != null
      ? extractAchievementStandards(curriculumFullText, curriculumSubjects, curriculumSelectedOriginalIdx)
      : [];

  useEffect(() => {
    if (isOpen) {
      const validSubjectCodeSet = new Set(standards.map((s) => s.code));
      const expandedInitial = expandRangeCodes(initialValue);
      // Only keep codes that strictly belong to the current subject's standards
      const currentCodes = new Set(
        validSubjectCodeSet.size > 0
          ? expandedInitial.filter((code) => validSubjectCodeSet.has(code))
          : expandedInitial
      );
      setSelectedCodes(currentCodes);
    }
  }, [isOpen, initialValue, curriculumSelectedOriginalIdx]);

  if (!isOpen || target === null) return null;

  const toggleCode = (code: string) => {
    const next = new Set(selectedCodes);
    if (next.has(code)) {
      next.delete(code);
    } else {
      next.add(code);
    }
    setSelectedCodes(next);
  };

  const handleSelectAll = () => {
    const all = new Set(standards.map((s) => s.code));
    setSelectedCodes(all);
  };

  const handleClearAll = () => {
    setSelectedCodes(new Set());
  };

  const handleApply = () => {
    const validSubjectCodeSet = new Set(standards.map((s) => s.code));
    const finalCodes = (Array.from(selectedCodes) as string[]).filter(
      (c: string) => validSubjectCodeSet.size === 0 || validSubjectCodeSet.has(c)
    );
    const sorted = sortAchievementStandardCodes(finalCodes);
    const joined = sorted.map((c) => `[${c}]`).join(", ");
    onConfirm(joined);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-xl w-full max-h-[85vh] flex flex-col overflow-hidden border border-slate-200">
        <div className="px-6 py-4 bg-slate-900 text-white flex justify-between items-center">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-blue-400" />
            <h3 className="font-bold text-base">교육과정 성취기준 선택</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-3 bg-blue-50 border-b border-blue-200 text-xs text-blue-900 flex justify-between items-center flex-wrap gap-2">
          <span>첨부한 교육과정에서 추출한 성취기준입니다. 적용할 항목을 선택해주세요.</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSelectAll}
              className="text-[11px] text-blue-700 hover:underline font-semibold"
            >
              전체 선택
            </button>
            <span className="text-blue-300">|</span>
            <button
              type="button"
              onClick={handleClearAll}
              className="text-[11px] text-blue-700 hover:underline font-semibold"
            >
              전체 해제
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-1">
          {standards.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-xs">
              선택된 과목에서 추출된 성취기준이 없습니다.
              <br />
              1단계에서 교육과정 HWP 파일을 첨부하고 과목을 선택해주세요.
            </div>
          ) : (
            standards.map((s) => {
              const isChecked = selectedCodes.has(s.code);
              return (
                <label
                  key={s.code}
                  className={`flex items-start gap-2.5 p-2.5 rounded-lg border transition-all cursor-pointer text-xs ${
                    isChecked
                      ? "bg-blue-50/70 border-blue-300 text-blue-950 font-medium"
                      : "bg-white border-slate-100 hover:bg-slate-50 text-slate-700"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggleCode(s.code)}
                    className="mt-0.5 text-blue-600 focus:outline-none"
                  >
                    {isChecked ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4 text-slate-400" />}
                  </button>
                  <div onClick={() => toggleCode(s.code)} className="flex-1">
                    <span className="font-bold text-blue-700 mr-1.5">[{s.code}]</span>
                    <span className="leading-relaxed">{s.text}</span>
                  </div>
                </label>
              );
            })
          )}
        </div>

        <div className="p-4 bg-slate-100 border-t flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg shadow-xs"
          >
            취소
          </button>
          <button
            onClick={handleApply}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg shadow"
          >
            선택 완료 ({selectedCodes.size}개)
          </button>
        </div>
      </div>
    </div>
  );
};
