import { PlanData, RubricCriterion } from "../types";
import { FIXED_SCHOOL_NAME, FIXED_YEAR_SEMESTER, getKoreanPrefix } from "../constants";
import { formatStdCodesForDisplay, getExpandedStdText } from "./hwpParser";
import { getOverlappingRegularExamForWeek } from "./dateUtils";
import { getAchievementTable, isFirstGrade, isThreeTier } from "./achievementUtils";

export interface FinalPreviewBasicInfo {
  academicYear: string;
  semester: string;
  yearSemester: string;
  schoolName: string;
  subjectName: string;
  grade: string;
  credit: string;
  gradeType: string;
  classDays: string;
  teacher: string;
  documentTitle: string;
  section1Title: string;
}

export interface FinalPreviewPolicyItem {
  prefix: string;
  text: string;
}

export interface FinalPreviewPolicy {
  items: FinalPreviewPolicyItem[];
  fullText: string;
}

export interface FinalPreviewExamOverview {
  id: "midterm" | "final";
  name: string;
  totalRatio: number;
  selective: { score: number; ratio: number };
  shortAnswer: { score: number; ratio: number };
  essay: { score: number; ratio: number };
  achievementStandards: string; // Must be formatStdCodesForDisplay (code-only)
  relatedUnits: string;
  period: string;
  tiedRankPriority: string;
  cutScoreMethod: string;
}

export interface FinalPreviewPerfOverview {
  id: string;
  num: number;
  prefix: string;
  name: string;
  method: string;
  totalScore: number;
  ratio: number;
  achievementStandards: string; // Must be formatStdCodesForDisplay (code-only)
  period: string;
  cutScoreMethod: string;
}

export interface FinalPreviewEvaluationOverview {
  examCount: number;
  perfCount: number;
  examRatio: number;
  performanceRatio: number;
  regularExams: FinalPreviewExamOverview[];
  performanceAssessments: FinalPreviewPerfOverview[];
  splitTypeExam: string;
  splitTypePerf: string;
  achievementScaleTable: Array<{ level: string; rate: string }>;
}

export interface FinalPreviewRubricLevel {
  score: number;
  desc: string;
}

export interface FinalPreviewRubricCriterion {
  name: string;
  maxScore: number;
  levels: FinalPreviewRubricLevel[];
}

export interface FinalPreviewPerformanceDetail {
  num: number;
  prefix: string;
  name: string;
  period: string;
  achievementStandards: string; // Full expanded standard text
  taskFlow: string;
  aiUsagePolicy: string;
  rubrics: FinalPreviewRubricCriterion[];
  rubric: FinalPreviewRubricCriterion[];
  note: string;
}

export interface FinalPreviewWeeklyItem {
  week: number;
  weekLabel: string;
  weekDate: string;
  weekEvent: string;
  hours: string;
  cumulative?: number;
  topic: string;
  achievementStandards: string; // Exam week = code-only; Normal week = expanded text
  evaluationType: string;
  teachingAndEvaluationDetails: string;
}

export interface FinalPreviewSemesterLevel {
  level: string;
  rate: string;
  description: string;
}

export interface FinalPreviewSemesterLevels {
  scaleType: string;
  isFirstGrade: boolean;
  isThreeTier: boolean;
  guidanceNotes: string[];
  levels: FinalPreviewSemesterLevel[];
  minCompetency?: string;
}

export interface FinalPreviewData {
  basicInfo: FinalPreviewBasicInfo;
  evaluationPolicy: FinalPreviewPolicy;
  evaluationOverview: FinalPreviewEvaluationOverview;
  performanceAssessments: FinalPreviewPerformanceDetail[];
  weeklyPlan: FinalPreviewWeeklyItem[];
  semesterAchievementLevels: FinalPreviewSemesterLevels;
}

/**
 * Single source of truth generator:
 * Turns raw PlanData into the EXACT strings and structures rendered on the DocumentPreview screen.
 * This exact object is then fed to HwpxWriter without ANY re-computation or re-generation.
 */
export function buildFinalPreviewData(data: PlanData): FinalPreviewData {
  const is1st = isFirstGrade(data.grade);
  const is3Tier = isThreeTier(data.gradeType);
  const yearSemester = data.yearSemester || FIXED_YEAR_SEMESTER;
  const schoolName = data.schoolName || FIXED_SCHOOL_NAME;
  const subjectName = data.subjectName || "";

  // 1. Basic Info
  const basicInfo: FinalPreviewBasicInfo = {
    academicYear: "2026학년도",
    semester: "2학기",
    yearSemester,
    schoolName,
    subjectName,
    grade: data.grade || "-",
    credit: data.credit || "-",
    gradeType: data.gradeType || "-",
    classDays: data.classDays || "-",
    teacher: data.teacher || "-",
    documentTitle: `${yearSemester} [${subjectName || "과목명"}]과 교수학습 및 평가 운영 계획`,
    section1Title: `1 [${subjectName || "교과"}]과 평가 계획`,
  };

  // 2. Evaluation Purposes & Policies
  const rawPolicies = data.policyItems && data.policyItems.length > 0 ? data.policyItems : [];
  const policyItems: FinalPreviewPolicyItem[] = rawPolicies.map((text, idx) => ({
    prefix: getKoreanPrefix(idx),
    text,
  }));
  const evaluationPolicy: FinalPreviewPolicy = {
    items: policyItems,
    fullText: policyItems.map((p) => `${p.prefix}. ${p.text}`).join("\n\n"),
  };

  // 3. Evaluation Overview
  const regularExams: FinalPreviewExamOverview[] = [];
  if (data.examCount >= 1) {
    regularExams.push({
      id: "midterm",
      name: data.examName1 || "중간시험",
      totalRatio: data.midTotalRatio || 0,
      selective: {
        score: data.midSelectScore || 0,
        ratio: data.midSelectRatio || 0,
      },
      shortAnswer: {
        score: data.midShortScore || 0,
        ratio: data.midShortRatio || 0,
      },
      essay: {
        score: data.midEssayScore || 0,
        ratio: data.midEssayRatio || 0,
      },
      achievementStandards: formatStdCodesForDisplay(data.midStd),
      relatedUnits: "1~2단원",
      period: data.midTime || "-",
      tiedRankPriority: "서답형 > 배점 높은 문항 순",
      cutScoreMethod: data.splitTypeExam || "고정/추정",
    });
  }

  if (data.examCount >= 2) {
    regularExams.push({
      id: "final",
      name: data.examName2 || "기말시험",
      totalRatio: data.finalTotalRatio || 0,
      selective: {
        score: data.finalSelectScore || 0,
        ratio: data.finalSelectRatio || 0,
      },
      shortAnswer: {
        score: data.finalShortScore || 0,
        ratio: data.finalShortRatio || 0,
      },
      essay: {
        score: data.finalEssayScore || 0,
        ratio: data.finalEssayRatio || 0,
      },
      achievementStandards: formatStdCodesForDisplay(data.finalStd),
      relatedUnits: "3~4단원",
      period: data.finalTime || "-",
      tiedRankPriority: "서답형 > 배점 높은 문항 순",
      cutScoreMethod: data.splitTypeExam || "고정/추정",
    });
  }

  const performanceAssessmentsOverview: FinalPreviewPerfOverview[] = [];
  for (let i = 0; i < (data.perfCount || 0); i++) {
    const num = i + 1;
    const name = String(data[`perf${num}Name` as keyof PlanData] || `수행평가 ${num}`);
    const method = String(data[`perf${num}Method` as keyof PlanData] || "탐구형");
    const totalScore = Number(data[`perf${num}Score` as keyof PlanData] ?? 100);
    const ratio = Number(data[`perf${num}Ratio` as keyof PlanData] || 0);
    const stdCodes = String(data[`perf${num}Std` as keyof PlanData] || "");
    const rawPeriod = String(data[`perf${num}Period` as keyof PlanData] || "");
    const period = rawPeriod || (i === 0 ? "10월 3째 주" : i === 1 ? "12월 2째 주" : "학기 중");

    performanceAssessmentsOverview.push({
      id: `perf${num}`,
      num,
      prefix: getKoreanPrefix(i),
      name,
      method,
      totalScore,
      ratio,
      achievementStandards: formatStdCodesForDisplay(stdCodes),
      period,
      cutScoreMethod: data.splitTypePerf || "고정/추정",
    });
  }

  const achievementScaleTable = getAchievementTable(data.grade, data.gradeType).map((item) => ({
    level: item.level,
    rate: item.rate,
  }));

  const evaluationOverview: FinalPreviewEvaluationOverview = {
    examCount: data.examCount || 0,
    perfCount: data.perfCount || 0,
    examRatio: data.examRatio || 0,
    performanceRatio: data.performanceRatio || 0,
    regularExams,
    performanceAssessments: performanceAssessmentsOverview,
    splitTypeExam: data.splitTypeExam || "고정/추정",
    splitTypePerf: data.splitTypePerf || "고정/추정",
    achievementScaleTable,
  };

  // 4. Performance Assessment Detail Plans
  const performanceAssessments: FinalPreviewPerformanceDetail[] = [];
  for (let i = 0; i < (data.perfCount || 0); i++) {
    const num = i + 1;
    const prefix = getKoreanPrefix(i);
    const name = String(data[`perf${num}Name` as keyof PlanData] || `수행평가 ${num}`);
    const stdCodes = String(data[`perf${num}Std` as keyof PlanData] || "");
    const stdFull =
      getExpandedStdText(
        stdCodes,
        data.curriculumFullText,
        data.curriculumSubjects,
        data.curriculumSelectedOriginalIdx
      ) || formatStdCodesForDisplay(stdCodes);
    const flow = String(data[`perf${num}Flow` as keyof PlanData] || "-");
    const ai = String(data[`perf${num}Ai` as keyof PlanData] || "-");
    const criteria = (data[`perf${num}RubricCriteria` as keyof PlanData] as RubricCriterion[]) || [];
    const note = String(data[`perf${num}Note` as keyof PlanData] ?? "");
    const rawPeriod = String(data[`perf${num}Period` as keyof PlanData] || "");
    const period = rawPeriod || "학기 중";

    const formattedRubrics: FinalPreviewRubricCriterion[] = criteria.map((c) => {
      const sorted = [...c.levels].sort((a, b) => b.score - a.score);
      const maxScore = sorted.length > 0 ? sorted[0].score : 0;
      return {
        name: c.name,
        maxScore,
        levels: sorted.map((lv) => ({
          score: lv.score,
          desc: lv.desc,
        })),
      };
    });

    performanceAssessments.push({
      num,
      prefix,
      name,
      period,
      achievementStandards: stdFull,
      taskFlow: flow,
      aiUsagePolicy: ai,
      rubrics: formattedRubrics,
      rubric: formattedRubrics,
      note,
    });
  }

  // 5. Weekly Teaching & Evaluation Plan (1~20주)
  const weeklyPlan: FinalPreviewWeeklyItem[] = (data.schedules || []).map((item, idx) => {
    // Determine achievement standard text matching DocumentPreview logic
    let stdText = "";
    const examInfo = item.weekDate ? getOverlappingRegularExamForWeek(item.weekDate, data) : null;
    if (examInfo) {
      const examStd = examInfo.type === "mid" ? data.midStd : data.finalStd;
      stdText = formatStdCodesForDisplay(item.std || examStd || examInfo.std || "");
    } else {
      stdText =
        getExpandedStdText(
          item.std,
          data.curriculumFullText,
          data.curriculumSubjects,
          data.curriculumSelectedOriginalIdx
        ) || item.std || "";
    }

    return {
      week: idx + 1,
      weekLabel: item.weekLabel || `${idx + 1}주`,
      weekDate: item.weekDate || "",
      weekEvent: item.weekEvent || "",
      hours: item.hours || "4",
      cumulative: item.cumulative,
      topic: item.topic || "",
      achievementStandards: stdText,
      evaluationType: item.type || "형성평가",
      teachingAndEvaluationDetails: item.detail || "",
    };
  });

  // 6. Semester Achievement Levels
  const guidanceNotes: string[] = [];
  if (is1st && !is3Tier) {
    guidanceNotes.push("※ 학기 단위의 성취수준은 한 학기 전체 성취기준을 포괄하는 수준에서 전반적인 이해와 수행 특성을 진술함.");
    guidanceNotes.push("※ 1학년 공통과목은 최소능력수행특성을 포함하여 진술");
  } else if (!is1st && !is3Tier) {
    guidanceNotes.push("※ 1학년 공통과목 외 과목은 학기단위 성취수준 진술(5단계)");
  } else if (is3Tier) {
    guidanceNotes.push("※ 1학년 공통과목 외 과목은 학기단위 성취수준 진술(3단계)");
  }

  const semesterLevels: FinalPreviewSemesterLevel[] = [
    {
      level: "A",
      rate: is3Tier ? "80%이상" : "90%이상",
      description: data.achieveA || "-",
    },
    {
      level: "B",
      rate: is3Tier ? "60%이상 ~ 80%미만" : "80%이상 ~ 90%미만",
      description: data.achieveB || "-",
    },
    {
      level: "C",
      rate: is3Tier ? "60%미만" : "70%이상 ~ 80%미만",
      description: data.achieveC || "-",
    },
  ];

  if (!is3Tier) {
    semesterLevels.push({
      level: "D",
      rate: "60%이상 ~ 70%미만",
      description: data.achieveD || "-",
    });
    semesterLevels.push({
      level: "E",
      rate: is1st ? "40%이상 ~ 60%미만" : "60%미만",
      description: data.achieveE || "-",
    });
  }

  const semesterAchievementLevels: FinalPreviewSemesterLevels = {
    scaleType: is1st && !is3Tier
      ? "5단계 (1학년 공통과목 최소능력수행특성 포함)"
      : is3Tier
      ? "3단계"
      : "5단계",
    isFirstGrade: is1st,
    isThreeTier: is3Tier,
    guidanceNotes,
    levels: semesterLevels,
    ...(is1st && !is3Tier ? { minCompetency: data.minCompetency || "-" } : {}),
  };

  return {
    basicInfo,
    evaluationPolicy,
    evaluationOverview,
    performanceAssessments,
    weeklyPlan,
    semesterAchievementLevels,
  };
}

/**
 * Validation function to verify consistency between final preview data and export targets.
 */
export function validateFinalPreviewData(previewData: FinalPreviewData): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!previewData.basicInfo.subjectName) {
    errors.push("기본정보: 과목명이 비어 있습니다.");
  }

  if (previewData.weeklyPlan.length !== 20) {
    console.warn(`[검증] 주차별 계획이 20주가 아닌 ${previewData.weeklyPlan.length}주입니다.`);
  }

  if (previewData.evaluationOverview.examRatio + previewData.evaluationOverview.performanceRatio !== 100) {
    console.warn(
      `[검증] 평가 반영 비율 합계가 100%가 아닙니다 (정기시험 ${previewData.evaluationOverview.examRatio}% + 수행평가 ${previewData.evaluationOverview.performanceRatio}%)`
    );
  }

  // Check code consistency in evaluation overview
  previewData.evaluationOverview.regularExams.forEach((exam) => {
    if (exam.achievementStandards && exam.achievementStandards.length > 50 && exam.achievementStandards.includes("다양한")) {
      errors.push(`평가개요 ${exam.name}: 성취기준이 코드 압축형이 아닌 긴 문장입니다.`);
    }
  });

  previewData.evaluationOverview.performanceAssessments.forEach((perf) => {
    if (perf.achievementStandards && perf.achievementStandards.length > 50 && perf.achievementStandards.includes("다양한")) {
      errors.push(`평가개요 ${perf.name}: 성취기준이 코드 압축형이 아닌 긴 문장입니다.`);
    }
  });

  return {
    valid: errors.length === 0,
    errors,
  };
}
