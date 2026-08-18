import { PlanData } from "../types";

/**
 * Calculates the Korean standard week of month string (e.g. "9월 3주")
 * for a given date formatted as "YYYY-MM-DD".
 */
export function getKoreanMonthWeekText(dateStr: string): string {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length < 3) return "";

  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);

  if (isNaN(year) || isNaN(month) || isNaN(day)) return "";

  // Find the day of week of the 1st of this month (0: Sunday, 1: Monday, ...)
  const firstDayOfMonth = new Date(year, month - 1, 1).getDay();
  // In Korean school calendars, weeks run Monday to Sunday (or Mon-Fri).
  // Calculate offset so Monday is the start of the week:
  const firstMondayOffset = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;
  const weekNum = Math.ceil((day + firstMondayOffset) / 7);

  return `${month}월 ${weekNum}주`;
}

/**
 * Calculates evaluation period description from start and end dates.
 * e.g. "2026-09-14" ~ "2026-09-18" -> "9월 3주"
 * e.g. "2026-09-14" ~ "2026-09-25" -> "9월 3주 ~ 9월 4주"
 * e.g. "2026-11-30" ~ "2026-12-04" -> "11월 5주 ~ 12월 1주"
 */
export function calcPeriodFromDates(startDateStr: string, endDateStr: string): string {
  if (!startDateStr && !endDateStr) return "";
  if (startDateStr && !endDateStr) return getKoreanMonthWeekText(startDateStr);
  if (!startDateStr && endDateStr) return getKoreanMonthWeekText(endDateStr);

  const startText = getKoreanMonthWeekText(startDateStr);
  const endText = getKoreanMonthWeekText(endDateStr);

  if (startText && endText) {
    if (startText === endText) {
      return startText;
    }
    return `${startText} ~ ${endText}`;
  }

  return startText || endText || "";
}

/**
 * Formats "YYYY-MM-DD" into "YYYY.MM.DD."
 */
export function formatDateDisplay(dateStr: string): string {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length === 3) {
    return `${parts[0]}.${parts[1]}.${parts[2]}.`;
  }
  return dateStr;
}

/**
 * Formats start and end dates into a readable range string.
 * e.g. "2026.09.14. ~ 2026.09.18." or single day "2026.09.17."
 */
export function formatDateRangeDisplay(startDateStr: string, endDateStr: string): string {
  if (!startDateStr && !endDateStr) return "";
  const startFmt = formatDateDisplay(startDateStr);
  const endFmt = formatDateDisplay(endDateStr);

  if (startFmt && endFmt) {
    if (startDateStr === endDateStr) {
      return `${startFmt} (1일간)`;
    }
    return `${startFmt} ~ ${endFmt}`;
  }
  return startFmt || endFmt || "";
}

/**
 * Parses academic calendar week date string (e.g. "9.14. ~ 9.18.", "11.30. ~ 12.4.", "7.20. ~ 7.24.")
 * into JavaScript Date boundaries for comparison.
 */
export function parseWeekDateRange(
  weekDateStr: string,
  baseYear = 2026
): { start: Date; end: Date } | null {
  if (!weekDateStr || !weekDateStr.trim()) return null;

  // 1. Full year format: YYYY.MM.DD ~ YYYY.MM.DD
  const fullYearMatch = weekDateStr.match(
    /(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})[.]?\s*~\s*(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})[.]?/
  );
  if (fullYearMatch) {
    const y1 = parseInt(fullYearMatch[1], 10);
    const m1 = parseInt(fullYearMatch[2], 10) - 1;
    const d1 = parseInt(fullYearMatch[3], 10);
    const y2 = parseInt(fullYearMatch[4], 10);
    const m2 = parseInt(fullYearMatch[5], 10) - 1;
    const d2 = parseInt(fullYearMatch[6], 10);
    return {
      start: new Date(y1, m1, d1, 0, 0, 0),
      end: new Date(y2, m2, d2, 23, 59, 59),
    };
  }

  // 2. Short month.day format: M.D. ~ M.D. (e.g. 9.14. ~ 9.18.)
  const shortMatch = weekDateStr.match(
    /(\d{1,2})\s*[.\-/]\s*(\d{1,2})\s*[.]?\s*~\s*(\d{1,2})\s*[.\-/]\s*(\d{1,2})\s*[.]?/
  );
  if (shortMatch) {
    const m1 = parseInt(shortMatch[1], 10);
    const d1 = parseInt(shortMatch[2], 10);
    const m2 = parseInt(shortMatch[3], 10);
    const d2 = parseInt(shortMatch[4], 10);

    // If month is Jan/Feb in a 2nd semester context, year is baseYear + 1
    const y1 = m1 <= 2 ? baseYear + 1 : baseYear;
    const y2 = m2 <= 2 ? baseYear + 1 : baseYear;

    return {
      start: new Date(y1, m1 - 1, d1, 0, 0, 0),
      end: new Date(y2, m2 - 1, d2, 23, 59, 59),
    };
  }

  return null;
}

/**
 * Checks if a performance assessment's date range overlaps with a week's date range.
 */
export function checkPerformanceWeekOverlap(
  weekDateStr: string,
  perfStartDateStr: string,
  perfEndDateStr: string,
  baseYear = 2026
): boolean {
  if (!weekDateStr || (!perfStartDateStr && !perfEndDateStr)) return false;

  const weekRange = parseWeekDateRange(weekDateStr, baseYear);
  if (!weekRange) return false;

  const pStartStr = perfStartDateStr || perfEndDateStr;
  const pEndStr = perfEndDateStr || perfStartDateStr;

  const pStartParts = pStartStr.split("-");
  const pEndParts = pEndStr.split("-");
  if (pStartParts.length < 3 || pEndParts.length < 3) return false;

  const pStartDate = new Date(
    parseInt(pStartParts[0], 10),
    parseInt(pStartParts[1], 10) - 1,
    parseInt(pStartParts[2], 10),
    0,
    0,
    0
  );
  const pEndDate = new Date(
    parseInt(pEndParts[0], 10),
    parseInt(pEndParts[1], 10) - 1,
    parseInt(pEndParts[2], 10),
    23,
    59,
    59
  );

  return pStartDate <= weekRange.end && pEndDate >= weekRange.start;
}

export interface MatchedPerfItem {
  perfIndex: number;
  name: string;
  startDate: string;
  endDate: string;
  period: string;
  std: string;
}

/**
 * Finds all performance assessments that overlap with a specific week's date.
 */
export function getOverlappingPerformancesForWeek(
  weekDateStr: string,
  data: PlanData
): MatchedPerfItem[] {
  if (!weekDateStr) return [];

  const matched: MatchedPerfItem[] = [];
  const maxPerf = data.perfCount || 0;

  for (let num = 1; num <= maxPerf; num++) {
    const startDate = String(data[`perf${num}StartDate` as keyof PlanData] || "");
    const endDate = String(data[`perf${num}EndDate` as keyof PlanData] || "");
    const name = String(data[`perf${num}Name` as keyof PlanData] || `수행평가 ${num}`);
    const period = String(data[`perf${num}Period` as keyof PlanData] || "");
    const std = String(data[`perf${num}Std` as keyof PlanData] || "");

    if (startDate || endDate) {
      const isOverlap = checkPerformanceWeekOverlap(weekDateStr, startDate, endDate);
      if (isOverlap) {
        matched.push({
          perfIndex: num,
          name,
          startDate,
          endDate,
          period,
          std,
        });
      }
    }
  }

  return matched;
}
