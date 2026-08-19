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
  flow: string;
  ai: string;
  method: string;
  rubricCriteria: any[];
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
    const flow = String(data[`perf${num}Flow` as keyof PlanData] || "");
    const ai = String(data[`perf${num}Ai` as keyof PlanData] || "");
    const method = String(data[`perf${num}Method` as keyof PlanData] || "");
    const rubricCriteria = (data[`perf${num}RubricCriteria` as keyof PlanData] as any[]) || [];

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
          flow,
          ai,
          method,
          rubricCriteria,
        });
      }
    }
  }

  return matched;
}

/**
 * Extracts a date range { start: "YYYY-MM-DD", end: "YYYY-MM-DD" } from Korean text
 * like "10월 14일~10월 19일", "10.14. ~ 10.19.", "12.17.~12.22."
 */
export function parseDateRangeFromText(text: string, baseYear = 2026): { start: string; end: string } | null {
  if (!text || !text.trim()) return null;
  const t = text.trim();

  // Pattern 1: "10월 14일 ~ 10월 19일"
  const m1 = t.match(/(\d{1,2})월\s*(\d{1,2})일?\s*~\s*(\d{1,2})월\s*(\d{1,2})일?/);
  if (m1) {
    const month1 = String(parseInt(m1[1], 10)).padStart(2, "0");
    const day1 = String(parseInt(m1[2], 10)).padStart(2, "0");
    const month2 = String(parseInt(m1[3], 10)).padStart(2, "0");
    const day2 = String(parseInt(m1[4], 10)).padStart(2, "0");
    return {
      start: `${baseYear}-${month1}-${day1}`,
      end: `${baseYear}-${month2}-${day2}`,
    };
  }

  // Pattern 2: "10월 14일 ~ 19일"
  const m2 = t.match(/(\d{1,2})월\s*(\d{1,2})일?\s*~\s*(\d{1,2})일?/);
  if (m2) {
    const month = String(parseInt(m2[1], 10)).padStart(2, "0");
    const day1 = String(parseInt(m2[2], 10)).padStart(2, "0");
    const day2 = String(parseInt(m2[3], 10)).padStart(2, "0");
    return {
      start: `${baseYear}-${month}-${day1}`,
      end: `${baseYear}-${month}-${day2}`,
    };
  }

  // Pattern 3: "10.14. ~ 10.19." or "10/14 ~ 10/19"
  const m3 = t.match(/(\d{1,2})[.\-/](\d{1,2})[.]?\s*~\s*(\d{1,2})[.\-/](\d{1,2})[.]?/);
  if (m3) {
    const month1 = String(parseInt(m3[1], 10)).padStart(2, "0");
    const day1 = String(parseInt(m3[2], 10)).padStart(2, "0");
    const month2 = String(parseInt(m3[3], 10)).padStart(2, "0");
    const day2 = String(parseInt(m3[4], 10)).padStart(2, "0");
    return {
      start: `${baseYear}-${month1}-${day1}`,
      end: `${baseYear}-${month2}-${day2}`,
    };
  }

  return null;
}

export interface MatchedRegularExamItem {
  type: "mid" | "final";
  label: "정기시험(중간)" | "정기시험(기말)";
  name: string;
  std: string;
  startDate: string;
  endDate: string;
  period: string;
}

/**
 * Checks if a specific week is the ACTUAL midterm or final exam execution week.
 * Matches based on midStartDate/midEndDate, finalStartDate/finalEndDate, or parsed midTime/finalTime.
 */
export function getOverlappingRegularExamForWeek(
  weekDateStr: string,
  data: PlanData
): MatchedRegularExamItem | null {
  if (!weekDateStr) return null;

  // 1. Check Midterm Exam
  if (data.examCount >= 1) {
    let mStart = data.midStartDate || "";
    let mEnd = data.midEndDate || mStart;
    if (!mStart && data.midTime) {
      const parsed = parseDateRangeFromText(data.midTime);
      if (parsed) {
        mStart = parsed.start;
        mEnd = parsed.end;
      }
    }

    if (mStart || mEnd) {
      if (checkPerformanceWeekOverlap(weekDateStr, mStart, mEnd)) {
        return {
          type: "mid",
          label: "정기시험(중간)",
          name: data.examName1 || "중간시험",
          std: data.midStd || "",
          startDate: mStart,
          endDate: mEnd,
          period: data.midPeriod || data.midTime || "",
        };
      }
    }
  }

  // 2. Check Final Exam
  if (data.examCount >= 2) {
    let fStart = data.finalStartDate || "";
    let fEnd = data.finalEndDate || fStart;
    if (!fStart && data.finalTime) {
      const parsed = parseDateRangeFromText(data.finalTime);
      if (parsed) {
        fStart = parsed.start;
        fEnd = parsed.end;
      }
    }

    if (fStart || fEnd) {
      if (checkPerformanceWeekOverlap(weekDateStr, fStart, fEnd)) {
        return {
          type: "final",
          label: "정기시험(기말)",
          name: data.examName2 || "기말시험",
          std: data.finalStd || "",
          startDate: fStart,
          endDate: fEnd,
          period: data.finalPeriod || data.finalTime || "",
        };
      }
    }
  }

  return null;
}

