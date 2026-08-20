import { EvaluationPlanExportJson, PlanData, RubricCriterion } from "../types";
import { FIXED_SCHOOL_NAME, FIXED_YEAR_SEMESTER, getKoreanPrefix } from "../constants";
import { formatStdCodesForDisplay, getExpandedStdText } from "./hwpParser";
import { getAchievementTable, isFirstGrade, isThreeTier } from "./achievementUtils";

/**
 * Builds the canonical structured JSON representation of the Evaluation Plan.
 * This JSON is designed specifically to be ingested by the school's official HWP auto-insertion module.
 */
export function buildEvaluationPlanExportJson(data: PlanData): EvaluationPlanExportJson {
  const is1st = isFirstGrade(data.grade);
  const is3Tier = isThreeTier(data.gradeType);
  const achievementItems = getAchievementTable(data.grade, data.gradeType);

  // 1. 기본정보 (Basic Information)
  const basicInfo = {
    academicYear: "2026학년도",
    semester: "2학기",
    yearSemester: data.yearSemester || FIXED_YEAR_SEMESTER,
    schoolName: data.schoolName || FIXED_SCHOOL_NAME,
    subjectName: data.subjectName || "",
    grade: data.grade || "",
    credit: data.credit || "",
    achievementScale: data.gradeType || "5단계(5등급)",
    targetClassAndDays: data.classDays || "",
    teacherName: data.teacher || "",
    documentTitle: `${data.yearSemester || FIXED_YEAR_SEMESTER} (${data.subjectName || "과목명"})과 교수학습 및 평가 운영 계획`,
  };

  // 2. 평가 목적 및 방침 (Evaluation Purpose & Policies)
  const policyList = data.policyItems && data.policyItems.length > 0 ? data.policyItems : [];
  const evaluationPurposesAndPolicies = {
    items: policyList.map((content, idx) => ({
      index: getKoreanPrefix(idx),
      content,
    })),
    fullText: policyList
      .map((content, idx) => `${getKoreanPrefix(idx)}. ${content}`)
      .join("\n\n"),
  };

  // 3. 평가 개요 (Evaluation Overview)
  const regularExams = [];
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
      achievementStandards: getExpandedStdText(
        data.midStd,
        data.curriculumFullText,
        data.curriculumSubjects,
        data.curriculumSelectedOriginalIdx
      ) || formatStdCodesForDisplay(data.midStd),
      relatedUnits: "1~2단원",
      period: data.midTime || "10월 3째 주",
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
      achievementStandards: getExpandedStdText(
        data.finalStd,
        data.curriculumFullText,
        data.curriculumSubjects,
        data.curriculumSelectedOriginalIdx
      ) || formatStdCodesForDisplay(data.finalStd),
      relatedUnits: "3~4단원",
      period: data.finalTime || "12월 4째 주",
      tiedRankPriority: "서답형 > 배점 높은 문항 순",
      cutScoreMethod: data.splitTypeExam || "고정/추정",
    });
  }

  const performanceAssessments = [];
  for (let i = 0; i < (data.perfCount || 0); i++) {
    const num = i + 1;
    const name = String(data[`perf${num}Name` as keyof PlanData] || `수행평가 ${num}`);
    const method = String(data[`perf${num}Method` as keyof PlanData] || "탐구형");
    const totalScore = Number(data[`perf${num}Score` as keyof PlanData] ?? 100);
    const ratio = Number(data[`perf${num}Ratio` as keyof PlanData] || 0);
    const stdCodes = String(data[`perf${num}Std` as keyof PlanData] || "");
    const period = String(data[`perf${num}Period` as keyof PlanData] || (i === 0 ? "10월 3째 주" : "12월 2째 주"));

    performanceAssessments.push({
      id: `perf${num}`,
      indexKorean: getKoreanPrefix(i),
      name,
      method,
      totalScore,
      ratio,
      achievementStandards: getExpandedStdText(
        stdCodes,
        data.curriculumFullText,
        data.curriculumSubjects,
        data.curriculumSelectedOriginalIdx
      ) || formatStdCodesForDisplay(stdCodes),
      period,
      cutScoreMethod: data.splitTypePerf || "고정/추정",
    });
  }

  const evaluationOverview = {
    regularExamRatio: data.examRatio || 0,
    performanceAssessmentRatio: data.performanceRatio || 0,
    regularExams,
    performanceAssessments,
    achievementScaleTable: achievementItems.map((item) => ({
      level: item.level,
      rate: item.rate,
    })),
    minimumCompetencyPolicy: {
      baseRate: "40%",
      committeeReview: "세부 사항은 학업성적관리위원회의 심의를 거쳐 학교장이 최종 결정한다.",
      preventiveTuition: "최소 성취수준 미도달 예방 및 보충지도는 별도 계획에 의해 실시한다.",
    },
  };

  // 4. 수행평가 세부계획 (Performance Detail Plans)
  const performanceDetailPlans = [];
  const rubrics = [];

  for (let i = 0; i < (data.perfCount || 0); i++) {
    const num = i + 1;
    const prefix = getKoreanPrefix(i);
    const name = String(data[`perf${num}Name` as keyof PlanData] || `수행평가 ${num}`);
    const stdCodes = String(data[`perf${num}Std` as keyof PlanData] || "");
    const stdFull = getExpandedStdText(
      stdCodes,
      data.curriculumFullText,
      data.curriculumSubjects,
      data.curriculumSelectedOriginalIdx
    ) || formatStdCodesForDisplay(stdCodes);
    const flow = String(data[`perf${num}Flow` as keyof PlanData] || "");
    const ai = String(data[`perf${num}Ai` as keyof PlanData] || "");
    const criteria = (data[`perf${num}RubricCriteria` as keyof PlanData] as RubricCriterion[]) || [];
    const note = String(data[`perf${num}Note` as keyof PlanData] || "");
    const period = String(data[`perf${num}Period` as keyof PlanData] || (i === 0 ? "10월 3째 주" : "12월 2째 주"));

    const formattedRubrics = criteria.map((c) => {
      const sorted = [...c.levels].sort((a, b) => b.score - a.score);
      const maxScore = sorted.length > 0 ? sorted[0].score : 0;
      return {
        criterionName: c.name,
        maxScore,
        levels: sorted.map((lv) => ({
          score: lv.score,
          description: lv.desc,
        })),
      };
    });

    performanceDetailPlans.push({
      indexKorean: prefix,
      name,
      period,
      achievementStandards: stdFull,
      taskFlow: flow,
      aiUsagePolicy: ai,
      rubrics: formattedRubrics,
      scoringNotes: note,
    });

    rubrics.push({
      taskIndex: num,
      taskName: name,
      criteria: criteria.map((c) => ({
        name: c.name,
        maxScore: c.levels.length > 0 ? Math.max(...c.levels.map((l) => l.score)) : 0,
        levels: c.levels,
      })),
      note,
    });
  }

  // 6. 교수학습-평가 방법 1~20주 (Weekly Teaching & Evaluation Plans)
  const weeklyTeachingPlans = (data.schedules || []).map((item, idx) => {
    // Extract key idea if present inside brackets [ ]
    let topicWithoutKeyIdea = item.topic || "";
    let keyIdea = "";
    const keyIdeaMatch = item.topic?.match(/\[\s*핵심\s*아이디어\s*[:：]?\s*([^\]]+)\]/i);
    if (keyIdeaMatch) {
      keyIdea = keyIdeaMatch[1].trim();
      topicWithoutKeyIdea = item.topic.replace(/\[\s*핵심\s*아이디어\s*[:：]?\s*[^\]]+\]/gi, "").trim();
    }

    const stdExpanded = getExpandedStdText(
      item.std,
      data.curriculumFullText,
      data.curriculumSubjects,
      data.curriculumSelectedOriginalIdx
    ) || item.std || "";

    return {
      week: idx + 1,
      weekLabel: item.weekLabel || `${idx + 1}주`,
      dates: item.weekDate || "",
      events: item.weekEvent || "",
      hours: item.hours || "4",
      cumulativeHours: item.cumulative,
      unitTitleAndTopic: topicWithoutKeyIdea,
      keyIdea,
      achievementStandards: stdExpanded,
      evaluationType: item.type || "형성평가",
      teachingAndEvaluationDetails: item.detail || "",
    };
  });

  // 7. 학기 단위 성취수준 (Semester Achievement Levels)
  const guidanceNotes: string[] = [];
  if (is1st && !is3Tier) {
    guidanceNotes.push("※ 학기 단위의 성취수준은 한 학기 전체 성취기준을 포괄하는 수준에서 전반적인 이해와 수행 특성을 진술함.");
    guidanceNotes.push("※ 1학년 공통과목은 최소능력수행특성을 포함하여 진술");
  } else if (!is1st && !is3Tier) {
    guidanceNotes.push("※ 1학년 공통과목 외 과목은 학기단위 성취수준 진술(5단계)");
  } else if (is3Tier) {
    guidanceNotes.push("※ 1학년 공통과목 외 과목은 학기단위 성취수준 진술(3단계)");
  }

  const semesterLevels = [
    {
      level: "A",
      rate: is3Tier ? "80%이상" : "90%이상",
      description: data.achieveA || "",
    },
    {
      level: "B",
      rate: is3Tier ? "60%이상 ~ 80%미만" : "80%이상 ~ 90%미만",
      description: data.achieveB || "",
    },
    {
      level: "C",
      rate: is3Tier ? "60%미만" : "70%이상 ~ 80%미만",
      description: data.achieveC || "",
    },
  ];

  if (!is3Tier) {
    semesterLevels.push({
      level: "D",
      rate: "60%이상 ~ 70%미만",
      description: data.achieveD || "",
    });
    semesterLevels.push({
      level: "E",
      rate: is1st ? "40%이상 ~ 60%미만" : "60%미만",
      description: data.achieveE || "",
    });
  }

  const semesterAchievementLevels = {
    scaleType: is1st && !is3Tier
      ? "5단계 (1학년 공통과목 최소능력수행특성 포함)"
      : is3Tier
      ? "3단계"
      : "5단계",
    guidanceNotes,
    levels: semesterLevels,
    ...(is1st && !is3Tier && data.minCompetency
      ? { minimumCompetencyCharacteristics: data.minCompetency }
      : {}),
  };

  return {
    metadata: {
      formatVersion: "2026.2.0",
      targetYearSemester: data.yearSemester || FIXED_YEAR_SEMESTER,
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
