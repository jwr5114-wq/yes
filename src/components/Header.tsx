import React from "react";
import { Sparkles, FileOutput } from "lucide-react";

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
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={onLoadSample}
          className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 shadow-sm"
        >
          <Sparkles className="w-3.5 h-3.5 text-emerald-200" /> 2026 화학 예시
        </button>

        <button
          type="button"
          onClick={onOpenHwpxExport}
          className="px-3.5 py-1.5 bg-indigo-700 hover:bg-indigo-600 text-white text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 shadow-sm cursor-pointer border border-indigo-400/40"
        >
          <FileOutput className="w-3.5 h-3.5 text-indigo-200" /> 한글(HWPX) 파일 완성
        </button>
      </div>
    </header>
  );
};

