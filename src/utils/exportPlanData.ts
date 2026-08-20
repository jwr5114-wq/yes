import { EvaluationPlanExportJson, PlanData } from "../types";
import { FIXED_YEAR_SEMESTER } from "../constants";
import { buildFinalPreviewData, FinalPreviewData } from "./finalPreviewData";

/**
 * Builds the canonical structured JSON representation of the Evaluation Plan.
 * Directly derives from buildFinalPreviewData to guarantee 100% data consistency
 * between Document Preview, HWPX Export, and JSON Export.
 */
export function buildEvaluationPlanExportJson(data: PlanData): EvaluationPlanExportJson {
  const preview: FinalPreviewData = buildFinalPreviewData(data);

  // 1. 기본정보 (Basic Information)
  const basicInfo = {
    academicYear: preview.basicInfo.academicYear,
    semester: preview.basicInfo.semester,
    yearSemester: preview.basicInfo.yearSemester,
    schoolName: preview.basicInfo.schoolName,
    subjectName: preview.basicInfo.subjectName,
    grade: preview.basicInfo.grade,
    credit: preview.basicInfo.credit,
    achievementScale: preview.basicInfo.gradeType,
    targetClassAndDays: preview.basicInfo.classDays,
    teacherName: preview.basicInfo.teacher,
    documentTitle: preview.basicInfo.documentTitle,
  };

  // 2. 평가 목적 및 방침 (Evaluation Purpose & Policies)
  const evaluationPurposesAndPolicies = {
    items: preview.evaluationPolicy.items.map((item) => ({
      index: item.prefix,
      content: item.text,
    })),
    fullText: preview.evaluationPolicy.fullText,
  };

  // 3. 평가 개요 (Evaluation Overview)
  const regularExams = preview.evaluationOverview.regularExams.map((exam) => ({
    id: exam.id,
    name: exam.name,
    totalRatio: exam.totalRatio,
    selective: exam.selective,
    shortAnswer: exam.shortAnswer,
    essay: exam.essay,
    achievementStandards: exam.achievementStandards,
    relatedUnits: exam.relatedUnits,
    period: exam.period,
    tiedRankPriority: exam.tiedRankPriority,
    cutScoreMethod: exam.cutScoreMethod,
  }));

  const performanceAssessments = preview.evaluationOverview.performanceAssessments.map((perf) => ({
    id: perf.id,
    indexKorean: perf.prefix,
    name: perf.name,
    method: perf.method,
    totalScore: perf.totalScore,
    ratio: perf.ratio,
    achievementStandards: perf.achievementStandards,
    period: perf.period,
    cutScoreMethod: perf.cutScoreMethod,
  }));

  const evaluationOverview = {
    regularExamRatio: preview.evaluationOverview.examRatio,
    performanceAssessmentRatio: preview.evaluationOverview.performanceRatio,
    regularExams,
    performanceAssessments,
    achievementScaleTable: preview.evaluationOverview.achievementScaleTable,
    minimumCompetencyPolicy: {
      baseRate: "40%",
      committeeReview: "세부 사항은 학업성적관리위원회의 심의를 거쳐 학교장이 최종 결정한다.",
      preventiveTuition: "최소 성취수준 미도달 예방 및 보충지도는 별도 계획에 의해 실시한다.",
    },
  };

  // 4. 수행평가 세부계획 & 루브릭
  const performanceDetailPlans = preview.performanceAssessments.map((perf) => ({
    indexKorean: perf.prefix,
    name: perf.name,
    period: perf.period,
    achievementStandards: perf.achievementStandards,
    taskFlow: perf.taskFlow,
    aiUsagePolicy: perf.aiUsagePolicy,
    rubrics: perf.rubrics.map((c) => ({
      criterionName: c.name,
      maxScore: c.maxScore,
      levels: c.levels.map((l) => ({
        score: l.score,
        description: l.desc,
      })),
    })),
    scoringNotes: perf.note,
  }));

  const rubrics = preview.performanceAssessments.map((perf) => ({
    taskIndex: perf.num,
    taskName: perf.name,
    criteria: perf.rubrics.map((c) => ({
      name: c.name,
      maxScore: c.maxScore,
      levels: c.levels.map((l) => ({
        score: l.score,
        desc: l.desc,
      })),
    })),
    note: perf.note,
  }));

  // 5. 주차별 계획 (1~20주)
  const weeklyTeachingPlans = preview.weeklyPlan.map((item) => {
    let topicWithoutKeyIdea = item.topic || "";
    let keyIdea = "";
    const keyIdeaMatch = item.topic?.match(/\[\s*핵심\s*아이디어\s*[:：]?\s*([^\]]+)\]/i);
    if (keyIdeaMatch) {
      keyIdea = keyIdeaMatch[1].trim();
      topicWithoutKeyIdea = item.topic.replace(/\[\s*핵심\s*아이디어\s*[:：]?\s*[^\]]+\]/gi, "").trim();
    }

    return {
      week: item.week,
      weekLabel: item.weekLabel,
      dates: item.weekDate,
      events: item.weekEvent,
      hours: item.hours,
      cumulativeHours: item.cumulative,
      unitTitleAndTopic: topicWithoutKeyIdea,
      keyIdea,
      achievementStandards: item.achievementStandards,
      evaluationType: item.evaluationType,
      teachingAndEvaluationDetails: item.teachingAndEvaluationDetails,
    };
  });

  // 6. 학기 단위 성취수준
  const semesterAchievementLevels = {
    scaleType: preview.semesterAchievementLevels.scaleType,
    guidanceNotes: preview.semesterAchievementLevels.guidanceNotes,
    levels: preview.semesterAchievementLevels.levels.map((lvl) => ({
      level: lvl.level,
      rate: lvl.rate,
      description: lvl.description,
    })),
    ...(preview.semesterAchievementLevels.minCompetency
      ? { minimumCompetencyCharacteristics: preview.semesterAchievementLevels.minCompetency }
      : {}),
  };

  return {
    metadata: {
      formatVersion: "2026.2.0",
      targetYearSemester: preview.basicInfo.yearSemester || FIXED_YEAR_SEMESTER,
      exportedAt: new Date().toISOString(),
      targetTemplate: "2026학년도 2학기 교수학습 및 평가 운영 계획 HWP",
    },
    basicInfo,
    evaluationPurposesAndPolicies,
    evaluationOverview,
    performanceDetailPlans,
    rubrics,
    weeklyTeachingPlans,
    semesterAchievementLevels,
  };
}

/**
 * Trigger browser download for the structured JSON export
 */
export function downloadEvaluationPlanJson(data: PlanData): void {
  const exportObject = buildEvaluationPlanExportJson(data);
  const jsonString = JSON.stringify(exportObject, null, 2);
  const cleanSubject = (data.subjectName || "교과").replace(/[\s/]/g, "_");
  const filename = `2026학년도_2학기_${cleanSubject}_교수학습및평가운영계획_HWP연동데이터.json`;

  const blob = new Blob([jsonString], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
