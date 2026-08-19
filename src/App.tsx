import React, { useState, useEffect, useRef, useCallback } from "react";
import { PlanData, Project } from "./types";
import { EMPTY_PLAN_DATA, DEFAULT_CHEM_DATA, FIXED_SCHOOL_NAME, FIXED_YEAR_SEMESTER } from "./constants";
import { Header } from "./components/Header";
import { StepTabs } from "./components/StepTabs";
import { Step1BasicInfo } from "./components/Step1BasicInfo";
import { Step2AssessmentOverview } from "./components/Step2AssessmentOverview";
import { Step3PerformanceDetail } from "./components/Step3PerformanceDetail";
import { Step4WeeklySchedule, syncScheduleWithPerformances } from "./components/Step4WeeklySchedule";
import { Step5AchievementLevels } from "./components/Step5AchievementLevels";
import { DocumentPreview } from "./components/DocumentPreview";
import { ProjectsModal } from "./components/ProjectsModal";
import { VersionsModal } from "./components/VersionsModal";
import { StdSelectModal } from "./components/StdSelectModal";
import { JsonExportModal } from "./components/JsonExportModal";
import { CustomDialog, DialogOptions } from "./components/CustomDialog";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";

declare global {
  interface Window {
    html2pdf?: any;
  }
}

export default function App() {
  const [projectsMap, setProjectsMap] = useState<Record<string, Project>>({});
  const [activeProjectId, setActiveProjectId] = useState<string>("default-project-1");
  const [appData, setAppData] = useState<PlanData>(() => JSON.parse(JSON.stringify(EMPTY_PLAN_DATA)));
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [viewMode, setViewMode] = useState<"step" | "full">("step");
  const [saveState, setSaveState] = useState<"saved" | "saving" | "dirty">("saved");

  // Modals state
  const [isProjectsModalOpen, setIsProjectsModalOpen] = useState(false);
  const [isVersionsModalOpen, setIsVersionsModalOpen] = useState(false);
  const [isJsonModalOpen, setIsJsonModalOpen] = useState(false);
  const [stdModalTarget, setStdModalTarget] = useState<"mid" | "final" | "perf1" | "perf2" | "perf3" | "perf4" | number | null>(null);
  const [dialog, setDialog] = useState<DialogOptions | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
  }, []);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => {
      setToastMessage(null);
    }, 2800);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  // Load initial projects from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem("eval_projects_store");
      let map: Record<string, Project> = {};
      if (stored) {
        map = JSON.parse(stored);
      }

      // Enforce fixed values
      Object.keys(map).forEach((k) => {
        if (map[k] && map[k].data) {
          map[k].data.yearSemester = FIXED_YEAR_SEMESTER;
          map[k].data.schoolName = FIXED_SCHOOL_NAME;
        }
      });

      if (Object.keys(map).length === 0) {
        const defaultProj: Project = {
          id: "default-project-1",
          name: "2026학년도 2학기 신규 교과 평가계획서",
          updatedAt: new Date().toISOString(),
          data: JSON.parse(JSON.stringify(EMPTY_PLAN_DATA)),
          snapshots: [],
        };
        map["default-project-1"] = defaultProj;
        localStorage.setItem("eval_projects_store", JSON.stringify(map));
      }

      const activeId = localStorage.getItem("eval_active_project_id") || Object.keys(map)[0];
      setProjectsMap(map);
      setActiveProjectId(activeId);
      if (map[activeId]) {
        setAppData(JSON.parse(JSON.stringify(map[activeId].data)));
      }
    } catch (e) {
      console.warn("Storage load error:", e);
    }
  }, []);

  // Compute calculated exam ratios and auto-sync assessment types whenever standards/ratios change
  const normalizeExamRatios = (data: PlanData): PlanData => {
    const updated = { ...data };

    // Midterm calculations
    const midTotalScore = updated.midSelectScore + updated.midShortScore + updated.midEssayScore;
    if (midTotalScore > 0) {
      updated.midSelectRatio = parseFloat(((updated.midSelectScore / midTotalScore) * updated.midTotalRatio).toFixed(1));
      updated.midShortRatio = parseFloat(((updated.midShortScore / midTotalScore) * updated.midTotalRatio).toFixed(1));
      updated.midEssayRatio = parseFloat(((updated.midEssayScore / midTotalScore) * updated.midTotalRatio).toFixed(1));
    } else {
      updated.midSelectRatio = 0;
      updated.midShortRatio = 0;
      updated.midEssayRatio = 0;
    }

    // Final exam calculations
    const finalTotalScore = updated.finalSelectScore + updated.finalShortScore + updated.finalEssayScore;
    if (finalTotalScore > 0) {
      updated.finalSelectRatio = parseFloat(((updated.finalSelectScore / finalTotalScore) * updated.finalTotalRatio).toFixed(1));
      updated.finalShortRatio = parseFloat(((updated.finalShortScore / finalTotalScore) * updated.finalTotalRatio).toFixed(1));
      updated.finalEssayRatio = parseFloat(((updated.finalEssayScore / finalTotalScore) * updated.finalTotalRatio).toFixed(1));
    } else {
      updated.finalSelectRatio = 0;
      updated.finalShortRatio = 0;
      updated.finalEssayRatio = 0;
    }

    // Auto-sync schedule types with exam standards & performance assessments
    if (updated.schedules && updated.schedules.length > 0) {
      const { schedules: syncedSchedules, changed } = syncScheduleWithPerformances(updated.schedules, updated);
      if (changed) {
        updated.schedules = syncedSchedules;
      }
    }

    return updated;
  };

  // State Updater with Auto-save
  const handleDataChange = useCallback(
    (updater: (prev: PlanData) => PlanData) => {
      setSaveState("dirty");
      setAppData((prev) => {
        const nextRaw = updater(prev);
        const next = normalizeExamRatios({
          ...nextRaw,
          yearSemester: FIXED_YEAR_SEMESTER,
          schoolName: FIXED_SCHOOL_NAME,
        });

        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = setTimeout(() => {
          setSaveState("saving");
          setProjectsMap((currentMap) => {
            const updatedMap = {
              ...currentMap,
              [activeProjectId]: {
                ...currentMap[activeProjectId],
                updatedAt: new Date().toISOString(),
                data: next,
              },
            };
            try {
              localStorage.setItem("eval_projects_store", JSON.stringify(updatedMap));
              localStorage.setItem("eval_active_project_id", activeProjectId);
            } catch (err) {
              console.error("Local storage error:", err);
            }
            return updatedMap;
          });
          setTimeout(() => setSaveState("saved"), 250);
        }, 600);

        return next;
      });
    },
    [activeProjectId]
  );

  // Manual explicit save
  const handleManualSave = () => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    setSaveState("saving");
    setProjectsMap((currentMap) => {
      const updatedMap = {
        ...currentMap,
        [activeProjectId]: {
          ...currentMap[activeProjectId],
          updatedAt: new Date().toISOString(),
          data: appData,
        },
      };
      localStorage.setItem("eval_projects_store", JSON.stringify(updatedMap));
      localStorage.setItem("eval_active_project_id", activeProjectId);
      return updatedMap;
    });
    setTimeout(() => {
      setSaveState("saved");
      showToast("현재 작성 내용이 성공적으로 저장되었습니다.");
    }, 200);
  };

  // Switch project
  const handleSelectProject = (projId: string) => {
    if (!projectsMap[projId]) return;
    setActiveProjectId(projId);
    setAppData(JSON.parse(JSON.stringify(projectsMap[projId].data)));
    localStorage.setItem("eval_active_project_id", projId);
    setSaveState("saved");
    showToast(`'${projectsMap[projId].name}' 프로젝트로 전환되었습니다.`);
  };

  // Create new project
  const handleCreateProject = () => {
    setDialog({
      type: "prompt",
      title: "새 평가계획서",
      msg: "새 평가계획서 프로젝트 제목을 입력하세요:",
      defaultText: "신규 교과 교수학습 및 평가계획서",
      onConfirm: (name) => {
        if (!name || !name.trim()) return;
        const newId = `proj-${Date.now()}`;
        const freshData: PlanData = {
          ...JSON.parse(JSON.stringify(EMPTY_PLAN_DATA)),
          yearSemester: FIXED_YEAR_SEMESTER,
          schoolName: FIXED_SCHOOL_NAME,
          subjectName: "",
          gradeType: "5단계(5등급)",
        };

        const newProject: Project = {
          id: newId,
          name: name.trim(),
          updatedAt: new Date().toISOString(),
          data: freshData,
          snapshots: [],
        };

        setProjectsMap((prev) => {
          const next = { ...prev, [newId]: newProject };
          localStorage.setItem("eval_projects_store", JSON.stringify(next));
          return next;
        });

        setActiveProjectId(newId);
        setAppData(freshData);
        localStorage.setItem("eval_active_project_id", newId);
        setIsProjectsModalOpen(false);
        showToast("새 평가계획서가 생성되었습니다.");
      },
    });
  };

  // Clone project
  const handleCloneProject = (projId: string) => {
    const source = projectsMap[projId];
    if (!source) return;

    const newId = `proj-${Date.now()}`;
    const clonedData = JSON.parse(JSON.stringify(source.data));

    const clonedProject: Project = {
      id: newId,
      name: `${source.name} (복사본)`,
      updatedAt: new Date().toISOString(),
      data: clonedData,
      snapshots: [],
    };

    setProjectsMap((prev) => {
      const next = { ...prev, [newId]: clonedProject };
      localStorage.setItem("eval_projects_store", JSON.stringify(next));
      return next;
    });
    showToast("프로젝트가 복제되었습니다.");
  };

  // Rename project
  const handleRenameProject = (projId: string) => {
    const current = projectsMap[projId];
    if (!current) return;

    setDialog({
      type: "prompt",
      title: "프로젝트 이름 변경",
      msg: "새 프로젝트 이름을 입력하세요:",
      defaultText: current.name,
      onConfirm: (newName) => {
        if (!newName || !newName.trim()) return;
        setProjectsMap((prev) => {
          const next = {
            ...prev,
            [projId]: { ...prev[projId], name: newName.trim() },
          };
          localStorage.setItem("eval_projects_store", JSON.stringify(next));
          return next;
        });
        showToast("프로젝트 이름이 변경되었습니다.");
      },
    });
  };

  // Delete project
  const handleDeleteProject = (projId: string) => {
    if (Object.keys(projectsMap).length <= 1) {
      setDialog({
        type: "alert",
        title: "삭제 불가",
        msg: "최소 하나의 평가계획서는 보관되어야 합니다.",
      });
      return;
    }

    setDialog({
      type: "confirm",
      title: "프로젝트 삭제",
      msg: `'${projectsMap[projId]?.name}' 프로젝트를 삭제하시겠습니까?`,
      onConfirm: () => {
        setProjectsMap((prev) => {
          const next = { ...prev };
          delete next[projId];
          localStorage.setItem("eval_projects_store", JSON.stringify(next));

          if (projId === activeProjectId) {
            const nextActive = Object.keys(next)[0];
            setActiveProjectId(nextActive);
            setAppData(JSON.parse(JSON.stringify(next[nextActive].data)));
            localStorage.setItem("eval_active_project_id", nextActive);
          }
          return next;
        });
        showToast("프로젝트가 삭제되었습니다.");
      },
    });
  };

  // Create Snapshot
  const handleCreateSnapshot = () => {
    const current = projectsMap[activeProjectId];
    if (!current) return;

    setDialog({
      type: "prompt",
      title: "현재 버전 스냅샷 저장",
      msg: "스냅샷 이름 (예: 1차 점검본, 최종 제출용):",
      defaultText: `${new Date().toLocaleTimeString("ko-KR")} 스냅샷`,
      onConfirm: (name) => {
        if (!name || !name.trim()) return;
        const newSnap = {
          id: `snap-${Date.now()}`,
          name: name.trim(),
          timestamp: new Date().toISOString(),
          data: JSON.parse(JSON.stringify(appData)),
        };

        setProjectsMap((prev) => {
          const proj = prev[activeProjectId];
          const snaps = proj.snapshots ? [newSnap, ...proj.snapshots] : [newSnap];
          const next = {
            ...prev,
            [activeProjectId]: { ...proj, snapshots: snaps },
          };
          localStorage.setItem("eval_projects_store", JSON.stringify(next));
          return next;
        });
        showToast("현재 버전 스냅샷이 생성되었습니다.");
      },
    });
  };

  // Restore Snapshot
  const handleRestoreSnapshot = (snapId: string) => {
    const current = projectsMap[activeProjectId];
    const snap = current?.snapshots?.find((s) => s.id === snapId);
    if (!snap) return;

    setDialog({
      type: "confirm",
      title: "스냅샷 복원",
      msg: `'${snap.name}' 스냅샷 버전으로 복원하시겠습니까? (현재 작업 내용이 덮어씌워집니다)`,
      onConfirm: () => {
        const restored = JSON.parse(JSON.stringify(snap.data));
        setAppData(restored);
        handleDataChange(() => restored);
        setIsVersionsModalOpen(false);
        showToast("선택한 스냅샷 버전으로 복원되었습니다.");
      },
    });
  };

  // Delete Snapshot
  const handleDeleteSnapshot = (snapId: string) => {
    setProjectsMap((prev) => {
      const proj = prev[activeProjectId];
      const snaps = (proj.snapshots || []).filter((s) => s.id !== snapId);
      const next = {
        ...prev,
        [activeProjectId]: { ...proj, snapshots: snaps },
      };
      localStorage.setItem("eval_projects_store", JSON.stringify(next));
      return next;
    });
    showToast("스냅샷이 삭제되었습니다.");
  };

  // Load sample chemistry data
  const handleLoadSampleChemistry = () => {
    setDialog({
      type: "confirm",
      title: "예시 데이터 불러오기",
      msg: "2026학년도 2학기 화학 표준 평가계획서 예시 데이터를 불러오시겠습니까?",
      onConfirm: () => {
        const sample = JSON.parse(JSON.stringify(DEFAULT_CHEM_DATA));
        setAppData(sample);
        handleDataChange(() => sample);
        showToast("2026 화학 예시 데이터가 로드되었습니다.");
      },
    });
  };

  // Real PDF Download with html2pdf.js
  const handleDownloadPdf = async () => {
    if (typeof window.html2pdf === "undefined") {
      setDialog({
        type: "alert",
        title: "PDF 모듈 로딩 중",
        msg: "PDF 생성 라이브러리가 로드되는 중입니다. 잠시 후 다시 시도해주세요.",
      });
      return;
    }

    setIsDownloadingPdf(true);
    const originalViewMode = viewMode;
    setViewMode("full");

    setTimeout(async () => {
      try {
        const element = document.getElementById("preview-page");
        if (!element) throw new Error("미리보기 요소를 찾을 수 없습니다.");

        const cleanSubject = (appData.subjectName || "교과").replace(/[\s/]/g, "_");
        const filename = `2026학년도_2학기_${cleanSubject}_교수학습및평가운영계획.pdf`;

        const opt = {
          margin: [10, 10, 10, 10],
          filename,
          image: { type: "jpeg", quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true, logging: false, letterRendering: true },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
          pagebreak: { mode: ["avoid-all", "css", "legacy"] },
        };

        await window.html2pdf().set(opt).from(element).save();
        showToast("PDF 다운로드가 완료되었습니다.");
      } catch (err: any) {
        console.error("PDF generation failed:", err);
        setDialog({
          type: "alert",
          title: "PDF 다운로드 실패",
          msg: `오류가 발생했습니다: ${err.message || err}`,
        });
      } finally {
        setViewMode(originalViewMode);
        setIsDownloadingPdf(false);
      }
    }, 400);
  };

  // Standards Selection Modal confirm handler
  const handleConfirmStdSelect = (joinedCodes: string) => {
    if (stdModalTarget === null) return;

    if (typeof stdModalTarget === "number") {
      // Week index target
      const weekIdx = stdModalTarget;
      const updated = [...appData.schedules];
      if (updated[weekIdx]) {
        updated[weekIdx] = { ...updated[weekIdx], std: joinedCodes };
        handleDataChange((prev) => ({ ...prev, schedules: updated }));
      }
    } else {
      const fieldKey = `${stdModalTarget}Std` as keyof PlanData;
      handleDataChange((prev) => ({ ...prev, [fieldKey]: joinedCodes }));
    }
    showToast("선택한 성취기준이 반영되었습니다.");
  };

  const currentProject = projectsMap[activeProjectId] || null;
  const currentProjectName = currentProject?.name || "평가계획서";

  // Get initial value for StdSelectModal
  let currentStdModalValue = "";
  if (stdModalTarget !== null) {
    if (typeof stdModalTarget === "number") {
      currentStdModalValue = appData.schedules[stdModalTarget]?.std || "";
    } else {
      const fieldKey = `${stdModalTarget}Std` as keyof PlanData;
      currentStdModalValue = String(appData[fieldKey] || "");
    }
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-slate-100 font-sans">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 bg-slate-900 text-white px-4 py-2.5 rounded-lg shadow-xl text-xs z-[120] flex items-center gap-2 border border-slate-700 animate-fade-in">
          <span className="text-emerald-400 text-sm">✅</span>
          <span className="font-medium">{toastMessage}</span>
        </div>
      )}

      {/* Custom Dialog */}
      <CustomDialog dialog={dialog} onClose={() => setDialog(null)} />

      {/* Projects Modal */}
      <ProjectsModal
        isOpen={isProjectsModalOpen}
        projects={projectsMap}
        activeProjectId={activeProjectId}
        onClose={() => setIsProjectsModalOpen(false)}
        onSelectProject={handleSelectProject}
        onCreateProject={handleCreateProject}
        onCloneProject={handleCloneProject}
        onRenameProject={handleRenameProject}
        onDeleteProject={handleDeleteProject}
      />

      {/* Versions Modal */}
      <VersionsModal
        isOpen={isVersionsModalOpen}
        project={currentProject}
        onClose={() => setIsVersionsModalOpen(false)}
        onCreateSnapshot={handleCreateSnapshot}
        onRestoreSnapshot={handleRestoreSnapshot}
        onDeleteSnapshot={handleDeleteSnapshot}
      />

      {/* Achievement Standards Multi-Select Modal */}
      <StdSelectModal
        isOpen={stdModalTarget !== null}
        target={stdModalTarget}
        curriculumFullText={appData.curriculumFullText}
        curriculumSubjects={appData.curriculumSubjects}
        curriculumSelectedOriginalIdx={appData.curriculumSelectedOriginalIdx}
        initialValue={currentStdModalValue}
        onClose={() => setStdModalTarget(null)}
        onConfirm={handleConfirmStdSelect}
      />

      {/* Structured HWP JSON Export Modal */}
      <JsonExportModal
        isOpen={isJsonModalOpen}
        onClose={() => setIsJsonModalOpen(false)}
        data={appData}
        showToast={showToast}
      />

      {/* Top Header */}
      <Header
        currentProjectName={currentProjectName}
        saveState={saveState}
        onOpenProjects={() => setIsProjectsModalOpen(true)}
        onOpenVersions={() => setIsVersionsModalOpen(true)}
        onManualSave={handleManualSave}
        onLoadSample={handleLoadSampleChemistry}
        onDownloadPdf={handleDownloadPdf}
        onOpenJsonExport={() => setIsJsonModalOpen(true)}
        onGoToHwpStep={() => setCurrentStep(5)}
        isDownloadingPdf={isDownloadingPdf}
      />

      {/* Main Split Container: Left 50% Wizard, Right 50% A4 Preview */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Side: Wizard Form Panel (50%) */}
        <div className="w-1/2 flex flex-col bg-white border-r border-slate-200 min-w-0">
          <StepTabs currentStep={currentStep} onStepChange={(s) => setCurrentStep(s)} />

          {/* Form Scroll Body */}
          <div className="flex-1 overflow-y-auto p-6">
            {currentStep === 1 && (
              <Step1BasicInfo data={appData} onChange={handleDataChange} showToast={showToast} />
            )}
            {currentStep === 2 && (
              <Step2AssessmentOverview
                data={appData}
                onChange={handleDataChange}
                onOpenStdModal={(target) => setStdModalTarget(target)}
              />
            )}
            {currentStep === 3 && (
              <Step3PerformanceDetail data={appData} onChange={handleDataChange} showToast={showToast} />
            )}
            {currentStep === 4 && (
              <Step4WeeklySchedule
                data={appData}
                onChange={handleDataChange}
                onOpenStdModal={(weekIdx) => setStdModalTarget(weekIdx)}
                showToast={showToast}
              />
            )}
            {currentStep === 5 && (
              <Step5AchievementLevels
                data={appData}
                onChange={handleDataChange}
                showToast={showToast}
                setDialog={setDialog}
              />
            )}
          </div>

          {/* Wizard Footer Navigation */}
          <div className="bg-slate-100 border-t border-slate-200 p-4 flex justify-between items-center shrink-0">
            <button
              onClick={() => setCurrentStep((prev) => Math.max(1, prev - 1))}
              style={{ visibility: currentStep === 1 ? "hidden" : "visible" }}
              className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 shadow-xs"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> 이전 단계
            </button>

            <span className="text-xs text-slate-500 font-medium hidden sm:block">
              오른쪽 미리보기에서 실시간 서식을 확인하세요
            </span>

            <button
              onClick={() => {
                if (currentStep < 5) {
                  setCurrentStep((prev) => prev + 1);
                } else {
                  showToast("작성이 완료되었습니다. 오른쪽 미리보기에서 전체 문서를 확인하고 PDF로 다운로드하세요.");
                  setViewMode("full");
                }
              }}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 shadow"
            >
              {currentStep === 5 ? (
                <>
                  작성 완료 및 확인 <Check className="w-3.5 h-3.5" />
                </>
              ) : (
                <>
                  다음 단계 <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </div>
        </div>

        {/* Right Side: Live A4 Document Preview Panel (50%) */}
        <div className="w-1/2 flex flex-col bg-slate-200 p-4 md:p-6 min-w-0">
          <DocumentPreview
            data={appData}
            currentStep={currentStep}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
          />
        </div>
      </div>
    </div>
  );
}
