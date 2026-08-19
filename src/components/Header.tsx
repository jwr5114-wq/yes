import React from "react";
import { Folder, Save, History, Sparkles, FileDown, FileCode, CheckCircle2, Loader2, Edit3, FileText, FileOutput } from "lucide-react";

interface HeaderProps {
  currentProjectName: string;
  saveState: "saved" | "saving" | "dirty";
  onOpenProjects: () => void;
  onOpenVersions: () => void;
  onManualSave: () => void;
  onLoadSample: () => void;
  onDownloadPdf: () => void;
  onOpenJsonExport: () => void;
  onOpenHwpxExport: () => void;
  onGoToHwpStep?: () => void;
  isDownloadingPdf: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  currentProjectName,
  saveState,
  onOpenProjects,
  onOpenVersions,
  onManualSave,
  onLoadSample,
  onDownloadPdf,
  onOpenJsonExport,
  onOpenHwpxExport,
  onGoToHwpStep,
  isDownloadingPdf,
}) => {
  return (
    <header className="bg-slate-900 text-white px-4 md:px-6 py-2.5 flex items-center justify-between shadow-md z-20 flex-wrap gap-2 shrink-0 border-b border-slate-800">
      <div className="flex items-center gap-3">
        <div className="bg-blue-600 p-2 rounded-lg text-white shadow-sm flex items-center justify-center">
          <span className="text-xl leading-none">📝</span>
        </div>
        <div>
          <h1 className="font-bold text-base md:text-lg leading-tight flex items-center gap-2">
            교수·학습 및 평가 운영 계획서 스마트 작성기
            <span className="bg-blue-500/20 text-blue-300 text-xs px-2 py-0.5 rounded border border-blue-400/30 hidden sm:inline-block font-medium">
              2026학년도 2학기 고정
            </span>
          </h1>
          <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5">
            <button
              onClick={onOpenProjects}
              className="font-medium text-slate-200 hover:text-blue-300 hover:underline flex items-center gap-1 transition-colors"
            >
              <Folder className="w-3.5 h-3.5 text-blue-400" />
              <span>{currentProjectName}</span>
            </button>
            <span className="text-slate-600">|</span>
            {saveState === "saved" && (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] bg-slate-800 text-emerald-400 font-medium border border-slate-700">
                <CheckCircle2 className="w-3 h-3 text-emerald-400" /> 저장됨
              </span>
            )}
            {saveState === "saving" && (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] bg-slate-800 text-amber-400 font-medium border border-slate-700 animate-pulse">
                <Loader2 className="w-3 h-3 text-amber-400 animate-spin" /> 저장 중...
              </span>
            )}
            {saveState === "dirty" && (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] bg-slate-800 text-slate-300 font-medium border border-slate-700">
                <Edit3 className="w-3 h-3 text-slate-400" /> 수정됨
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={onOpenProjects}
          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 border border-slate-700 shadow-sm"
        >
          <Folder className="w-3.5 h-3.5 text-blue-400" /> 내 평가계획서 목록
        </button>

        <button
          onClick={onManualSave}
          className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 shadow-sm border border-slate-600"
        >
          <Save className="w-3.5 h-3.5 text-emerald-400" /> 저장
        </button>

        <button
          onClick={onOpenVersions}
          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 border border-slate-700 shadow-sm"
        >
          <History className="w-3.5 h-3.5 text-amber-400" /> 스냅샷/버전
        </button>

        <button
          onClick={onLoadSample}
          className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 shadow-sm"
        >
          <Sparkles className="w-3.5 h-3.5 text-emerald-200" /> 2026 화학 예시
        </button>

        <button
          type="button"
          onClick={onOpenJsonExport}
          className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 shadow-sm cursor-pointer border border-indigo-400/40"
        >
          <FileCode className="w-3.5 h-3.5 text-indigo-200" /> HWP 연동 데이터 (JSON)
        </button>

        <button
          type="button"
          onClick={onOpenHwpxExport}
          className="px-3.5 py-1.5 bg-indigo-700 hover:bg-indigo-600 text-white text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 shadow-sm cursor-pointer border border-indigo-400/40"
        >
          <FileOutput className="w-3.5 h-3.5 text-indigo-200" /> 한글(HWPX) 파일 완성
        </button>

        <button
          type="button"
          onClick={onDownloadPdf}
          disabled={isDownloadingPdf}
          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:bg-slate-800 text-slate-200 text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 border border-slate-700 shadow-sm cursor-pointer"
          title="참고용 PDF 미리보기 다운로드"
        >
          {isDownloadingPdf ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> PDF 생성 중...
            </>
          ) : (
            <>
              <FileDown className="w-3.5 h-3.5 text-slate-400" /> PDF 참고용
            </>
          )}
        </button>
      </div>
    </header>
  );
};

