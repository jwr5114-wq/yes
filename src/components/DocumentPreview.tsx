import React, { useMemo } from "react";
import { PlanData } from "../types";
import { buildFinalPreviewData, FinalPreviewRubricCriterion } from "../utils/finalPreviewData";

interface DocumentPreviewProps {
  data: PlanData;
  currentStep: number;
  viewMode: "step" | "full";
  onViewModeChange: (mode: "step" | "full") => void;
}

export const DocumentPreview: React.FC<DocumentPreviewProps> = ({
  data,
  currentStep,
  viewMode,
  onViewModeChange,
}) => {
  // Single canonical source of truth for preview and exports
  const preview = useMemo(() => buildFinalPreviewData(data), [data]);
  const is1stGrade = preview.semesterAchievementLevels.isFirstGrade;
  const is3Tier = preview.semesterAchievementLevels.isThreeTier;

  const isShowSection = (secNum: number) => {
    if (viewMode === "full") return true;
    return currentStep === secNum;
  };

  // Helper for rendering structured rubric tables in preview
  const renderRubricTable = (criteria: FinalPreviewRubricCriterion[], note: string) => {
    if (!criteria || criteria.length === 0) {
      return (
        <div className="text-[8pt] text-slate-400 italic py-1">
          - 채점 기준 미작성 -
          {note && <div className="mt-1 text-slate-600"><b>[유의 사항]</b> {note}</div>}
        </div>
      );
    }

    return (
      <div>
        <table className="doc-table mb-1">
          <thead>
            <tr>
              <th style={{ width: "22%" }}>평가요소(배점)</th>
              <th style={{ width: "12%" }}>점수</th>
              <th>채점 기준</th>
            </tr>
          </thead>
          <tbody>
            {criteria.map((c, cIdx) => {
              const sortedLevels = [...c.levels].sort((a, b) => b.score - a.score);
              const maxScore = c.maxScore;

              return sortedLevels.map((lv, lIdx) => (
                <tr key={`${cIdx}-${lIdx}`}>
                  {lIdx === 0 && (
                    <td
                      rowSpan={sortedLevels.length}
                      style={{ fontWeight: "bold", verticalAlign: "middle", textAlign: "center" }}
                    >
                      {c.name}
                      <br />({maxScore}점)
                    </td>
                  )}
                  <td style={{ textAlign: "center", fontWeight: "600" }}>{lv.score}점</td>
                  <td className="left text-[7.5pt] leading-relaxed">{lv.desc}</td>
                </tr>
              ));
            })}
          </tbody>
        </table>
        {note && (
          <div className="text-[7.5pt] text-slate-700 bg-slate-50 p-1.5 rounded border border-slate-200 mt-1">
            <b>[유의 사항]</b> {note}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="w-full h-full flex flex-col min-w-0">
      {/* Top Preview Controls */}
      <div className="mb-3 flex flex-wrap justify-between items-center w-full gap-2 shrink-0">
        <div className="text-xs font-bold text-slate-700 flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block animate-pulse"></span>
          <span className="text-blue-900 font-extrabold">
            {viewMode === "full"
              ? "전체 문서 보기 (A4 인쇄용 서식)"
              : `${currentStep}단계 실시간 미리보기`}
          </span>
        </div>
        <div className="flex items-center gap-1.5 bg-white p-1 rounded-lg border border-slate-300 text-xs shadow-xs">
          <button
            type="button"
            onClick={() => onViewModeChange("step")}
            className={`px-2.5 py-1 rounded font-medium transition-all ${
              viewMode === "step" ? "bg-blue-600 text-white font-bold" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            🔎 선택 항목만
          </button>
          <button
            type="button"
            onClick={() => onViewModeChange("full")}
            className={`px-2.5 py-1 rounded font-medium transition-all ${
              viewMode === "full" ? "bg-blue-600 text-white font-bold" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            📄 전체 문서
          </button>
        </div>
      </div>

      {/* A4 Container */}
      <div className="flex-1 overflow-y-auto pr-1">
        <div id="preview-page" className="a4-page transition-all space-y-4">
          {/* SECTION 1: 기본 정보 및 교과 평가 방침 */}
          {isShowSection(1) && (
            <div id="pv-step-1" className="pv-section space-y-3">
              <div className="text-center font-bold text-base md:text-lg tracking-tight border-b-2 border-slate-900 pb-2 mb-3 leading-snug break-keep">
                <span>{preview.basicInfo.documentTitle}</span>
              </div>

              <table className="doc-table">
                <tbody>
                  <tr>
                    <th style={{ width: "14%" }}>학교명</th>
                    <td style={{ width: "20%" }}>{preview.basicInfo.schoolName}</td>
                    <th style={{ width: "10%" }}>학년</th>
                    <td style={{ width: "10%" }}>{preview.basicInfo.grade}</td>
                    <th style={{ width: "10%" }}>학점</th>
                    <td style={{ width: "10%" }}>{preview.basicInfo.credit}</td>
                    <th style={{ width: "12%" }}>성취도</th>
                    <td style={{ width: "14%" }}>{preview.basicInfo.gradeType}</td>
                  </tr>
                  <tr>
                    <th>기준학급</th>
                    <td colSpan={3}>{preview.basicInfo.classDays}</td>
                    <th>지도교사</th>
                    <td colSpan={3}>{preview.basicInfo.teacher}</td>
                  </tr>
                </tbody>
              </table>

              <div className="font-bold text-sm text-slate-900 mt-2 mb-1 flex items-center gap-1 border-b border-slate-300 pb-1">
                <span>{preview.basicInfo.section1Title}</span>
              </div>

              <div className="text-[9pt] font-bold text-slate-800 mb-1">1. 평가 목적 및 평가 방향, 평가 방침</div>
              <div className="text-[8pt] leading-relaxed whitespace-pre-line text-slate-800 bg-slate-50/70 p-3 rounded border border-slate-300">
                {preview.evaluationPolicy.items.length > 0 ? (
                  preview.evaluationPolicy.fullText
                ) : (
                  <span className="text-slate-400">- 평가 방침이 작성되지 않았습니다 -</span>
                )}
              </div>
            </div>
          )}

          {/* SECTION 2: 평가 개요 & 반영 비율 */}
          {isShowSection(2) && (
            <div id="pv-step-2" className="pv-section space-y-3">
              <div className="font-bold text-sm text-slate-900 mb-1 border-b border-slate-300 pb-1">
                2. 평가 개요 및 반영 비율
              </div>

              <table className="doc-table">
                <tbody>
                  <tr>
                    <th style={{ width: "14%" }}>평가 유형</th>
                    {preview.evaluationOverview.examCount > 0 && (
                      <td colSpan={preview.evaluationOverview.examCount * 3} style={{ fontWeight: "bold" }}>
                        정기시험 ({preview.evaluationOverview.examRatio}%)
                      </td>
                    )}
                    {preview.evaluationOverview.perfCount > 0 && (
                      <td colSpan={preview.evaluationOverview.perfCount} style={{ fontWeight: "bold" }}>
                        수행평가 ({preview.evaluationOverview.performanceRatio}%)
                      </td>
                    )}
                  </tr>
                  <tr>
                    <th>횟수/영역</th>
                    {preview.evaluationOverview.regularExams.map((exam) => (
                      <td key={exam.id} colSpan={3} className="font-semibold">
                        {exam.name}
                      </td>
                    ))}
                    {preview.evaluationOverview.performanceAssessments.map((perf) => (
                      <td key={perf.id} className="font-semibold">
                        {perf.name}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <th>문항 유형</th>
                    {preview.evaluationOverview.regularExams.map((exam) => (
                      <React.Fragment key={exam.id}>
                        <td>선택형</td>
                        <td>단답형</td>
                        <td>서·논술형</td>
                      </React.Fragment>
                    ))}
                    {preview.evaluationOverview.performanceAssessments.map((perf) => (
                      <td key={perf.id}>{perf.method}</td>
                    ))}
                  </tr>
                  <tr>
                    <th>영역 만점</th>
                    {preview.evaluationOverview.regularExams.map((exam) => (
                      <React.Fragment key={exam.id}>
                        <td>{exam.selective.score}점</td>
                        <td>{exam.shortAnswer.score}점</td>
                        <td>{exam.essay.score}점</td>
                      </React.Fragment>
                    ))}
                    {preview.evaluationOverview.performanceAssessments.map((perf) => (
                      <td key={perf.id}>{perf.totalScore}점</td>
                    ))}
                  </tr>
                  <tr>
                    <th>반영 비율</th>
                    {preview.evaluationOverview.regularExams.map((exam) => (
                      <React.Fragment key={exam.id}>
                        <td>{exam.selective.ratio}%</td>
                        <td>{exam.shortAnswer.ratio}%</td>
                        <td>{exam.essay.ratio}%</td>
                      </React.Fragment>
                    ))}
                    {preview.evaluationOverview.performanceAssessments.map((perf) => (
                      <td key={perf.id} className="font-semibold text-emerald-800">
                        {perf.ratio}%
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <th>교육과정 성취기준</th>
                    {preview.evaluationOverview.regularExams.map((exam) => (
                      <td key={exam.id} colSpan={3}>
                        {exam.achievementStandards}
                      </td>
                    ))}
                    {preview.evaluationOverview.performanceAssessments.map((perf) => (
                      <td key={perf.id}>{perf.achievementStandards}</td>
                    ))}
                  </tr>
                  <tr>
                    <th>평가 시기</th>
                    {preview.evaluationOverview.regularExams.map((exam) => (
                      <td key={exam.id} colSpan={3}>
                        {exam.period}
                      </td>
                    ))}
                    {preview.evaluationOverview.performanceAssessments.map((perf) => (
                      <td key={perf.id} className="text-[7.5pt]">
                        {perf.period}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <th>분할점수 처리</th>
                    {preview.evaluationOverview.examCount > 0 && (
                      <td colSpan={preview.evaluationOverview.examCount * 3}>
                        {preview.evaluationOverview.splitTypeExam}
                      </td>
                    )}
                    {preview.evaluationOverview.perfCount > 0 && (
                      <td colSpan={preview.evaluationOverview.perfCount}>
                        {preview.evaluationOverview.splitTypePerf}
                      </td>
                    )}
                  </tr>
                </tbody>
              </table>

              <div className="text-[9pt] font-bold text-slate-800 mt-2 mb-1">3. 성취율과 성취도</div>
              <table className="doc-table">
                <tbody>
                  <tr>
                    <th style={{ width: "20%" }}>성취율</th>
                    {preview.evaluationOverview.achievementScaleTable.map((item, idx) => (
                      <td key={idx}>{item.rate}</td>
                    ))}
                  </tr>
                  <tr>
                    <th>성취도</th>
                    {preview.evaluationOverview.achievementScaleTable.map((item, idx) => (
                      <td key={idx} className="font-bold text-slate-900">
                        {item.level}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* SECTION 3: 수행평가 세부 계획 */}
          {isShowSection(3) && (
            <div id="pv-step-3" className="pv-section space-y-3">
              <div className="font-bold text-sm text-slate-900 border-b border-slate-300 pb-1">
                4. 수행평가 세부 계획
              </div>

              {preview.performanceAssessments.map((perf) => (
                <div key={perf.num} className="space-y-1.5 pt-1">
                  <div className="font-bold text-[8.5pt] text-slate-900">
                    {perf.prefix}. <span>{perf.name}</span>
                  </div>
                  <table className="doc-table">
                    <tbody>
                      <tr>
                        <th style={{ width: "20%" }}>평가 시기</th>
                        <td className="left text-[7.5pt]">{perf.period}</td>
                      </tr>
                      <tr>
                        <th style={{ width: "20%" }}>성취기준</th>
                        <td className="left text-[7.5pt] whitespace-pre-line leading-relaxed">
                          {perf.achievementStandards}
                        </td>
                      </tr>
                      <tr>
                        <th>수행 과제 흐름</th>
                        <td className="left text-[7.5pt] whitespace-pre-line leading-relaxed">{perf.taskFlow}</td>
                      </tr>
                      <tr>
                        <th>AI 활용 범위</th>
                        <td className="left text-[7.5pt] whitespace-pre-line leading-relaxed">{perf.aiUsagePolicy}</td>
                      </tr>
                    </tbody>
                  </table>
                  {renderRubricTable(perf.rubrics, perf.note)}
                </div>
              ))}

              <div className="text-[7.5pt] text-slate-700 bg-slate-50 p-2 rounded border border-slate-300 space-y-0.5 mt-2">
                <div className="font-bold text-slate-900">5. 유의 사항 및 부정행위 처리 방침</div>
                <p>• 장기 결석, 백지 제출, 미완성 등 평가 결과 확인이 어려운 경우 평가 요소 배점의 차하점(최하점-1점) 처리한다.</p>
                <p>• 학문적 정직성을 준수하며 표절, 공모 및 담합, 타인의 결과물 및 안내 범위를 벗어난 AI 도용 시 부정행위 처리한다.</p>
              </div>
            </div>
          )}

          {/* SECTION 4: 주차별 교수·학습-평가 방법 */}
          {isShowSection(4) && (
            <div id="pv-step-4" className="pv-section space-y-3">
              <div className="font-bold text-sm text-slate-900 border-b border-slate-300 pb-1">
                2. [<span>{preview.basicInfo.subjectName || "교과"}</span>]과 교수학습-평가 방법 (주차별 계획)
              </div>

              <table className="doc-table">
                <thead>
                  <tr>
                    <th style={{ width: "15%" }}>시기</th>
                    <th style={{ width: "8%" }}>시수<br />/누계</th>
                    <th style={{ width: "24%" }}>단원명(주제)<br />[핵심 아이디어]</th>
                    <th style={{ width: "16%" }}>성취기준</th>
                    <th style={{ width: "12%" }}>평가 유형</th>
                    <th style={{ width: "25%" }}>평가와 연계한<br />수업 세부 방법</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.weeklyPlan.map((item, idx) => (
                    <tr key={idx}>
                      <td className="text-[7.5pt]" style={{ lineHeight: "1.3" }}>
                        <div style={{ fontWeight: 700, color: "#0f172a" }}>{item.weekLabel}</div>
                        <div style={{ color: "#0f172a" }}>{item.weekDate}</div>
                        {item.weekEvent && (
                          <div style={{ color: "#db2777", fontSize: "7pt", lineHeight: "1.25", marginTop: "2px" }}>
                            {item.weekEvent.split("\n").map((line, li) => (
                              <React.Fragment key={li}>
                                {line}
                                <br />
                              </React.Fragment>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="text-[7.5pt]">
                        {item.hours}
                        {item.cumulative !== undefined && (
                          <div style={{ fontSize: "6.5pt", color: "#64748b" }}>({item.cumulative})</div>
                        )}
                      </td>
                      <td className="left text-[7.5pt] font-semibold whitespace-pre-line">{item.topic}</td>
                      <td className="left text-[7.5pt] whitespace-pre-line leading-relaxed">
                        {item.achievementStandards}
                      </td>
                      <td className="text-[7.5pt] font-medium whitespace-pre-line">{item.evaluationType}</td>
                      <td className="left text-[7.5pt] whitespace-pre-line leading-relaxed">{item.teachingAndEvaluationDetails}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* SECTION 5: 학기 단위 성취수준 */}
          {isShowSection(5) && (
            <div id="pv-step-5" className="pv-section space-y-2">
              <div className="font-bold text-sm text-slate-900 border-b border-slate-300 pb-1">
                3. [<span>{preview.basicInfo.subjectName || "교과"}</span>]과 학기 단위 성취수준
              </div>

              <div className="font-bold text-xs text-slate-800 mt-1">
                1. 학기 단위 성취수준
              </div>

              {/* Guidance notes matching the official HWP template */}
              <div className="text-[7.5pt] text-blue-700 space-y-0.5 my-1">
                {preview.semesterAchievementLevels.guidanceNotes.map((note, nIdx) => (
                  <div key={nIdx}>{note}</div>
                ))}
              </div>

              <table className="doc-table">
                <thead>
                  <tr>
                    <th style={{ width: "12%" }}>성취수준</th>
                    <th style={{ width: "70%" }}>성취수준 기술</th>
                    <th style={{ width: "18%" }}>성취율</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.semesterAchievementLevels.levels.map((lvl) => (
                    <tr key={lvl.level}>
                      <td
                        className={`font-bold text-center ${
                          lvl.level === "A" ? "text-blue-700" : "text-slate-800"
                        }`}
                      >
                        {lvl.level}
                      </td>
                      <td className="left text-[7.5pt] whitespace-pre-line leading-relaxed">
                        {lvl.description}
                      </td>
                      <td className="text-center">{lvl.rate}</td>
                    </tr>
                  ))}
                  {preview.semesterAchievementLevels.minCompetency && (
                    <>
                      <tr>
                        <th colSpan={3} className="font-bold text-center bg-slate-100 text-[8pt] py-1">
                          최소능력수행특성
                        </th>
                      </tr>
                      <tr>
                        <td colSpan={3} className="left text-[7.5pt] whitespace-pre-line leading-relaxed py-2">
                          {preview.semesterAchievementLevels.minCompetency}
                        </td>
                      </tr>
                    </>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
