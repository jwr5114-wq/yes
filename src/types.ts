export interface RubricLevel {
  score: number;
  desc: string;
}

export interface RubricCriterion {
  name: string;
  levels: RubricLevel[];
}

export interface ScheduleItem {
  weekLabel: string;
  weekDate: string;
  weekEvent: string;
  hours: string;
  cumulative?: number;
  topic: string;
  std: string;
  type: string;
  detail: string;
}

export interface PlanData {
  yearSemester: string;
  schoolName: string;
  subjectName: string;
  grade: string;
  credit: string;
  gradeType: string; // '5단계(5등급)' | '3단계' | 'P/F'
  classDays: string;
  teacher: string;
  policyItems: string[];

  // Assessment Counts & Ratios
  examCount: number;
  perfCount: number;
  examRatio: number;
  performanceRatio: number;

  // Regular Exam 1 (Midterm)
  examName1: string;
  midTotalRatio: number;
  midSelectScore: number;
  midSelectRatio: number;
  midShortScore: number;
  midShortRatio: number;
  midEssayScore: number;
  midEssayRatio: number;
  midStartDate?: string;
  midEndDate?: string;
  midPeriod?: string;
  midTime: string;
  midStd: string;

  // Regular Exam 2 (Final)
  examName2: string;
  finalTotalRatio: number;
  finalSelectScore: number;
  finalSelectRatio: number;
  finalShortScore: number;
  finalShortRatio: number;
  finalEssayScore: number;
  finalEssayRatio: number;
  finalStartDate?: string;
  finalEndDate?: string;
  finalPeriod?: string;
  finalTime: string;
  finalStd: string;

  // Performance Assessment 1
  perf1Name: string;
  perf1Ratio: number;
  perf1Score: number;
  perf1Method: string;
  perf1StartDate: string;
  perf1EndDate: string;
  perf1Period: string;
  perf1Std: string;
  perf1Flow: string;
  perf1Ai: string;
  perf1RubricCriteria: RubricCriterion[];
  perf1Note: string;

  // Performance Assessment 2
  perf2Name: string;
  perf2Ratio: number;
  perf2Score: number;
  perf2Method: string;
  perf2StartDate: string;
  perf2EndDate: string;
  perf2Period: string;
  perf2Std: string;
  perf2Flow: string;
  perf2Ai: string;
  perf2RubricCriteria: RubricCriterion[];
  perf2Note: string;

  // Performance Assessment 3
  perf3Name: string;
  perf3Ratio: number;
  perf3Score: number;
  perf3Method: string;
  perf3StartDate: string;
  perf3EndDate: string;
  perf3Period: string;
  perf3Std: string;
  perf3Flow: string;
  perf3Ai: string;
  perf3RubricCriteria: RubricCriterion[];
  perf3Note: string;

  // Performance Assessment 4
  perf4Name: string;
  perf4Ratio: number;
  perf4Score: number;
  perf4Method: string;
  perf4StartDate: string;
  perf4EndDate: string;
  perf4Period: string;
  perf4Std: string;
  perf4Flow: string;
  perf4Ai: string;
  perf4RubricCriteria: RubricCriterion[];
  perf4Note: string;

  splitTypeExam: string;
  splitTypePerf: string;

  // Step 4 Schedules
  schedules: ScheduleItem[];

  // Step 5 Semester Achievement Level
  achieveA: string;
  achieveB: string;
  achieveC: string;
  achieveD: string;
  achieveE: string;
  minCompetency?: string; // 최소능력수행특성 (1학년 5단계 공통과목)

  // HWP cache
  curriculumFullText?: string;
  curriculumSubjects?: Array<{ name: string; headingIndex: number }>;
  curriculumSelectedOriginalIdx?: number | null;
  achievementLevelsFullText?: string;
  achievementLevelsFileName?: string;
  achievementLevelsCache?: Record<
    string,
    {
      achieveA: string;
      achieveB: string;
      achieveC: string;
      achieveD: string;
      achieveE: string;
      totalStandards?: number;
      extractedStandards?: string[];
    }
  >;
}

export interface Snapshot {
  id: string;
  name: string;
  timestamp: string;
  data: PlanData;
}

export interface Project {
  id: string;
  name: string;
  updatedAt: string;
  data: PlanData;
  snapshots: Snapshot[];
}

export interface AchievementStandard {
  code: string;
  text: string;
}

export interface CurriculumSubjectOption {
  label: string;
  originalIdx: number;
}

/**
 * Structured Export Data Object for School HWP Template Auto-Insertion
 * Exactly conforms to the 7 sections of the official 2026 Curriculum Evaluation Plan HWP/PDF.
 */
export interface EvaluationPlanExportJson {
  metadata: {
    formatVersion: string;
    targetYearSemester: string;
    exportedAt: string;
    targetTemplate: "2026학년도 2학기 교수학습 및 평가 운영 계획 HWP";
  };

  // 1. 기본정보
  basicInfo: {
    academicYear: string;
    semester: string;
    yearSemester: string;
    schoolName: string;
    subjectName: string;
    grade: string;
    credit: string;
    achievementScale: string; // '5단계(5등급)' | '3단계' | 'P/F'
    targetClassAndDays: string; // 기준학급(수업 요일)
    teacherName: string; // 지도교사
    documentTitle: string; // "2026학년도 2학기 (과목명)과 교수학습 및 평가 운영 계획"
  };

  // 2. 평가 목적 및 방침
  evaluationPurposesAndPolicies: {
    items: Array<{
      index: string; // "가", "나", "다", "라", "마", "바" ...
      content: string;
    }>;
    fullText: string;
  };

  // 3. 평가 개요
  evaluationOverview: {
    regularExamRatio: number; // e.g. 60
    performanceAssessmentRatio: number; // e.g. 40
    regularExams: Array<{
      id: string;
      name: string; // "중간시험", "기말시험"
      totalRatio: number;
      selective: { score: number; ratio: number };
      shortAnswer: { score: number; ratio: number };
      essay: { score: number; ratio: number };
      achievementStandards: string;
      relatedUnits: string;
      period: string;
      tiedRankPriority: string;
      cutScoreMethod: string;
    }>;
    performanceAssessments: Array<{
      id: string;
      indexKorean: string; // "가", "나", "다"
      name: string; // "수행평가 1", "수행평가 2"
      method: string;
      totalScore: number;
      ratio: number;
      achievementStandards: string;
      period: string;
      cutScoreMethod: string;
    }>;
    achievementScaleTable: Array<{
      level: string; // "A", "B", "C", "D", "E"
      rate: string; // "90%이상", "80%이상 ~ 90%미만" ...
    }>;
    minimumCompetencyPolicy: {
      baseRate: string;
      committeeReview: string;
      preventiveTuition: string;
    };
  };

  // 4. 수행평가 세부계획
  performanceDetailPlans: Array<{
    indexKorean: string; // "가", "나", "다"
    name: string;
    period: string;
    achievementStandards: string;
    taskFlow: string; // 수행 과제 흐름(단계)
    aiUsagePolicy: string; // AI 활용 범위
    rubrics: Array<{
      criterionName: string;
      maxScore: number;
      levels: Array<{
        score: number;
        description: string;
      }>;
    }>;
    scoringNotes: string; // [유의 사항]
  }>;

  // 5. 루브릭 (수행평가별 채점 기준표 집계)
  rubrics: Array<{
    taskIndex: number;
    taskName: string;
    criteria: Array<{
      name: string;
      maxScore: number;
      levels: Array<{ score: number; desc: string }>;
    }>;
    note: string;
  }>;

  // 6. 교수학습-평가 방법 1~20주
  weeklyTeachingPlans: Array<{
    week: number;
    weekLabel: string; // "1주", "2주" ...
    dates: string; // "7.20. ~ 7.24."
    events: string; // 학사일정 (여름방학식, 학력평가, 수능 등)
    hours: string; // 시수 (e.g. "4")
    cumulativeHours?: number; // 누계 시수
    unitTitleAndTopic: string; // 단원명(주제)
    keyIdea: string; // [핵심 아이디어]
    achievementStandards: string; // 성취기준
    evaluationType: string; // 평가 유형 (진단평가, 형성평가, 수행평가, 정기시험 등)
    teachingAndEvaluationDetails: string; // 평가와 연계한 수업 세부 방법 ([핵심개념], [핵심질문], [개별화], [피드백], [수행지시어])
  }>;

  // 7. 학기 단위 성취수준
  semesterAchievementLevels: {
    scaleType: string; // "5단계 (1학년 공통과목 최소능력수행특성 포함)" | "5단계" | "3단계"
    guidanceNotes: string[];
    levels: Array<{
      level: string; // "A", "B", "C", "D", "E"
      rate: string; // "90%이상", "80%이상 ~ 90%미만" ...
      description: string; // 성취수준 기술 문장
    }>;
    minimumCompetencyCharacteristics?: string; // 최소능력수행특성 (1학년 5단계 공통과목)
  };
}
