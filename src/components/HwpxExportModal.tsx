import React, { useRef, useState } from "react";
import { PlanData } from "../types";
import { buildFinalPreviewData } from "../utils/finalPreviewData";
import { fillHwpxTemplate, downloadBlob } from "../utils/hwpxWriter";
import { X, FileUp, FileCheck2, AlertTriangle, Loader2, FileOutput } from "lucide-react";

interface HwpxExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: PlanData;
  showToast?: (msg: string) => void;
}

export const HwpxExportModal: React.FC<HwpxExportModalProps> = ({ isOpen, onClose, data, showToast }) => {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [warnings, setWarnings] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handlePickFile = (f: File | null) => {
    setFile(f);
    setWarnings(null);
    setError(null);
  };

  const handleComplete = async () => {
    if (!file) return;
    setIsProcessing(true);
    setError(null);
    setWarnings(null);
    try {
      const buffer = await file.arrayBuffer();
      const previewData = buildFinalPreviewData(data);
      const result = await fillHwpxTemplate(buffer, previewData);
      downloadBlob(result.blob, result.filename);
      setWarnings(result.warnings);
      if (showToast) {
        showToast(
          result.warnings.length > 0
            ? `한글 파일이 완성되었습니다. 확인이 필요한 항목 ${result.warnings.length}건이 있습니다.`
            : "한글(HWPX) 파일이 완성되어 다운로드되었습니다."
        );
      }
    } catch (e: any) {
      setError(e?.message || "한글 파일을 만드는 중 오류가 발생했습니다.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-lg flex flex-col max-h-[90vh] overflow-hidden">
        <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-indigo-600 rounded-lg text-white">
              <FileOutput className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-sm sm:text-base leading-tight">출력 전용 마스터 서식(HWPX)으로 완성하기</h2>
              <p className="text-xs text-slate-400 mt-0.5">마스터 템플릿의 열 너비·셀 병합·테두리는 유지하고, 내용에 맞춰 행 높이 자동 확장 및 정규 장평(100%)·자간으로 저장합니다.</p>
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

        <div className="p-5 space-y-4 overflow-y-auto">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
              <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px]">1</span>
              출력 전용 마스터 서식 파일 선택 (.hwpx)
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className={`w-full border-2 border-dashed rounded-xl p-4 flex items-center gap-3 text-left transition-colors ${
                file ? "border-indigo-300 bg-indigo-50/60" : "border-slate-300 hover:border-indigo-300 hover:bg-slate-50"
              }`}
            >
              {file ? <FileCheck2 className="w-5 h-5 text-indigo-600 shrink-0" /> : <FileUp className="w-5 h-5 text-slate-400 shrink-0" />}
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-800 truncate">{file ? file.name : "수정하신 출력 전용 마스터 .hwpx 파일을 선택하세요"}</div>
                <div className="text-xs text-slate-500 mt-0.5">열 너비·서식 유지 및 줄 수에 따른 행 높이 자동 확장이 적용됩니다.</div>
              </div>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".hwpx"
              className="hidden"
              onChange={(e) => handlePickFile(e.target.files?.[0] || null)}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
              <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px]">2</span>
              앱 데이터 사용
            </div>
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-xs text-slate-600">
              현재 작성 중인 <b>{data.subjectName || "(과목명 미입력)"}</b> 평가계획의 기본정보·평가개요·수행평가·진도표·성취수준 데이터를 자동으로 사용합니다.
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
              <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px]">3</span>
              한글 파일 완성하기
            </div>
            <button
              type="button"
              onClick={handleComplete}
              disabled={!file || isProcessing}
              className="w-full py-3 rounded-xl bg-indigo-600 text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-indigo-700 transition-colors"
            >
              {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileOutput className="w-4 h-4" />}
              {isProcessing ? "채우는 중..." : "한글 파일 완성하기"}
            </button>
          </div>

          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-700 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {warnings && warnings.length > 0 && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800 space-y-1.5">
              <div className="flex items-center gap-2 font-bold">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                다운로드는 완료되었지만, 아래 항목은 원본 서식에서 자리를 못 찾았거나 표 용량을 초과해 비어 있을 수 있습니다. 한글에서 직접 열어 확인해 주세요.
              </div>
              <ul className="list-disc list-inside space-y-0.5 pl-1">
                {warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          {warnings && warnings.length === 0 && (
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-700 flex items-center gap-2">
              <FileCheck2 className="w-4 h-4 shrink-0" />
              모든 항목을 서식 손상 없이 채워 넣었습니다.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
