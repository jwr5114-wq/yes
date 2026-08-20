import React, { useState, useRef } from "react";
import { PlanData } from "../types";
import { isFirstGrade, isThreeTier } from "../utils/achievementUtils";
import {
  processHwpFile,
  extractAchievementLevelsByStandard,
} from "../utils/hwpParser";
import {
  Loader2,
  Info,
  CheckCircle2,
  UploadCloud,
  RefreshCw,
  AlertCircle,
} from "lucide-react";

interface Step5AchievementLevelsProps {
  data: PlanData;
  onChange: (updater: (prev: PlanData) => PlanData) => void;
  showToast?: (msg: string) => void;
  setDialog?: (dialog: any) => void;
}

export const Step5AchievementLevels: React.FC<Step5AchievementLevelsProps> = ({
  data,
  onChange,
  showToast,
  setDialog,
}) => {
  const [fileParsing, setFileParsing] = useState(false);
  const [extractStatus, setExtractStatus] = useState<{
    text: string;
    type: "success" | "info" | "error" | "loading";
    details?: string;
  } | null>(
    data.achievementLevelsFileName
      ? {
          text: `"${data.achievementLevelsFileName}" 파일에서 추출된 데이터가 적용 중입니다.`,
          type: "success",
        }
      : null
  );

  const fileInputRef = useRef<HTMLInputElement>(null);

  const is1stGrade = isFirstGrade(data.grade);
  const is3Tier = isThreeTier(data.gradeType);

  // Determine current active table type:
  // Type 1: 1학년 + 5단계 평가 (공통과목 - 최소능력수행특성 포함)
  // Type 2: 2학년/3학년 + 5단계 평가 (선택과목 등 - 5단계)
  // Type 3: 3단계 평가 (1학년/2학년/3학년 공통)
  const isTable1 = is1stGrade && !is3Tier;
  const isTable2 = !is1stGrade && !is3Tier;
  const isTable3 = is3Tier;

  // Process achievement levels extraction from text (Runs ONLY on file attach or manual re-extract)
  const runExtractionFromText = (
    textToExtract: string,
    fileName?: string,
    showDetailedToast = true
  ) => {
    try {
      const result = extractAchievementLevelsByStandard(
        textToExtract,
        data.subjectName,
        is3Tier
      );

      const hasContent =
        result.achieveA.trim().length > 0 ||
        result.achieveB.trim().length > 0 ||
        result.achieveC.trim().length > 0;

      if (!result.subjectFound || !hasContent) {
        onChange((prev) => ({
          ...prev,
          achieveA: "",
          achieveB: "",
          achieveC: "",
          achieveD: "",
          achieveE: "",
          ...(fileName
            ? {
                achievementLevelsFullText: textToExtract,
                achievementLevelsFileName: fileName,
              }
            : {}),
        }));

        setExtractStatus({
          text: `선택한 과목("${data.subjectName || "현재 과목"}")의 성취수준 영역을 파일에서 찾지 못했습니다.`,
          type: "error",
          details: "첨부된 파일 내에 현재 선택 과목의 영역 또는 [성취기준]별 A/B/C/D/E 성취수준 표가 존재하는지 확인해주세요.",
        });
        if (showToast) showToast(`"${data.subjectName || "선택 과목"}" 성취수준 영역을 찾지 못했습니다.`);
        return false;
      }

      const subjectKey = data.subjectName || "기본과목";

      onChange((prev) => ({
        ...prev,
        achieveA: result.achieveA,
        achieveB: result.achieveB,
        achieveC: result.achieveC,
        achieveD: !is3Tier ? result.achieveD : "",
        achieveE: !is3Tier ? result.achieveE : "",
        achievementLevelsCache: {
          ...(prev.achievementLevelsCache || {}),
          [subjectKey]: {
            achieveA: result.achieveA,
            achieveB: result.achieveB,
            achieveC: result.achieveC,
            achieveD: !is3Tier ? result.achieveD : "",
            achieveE: !is3Tier ? result.achieveE : "",
            totalStandards: result.totalStandards,
            extractedStandards: result.extractedStandards,
          },
        },
        ...(fileName
          ? {
              achievementLevelsFullText: textToExtract,
              achievementLevelsFileName: fileName,
            }
          : {}),
      }));

      const stdCountStr = result.totalStandards > 0 ? `${result.totalStandards}개 성취기준` : "성취기준";
      const statusMsg = `"${data.subjectName || "선택 과목"}"의 ${stdCountStr}에서 수준별(A~${is3Tier ? "C" : "E"}) 원문 문구를 그대로 추출하여 표에 자동 입력했습니다.`;

      setExtractStatus({
        text: statusMsg,
        type: "success",
        details: result.extractedStandards.length > 0 ? `추출된 성취기준: ${result.extractedStandards.slice(0, 5).join(", ")}${result.extractedStandards.length > 5 ? ` 외 ${result.extractedStandards.length - 5}개` : ""}` : undefined,
      });

      if (showToast && showDetailedToast) {
        showToast("성취기준별 성취수준 원문이 표에 자동 반영되었습니다.");
      }
      return true;
    } catch (err: any) {
      console.error("Extraction error:", err);
      setExtractStatus({
        text: `추출 중 오류가 발생했습니다: ${err.message || err}`,
        type: "error",
      });
      return false;
    }
  };

  // Handle file upload in Step 5 (Analyzes 1 time only on upload)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    setFileParsing(true);
    setExtractStatus({
      text: `"${file.name}" 파일을 분석하여 "${data.subjectName || "현재 과목"}"의 성취수준을 추출하고 있습니다...`,
      type: "loading",
    });

    try {
      let fullText = "";
      if (file.name.toLowerCase().endsWith(".hwp")) {
        fullText = await processHwpFile(file);
      } else if (file.name.toLowerCase().endsWith(".txt")) {
        fullText = await file.text();
      } else {
        try {
          fullText = await processHwpFile(file);
        } catch {
          fullText = await file.text();
        }
      }

      runExtractionFromText(fullText, file.name, true);
    } catch (err: any) {
      console.error("File upload error:", err);
      setExtractStatus({
        text: `파일 분석 오류: ${err.message || "HWP 또는 TXT 파일을 확인해주세요."}`,
        type: "error",
      });
      if (showToast) showToast("파일 분석에 실패했습니다.");
    } finally {
      setFileParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Handle user manual re-extraction request
  const handleManualReExtract = () => {
    if (!data.achievementLevelsFullText) {
      if (showToast) showToast("첨부된 성취수준 파일이 없습니다. 파일을 먼저 첨부해주세요.");
      return;
    }
    setFileParsing(true);
    setExtractStatus({
      text: `"${data.subjectName || "현재 과목"}"의 성취수준을 다시 분석 중입니다...`,
      type: "loading",
    });
    setTimeout(() => {
      runExtractionFromText(data.achievementLevelsFullText!, data.achievementLevelsFileName, true);
      setFileParsing(false);
    }, 50);
  };

  return (
    <div className="space-y-5">
      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept=".hwp,.txt"
        className="hidden"
      />

      {/* Header */}
      <div className="border-b border-slate-200 pb-3 flex justify-between items-center gap-2">
        <div>
          <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">
              5
            </span>
            3. [{data.subjectName || "과목"}]과 학기 단위 성취수준
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            앞 단계에서 설정된 대상 학년({data.grade || "1"}학년) 및 평가 단계({data.gradeType || "5단계"})에 따라 해당 양식의 표가 자동으로 적용됩니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs bg-blue-50 text-blue-700 px-3 py-1 rounded-full border border-blue-200 font-medium whitespace-nowrap">
            5 / 5 단계
          </span>
        </div>
      </div>

      {/* Auto File Extraction Toolbar */}
      <div className="bg-gradient-to-r from-blue-50 via-indigo-50 to-slate-50 border border-blue-200 rounded-xl p-4 shadow-xs space-y-3">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="space-y-1 max-w-xl">
            <div className="flex items-center gap-2">
              <span className="bg-blue-600 text-white text-[11px] font-bold px-2 py-0.5 rounded">
                원문 추출
              </span>
              <h3 className="text-xs font-bold text-slate-900">
                성취기준별 성취수준 파일
              </h3>
            </div>
            <p className="text-[11.5px] text-slate-600 leading-relaxed">
              성취기준별 성취수준 HWP 파일을 첨부하면, 현재 선택된 과목(<strong className="text-blue-700">{data.subjectName || "과목"}</strong>)의 성취기준별 성취수준 표에서 <strong className="text-slate-800">A / B / C{is3Tier ? "" : " / D / E"}</strong> 원문을 추출하여 공백 한 칸으로 이어진 하나의 문단으로 자동 입력합니다.
            </p>
          </div>

          {/* Action Buttons (필수 파일 첨부) */}
          <div className="flex items-center gap-2 p-1.5 bg-yellow-50 border border-yellow-300 rounded-xl">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={fileParsing}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center gap-2 shadow-sm transition-all cursor-pointer disabled:opacity-50"
              title="성취기준별 성취수준 HWP 파일 첨부"
            >
              {fileParsing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <UploadCloud className="w-4 h-4" />
              )}
              <span>HWP 파일 첨부</span>
            </button>

            {data.achievementLevelsFullText && (
              <button
                type="button"
                onClick={handleManualReExtract}
                disabled={fileParsing}
                className="px-3 py-2.5 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer disabled:opacity-50"
                title="첨부된 파일에서 현재 과목의 성취수준을 다시 추출합니다."
              >
                <RefreshCw className={`w-3.5 h-3.5 ${fileParsing ? "animate-spin" : ""}`} />
                <span>다시 추출</span>
              </button>
            )}
          </div>
        </div>

        {/* Extraction status notification bar */}
        {extractStatus && (
          <div
            className={`p-2.5 rounded-lg text-xs flex items-start gap-2 border ${
              extractStatus.type === "success"
                ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                : extractStatus.type === "loading"
                ? "bg-blue-50 border-blue-200 text-blue-900"
                : extractStatus.type === "error"
                ? "bg-rose-50 border-rose-200 text-rose-900"
                : "bg-slate-50 border-slate-200 text-slate-800"
            }`}
          >
            {extractStatus.type === "success" && (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            )}
            {extractStatus.type === "loading" && (
              <Loader2 className="w-4 h-4 text-blue-600 animate-spin shrink-0 mt-0.5" />
            )}
            {extractStatus.type === "error" && (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            )}
            {extractStatus.type === "info" && (
              <Info className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
            )}
            <div className="space-y-0.5">
              <p className="font-semibold">{extractStatus.text}</p>
              {extractStatus.details && (
                <p className="text-[11px] opacity-90">{extractStatus.details}</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Auto-matching info banner */}
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 text-slate-700 font-medium">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>현재 적용된 양식:</span>
          <span className="bg-white border border-slate-300 px-2 py-0.5 rounded text-blue-700 font-bold">
            {isTable1
              ? "1학년 공통과목 (5단계 + 최소능력수행특성)"
              : isTable2
              ? "2·3학년 일반/선택과목 (5단계)"
              : "3단계 평가 (A / B / C)"}
          </span>
        </div>
        <div className="text-[11px] text-slate-500 flex items-center gap-1">
          <Info className="w-3.5 h-3.5 text-slate-400" />
          <span>자동 입력된 문구는 각 칸에서 언제든지 직접 추가·수정할 수 있습니다.</span>
        </div>
      </div>

      {/* Main Table Form Section */}
      <div className="bg-white border border-slate-300 rounded-xl overflow-hidden shadow-sm">
        {/* Section Heading with subtle official styling */}
        <div className="px-4 py-3 bg-slate-100 border-b border-slate-300 flex items-center justify-between">
          <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
            <span className="bg-emerald-100 text-emerald-900 px-1.5 py-0.5 rounded text-xs font-bold border border-emerald-300">
              1
            </span>
            학기 단위 성취수준
          </h3>
          <span className="text-[11px] text-slate-500">
            동일 수준의 모든 성취기준별 문구는 공백 한 칸으로 연결된 하나의 연속 문단으로 작성됩니다.
          </span>
        </div>

        {/* Guidance notes matching the official HWP form */}
        <div className="p-3 bg-blue-50/60 border-b border-blue-100 text-[11.5px] text-blue-900 space-y-1">
          {isTable1 && (
            <>
              <p className="font-medium">
                ※ 학기 단위의 성취수준은 한 학기 전체 성취기준을 포괄하는 수준에서 전반적인 이해와 수행 특성을 진술함.
              </p>
              <p className="font-medium text-blue-950">
                ※ 1학년 공통과목은 <span className="bg-yellow-200 text-yellow-900 px-1 rounded font-bold">최소능력수행특성</span>을 포함하여 진술
              </p>
            </>
          )}
          {isTable2 && (
            <p className="font-medium">
              ※ 1학년 공통과목 외 과목은 학기단위 성취수준 진술(5단계)
            </p>
          )}
          {isTable3 && (
            <p className="font-medium">
              ※ 1학년 공통과목 외 과목은 학기단위 성취수준 진술(3단계)
            </p>
          )}
        </div>

        {/* Form Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300 text-center">
                <th className="p-2.5 border-r border-slate-300 w-24">성취수준</th>
                <th className="p-2.5 border-r border-slate-300">성취수준 기술</th>
                <th className="p-2.5 w-44">성취율</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {/* Row A */}
              <tr>
                <td className="p-3 text-center font-bold text-blue-700 bg-slate-50/50 border-r border-slate-200 text-sm">
                  A
                </td>
                <td className="p-2 border-r border-slate-200">
                  <textarea
                    rows={4}
                    value={data.achieveA}
                    onChange={(e) => onChange((prev) => ({ ...prev, achieveA: e.target.value }))}
                    placeholder="파일에서 추출된 성취기준별 A 문구가 자동으로 입력되거나, 직접 기술 문구를 작성합니다."
                    className="w-full p-2 text-xs border border-slate-200 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none leading-relaxed resize-y bg-white font-sans"
                  />
                </td>
                <td className="p-3 text-center font-semibold text-slate-700 bg-slate-50/30 whitespace-nowrap">
                  {is3Tier ? "80% 이상" : "90% 이상"}
                </td>
              </tr>

              {/* Row B */}
              <tr>
                <td className="p-3 text-center font-bold text-slate-800 bg-slate-50/50 border-r border-slate-200 text-sm">
                  B
                </td>
                <td className="p-2 border-r border-slate-200">
                  <textarea
                    rows={4}
                    value={data.achieveB}
                    onChange={(e) => onChange((prev) => ({ ...prev, achieveB: e.target.value }))}
                    placeholder="파일에서 추출된 성취기준별 B 문구가 자동으로 입력되거나, 직접 기술 문구를 작성합니다."
                    className="w-full p-2 text-xs border border-slate-200 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none leading-relaxed resize-y bg-white font-sans"
                  />
                </td>
                <td className="p-3 text-center font-semibold text-slate-700 bg-slate-50/30 whitespace-nowrap">
                  {is3Tier ? "60% 이상 ~ 80% 미만" : "80% 이상 ~ 90% 미만"}
                </td>
              </tr>

              {/* Row C */}
              <tr>
                <td className="p-3 text-center font-bold text-slate-800 bg-slate-50/50 border-r border-slate-200 text-sm">
                  C
                </td>
                <td className="p-2 border-r border-slate-200">
                  <textarea
                    rows={4}
                    value={data.achieveC}
                    onChange={(e) => onChange((prev) => ({ ...prev, achieveC: e.target.value }))}
                    placeholder="파일에서 추출된 성취기준별 C 문구가 자동으로 입력되거나, 직접 기술 문구를 작성합니다."
                    className="w-full p-2 text-xs border border-slate-200 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none leading-relaxed resize-y bg-white font-sans"
                  />
                </td>
                <td className="p-3 text-center font-semibold text-slate-700 bg-slate-50/30 whitespace-nowrap">
                  {is3Tier ? "60% 미만" : "70% 이상 ~ 80% 미만"}
                </td>
              </tr>

              {/* Rows D & E for 5-tier scales */}
              {!is3Tier && (
                <>
                  {/* Row D */}
                  <tr>
                    <td className="p-3 text-center font-bold text-slate-800 bg-slate-50/50 border-r border-slate-200 text-sm">
                      D
                    </td>
                    <td className="p-2 border-r border-slate-200">
                      <textarea
                        rows={4}
                        value={data.achieveD}
                        onChange={(e) => onChange((prev) => ({ ...prev, achieveD: e.target.value }))}
                        placeholder="파일에서 추출된 성취기준별 D 문구가 자동으로 입력되거나, 직접 기술 문구를 작성합니다."
                        className="w-full p-2 text-xs border border-slate-200 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none leading-relaxed resize-y bg-white font-sans"
                      />
                    </td>
                    <td className="p-3 text-center font-semibold text-slate-700 bg-slate-50/30 whitespace-nowrap">
                      60% 이상 ~ 70% 미만
                    </td>
                  </tr>

                  {/* Row E */}
                  <tr>
                    <td className="p-3 text-center font-bold text-slate-800 bg-slate-50/50 border-r border-slate-200 text-sm">
                      E
                    </td>
                    <td className="p-2 border-r border-slate-200">
                      <textarea
                        rows={4}
                        value={data.achieveE}
                        onChange={(e) => onChange((prev) => ({ ...prev, achieveE: e.target.value }))}
                        placeholder="파일에서 추출된 성취기준별 E 문구가 자동으로 입력되거나, 직접 기술 문구를 작성합니다."
                        className="w-full p-2 text-xs border border-slate-200 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none leading-relaxed resize-y bg-white font-sans"
                      />
                    </td>
                    <td className="p-3 text-center font-semibold text-slate-700 bg-slate-50/30 whitespace-nowrap">
                      {isTable1 ? "40% 이상 ~ 60% 미만" : "60% 미만"}
                    </td>
                  </tr>
                </>
              )}

              {/* Table 1 Only: 최소능력수행특성 Section */}
              {isTable1 && (
                <>
                  <tr className="bg-slate-100 border-t-2 border-b border-slate-300">
                    <th colSpan={3} className="p-2.5 text-center font-bold text-slate-900 bg-slate-100 text-xs tracking-wide">
                      최소능력수행특성
                    </th>
                  </tr>
                  <tr>
                    <td colSpan={3} className="p-3 bg-white">
                      <textarea
                        rows={3}
                        value={data.minCompetency || ""}
                        onChange={(e) => onChange((prev) => ({ ...prev, minCompetency: e.target.value }))}
                        placeholder="1학년 공통과목의 최소 성취수준 보장을 위한 최소능력수행특성을 기술합니다. (예: 교과의 기초적인 용어와 기본 개념을 이해하고, 안내에 따라 단순한 탐구 활동에 참여할 수 있다.)"
                        className="w-full p-2.5 text-xs border border-slate-200 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none leading-relaxed resize-y bg-white font-sans"
                      />
                    </td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

