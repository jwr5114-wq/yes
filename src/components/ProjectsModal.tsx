import React from "react";
import { Project } from "../types";
import { Folder, Plus, X, Edit2, Copy, Trash2, CheckCircle2 } from "lucide-react";

interface ProjectsModalProps {
  isOpen: boolean;
  projects: Record<string, Project>;
  activeProjectId: string;
  onClose: () => void;
  onSelectProject: (id: string) => void;
  onCreateProject: () => void;
  onCloneProject: (id: string) => void;
  onRenameProject: (id: string) => void;
  onDeleteProject: (id: string) => void;
}

export const ProjectsModal: React.FC<ProjectsModalProps> = ({
  isOpen,
  projects,
  activeProjectId,
  onClose,
  onSelectProject,
  onCreateProject,
  onCloneProject,
  onRenameProject,
  onDeleteProject,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden border border-slate-200">
        <div className="px-6 py-4 bg-slate-900 text-white flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Folder className="w-5 h-5 text-blue-400" />
            <h3 className="font-bold text-base">내 평가계획서 저장소</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 bg-slate-50 border-b flex justify-between items-center gap-2">
          <span className="text-xs text-slate-600">
            작성 중인 평가계획서를 프로젝트 단위로 관리하고 복제/수정할 수 있습니다.
          </span>
          <button
            onClick={onCreateProject}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow"
          >
            <Plus className="w-3.5 h-3.5" /> 새 평가계획서
          </button>
        </div>

        <div className="p-6 flex-1 overflow-y-auto space-y-3">
          {(Object.values(projects) as Project[]).map((proj) => {
            const isActive = proj.id === activeProjectId;
            const dateStr = new Date(proj.updatedAt).toLocaleString("ko-KR");

            return (
              <div
                key={proj.id}
                className={`p-4 rounded-xl border transition-all flex justify-between items-center ${
                  isActive
                    ? "bg-blue-50/70 border-blue-300 ring-2 ring-blue-500/30"
                    : "bg-white border-slate-200 hover:border-slate-300"
                }`}
              >
                <div
                  className="flex-1 cursor-pointer pr-4"
                  onClick={() => {
                    onSelectProject(proj.id);
                    onClose();
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-slate-800">{proj.name}</span>
                    {isActive && (
                      <span className="bg-blue-600 text-white text-[10px] px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> 현재 작업 중
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 mt-1 flex items-center gap-3">
                    <span>
                      📘 영진고등학교 ({proj.data?.subjectName || "과목미지정"})
                    </span>
                    <span>🕒 최근수정: {dateStr}</span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => onRenameProject(proj.id)}
                    title="이름 변경"
                    className="p-2 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onCloneProject(proj.id)}
                    title="복제"
                    className="p-2 text-slate-500 hover:text-emerald-600 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onDeleteProject(proj.id)}
                    title="삭제"
                    className="p-2 text-slate-500 hover:text-red-600 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
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
