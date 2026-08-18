import React from "react";
import { PlanData } from "../types";
import {
  getAchievementTable,
  getAchievementRuleSummary,
  isThreeTier,
} from "../utils/achievementUtils";
import { CheckCircle2 } from "lucide-react";

interface Step5AchievementLevelsProps {
  data: PlanData;
  onChange: (updater: (prev: PlanData) => PlanData) => void;
}

export const Step5AchievementLevels: React.FC<Step5AchievementLevelsProps> = ({
  data,
  onChange,
}) => {
  const is3Tier = isThreeTier(data.gradeType);
  const achievementItems = getAchievementTable(data.grade, data.gradeType);
  const ruleSummary = getAchievementRuleSummary(data.grade, data.gradeType);

  const rateMap: Record<string, string> = {};
  achievementItems.forEach((item) => {
    rateMap[item.level] = item.rate;
  });

  return (
    <div className="space-y-5">
      <div className="border-b border-slate-200 pb-3 flex justify-between items-center gap-2">
        <div>
          <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">
              5
            </span>
            학기 단위 및 성취기준별 성취수준
          </h2>
          <p className="text-xs text-slate-500 mt-1">학기 전체 성취수준({is3Tier ? "A~C" : "A~E"}) 특성을 최종 진술합니다.</p>
        </div>
        <span className="text-xs bg-blue-50 text-blue-700 px-3 py-1 rounded-full border border-blue-200 font-medium whitespace-nowrap">
          5 / 5 단계
        </span>
      </div>

      {/* 성취율·성취도 자동 연동 안내 카드 */}
      <div className="bg-blue-50/70 border border-blue-200 rounded-lg p-3 text-xs text-blue-950 space-y-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-1.5 font-bold text-blue-950 text-[11px]">
            <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
            <span>성취율과 성취도 자동 연동 기준</span>
          </div>
          <span className="text-[10px] bg-white text-blue-800 font-semibold px-2 py-0.5 rounded border border-blue-300">
            {ruleSummary}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-center border-collapse bg-white rounded border border-blue-200">
            <thead>
              <tr className="bg-blue-100/60 text-blue-900 font-semibold text-[11px]">
                <th className="p-1.5 border border-blue-200 w-20">성취율</th>
                {achievementItems.map((item, idx) => (
                  <th key={idx} className="p-1.5 border border-blue-200 font-normal">
                    {item.rate}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="font-bold text-slate-800">
                <th className="p-1.5 border border-blue-200 bg-blue-50 text-blue-900 font-semibold text-[11px]">
                  성취도
                </th>
                {achievementItems.map((item, idx) => (
                  <td key={idx} className="p-1.5 border border-blue-200 text-blue-700">
                    {item.level}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-xs font-bold text-blue-900 mb-1 flex items-center gap-1.5">
            <span className="w-4 h-4 rounded bg-blue-600 text-white flex items-center justify-center text-[10px]">A</span>
            <span>성취수준 A ({rateMap["A"] || "90% 이상"})</span>
          </label>
          <textarea
            rows={3}
            value={data.achieveA}
            onChange={(e) => onChange((prev) => ({ ...prev, achieveA: e.target.value }))}
            placeholder="성취수준 A에 도달한 학생이 보이는 지식, 탐구, 태도의 총괄적 성취 특성"
            className="w-full text-xs p-2.5 border rounded border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none leading-relaxed bg-white"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-800 mb-1 flex items-center gap-1.5">
            <span className="w-4 h-4 rounded bg-slate-700 text-white flex items-center justify-center text-[10px]">B</span>
            <span>성취수준 B ({rateMap["B"] || "80% 이상 ~ 90% 미만"})</span>
          </label>
          <textarea
            rows={3}
            value={data.achieveB}
            onChange={(e) => onChange((prev) => ({ ...prev, achieveB: e.target.value }))}
            placeholder="성취수준 B에 도달한 학생의 성취 특성"
            className="w-full text-xs p-2.5 border rounded border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none leading-relaxed bg-white"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-800 mb-1 flex items-center gap-1.5">
            <span className="w-4 h-4 rounded bg-slate-700 text-white flex items-center justify-center text-[10px]">C</span>
            <span>성취수준 C ({rateMap["C"] || (is3Tier ? "60% 미만" : "70% 이상 ~ 80% 미만")})</span>
          </label>
          <textarea
            rows={3}
            value={data.achieveC}
            onChange={(e) => onChange((prev) => ({ ...prev, achieveC: e.target.value }))}
            placeholder="성취수준 C에 도달한 학생의 성취 특성"
            className="w-full text-xs p-2.5 border rounded border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none leading-relaxed bg-white"
          />
        </div>

        {!is3Tier && (
          <>
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1 flex items-center gap-1.5">
                <span className="w-4 h-4 rounded bg-slate-700 text-white flex items-center justify-center text-[10px]">D</span>
                <span>성취수준 D ({rateMap["D"] || "60% 이상 ~ 70% 미만"})</span>
              </label>
              <textarea
                rows={3}
                value={data.achieveD}
                onChange={(e) => onChange((prev) => ({ ...prev, achieveD: e.target.value }))}
                placeholder="성취수준 D에 도달한 학생의 성취 특성"
                className="w-full text-xs p-2.5 border rounded border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none leading-relaxed bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1 flex items-center gap-1.5">
                <span className="w-4 h-4 rounded bg-slate-700 text-white flex items-center justify-center text-[10px]">E</span>
                <span>성취수준 E ({rateMap["E"] || "60% 미만"})</span>
              </label>
              <textarea
                rows={3}
                value={data.achieveE}
                onChange={(e) => onChange((prev) => ({ ...prev, achieveE: e.target.value }))}
                placeholder="성취수준 E에 도달한 학생의 성취 특성"
                className="w-full text-xs p-2.5 border rounded border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none leading-relaxed bg-white"
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
};

