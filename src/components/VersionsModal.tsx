import React from "react";
import { Project } from "../types";
import { History, Camera, X, RotateCcw, Trash2 } from "lucide-react";

interface VersionsModalProps {
  isOpen: boolean;
  project: Project | null;
  onClose: () => void;
  onCreateSnapshot: () => void;
  onRestoreSnapshot: (snapId: string) => void;
  onDeleteSnapshot: (snapId: string) => void;
}

export const VersionsModal: React.FC<VersionsModalProps> = ({
  isOpen,
  project,
  onClose,
  onCreateSnapshot,
  onRestoreSnapshot,
  onDeleteSnapshot,
}) => {
  if (!isOpen || !project) return null;

  const snapshots = project.snapshots || [];

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-xl w-full max-h-[85vh] flex flex-col overflow-hidden border border-slate-200">
        <div className="px-6 py-4 bg-slate-900 text-white flex justify-between items-center">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-amber-400" />
            <h3 className="font-bold text-base">버전 히스토리 & 스냅샷</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 bg-amber-50 border-b border-amber-200 flex items-center justify-between gap-2">
          <div>
            <div className="text-xs font-bold text-amber-900">현재 상태를 스냅샷으로 백업</div>
            <div className="text-[11px] text-amber-700">수정 전 주요 전환점에 언제든지 이전 버전으로 복원할 수 있습니다.</div>
          </div>
          <button
            onClick={onCreateSnapshot}
            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold rounded-lg shadow flex items-center gap-1 shrink-0"
          >
            <Camera className="w-3.5 h-3.5" /> 현재 버전 저장
          </button>
        </div>

        <div className="p-6 flex-1 overflow-y-auto space-y-3">
          {snapshots.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-xs">
              <History className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              저장된 스냅샷이 없습니다.
              <br />
              '현재 버전 저장' 버튼을 눌러 백업 버전을 만들어보세요.
            </div>
          ) : (
            snapshots.map((snap) => {
              const dateStr = new Date(snap.timestamp).toLocaleString("ko-KR");
              return (
                <div
                  key={snap.id}
                  className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg flex justify-between items-center text-xs hover:border-slate-300 transition-all"
                >
                  <div>
                    <div className="font-bold text-slate-800">{snap.name}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">📅 {dateStr}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onRestoreSnapshot(snap.id)}
                      className="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded-md font-semibold flex items-center gap-1 text-[11px] shadow-xs"
                    >
                      <RotateCcw className="w-3 h-3" /> 이 버전으로 복원
                    </button>
                    <button
                      onClick={() => onDeleteSnapshot(snap.id)}
                      className="p-1.5 text-slate-400 hover:text-red-600 rounded transition-colors"
                      title="스냅샷 삭제"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="p-4 bg-slate-100 border-t text-right">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-semibold rounded-lg transition-colors"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
};
