import React from "react";
import { Folder, Sparkles, FileOutput, CheckCircle2, Loader2, Edit3 } from "lucide-react";

interface HeaderProps {
  currentProjectName: string;
  saveState: "saved" | "saving" | "dirty";
  onLoadSample: () => void;
  onOpenHwpxExport: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentProjectName,
  saveState,
  onLoadSample,
  onOpenHwpxExport,
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
            <span className="font-medium text-slate-300 flex items-center gap-1">
              <Folder className="w-3.5 h-3.5 text-blue-400" />
              <span>{currentProjectName}</span>
            </span>
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

      <div className="flex items-center gap-2.5">
        <button
          onClick={onLoadSample}
          className="px-4 py-2 bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-semibold rounded-lg transition-all flex items-center gap-2 shadow-sm"
        >
          <Sparkles className="w-4 h-4 text-emerald-200" /> 2026 화학 예시
        </button>

        <button
          type="button"
          onClick={onOpenHwpxExport}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold rounded-lg transition-all flex items-center gap-2 shadow-sm cursor-pointer border border-indigo-400/40"
        >
          <FileOutput className="w-4 h-4 text-indigo-200" /> 한글(HWPX) 파일 완성
        </button>
      </div>
    </header>
  );
};
