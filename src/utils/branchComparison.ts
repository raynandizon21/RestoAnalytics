import type { ComparisonWindowCell, MainExpenseCategoryData } from '../types';

export const SAME_PERIOD_LOOKBACK_DAYS = 3;

export const COMPARE_METRIC_LABELS = {
  totalSales: '매출액',
  totalExpenses: '비용',
  totalProfit: '순이익',
  vsSamePeriod: '전월 동기 대비(3일전 기준)',
  vsLastMonth: '전월 대비',
  foodSupplies: '식자재 및 주류',
  rent: '임대료',
  salary: '급여',
  others: '그밖에',
  sections: {
    sales: '매출',
    expenses: '지출',
    profit: '순익',
    mainExpenses: '지출상세',
  },
} as const;

export type YmdRange = { start: string; end: string };

const pad2 = (n: number) => String(n).padStart(2, '0');

export function toYYYYMMDD(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function parseLocalYmd(s: string): Date | null {
  const match = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function addDaysLocal(d: Date, days: number): Date {
  const next = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  next.setDate(next.getDate() + days);
  return next;
}

function shiftMonthClamped(d: Date, deltaMonths: number): Date {
  const day = d.getDate();
  const target = new Date(d.getFullYear(), d.getMonth() + deltaMonths, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day, lastDay));
  return target;
}

/** Current vs last month same period, ending `lookbackDays` before selected end. */
export function getSamePeriodWindows(
  start: string,
  end: string,
  lookbackDays = SAME_PERIOD_LOOKBACK_DAYS,
): { current: YmdRange; previous: YmdRange } | null {
  const s = parseLocalYmd(start);
  const e = parseLocalYmd(end);
  if (!s || !e || s > e) return null;

  let currentEnd = addDaysLocal(e, -lookbackDays);
  if (currentEnd < s) currentEnd = new Date(s.getFullYear(), s.getMonth(), s.getDate());

  const previousStart = shiftMonthClamped(s, -1);
  const previousEnd = shiftMonthClamped(currentEnd, -1);

  return {
    current: { start: toYYYYMMDD(s), end: toYYYYMMDD(currentEnd) },
    previous: { start: toYYYYMMDD(previousStart), end: toYYYYMMDD(previousEnd) },
  };
}

/** 전월 대비: MTD (1st → end) vs full prior calendar month. */
export function getMtdVsFullPreviousMonth(end: string): { current: YmdRange; previous: YmdRange } | null {
  const e = parseLocalYmd(end);
  if (!e) return null;
  const currentStart = new Date(e.getFullYear(), e.getMonth(), 1);
  const previousStart = new Date(e.getFullYear(), e.getMonth() - 1, 1);
  const previousEnd = new Date(e.getFullYear(), e.getMonth(), 0);
  return {
    current: { start: toYYYYMMDD(currentStart), end: toYYYYMMDD(e) },
    previous: { start: toYYYYMMDD(previousStart), end: toYYYYMMDD(previousEnd) },
  };
}

export function formatYmdRangeLabel(range: YmdRange): string {
  const s = parseLocalYmd(range.start);
  const e = parseLocalYmd(range.end);
  if (!s || !e) return `${range.start} – ${range.end}`;
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return `${fmt(s)} – ${fmt(e)}`;
}

export function formatMonthChooserLabel(start: string, end: string): string {
  const s = parseLocalYmd(start);
  const e = parseLocalYmd(end);
  if (!s || !e) return start;
  const sameMonth = s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth();
  if (!sameMonth) return formatYmdRangeLabel({ start, end });
  const month = s.toLocaleString('en-US', { month: 'short', year: 'numeric' });
  const today = new Date();
  const isMtd =
    s.getFullYear() === today.getFullYear() &&
    s.getMonth() === today.getMonth() &&
    e.getDate() < new Date(e.getFullYear(), e.getMonth() + 1, 0).getDate();
  if (isMtd) return `${month} (MTD)`;
  return month;
}

function pctChange(current: number, previous: number): number {
  const cur = Number(current) || 0;
  const prev = Number(previous) || 0;
  const diff = cur - prev;
  if (prev === 0) {
    if (cur === 0) return 0;
    return diff > 0 ? 100 : -100;
  }
  return (diff / Math.abs(prev)) * 100;
}

function isUnreliableBase(previous: number): boolean {
  return Math.abs(Number(previous) || 0) < 1;
}

/** Build comparison cell: shows baseline amount + Korean index %. */
export function buildWindowCell(
  current: number,
  previous: number,
  dateRangeCurrent: string,
  dateRangeBaseline: string,
  opts?: { hasArrow?: boolean; invertSentiment?: boolean },
): ComparisonWindowCell {
  const cur = Number(current) || 0;
  const prev = Number(previous) || 0;
  const unreliable = isUnreliableBase(prev);
  const index = unreliable ? 100 : 100 + pctChange(cur, prev);
  const up = index >= 100;
  const invert = Boolean(opts?.invertSentiment);
  const sentiment: ComparisonWindowCell['sentiment'] = unreliable
    ? 'neutral'
    : invert
      ? up
        ? 'negative'
        : 'positive'
      : up
        ? 'positive'
        : 'negative';

  return {
    currentAmount: cur,
    baselineAmount: prev,
    indexPercent: +index.toFixed(1),
    hasArrow: Boolean(opts?.hasArrow) && !unreliable,
    arrowDirection: up ? 'up' : 'down',
    sentiment,
    dateRangeCurrent,
    dateRangeBaseline,
  };
}

export function emptyWindowCell(): ComparisonWindowCell {
  return {
    currentAmount: 0,
    baselineAmount: 0,
    indexPercent: 100,
    hasArrow: false,
    sentiment: 'neutral',
    dateRangeCurrent: '',
    dateRangeBaseline: '',
  };
}

// ─── Main expense classification (aligned with restoAdmin) ───

const RENT_NAME_HINTS = ['rent', 'rental', 'lease', '월세', '임대'];
const LABOR_BENEFITS_NAME_HINTS = ['labor', 'benefits', '복지'];
const SALARY_NAME_HINTS = [
  'salary', 'salaries', 'payroll', 'wage', 'wages', '급여', '인건',
  '가불', 'c.a', 'cash advance', 'cashadvance', 'dj', 'promoter',
];

type MainExpenseBucket = 'food' | 'rent' | 'salary' | 'other';

function matchesExpenseNameHints(namePart: string, hints: string[]): boolean {
  const name = String(namePart || '').trim().toLowerCase();
  if (!name) return false;
  return hints.some((h) => name === h || name.includes(h));
}

function splitExpenseMapKey(key: string): { mainPart: string; namePart: string; full: string } {
  const full = String(key || '').trim().toLowerCase();
  const pipe = full.indexOf('|');
  return {
    full,
    mainPart: (pipe >= 0 ? full.slice(0, pipe) : full).trim(),
    namePart: (pipe >= 0 ? full.slice(pipe + 1) : full).trim(),
  };
}

function isLaborBenefitsSub(namePart: string): boolean {
  const name = String(namePart || '').trim().toLowerCase();
  if (!name) return false;
  if (matchesExpenseNameHints(name, LABOR_BENEFITS_NAME_HINTS)) return true;
  return name.includes('급여') && name.includes('복지');
}

function isPureSalaryMain(mainPart: string): boolean {
  const main = String(mainPart || '').trim().toLowerCase();
  if (!main) return false;
  if (
    main.includes(',') ||
    main.includes('세금') ||
    main.includes('tax') ||
    main.includes('기타') ||
    main.includes('others') ||
    /\bother\b/.test(main)
  ) {
    return false;
  }
  return matchesExpenseNameHints(main, SALARY_NAME_HINTS);
}

function classifyMainExpenseKey(key: string): MainExpenseBucket {
  const { mainPart, namePart, full } = splitExpenseMapKey(key);

  if (isLaborBenefitsSub(namePart)) return 'salary';
  if (matchesExpenseNameHints(namePart, RENT_NAME_HINTS)) return 'rent';
  if (matchesExpenseNameHints(namePart, SALARY_NAME_HINTS)) return 'salary';
  if (isPureSalaryMain(mainPart)) return 'salary';

  const isFoodMain =
    mainPart.includes('식자재') ||
    mainPart.includes('food') ||
    mainPart.includes('inventory') ||
    mainPart.includes('마트') ||
    /\bmart\b/.test(mainPart);
  if (full.startsWith('inventory|') || isFoodMain) return 'food';

  return 'other';
}

export function sumMainExpenseBuckets(
  branchMap?: Record<string, number>,
): Record<MainExpenseBucket, number> {
  const out: Record<MainExpenseBucket, number> = { food: 0, rent: 0, salary: 0, other: 0 };
  if (!branchMap) return out;
  for (const [key, amount] of Object.entries(branchMap)) {
    out[classifyMainExpenseKey(key)] += Number(amount) || 0;
  }
  return out;
}

export function buildMainExpenseCategory(
  id: string,
  labelKorean: string,
  amount: number,
  sales: number,
): MainExpenseCategoryData {
  const amt = Math.trunc(Number(amount) || 0);
  const salesN = Number(sales) || 0;
  return {
    id,
    labelKorean,
    labelEnglish: labelKorean,
    amount: amt,
    ratioOfSales: salesN > 0 ? +((amt / salesN) * 100).toFixed(1) : 0,
  };
}

export type MetricMaps = {
  sales: Record<string, number>;
  expenses: Record<string, number>;
  profit: Record<string, number>;
};

export function branchCardsToMetricMaps(
  cards: Array<{ id: number | string; totalSales: number; totalExpenses?: number }>,
  expenseCategoryByBranch?: Record<string, Record<string, number>>,
): MetricMaps {
  const sales: Record<string, number> = {};
  const expenses: Record<string, number> = {};
  const profit: Record<string, number> = {};
  for (const card of cards) {
    const id = String(card.id);
    const s = Number(card.totalSales) || 0;
    const branchMap = expenseCategoryByBranch?.[id];
    const fromBreakdown = branchMap
      ? Object.values(branchMap).reduce((sum, v) => sum + (Number(v) || 0), 0)
      : 0;
    const fromCard = Number(card.totalExpenses) || 0;
    const e = Math.max(fromBreakdown, fromCard);
    sales[id] = s;
    expenses[id] = e;
    profit[id] = s - e;
  }
  return { sales, expenses, profit };
}
