import React from "react";
import { PlanData, RubricCriterion } from "../types";
import { FIXED_SCHOOL_NAME, FIXED_YEAR_SEMESTER, getKoreanPrefix } from "../constants";
import { formatStdCodesForDisplay, getExpandedStdText } from "../utils/hwpParser";
import { formatDateRangeDisplay } from "../utils/dateUtils";
import { getAchievementTable } from "../utils/achievementUtils";

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
  const is3Tier = data.gradeType === "3단계";
  const isShowSection = (secNum: number) => {
    if (viewMode === "full") return true;
    return currentStep === secNum;
  };

  // Helper for rendering structured rubric tables in preview
  const renderRubricTable = (criteria: RubricCriterion[], note: string) => {
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
              const maxScore = sortedLevels.length ? sortedLevels[0].score : 0;

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
                <span>{FIXED_YEAR_SEMESTER}</span> [<span>{data.subjectName || "과목명"}</span>]과 교수학습 및 평가 운영 계획
              </div>

              <table className="doc-table">
                <tbody>
                  <tr>
                    <th style={{ width: "14%" }}>학교명</th>
                    <td style={{ width: "20%" }}>{FIXED_SCHOOL_NAME}</td>
                    <th style={{ width: "10%" }}>학년</th>
                    <td style={{ width: "10%" }}>{data.grade || "-"}</td>
                    <th style={{ width: "10%" }}>학점</th>
                    <td style={{ width: "10%" }}>{data.credit || "-"}</td>
                    <th style={{ width: "12%" }}>성취도</th>
                    <td style={{ width: "14%" }}>{data.gradeType || "-"}</td>
                  </tr>
                  <tr>
                    <th>기준학급</th>
                    <td colSpan={3}>{data.classDays || "-"}</td>
                    <th>지도교사</th>
                    <td colSpan={3}>{data.teacher || "-"}</td>
                  </tr>
                </tbody>
              </table>

              <div className="font-bold text-sm text-slate-900 mt-2 mb-1 flex items-center gap-1 border-b border-slate-300 pb-1">
                <span>1</span> [<span>{data.subjectName || "교과"}</span>]과 평가 계획
              </div>

              <div className="text-[9pt] font-bold text-slate-800 mb-1">1. 평가 목적 및 평가 방향, 평가 방침</div>
              <div className="text-[8pt] leading-relaxed whitespace-pre-line text-slate-800 bg-slate-50/70 p-3 rounded border border-slate-300">
                {data.policyItems && data.policyItems.length > 0 ? (
                  data.policyItems.map((item, idx) => `${getKoreanPrefix(idx)}. ${item}`).join("\n\n")
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
                    {data.examCount > 0 && (
                      <td colSpan={data.examCount * 3} style={{ fontWeight: "bold" }}>
                        정기시험 ({data.examRatio}%)
                      </td>
                    )}
                    {data.perfCount > 0 && (
                      <td colSpan={data.perfCount} style={{ fontWeight: "bold" }}>
                        수행평가 ({data.performanceRatio}%)
                      </td>
                    )}
                  </tr>
                  <tr>
                    <th>횟수/영역</th>
                    {data.examCount >= 1 && <td colSpan={3} className="font-semibold">{data.examName1 || "중간시험"}</td>}
                    {data.examCount >= 2 && <td colSpan={3} className="font-semibold">{data.examName2 || "기말시험"}</td>}
                    {Array.from({ length: data.perfCount }).map((_, i) => {
                      const num = i + 1;
                      const name = String(data[`perf${num}Name` as keyof PlanData] || `수행평가 ${num}`);
                      return <td key={i} className="font-semibold">{name}</td>;
                    })}
                  </tr>
                  <tr>
                    <th>문항 유형</th>
                    {data.examCount >= 1 && (
                      <>
                        <td>선택형</td>
                        <td>단답형</td>
                        <td>서·논술형</td>
                      </>
                    )}
                    {data.examCount >= 2 && (
                      <>
                        <td>선택형</td>
                        <td>단답형</td>
                        <td>서·논술형</td>
                      </>
                    )}
                    {Array.from({ length: data.perfCount }).map((_, i) => {
                      const num = i + 1;
                      const method = String(data[`perf${num}Method` as keyof PlanData] || "탐구형");
                      return <td key={i}>{method}</td>;
                    })}
                  </tr>
                  <tr>
                    <th>영역 만점</th>
                    {data.examCount >= 1 && (
                      <>
                        <td>{data.midSelectScore}점</td>
                        <td>{data.midShortScore}점</td>
                        <td>{data.midEssayScore}점</td>
                      </>
                    )}
                    {data.examCount >= 2 && (
                      <>
                        <td>{data.finalSelectScore}점</td>
                        <td>{data.finalShortScore}점</td>
                        <td>{data.finalEssayScore}점</td>
                      </>
                    )}
                    {Array.from({ length: data.perfCount }).map((_, i) => {
                      const num = i + 1;
                      const sc = Number(data[`perf${num}Score` as keyof PlanData] ?? 100);
                      return <td key={i}>{sc}점</td>;
                    })}
                  </tr>
                  <tr>
                    <th>반영 비율</th>
                    {data.examCount >= 1 && (
                      <>
                        <td>{data.midSelectRatio}%</td>
                        <td>{data.midShortRatio}%</td>
                        <td>{data.midEssayRatio}%</td>
                      </>
                    )}
                    {data.examCount >= 2 && (
                      <>
                        <td>{data.finalSelectRatio}%</td>
                        <td>{data.finalShortRatio}%</td>
                        <td>{data.finalEssayRatio}%</td>
                      </>
                    )}
                    {Array.from({ length: data.perfCount }).map((_, i) => {
                      const num = i + 1;
                      const ratio = Number(data[`perf${num}Ratio` as keyof PlanData] || 0);
                      return <td key={i} className="font-semibold text-emerald-800">{ratio}%</td>;
                    })}
                  </tr>
                  <tr>
                    <th>교육과정 성취기준</th>
                    {data.examCount >= 1 && <td colSpan={3}>{formatStdCodesForDisplay(data.midStd)}</td>}
                    {data.examCount >= 2 && <td colSpan={3}>{formatStdCodesForDisplay(data.finalStd)}</td>}
                    {Array.from({ length: data.perfCount }).map((_, i) => {
                      const num = i + 1;
                      const std = String(data[`perf${num}Std` as keyof PlanData] || "");
                      return <td key={i}>{formatStdCodesForDisplay(std)}</td>;
                    })}
                  </tr>
                  <tr>
                    <th>평가 시기</th>
                    {data.examCount >= 1 && <td colSpan={3}>{data.midTime || "-"}</td>}
                    {data.examCount >= 2 && <td colSpan={3}>{data.finalTime || "-"}</td>}
                    {Array.from({ length: data.perfCount }).map((_, i) => {
                      const num = i + 1;
                      const period = String(data[`perf${num}Period` as keyof PlanData] || "");
                      return (
                        <td key={i} className="text-[7.5pt]">
                          {period || (i === 0 ? "10월 3째 주" : i === 1 ? "12월 2째 주" : "학기 중")}
                        </td>
                      );
                    })}
                  </tr>
                  <tr>
                    <th>분할점수 처리</th>
                    {data.examCount > 0 && <td colSpan={data.examCount * 3}>{data.splitTypeExam}</td>}
                    {data.perfCount > 0 && <td colSpan={data.perfCount}>{data.splitTypePerf}</td>}
                  </tr>
                </tbody>
              </table>

              <div className="text-[9pt] font-bold text-slate-800 mt-2 mb-1">3. 성취율과 성취도</div>
              {(() => {
                const achievementItems = getAchievementTable(data.grade, data.gradeType);
                return (
                  <table className="doc-table">
                    <tbody>
                      <tr>
                        <th style={{ width: "20%" }}>성취율</th>
                        {achievementItems.map((item, idx) => (
                          <td key={idx}>{item.rate}</td>
                        ))}
                      </tr>
                      <tr>
                        <th>성취도</th>
                        {achievementItems.map((item, idx) => (
                          <td key={idx} className="font-bold text-slate-900">
                            {item.level}
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                );
              })()}
            </div>
          )}

          {/* SECTION 3: 수행평가 세부 계획 */}
          {isShowSection(3) && (
            <div id="pv-step-3" className="pv-section space-y-3">
              <div className="font-bold text-sm text-slate-900 border-b border-slate-300 pb-1">
                4. 수행평가 세부 계획
              </div>

              {Array.from({ length: data.perfCount || 1 }).map((_, i) => {
                const num = i + 1;
                const prefix = getKoreanPrefix(i);
                const name = String(data[`perf${num}Name` as keyof PlanData] || `수행평가 ${num}`);
                const stdCodes = String(data[`perf${num}Std` as keyof PlanData] || "");
                const stdFull = getExpandedStdText(
                  stdCodes,
                  data.curriculumFullText,
                  data.curriculumSubjects,
                  data.curriculumSelectedOriginalIdx
                );
                const flow = String(data[`perf${num}Flow` as keyof PlanData] || "-");
                const ai = String(data[`perf${num}Ai` as keyof PlanData] || "-");
                const criteria = (data[`perf${num}RubricCriteria` as keyof PlanData] as RubricCriterion[]) || [];
                const note = String(data[`perf${num}Note` as keyof PlanData] ?? "");
                const startDate = String(data[`perf${num}StartDate` as keyof PlanData] || "");
                const endDate = String(data[`perf${num}EndDate` as keyof PlanData] || "");
                const period = String(data[`perf${num}Period` as keyof PlanData] || "");
                const dateRange = formatDateRangeDisplay(startDate, endDate);

                return (
                  <div key={num} className="space-y-1.5 pt-1">
                    <div className="font-bold text-[8.5pt] text-slate-900">
                      {prefix}. <span>{name}</span>
                    </div>
                    <table className="doc-table">
                      <tbody>
                        <tr>
                          <th style={{ width: "20%" }}>평가 시기</th>
                          <td className="left text-[7.5pt]">
                            {period || "학기 중"}
                          </td>
                        </tr>
                        <tr>
                          <th style={{ width: "20%" }}>성취기준</th>
                          <td className="left text-[7.5pt] whitespace-pre-line leading-relaxed">
                            {stdFull || formatStdCodesForDisplay(stdCodes)}
                          </td>
                        </tr>
                        <tr>
                          <th>수행 과제 흐름</th>
                          <td className="left text-[7.5pt] whitespace-pre-line leading-relaxed">{flow}</td>
                        </tr>
                        <tr>
                          <th>AI 활용 범위</th>
                          <td className="left text-[7.5pt] whitespace-pre-line leading-relaxed">{ai}</td>
                        </tr>
                      </tbody>
                    </table>
                    {renderRubricTable(criteria, note)}
                  </div>
                );
              })}

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
                2. [<span>{data.subjectName || "교과"}</span>]과 교수학습-평가 방법 (주차별 계획)
              </div>

              <table className="doc-table">
                <thead>
                  <tr>
                    <th style={{ width: "15%" }}>시기</th>
                    <th style={{ width: "8%" }}>시수<br />/누계</th>
                    <th style={{ width: "24%" }}>단원명(주제)<br />[핵심 아이디어]</th>
                    <th style={{ width: "16%" }}>성취기준</th>
                    <th style={{ width: "12%" }}>평가 유형</th>
                    <th style={{ width: "25%" }}>수업 세부 방법</th>
                  </tr>
                </thead>
                <tbody>
                  {data.schedules.map((item, idx) => (
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
                      <td className="left text-[7.5pt] whitespace-pre-line">{item.std}</td>
                      <td className="text-[7.5pt] font-medium whitespace-pre-line">{item.type}</td>
                      <td className="left text-[7.5pt] whitespace-pre-line leading-relaxed">{item.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* SECTION 5: 학기 단위 성취수준 */}
          {isShowSection(5) && (
            <div id="pv-step-5" className="pv-section space-y-3">
              <div className="font-bold text-sm text-slate-900 border-b border-slate-300 pb-1">
                3. [<span>{data.subjectName || "교과"}</span>]과 학기 단위 성취수준
              </div>

              <table className="doc-table">
                <thead>
                  <tr>
                    <th style={{ width: "12%" }}>성취수준</th>
                    <th style={{ width: "70%" }}>학기 단위 성취수준 기술</th>
                    <th style={{ width: "18%" }}>성취율</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="font-bold text-blue-700">A</td>
                    <td className="left text-[7.5pt] whitespace-pre-line leading-relaxed">{data.achieveA}</td>
                    <td>{is3Tier ? "80% 이상" : "90% 이상"}</td>
                  </tr>
                  <tr>
                    <td className="font-bold text-slate-800">B</td>
                    <td className="left text-[7.5pt] whitespace-pre-line leading-relaxed">{data.achieveB}</td>
                    <td>{is3Tier ? "60% 이상 ~ 80% 미만" : "80% 이상 ~ 90% 미만"}</td>
                  </tr>
                  <tr>
                    <td className="font-bold text-slate-800">C</td>
                    <td className="left text-[7.5pt] whitespace-pre-line leading-relaxed">{data.achieveC}</td>
                    <td>{is3Tier ? "60% 미만" : "70% 이상 ~ 80% 미만"}</td>
                  </tr>
                  {!is3Tier && (
                    <>
                      <tr>
                        <td className="font-bold text-slate-800">D</td>
                        <td className="left text-[7.5pt] whitespace-pre-line leading-relaxed">{data.achieveD}</td>
                        <td>60% 이상 ~ 70% 미만</td>
                      </tr>
                      <tr>
                        <td className="font-bold text-slate-800">E</td>
                        <td className="left text-[7.5pt] whitespace-pre-line leading-relaxed">{data.achieveE}</td>
                        <td>60% 미만</td>
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
