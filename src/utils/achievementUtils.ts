/**
 * Utility functions for determining Achievement Rates and Levels (성취율과 성취도)
 * based on target grade and achievement evaluation scale (5단계 / 3단계).
 */

export interface AchievementScaleItem {
  rate: string;
  level: string;
}

/**
 * Determines whether the grade input corresponds to 1st grade (고1 / 1학년).
 * Handles numbers, Korean texts, strings like "1", "1학년", "고1", "1학년 1학기", etc.
 */
export function isFirstGrade(gradeStr: string | undefined | null): boolean {
  if (!gradeStr) return false;
  const clean = gradeStr.trim();
  const match = clean.match(/\d+/);
  if (match) {
    return parseInt(match[0], 10) === 1;
  }
  if (clean.includes("1") || clean.includes("일학년") || clean.includes("첫")) {
    return true;
  }
  return false;
}

/**
 * Checks if the evaluation scale is 3-tier (3단계).
 */
export function isThreeTier(gradeTypeStr: string | undefined | null): boolean {
  if (!gradeTypeStr) return false;
  return gradeTypeStr.includes("3단계");
}

/**
 * Returns the exact achievement rate & level table items based on:
 * - Target grade (1학년 vs 2학년+)
 * - Evaluation scale (5단계 vs 3단계)
 *
 * Rules:
 * [1] 1학년 + 5단계:
 *     90% 이상 (A), 80% 이상 ~ 90% 미만 (B), 70% 이상 ~ 80% 미만 (C), 60% 이상 ~ 70% 미만 (D), 40% 이상 ~ 60% 미만 (E)
 * [2] 2학년 + 5단계:
 *     90% 이상 (A), 80% 이상 ~ 90% 미만 (B), 70% 이상 ~ 80% 미만 (C), 60% 이상 ~ 70% 미만 (D), 60% 미만 (E)
 * [3] 1학년 + 3단계:
 *     80% 이상 (A), 60% 이상 ~ 80% 미만 (B), 60% 미만 (C)
 * [4] 2학년 + 3단계:
 *     80% 이상 (A), 60% 이상 ~ 80% 미만 (B), 60% 미만 (C)
 */
export function getAchievementTable(
  gradeStr: string | undefined | null,
  gradeTypeStr: string | undefined | null
): AchievementScaleItem[] {
  const is1st = isFirstGrade(gradeStr);
  const is3Tier = isThreeTier(gradeTypeStr);

  // [3] & [4] 3단계 평가 (1학년, 2학년 공통)
  if (is3Tier) {
    return [
      { rate: "80% 이상", level: "A" },
      { rate: "60% 이상 ~ 80% 미만", level: "B" },
      { rate: "60% 미만", level: "C" },
    ];
  }

  // [1] 1학년 + 5단계 평가
  if (is1st) {
    return [
      { rate: "90% 이상", level: "A" },
      { rate: "80% 이상 ~ 90% 미만", level: "B" },
      { rate: "70% 이상 ~ 80% 미만", level: "C" },
      { rate: "60% 이상 ~ 70% 미만", level: "D" },
      { rate: "40% 이상 ~ 60% 미만", level: "E" },
    ];
  }

  // [2] 2학년 (및 기타 학년) + 5단계 평가
  return [
    { rate: "90% 이상", level: "A" },
    { rate: "80% 이상 ~ 90% 미만", level: "B" },
    { rate: "70% 이상 ~ 80% 미만", level: "C" },
    { rate: "60% 이상 ~ 70% 미만", level: "D" },
    { rate: "60% 미만", level: "E" },
  ];
}

/**
 * Returns a human-readable rule description summary.
 */
export function getAchievementRuleSummary(
  gradeStr: string | undefined | null,
  gradeTypeStr: string | undefined | null
): string {
  const is1st = isFirstGrade(gradeStr);
  const is3Tier = isThreeTier(gradeTypeStr);

  const gradeName = is1st ? "1학년" : `${gradeStr || "2"}학년`;
  const scaleName = is3Tier ? "3단계 평가(A/B/C)" : "5단계 평가(A/B/C/D/E)";

  if (is3Tier) {
    return `[${gradeName} · ${scaleName}] 성취도 3단계 (A: 80% 이상, B: 60%~80%, C: 60% 미만) 자동 적용`;
  }
  if (is1st) {
    return `[1학년 · 5단계 평가] 2022 개정 최소성취수준 보장 기준 적용 (E: 40% 이상 ~ 60% 미만)`;
  }
  return `[${gradeName} · 5단계 평가] 일반 기준 적용 (E: 60% 미만)`;
}
