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

  // HWP cache
  curriculumFullText?: string;
  curriculumSubjects?: Array<{ name: string; headingIndex: number }>;
  curriculumSelectedOriginalIdx?: number | null;
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
