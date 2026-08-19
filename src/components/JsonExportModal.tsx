import React, { useState } from "react";
import { PlanData } from "../types";
import { buildEvaluationPlanExportJson, downloadEvaluationPlanJson } from "../utils/exportPlanData";
import { X, Download, Copy, Check, FileCode, Layers, HelpCircle } from "lucide-react";

interface JsonExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: PlanData;
  showToast?: (msg: string) => void;
}

export const JsonExportModal: React.FC<JsonExportModalProps> = ({
  isOpen,
  onClose,
  data,
  showToast,
}) => {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"formatted" | "structure">("structure");

  if (!isOpen) return null;

  const exportJson = buildEvaluationPlanExportJson(data);
  const jsonString = JSON.stringify(exportJson, null, 2);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(jsonString);
      setCopied(true);
      if (showToast) showToast("HWP 연동용 JSON 데이터가 클립보드에 복사되었습니다.");
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Copy failed:", err);
    }
  };

  const handleDownload = () => {
    downloadEvaluationPlanJson(data);
    if (showToast) showToast("HWP 연동용 JSON 파일이 다운로드되었습니다.");
  };

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-4xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Modal Header */}
        <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-blue-600 rounded-lg text-white">
              <FileCode className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-sm sm:text-base leading-tight flex items-center gap-2">
                학교 원본 HWP 서식 연동 데이터 (JSON)
                <span className="text-[11px] font-normal px-2 py-0.5 bg-blue-500/20 text-blue-300 rounded border border-blue-400/30">
                  7대 표준 영역 구조화
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                앱에서 완성된 데이터를 학교 공식 HWP 양식에 자동 삽입할 수 있는 표준 규격 데이터입니다.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab & Info Bar */}
        <div className="px-5 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setActiveTab("structure")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                activeTab === "structure"
                  ? "bg-blue-600 text-white shadow-xs"
                  : "bg-white text-slate-700 hover:bg-slate-200 border border-slate-300"
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              7대 영역 구조 매핑
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("formatted")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                activeTab === "formatted"
                  ? "bg-blue-600 text-white shadow-xs"
                  : "bg-white text-slate-700 hover:bg-slate-200 border border-slate-300"
              }`}
            >
              <FileCode className="w-3.5 h-3.5" />
              전체 JSON 코드
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors shadow-xs"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-emerald-700 font-bold">복사 완료!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-slate-500" />
                  <span>JSON 복사</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={handleDownload}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>.json 파일 다운로드</span>
            </button>
          </div>
        </div>

        {/* Modal Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {activeTab === "structure" ? (
            <div className="space-y-4">
              {/* Notice Banner */}
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-2.5 text-xs text-blue-900 leading-relaxed">
                <HelpCircle className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <b>HWP 출력 모듈 연동 안내:</b> PDF는 학교 원본 HWP 서식의 구조와 항목 위치를 파악하기 위한 참고 자료이며, 실제 문서는 이 정형화된 JSON 데이터를 통해 <b>학교 공식 HWP 서식에 자동 삽입</b>됩니다.
                </div>
              </div>

              {/* 7 Section Mapping Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* 1. 기본정보 */}
                <div className="p-3.5 bg-white rounded-lg border border-slate-200 shadow-xs space-y-1.5">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                    <span className="font-bold text-xs text-slate-900 flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded bg-blue-100 text-blue-800 text-[11px] font-bold flex items-center justify-center">1</span>
                      기본정보 (basicInfo)
                    </span>
                    <span className="text-[10px] text-slate-500">HWP 1쪽 상단 표</span>
                  </div>
                  <div className="text-xs text-slate-700 space-y-0.5">
                    <div><b>과목명:</b> {exportJson.basicInfo.subjectName || "미입력"} ({exportJson.basicInfo.grade || "-"}, {exportJson.basicInfo.credit || "-"}학점)</div>
                    <div><b>성취도:</b> {exportJson.basicInfo.achievementScale}</div>
                    <div><b>기준학급/교사:</b> {exportJson.basicInfo.targetClassAndDays || "-"} / {exportJson.basicInfo.teacherName || "-"}</div>
                  </div>
                </div>

                {/* 2. 평가 목적 및 방침 */}
                <div className="p-3.5 bg-white rounded-lg border border-slate-200 shadow-xs space-y-1.5">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                    <span className="font-bold text-xs text-slate-900 flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded bg-blue-100 text-blue-800 text-[11px] font-bold flex items-center justify-center">2</span>
                      평가 목적 및 방침
                    </span>
                    <span className="text-[10px] text-slate-500">HWP 1쪽 1번 항목</span>
                  </div>
                  <div className="text-xs text-slate-700">
                    <div><b>항목 수:</b> 총 {exportJson.evaluationPurposesAndPolicies.items.length}개 조항 (가~바)</div>
                    <div className="text-[11px] text-slate-500 mt-1 line-clamp-2">
                      {exportJson.evaluationPurposesAndPolicies.items[0]?.content || "평가 방침 내용"}
                    </div>
                  </div>
                </div>

                {/* 3. 평가 개요 */}
                <div className="p-3.5 bg-white rounded-lg border border-slate-200 shadow-xs space-y-1.5">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                    <span className="font-bold text-xs text-slate-900 flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded bg-blue-100 text-blue-800 text-[11px] font-bold flex items-center justify-center">3</span>
                      평가 개요 (evaluationOverview)
                    </span>
                    <span className="text-[10px] text-slate-500">HWP 1~2쪽 표</span>
                  </div>
                  <div className="text-xs text-slate-700 space-y-0.5">
                    <div><b>반영비율:</b> 정기시험 {exportJson.evaluationOverview.regularExamRatio}% / 수행평가 {exportJson.evaluationOverview.performanceAssessmentRatio}%</div>
                    <div><b>정기시험:</b> {exportJson.evaluationOverview.regularExams.length}회 ({exportJson.evaluationOverview.regularExams.map(e => e.name).join(", ")})</div>
                    <div><b>수행평가:</b> {exportJson.evaluationOverview.performanceAssessments.length}개 영역 ({exportJson.evaluationOverview.performanceAssessments.map(p => `${p.name}(${p.ratio}%)`).join(", ")})</div>
                  </div>
                </div>

                {/* 4. 수행평가 세부계획 */}
                <div className="p-3.5 bg-white rounded-lg border border-slate-200 shadow-xs space-y-1.5">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                    <span className="font-bold text-xs text-slate-900 flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded bg-blue-100 text-blue-800 text-[11px] font-bold flex items-center justify-center">4</span>
                      수행평가 세부계획
                    </span>
                    <span className="text-[10px] text-slate-500">HWP 2~4쪽</span>
                  </div>
                  <div className="text-xs text-slate-700 space-y-0.5">
                    <div><b>등록 과제:</b> {exportJson.performanceDetailPlans.length}개 과제</div>
                    {exportJson.performanceDetailPlans.map((p, idx) => (
                      <div key={idx} className="text-[11px] text-slate-600">
                        • {p.indexKorean}. {p.name} (시기: {p.period}, 루브릭 {p.rubrics.length}개 요소)
                      </div>
                    ))}
                  </div>
                </div>

                {/* 5. 루브릭 */}
                <div className="p-3.5 bg-white rounded-lg border border-slate-200 shadow-xs space-y-1.5">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                    <span className="font-bold text-xs text-slate-900 flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded bg-blue-100 text-blue-800 text-[11px] font-bold flex items-center justify-center">5</span>
                      루브릭 (rubrics)
                    </span>
                    <span className="text-[10px] text-slate-500">HWP 3쪽 채점기준표</span>
                  </div>
                  <div className="text-xs text-slate-700 space-y-0.5">
                    <div><b>채점 기준표:</b> 총 {exportJson.rubrics.reduce((acc, r) => acc + r.criteria.length, 0)}개 평가요소 기준 등록</div>
                    <div className="text-[11px] text-slate-500">각 수행평가별 점수대별(배점/차하점/최하수준 특성) 구조화 완료</div>
                  </div>
                </div>

                {/* 6. 교수학습-평가 방법 1~20주 */}
                <div className="p-3.5 bg-white rounded-lg border border-slate-200 shadow-xs space-y-1.5">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                    <span className="font-bold text-xs text-slate-900 flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded bg-blue-100 text-blue-800 text-[11px] font-bold flex items-center justify-center">6</span>
                      교수학습-평가 방법 1~20주
                    </span>
                    <span className="text-[10px] text-slate-500">HWP 4~11쪽 20주 진도표</span>
                  </div>
                  <div className="text-xs text-slate-700 space-y-0.5">
                    <div><b>주차별 계획:</b> 1주~20주 전체 편성 ({exportJson.weeklyTeachingPlans.length}개 주차)</div>
                    <div className="text-[11px] text-slate-500">시수/누계, 단원명/핵심아이디어, 성취기준, 평가유형, 세부방법 포함</div>
                  </div>
                </div>

                {/* 7. 학기 단위 성취수준 */}
                <div className="p-3.5 bg-white rounded-lg border border-slate-200 shadow-xs space-y-1.5 md:col-span-2">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                    <span className="font-bold text-xs text-slate-900 flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded bg-blue-100 text-blue-800 text-[11px] font-bold flex items-center justify-center">7</span>
                      학기 단위 성취수준 (semesterAchievementLevels)
                    </span>
                    <span className="text-[10px] text-slate-500">HWP 12쪽 성취수준 기술표</span>
                  </div>
                  <div className="text-xs text-slate-700 space-y-1">
                    <div><b>평정 체계:</b> {exportJson.semesterAchievementLevels.scaleType}</div>
                    <div className="flex flex-wrap gap-2">
                      {exportJson.semesterAchievementLevels.levels.map((lv) => (
                        <span key={lv.level} className="px-2 py-0.5 bg-slate-100 rounded text-[11px] text-slate-700 border border-slate-200">
                          <b>{lv.level} ({lv.rate}):</b> {lv.description ? `${lv.description.slice(0, 25)}...` : "미입력"}
                        </span>
                      ))}
                    </div>
                    {exportJson.semesterAchievementLevels.minimumCompetencyCharacteristics && (
                      <div className="text-[11px] text-blue-800 bg-blue-50/50 p-1.5 rounded border border-blue-100 mt-1">
                        <b>최소능력수행특성:</b> {exportJson.semesterAchievementLevels.minimumCompetencyCharacteristics.slice(0, 60)}...
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="relative">
              <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg text-[11px] font-mono leading-relaxed overflow-x-auto max-h-[60vh]">
                {jsonString}
              </pre>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 bg-slate-100 border-t border-slate-200 flex items-center justify-between shrink-0">
          <div className="text-xs text-slate-500">
            버전: {exportJson.metadata.formatVersion} | 대상: {exportJson.metadata.targetTemplate}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold transition-colors"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
};
