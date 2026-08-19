import React from "react";
import { PlanData } from "../types";
import { formatStdCodesForDisplay } from "../utils/hwpParser";
import { calcPeriodFromDates, formatDateRangeDisplay } from "../utils/dateUtils";
import { BookOpen, AlertTriangle, Calendar } from "lucide-react";

interface Step2AssessmentOverviewProps {
  data: PlanData;
  onChange: (updater: (prev: PlanData) => PlanData) => void;
  onOpenStdModal: (target: "mid" | "final" | "perf1" | "perf2" | "perf3" | "perf4") => void;
}

export const Step2AssessmentOverview: React.FC<Step2AssessmentOverviewProps> = ({
  data,
  onChange,
  onOpenStdModal,
}) => {
  return (
    <div className="space-y-5">
      <div className="border-b border-slate-200 pb-3 flex justify-between items-center gap-2">
        <div>
          <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">
              2
            </span>
            평가 개요 및 반영 비율
          </h2>
          <p className="text-xs text-slate-500 mt-1">정기시험(지필) 및 수행평가의 비율과 영역을 설정합니다.</p>
        </div>
        <span className="text-xs bg-blue-50 text-blue-700 px-3 py-1 rounded-full border border-blue-200 font-medium whitespace-nowrap">
          2 / 5 단계
        </span>
      </div>

      {/* 2026 규정 안내 박스 */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900 space-y-1">
        <div className="font-bold flex items-center gap-1.5 text-amber-950">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          <span>2026학년도 필수 확인 규정</span>
        </div>
        <p>1. 지필평가 공식 용어가 <b>'정기시험'</b>으로 변경되었습니다.</p>
        <p>2. 수행평가는 한 학기 환산점 100점 중 <b>40% 이상(2개 영역 이상)</b> 권장됩니다.</p>
        <p>3. 서술형 문항 배점은 한 학기 환산점 100점 중 <b>20% 이상</b> 지정해야 합니다.</p>
      </div>

      {/* ① 정기시험 입력 영역 */}
      <div className="border-2 border-blue-200 rounded-xl p-4 bg-blue-50/40 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-sm font-bold text-blue-900 flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px]">
              1
            </span>
            정기시험 (지필평가)
          </h3>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-slate-700">횟수</span>
              {[0, 1, 2].map((cnt) => (
                <button
                  key={cnt}
                  type="button"
                  onClick={() => onChange((prev) => ({ ...prev, examCount: cnt }))}
                  className={`px-2.5 py-1 text-xs border rounded-md transition-all ${
                    data.examCount === cnt
                      ? "font-bold bg-blue-600 text-white border-blue-600 shadow-sm"
                      : "font-medium bg-white text-slate-600 border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  {cnt}개
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-slate-700">총 반영비율</span>
              <div className="flex items-center border border-slate-300 rounded-md bg-white px-2 shadow-sm focus-within:ring-2 focus-within:ring-blue-500">
                <input
                  type="number"
                  value={data.examRatio}
                  onChange={(e) =>
                    onChange((prev) => ({ ...prev, examRatio: parseInt(e.target.value, 10) || 0 }))
                  }
                  className="w-12 text-xs py-1.5 outline-none font-bold text-blue-600 bg-transparent text-right"
                />
                <span className="text-xs text-slate-500 font-bold ml-1">%</span>
              </div>
            </div>
          </div>
        </div>

        {/* 중간시험 */}
        {data.examCount >= 1 && (
          <div className="p-4 bg-white border border-slate-200 rounded-lg text-xs space-y-3 shadow-sm">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">시험명 (정기시험 1)</label>
                <input
                  type="text"
                  value={data.examName1}
                  onChange={(e) => onChange((prev) => ({ ...prev, examName1: e.target.value }))}
                  className="w-full p-2 border rounded-md border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">총 반영비율</label>
                <div className="flex items-center border border-slate-300 rounded-md bg-white px-2">
                  <input
                    type="number"
                    value={data.midTotalRatio}
                    onChange={(e) =>
                      onChange((prev) => ({ ...prev, midTotalRatio: parseInt(e.target.value, 10) || 0 }))
                    }
                    className="w-full py-2 outline-none text-right font-bold text-blue-600 bg-transparent"
                  />
                  <span className="text-xs text-slate-500 font-bold ml-1">%</span>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">선택형 점수</label>
                <input
                  type="number"
                  value={data.midSelectScore}
                  onChange={(e) =>
                    onChange((prev) => ({ ...prev, midSelectScore: parseInt(e.target.value, 10) || 0 }))
                  }
                  placeholder="점"
                  className="w-full p-2 border rounded-md border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none"
                />
                <div className="mt-1 flex items-center gap-1 text-[11px] text-slate-500">
                  자동 반영비율:
                  <input
                    type="number"
                    value={data.midSelectRatio}
                    readOnly
                    className="w-12 p-1 border rounded bg-slate-100 text-right text-slate-500 cursor-not-allowed"
                  />
                  %
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">단답형 점수</label>
                <input
                  type="number"
                  value={data.midShortScore}
                  onChange={(e) =>
                    onChange((prev) => ({ ...prev, midShortScore: parseInt(e.target.value, 10) || 0 }))
                  }
                  placeholder="점"
                  className="w-full p-2 border rounded-md border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none"
                />
                <div className="mt-1 flex items-center gap-1 text-[11px] text-slate-500">
                  자동 반영비율:
                  <input
                    type="number"
                    value={data.midShortRatio}
                    readOnly
                    className="w-12 p-1 border rounded bg-slate-100 text-right text-slate-500 cursor-not-allowed"
                  />
                  %
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">서·논술형 점수</label>
                <input
                  type="number"
                  value={data.midEssayScore}
                  onChange={(e) =>
                    onChange((prev) => ({ ...prev, midEssayScore: parseInt(e.target.value, 10) || 0 }))
                  }
                  placeholder="점"
                  className="w-full p-2 border rounded-md border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none"
                />
                <div className="mt-1 flex items-center gap-1 text-[11px] text-slate-500">
                  자동 반영비율:
                  <input
                    type="number"
                    value={data.midEssayRatio}
                    readOnly
                    className="w-12 p-1 border rounded bg-slate-100 text-right text-slate-500 cursor-not-allowed"
                  />
                  %
                </div>
              </div>
            </div>
            {/* 중간시험 평가 실시일 및 시기 */}
            <div className="p-3 bg-blue-50/50 rounded-lg border border-blue-200/80 space-y-1.5">
              <div className="flex items-center gap-1.5 font-bold text-slate-700 text-xs">
                <Calendar className="w-3.5 h-3.5 text-blue-600" />
                <span>평가 실시일 (실제 시험 기간)</span>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={data.midStartDate || ""}
                  onChange={(e) => {
                    const newStart = e.target.value;
                    const nextEnd = (!data.midEndDate || data.midEndDate < newStart) ? newStart : data.midEndDate;
                    const newPeriod = calcPeriodFromDates(newStart, nextEnd);
                    const newDisplay = formatDateRangeDisplay(newStart, nextEnd);
                    onChange((prev) => ({
                      ...prev,
                      midStartDate: newStart,
                      midEndDate: nextEnd,
                      midPeriod: newPeriod,
                      midTime: newDisplay || prev.midTime,
                    }));
                  }}
                  className="flex-1 p-2 text-xs bg-white border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none font-medium text-slate-800 shadow-xs"
                />
                <span className="text-slate-400 font-bold text-sm">~</span>
                <input
                  type="date"
                  value={data.midEndDate || ""}
                  min={data.midStartDate || undefined}
                  onChange={(e) => {
                    const newEnd = e.target.value;
                    const nextStart = (!data.midStartDate || data.midStartDate > newEnd) ? newEnd : data.midStartDate;
                    const newPeriod = calcPeriodFromDates(nextStart, newEnd);
                    const newDisplay = formatDateRangeDisplay(nextStart, newEnd);
                    onChange((prev) => ({
                      ...prev,
                      midStartDate: nextStart,
                      midEndDate: newEnd,
                      midPeriod: newPeriod,
                      midTime: newDisplay || prev.midTime,
                    }));
                  }}
                  className="flex-1 p-2 text-xs bg-white border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none font-medium text-slate-800 shadow-xs"
                />
              </div>

              <div className="text-[11px] text-slate-500 font-medium pl-0.5">
                평가 시기: <span className="text-blue-700 font-semibold">{data.midPeriod || data.midTime || "-"}</span>
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-[11px] font-semibold text-slate-700">관련 교육과정 성취기준</label>
                <button
                  type="button"
                  onClick={() => onOpenStdModal("mid")}
                  className="text-[11px] text-blue-600 hover:underline font-semibold flex items-center gap-1"
                >
                  <BookOpen className="w-3 h-3" /> 성취기준 선택
                </button>
              </div>
              <input
                type="text"
                value={formatStdCodesForDisplay(data.midStd)}
                readOnly
                placeholder="성취기준 선택 버튼을 눌러 지정하세요"
                className="w-full p-2 border rounded-md border-slate-300 bg-slate-50 text-slate-600 cursor-not-allowed"
              />
            </div>
          </div>
        )}

        {/* 기말시험 */}
        {data.examCount >= 2 && (
          <div className="p-4 bg-white border border-slate-200 rounded-lg text-xs space-y-3 shadow-sm">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">시험명 (정기시험 2)</label>
                <input
                  type="text"
                  value={data.examName2}
                  onChange={(e) => onChange((prev) => ({ ...prev, examName2: e.target.value }))}
                  className="w-full p-2 border rounded-md border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">총 반영비율</label>
                <div className="flex items-center border border-slate-300 rounded-md bg-white px-2">
                  <input
                    type="number"
                    value={data.finalTotalRatio}
                    onChange={(e) =>
                      onChange((prev) => ({ ...prev, finalTotalRatio: parseInt(e.target.value, 10) || 0 }))
                    }
                    className="w-full py-2 outline-none text-right font-bold text-blue-600 bg-transparent"
                  />
                  <span className="text-xs text-slate-500 font-bold ml-1">%</span>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">선택형 점수</label>
                <input
                  type="number"
                  value={data.finalSelectScore}
                  onChange={(e) =>
                    onChange((prev) => ({ ...prev, finalSelectScore: parseInt(e.target.value, 10) || 0 }))
                  }
                  placeholder="점"
                  className="w-full p-2 border rounded-md border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none"
                />
                <div className="mt-1 flex items-center gap-1 text-[11px] text-slate-500">
                  자동 반영비율:
                  <input
                    type="number"
                    value={data.finalSelectRatio}
                    readOnly
                    className="w-12 p-1 border rounded bg-slate-100 text-right text-slate-500 cursor-not-allowed"
                  />
                  %
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">단답형 점수</label>
                <input
                  type="number"
                  value={data.finalShortScore}
                  onChange={(e) =>
                    onChange((prev) => ({ ...prev, finalShortScore: parseInt(e.target.value, 10) || 0 }))
                  }
                  placeholder="점"
                  className="w-full p-2 border rounded-md border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none"
                />
                <div className="mt-1 flex items-center gap-1 text-[11px] text-slate-500">
                  자동 반영비율:
                  <input
                    type="number"
                    value={data.finalShortRatio}
                    readOnly
                    className="w-12 p-1 border rounded bg-slate-100 text-right text-slate-500 cursor-not-allowed"
                  />
                  %
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">서·논술형 점수</label>
                <input
                  type="number"
                  value={data.finalEssayScore}
                  onChange={(e) =>
                    onChange((prev) => ({ ...prev, finalEssayScore: parseInt(e.target.value, 10) || 0 }))
                  }
                  placeholder="점"
                  className="w-full p-2 border rounded-md border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none"
                />
                <div className="mt-1 flex items-center gap-1 text-[11px] text-slate-500">
                  자동 반영비율:
                  <input
                    type="number"
                    value={data.finalEssayRatio}
                    readOnly
                    className="w-12 p-1 border rounded bg-slate-100 text-right text-slate-500 cursor-not-allowed"
                  />
                  %
                </div>
              </div>
            </div>
            {/* 기말시험 평가 실시일 및 시기 */}
            <div className="p-3 bg-blue-50/50 rounded-lg border border-blue-200/80 space-y-1.5">
              <div className="flex items-center gap-1.5 font-bold text-slate-700 text-xs">
                <Calendar className="w-3.5 h-3.5 text-blue-600" />
                <span>평가 실시일 (실제 시험 기간)</span>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={data.finalStartDate || ""}
                  onChange={(e) => {
                    const newStart = e.target.value;
                    const nextEnd = (!data.finalEndDate || data.finalEndDate < newStart) ? newStart : data.finalEndDate;
                    const newPeriod = calcPeriodFromDates(newStart, nextEnd);
                    const newDisplay = formatDateRangeDisplay(newStart, nextEnd);
                    onChange((prev) => ({
                      ...prev,
                      finalStartDate: newStart,
                      finalEndDate: nextEnd,
                      finalPeriod: newPeriod,
                      finalTime: newDisplay || prev.finalTime,
                    }));
                  }}
                  className="flex-1 p-2 text-xs bg-white border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none font-medium text-slate-800 shadow-xs"
                />
                <span className="text-slate-400 font-bold text-sm">~</span>
                <input
                  type="date"
                  value={data.finalEndDate || ""}
                  min={data.finalStartDate || undefined}
                  onChange={(e) => {
                    const newEnd = e.target.value;
                    const nextStart = (!data.finalStartDate || data.finalStartDate > newEnd) ? newEnd : data.finalStartDate;
                    const newPeriod = calcPeriodFromDates(nextStart, newEnd);
                    const newDisplay = formatDateRangeDisplay(nextStart, newEnd);
                    onChange((prev) => ({
                      ...prev,
                      finalStartDate: nextStart,
                      finalEndDate: newEnd,
                      finalPeriod: newPeriod,
                      finalTime: newDisplay || prev.finalTime,
                    }));
                  }}
                  className="flex-1 p-2 text-xs bg-white border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none font-medium text-slate-800 shadow-xs"
                />
              </div>

              <div className="text-[11px] text-slate-500 font-medium pl-0.5">
                평가 시기: <span className="text-blue-700 font-semibold">{data.finalPeriod || data.finalTime || "-"}</span>
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-[11px] font-semibold text-slate-700">관련 교육과정 성취기준</label>
                <button
                  type="button"
                  onClick={() => onOpenStdModal("final")}
                  className="text-[11px] text-blue-600 hover:underline font-semibold flex items-center gap-1"
                >
                  <BookOpen className="w-3 h-3" /> 성취기준 선택
                </button>
              </div>
              <input
                type="text"
                value={formatStdCodesForDisplay(data.finalStd)}
                readOnly
                placeholder="성취기준 선택 버튼을 눌러 지정하세요"
                className="w-full p-2 border rounded-md border-slate-300 bg-slate-50 text-slate-600 cursor-not-allowed"
              />
            </div>
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">지필평가 분할점수 처리 방법</label>
          <select
            value={data.splitTypeExam}
            onChange={(e) => onChange((prev) => ({ ...prev, splitTypeExam: e.target.value }))}
            className="w-full text-xs p-2 border rounded-md border-slate-300 bg-white"
          >
            <option value="고정분할점수">고정분할점수 (A:90%, B:80%, C:70%, D:60%, E:60%미만)</option>
            <option value="추정분할점수">추정분할점수 (학업성적관리위원회 심의 산출)</option>
          </select>
        </div>
      </div>

      {/* ② 수행평가 입력 영역 */}
      <div className="border-2 border-emerald-200 rounded-xl p-4 bg-emerald-50/40 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-sm font-bold text-emerald-900 flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px]">
              2
            </span>
            수행평가
          </h3>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-bold text-slate-700">횟수</span>
              {[1, 2, 3, 4].map((cnt) => (
                <button
                  key={cnt}
                  type="button"
                  onClick={() => onChange((prev) => ({ ...prev, perfCount: cnt }))}
                  className={`px-2.5 py-1 text-xs border rounded-md transition-all ${
                    data.perfCount === cnt
                      ? "font-bold bg-emerald-600 text-white border-emerald-600 shadow-sm"
                      : "font-medium bg-white text-slate-600 border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  {cnt}개
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-slate-700">총 반영비율</span>
              <div className="flex items-center border border-slate-300 rounded-md bg-white px-2 shadow-sm focus-within:ring-2 focus-within:ring-emerald-500">
                <input
                  type="number"
                  value={data.performanceRatio}
                  onChange={(e) =>
                    onChange((prev) => ({ ...prev, performanceRatio: parseInt(e.target.value, 10) || 0 }))
                  }
                  className="w-12 text-xs py-1.5 outline-none font-bold text-emerald-600 bg-transparent text-right"
                />
                <span className="text-xs text-slate-500 font-bold ml-1">%</span>
              </div>
            </div>
          </div>
        </div>

        {/* 수행평가 1~4 loop */}
        {[1, 2, 3, 4].map((num) => {
          if (num > data.perfCount) return null;
          const nameKey = `perf${num}Name` as keyof PlanData;
          const methodKey = `perf${num}Method` as keyof PlanData;
          const scoreKey = `perf${num}Score` as keyof PlanData;
          const ratioKey = `perf${num}Ratio` as keyof PlanData;
          const stdKey = `perf${num}Std` as keyof PlanData;
          const startKey = `perf${num}StartDate` as keyof PlanData;
          const endKey = `perf${num}EndDate` as keyof PlanData;
          const periodKey = `perf${num}Period` as keyof PlanData;
          const targetKey = `perf${num}` as "perf1" | "perf2" | "perf3" | "perf4";

          const startDate = String(data[startKey] || "");
          const endDate = String(data[endKey] || "");
          const period = String(data[periodKey] || "");

          const handleStartDateChange = (newStart: string) => {
            const nextEnd = (!endDate || endDate < newStart) ? newStart : endDate;
            const newPeriod = calcPeriodFromDates(newStart, nextEnd);
            onChange((prev) => ({
              ...prev,
              [startKey]: newStart,
              [endKey]: nextEnd,
              [periodKey]: newPeriod,
            }));
          };

          const handleEndDateChange = (newEnd: string) => {
            const nextStart = (!startDate || startDate > newEnd) ? newEnd : startDate;
            const newPeriod = calcPeriodFromDates(nextStart, newEnd);
            onChange((prev) => ({
              ...prev,
              [startKey]: nextStart,
              [endKey]: newEnd,
              [periodKey]: newPeriod,
            }));
          };

          return (
            <div key={num} className="p-4 bg-white border border-emerald-200 rounded-lg text-xs space-y-3 shadow-sm">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  수행평가명 (수행평가 {num})
                </label>
                <input
                  type="text"
                  value={String(data[nameKey] || "")}
                  onChange={(e) => onChange((prev) => ({ ...prev, [nameKey]: e.target.value }))}
                  placeholder="영역명 (예: 분자의 입체 구조 모델링 보고서)"
                  className="w-full p-2 border rounded-md border-slate-300 focus:ring-2 focus:ring-emerald-500 outline-none font-medium"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">평가 방법</label>
                  <input
                    type="text"
                    value={String(data[methodKey] || "")}
                    onChange={(e) => onChange((prev) => ({ ...prev, [methodKey]: e.target.value }))}
                    placeholder="예: 탐구형"
                    className="w-full p-2 border rounded-md border-slate-300 focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">만점</label>
                  <input
                    type="number"
                    value={Number(data[scoreKey] ?? 100)}
                    onChange={(e) =>
                      onChange((prev) => ({ ...prev, [scoreKey]: parseInt(e.target.value, 10) || 0 }))
                    }
                    className="w-full p-2 border rounded-md border-slate-300 focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">반영비율</label>
                  <div className="flex items-center border border-slate-300 rounded-md bg-white px-2">
                    <input
                      type="number"
                      value={Number(data[ratioKey] || 0)}
                      onChange={(e) =>
                        onChange((prev) => ({ ...prev, [ratioKey]: parseInt(e.target.value, 10) || 0 }))
                      }
                      className="w-full py-2 outline-none text-right font-bold text-emerald-700 bg-transparent"
                    />
                    <span className="text-xs text-slate-500 font-bold ml-1">%</span>
                  </div>
                </div>
              </div>

              {/* 평가 실시일 및 평가 시기 영역 */}
              <div className="p-3 bg-emerald-50/50 rounded-lg border border-emerald-200/80 space-y-1.5">
                <div className="flex items-center gap-1.5 font-bold text-slate-700 text-xs">
                  <Calendar className="w-3.5 h-3.5 text-emerald-600" />
                  <span>평가 실시일</span>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => handleStartDateChange(e.target.value)}
                    className="flex-1 p-2 text-xs bg-white border border-slate-300 rounded-md focus:ring-2 focus:ring-emerald-500 outline-none font-medium text-slate-800 shadow-xs"
                  />
                  <span className="text-slate-400 font-bold text-sm">~</span>
                  <input
                    type="date"
                    value={endDate}
                    min={startDate || undefined}
                    onChange={(e) => handleEndDateChange(e.target.value)}
                    className="flex-1 p-2 text-xs bg-white border border-slate-300 rounded-md focus:ring-2 focus:ring-emerald-500 outline-none font-medium text-slate-800 shadow-xs"
                  />
                </div>

                <div className="text-[11px] text-slate-500 font-medium pl-0.5">
                  평가 시기: <span className="text-emerald-700 font-semibold">{period || "-"}</span>
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-[11px] font-semibold text-slate-700">관련 교육과정 성취기준</label>
                  <button
                    type="button"
                    onClick={() => onOpenStdModal(targetKey)}
                    className="text-[11px] text-emerald-700 hover:underline font-semibold flex items-center gap-1"
                  >
                    <BookOpen className="w-3 h-3" /> 성취기준 선택
                  </button>
                </div>
                <input
                  type="text"
                  value={formatStdCodesForDisplay(String(data[stdKey] || ""))}
                  readOnly
                  placeholder="성취기준 선택 버튼을 눌러 지정하세요"
                  className="w-full p-2 border rounded-md border-slate-300 bg-slate-50 text-slate-600 cursor-not-allowed"
                />
              </div>
            </div>
          );
        })}

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">수행평가 분할점수 처리 방법</label>
          <select
            value={data.splitTypePerf}
            onChange={(e) => onChange((prev) => ({ ...prev, splitTypePerf: e.target.value }))}
            className="w-full text-xs p-2 border rounded-md border-slate-300 bg-white"
          >
            <option value="고정분할점수">고정분할점수 (A:90%, B:80%, C:70%, D:60%, E:60%미만)</option>
            <option value="추정분할점수">추정분할점수 (학업성적관리위원회 심의 산출)</option>
          </select>
        </div>
      </div>
    </div>
  );
};
