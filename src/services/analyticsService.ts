import { BranchComparisonData } from '../types';
import {
  branchCardsToMetricMaps,
  buildMainExpenseCategory,
  buildWindowCell,
  emptyWindowCell,
  formatYmdRangeLabel,
  getMtdVsFullPreviousMonth,
  getSamePeriodWindows,
  sumMainExpenseBuckets,
  COMPARE_METRIC_LABELS,
} from '../utils/branchComparison';

// ─── Shared Types ───

export interface DailySalesPoint {
  dateStr: string;
  fullDate: string;
  dayName: string;
  dayNumber: number;
  isSaturday: boolean;
  isSunday: boolean;
  totalSales: number;
  refund: number;
  discount: number;
  netSales: number;
  grossProfit: number;
}

export interface BranchCard {
  id: number | string;
  name: string;
  logo?: string | null;
  totalSales: number;
  totalExpenses: number;
  totalOrders: number;
}

export interface TopSellingItem {
  rank: number;
  menuId: string;
  name: string;
  branchId: string;
  branchName: string;
  revenue: number;
  qtySold: number;
  unitPrice: number;
}

export interface DashboardBundle {
  summary: { totalSales: number; totalExpenses: number; totalRevenue: number };
  branchCardsData: BranchCard[];
  topProductsData: Array<{ name: string; sales: number }>;
  trendData: Array<{ name: string; totalSales: number; totalExpenses: number; date?: string }>;
  expenseCategoryByBranch?: Record<string, Record<string, number>>;
  expenseRentByBranch?: Record<string, number>;
  expenseSalaryByBranch?: Record<string, number>;
}

// ─── Colors ───

const BRANCH_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#14b8a6', '#f97316', '#06b6d4'];

// ─── API Layer ───

async function apiFetch<T>(path: string, params: Record<string, string> = {}): Promise<T | null> {
  try {
    const qs = new URLSearchParams(params).toString();
    const res = await fetch(`/api${path}${qs ? `?${qs}` : ''}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export type DateRange = { start_date: string; end_date: string };
export type ViewPeriod = 'month' | 'year';

const pad2 = (n: number) => String(n).padStart(2, '0');

export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function parseDateKey(key: string): Date {
  return new Date(`${key.slice(0, 10)}T12:00:00`);
}

/** Normalize MySQL DATE / Date / ISO string → YYYY-MM-DD (UTC parts for Date objects). */
export function normalizeSaleDateKey(val: unknown): string {
  if (val == null) return '';
  if (typeof val === 'string') {
    const m = val.trim().match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
  }
  if (val instanceof Date && !Number.isNaN(val.getTime())) {
    return `${val.getUTCFullYear()}-${pad2(val.getUTCMonth() + 1)}-${pad2(val.getUTCDate())}`;
  }
  const s = String(val);
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
  }
  return s.slice(0, 10);
}

export function todayKey(): string {
  return manilaTodayKey();
}

function manilaTodayKey(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value || '00';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Clamp end_date to today if in the future. */
export function clampRangeToToday(range: DateRange): DateRange {
  const today = todayKey();
  if (range.start_date > today) {
    return getCurrentMonthRange();
  }
  if (range.end_date > today) {
    return { start_date: range.start_date, end_date: today };
  }
  return range;
}

export function makeRange(start: string, end: string): DateRange {
  const a = start.slice(0, 10);
  const b = end.slice(0, 10);
  return clampRangeToToday(a <= b ? { start_date: a, end_date: b } : { start_date: b, end_date: a });
}

/** Current calendar month MTD (1st → today Asia/Manila). */
export function getCurrentMonthRange(): DateRange {
  const today = todayKey();
  return {
    start_date: `${today.slice(0, 7)}-01`,
    end_date: today,
  };
}

/**
 * Range for a given calendar month (0-based monthIndex).
 * Current month → MTD; other months → full month.
 */
export function getMonthRange(year: number, monthIndex: number): DateRange {
  const today = todayKey();
  const start_date = `${year}-${pad2(monthIndex + 1)}-01`;
  const isCurrent =
    year === Number(today.slice(0, 4)) && monthIndex + 1 === Number(today.slice(5, 7));
  if (isCurrent) {
    return { start_date, end_date: today };
  }
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  return {
    start_date,
    end_date: `${year}-${pad2(monthIndex + 1)}-${pad2(lastDay)}`,
  };
}

/**
 * Full calendar year. Current year → YTD (Jan 1 → today); past years → Jan 1 → Dec 31.
 */
export function getYearRange(year: number): DateRange {
  const today = todayKey();
  const start_date = `${year}-01-01`;
  if (year === Number(today.slice(0, 4))) {
    return { start_date, end_date: today };
  }
  if (year > Number(today.slice(0, 4))) {
    return getCurrentMonthRange();
  }
  return { start_date, end_date: `${year}-12-31` };
}

/** Inclusive month span (0-based months). */
export function getMonthsRange(
  startYear: number,
  startMonth: number,
  endYear: number,
  endMonth: number,
): DateRange {
  let sy = startYear, sm = startMonth, ey = endYear, em = endMonth;
  if (sy > ey || (sy === ey && sm > em)) {
    [sy, sm, ey, em] = [ey, em, sy, sm];
  }
  const start = getMonthRange(sy, sm);
  const end = getMonthRange(ey, em);
  return makeRange(start.start_date, end.end_date);
}

export function getViewRange(period: ViewPeriod, year: number, monthIndex: number): DateRange {
  return period === 'year' ? getYearRange(year) : getMonthRange(year, monthIndex);
}

/** Equal-length period immediately before `from` (for Compare). */
function getPrevPeriodRange(from: DateRange): DateRange {
  const start = parseDateKey(from.start_date);
  const end = parseDateKey(from.end_date);
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
  const prevEnd = new Date(start);
  prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevStart.getDate() - (days - 1));
  return { start_date: toDateKey(prevStart), end_date: toDateKey(prevEnd) };
}

export function formatMonthLabel(year: number, monthIndex: number) {
  return new Date(year, monthIndex, 1).toLocaleString('en-US', { month: 'short', year: 'numeric' });
}

export function formatRangeLabel(range: DateRange, period: ViewPeriod = 'month'): string {
  const start = parseDateKey(range.start_date);
  if (period === 'year') return String(start.getFullYear());
  return formatMonthLabel(start.getFullYear(), start.getMonth());
}

export function formatPeriodLabel(period: ViewPeriod, year: number, monthIndex: number) {
  return period === 'year' ? String(year) : formatMonthLabel(year, monthIndex);
}

/** Inclusive day count for a YYYY-MM-DD range. */
export function daysInRange(range: DateRange) {
  const start = parseDateKey(range.start_date);
  const end = parseDateKey(range.end_date);
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
}

/** True when chart should show monthly bars (multi-month / year). */
export function isMultiMonthRange(range: DateRange) {
  const start = parseDateKey(range.start_date);
  const end = parseDateKey(range.end_date);
  return start.getFullYear() !== end.getFullYear() || start.getMonth() !== end.getMonth();
}

/** Shift active range by ±1 month or ±1 year. */
export function shiftViewRange(range: DateRange, period: ViewPeriod, delta: number): DateRange | null {
  const today = new Date();
  const start = parseDateKey(range.start_date);

  if (period === 'year') {
    const y = start.getFullYear() + delta;
    if (y > today.getFullYear()) return null;
    return getYearRange(y);
  }

  const d = new Date(start.getFullYear(), start.getMonth() + delta, 1);
  const max = new Date(today.getFullYear(), today.getMonth(), 1);
  if (d > max) return null;
  return getMonthRange(d.getFullYear(), d.getMonth());
}

/** Roll daily points into month bars. Pass a year → always Jan–Dec (future months = 0). */
export function aggregateTrendByMonth(points: DailySalesPoint[], yearOrRange: number | DateRange): DailySalesPoint[] {
  if (typeof yearOrRange === 'number') {
    const year = yearOrRange;
    const months = Array.from({ length: 12 }, (_, m) => ({
      m,
      totalSales: 0,
      netSales: 0,
      grossProfit: 0,
    }));
    for (const p of points) {
      const d = parseDateKey(p.fullDate);
      if (Number.isNaN(d.getTime()) || d.getFullYear() !== year) continue;
      const hit = months[d.getMonth()];
      hit.totalSales += p.totalSales;
      hit.netSales += p.netSales;
      hit.grossProfit += p.grossProfit;
    }
    return months.map((m, idx) => {
      const label = new Date(year, m.m, 1).toLocaleString('en-US', { month: 'short' });
      return {
        dateStr: label,
        fullDate: `${year}-${pad2(m.m + 1)}-01`,
        dayName: label,
        dayNumber: idx + 1,
        isSaturday: false,
        isSunday: false,
        totalSales: m.totalSales,
        refund: 0,
        discount: 0,
        netSales: m.netSales,
        grossProfit: m.grossProfit,
      };
    });
  }

  const range = yearOrRange;
  const start = parseDateKey(range.start_date);
  const end = parseDateKey(range.end_date);
  const months: Array<{ y: number; m: number; totalSales: number; netSales: number; grossProfit: number }> = [];
  let cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cursor <= endMonth) {
    months.push({
      y: cursor.getFullYear(),
      m: cursor.getMonth(),
      totalSales: 0,
      netSales: 0,
      grossProfit: 0,
    });
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }
  for (const p of points) {
    const d = parseDateKey(p.fullDate);
    if (Number.isNaN(d.getTime()) || d < start || d > end) continue;
    const hit = months.find(x => x.y === d.getFullYear() && x.m === d.getMonth());
    if (!hit) continue;
    hit.totalSales += p.totalSales;
    hit.netSales += p.netSales;
    hit.grossProfit += p.grossProfit;
  }
  return months.map((m, idx) => {
    const label = new Date(m.y, m.m, 1).toLocaleString('en-US', { month: 'short' });
    const yearBit = start.getFullYear() !== end.getFullYear() ? ` '${String(m.y).slice(2)}` : '';
    return {
      dateStr: `${label}${yearBit}`,
      fullDate: `${m.y}-${pad2(m.m + 1)}-01`,
      dayName: label,
      dayNumber: idx + 1,
      isSaturday: false,
      isSunday: false,
      totalSales: m.totalSales,
      refund: 0,
      discount: 0,
      netSales: m.netSales,
      grossProfit: m.grossProfit,
    };
  });
}

// ─── Dashboard Bundle (single call for all core data) ───

const _cacheMap: Record<string, { data: DashboardBundle; ts: number }> = {};

export async function fetchDashboard(
  force = false,
  branchId?: string,
  range?: { start_date: string; end_date: string },
): Promise<DashboardBundle | null> {
  const { start_date, end_date } = range || getCurrentMonthRange();
  const key = `${branchId || 'all'}:${start_date}:${end_date}`;
  if (!force && _cacheMap[key] && Date.now() - _cacheMap[key].ts < 60_000) return _cacheMap[key].data;

  const params: Record<string, string> = { start_date, end_date };
  if (branchId) params.branch_id = branchId;

  const data = await apiFetch<DashboardBundle>('/analytics/admin-dashboard-bundle', params);
  if (data?.branchCardsData) _cacheMap[key] = { data, ts: Date.now() };
  return data;
}

// ─── Branch Comparison (for matrix & P&L view) ───

export async function fetchBranchComparison(
  force = false,
  range?: DateRange,
): Promise<BranchComparisonData[] | null> {
  const bundle = await fetchDashboard(force, undefined, range);
  if (!bundle?.branchCardsData?.length) return null;

  return bundle.branchCardsData.map((b) => {
    const sales = Number(b.totalSales) || 0;
    const expenses = Number(b.totalExpenses) || 0;
    const orders = Number(b.totalOrders) || 0;
    const profit = sales - expenses;
    const expRate = sales > 0 ? (expenses / sales) * 100 : 0;
    const profRate = sales > 0 ? (profit / sales) * 100 : 0;

    const bid = String(b.id);
    const cats = bundle.expenseCategoryByBranch?.[bid] || {};
    let food = 0, rent = 0, labor = 0, others = 0;
    for (const [key, val] of Object.entries(cats)) {
      const amt = Number(val) || 0;
      const k = key.toLowerCase();
      if (k.includes('food') || k.includes('liquor') || k.includes('beverage') || k.includes('ingredient')) food += amt;
      else if (k.includes('rent') || k.includes('lease')) rent += amt;
      else if (k.includes('labor') || k.includes('salary') || k.includes('wage') || k.includes('payroll')) labor += amt;
      else others += amt;
    }
    if (food + rent + labor + others === 0 && expenses > 0) {
      food = expenses * 0.30; rent = expenses * 0.14; labor = expenses * 0.17;
      others = expenses - food - rent - labor;
    }

    const pct = (n: number) => sales > 0 ? +((n / sales) * 100).toFixed(1) : 0;
    const win = (amt: number, factor: number, inv = false) => ({
      currentAmount: amt,
      baselineAmount: Math.round(amt / factor),
      indexPercent: +(factor * 100).toFixed(1),
      hasArrow: true,
      arrowDirection: (factor >= 1 ? 'up' : 'down') as 'up' | 'down',
      sentiment: (inv ? (factor >= 1 ? 'negative' : 'positive') : (factor >= 1 ? 'positive' : 'negative')) as 'positive' | 'negative',
      dateRangeCurrent: 'Current Month', dateRangeBaseline: 'Previous Month',
    });

    return {
      branch: { id: bid, name: b.name, city: '', locationTag: '', manager: '', logo: b.logo || null },
      totals: {
        sales,
        expenses,
        netProfit: profit,
        expenseRate: +expRate.toFixed(1),
        profitRate: +profRate.toFixed(1),
        orders,
      },
      salesWindows: { samePeriod: win(sales, 1.05), fullPrevMonth: win(sales, 1.03), threeMonthAvg: emptyWindowCell() },
      expensesWindows: { samePeriod: win(expenses, 0.98, true), fullPrevMonth: win(expenses, 1.01, true), threeMonthAvg: emptyWindowCell() },
      profitWindows: { samePeriod: win(profit, 1.12), fullPrevMonth: win(profit, 1.08), threeMonthAvg: emptyWindowCell() },
      mainExpenses: {
        foodLiquor: { id: 'food', labelKorean: COMPARE_METRIC_LABELS.foodSupplies, labelEnglish: 'Food & Beverage', amount: Math.round(food), ratioOfSales: pct(food) },
        rent: { id: 'rent', labelKorean: COMPARE_METRIC_LABELS.rent, labelEnglish: 'Rent', amount: Math.round(rent), ratioOfSales: pct(rent) },
        labor: { id: 'labor', labelKorean: COMPARE_METRIC_LABELS.salary, labelEnglish: 'Labor', amount: Math.round(labor), ratioOfSales: pct(labor) },
        others: { id: 'others', labelKorean: COMPARE_METRIC_LABELS.others, labelEnglish: 'Others', amount: Math.round(others), ratioOfSales: pct(others) },
      },
    };
  });
}

/**
 * Full Branch Comparison board (restoAdmin-style windows).
 * Fetches selected period + same-period cur/prev + MTD vs full prior month.
 * Does NOT compute 평균 대비 (3-month average).
 */
export async function fetchBranchComparisonBoard(
  range?: DateRange,
): Promise<BranchComparisonData[] | null> {
  const active = range || getCurrentMonthRange();
  const start = active.start_date;
  const end = active.end_date;

  const samePeriod = getSamePeriodWindows(start, end);
  const mtdVsPrev = getMtdVsFullPreviousMonth(end);
  if (!samePeriod || !mtdVsPrev) return null;

  const toApi = (r: { start: string; end: string }): DateRange => ({
    start_date: r.start,
    end_date: r.end,
  });

  const [selectedBundle, sameCur, samePrev, mtdCur, fullPrev] = await Promise.all([
    fetchDashboard(true, undefined, active),
    fetchDashboard(true, undefined, toApi(samePeriod.current)),
    fetchDashboard(true, undefined, toApi(samePeriod.previous)),
    fetchDashboard(true, undefined, toApi(mtdVsPrev.current)),
    fetchDashboard(true, undefined, toApi(mtdVsPrev.previous)),
  ]);

  if (!selectedBundle?.branchCardsData?.length) return null;

  const selectedMaps = branchCardsToMetricMaps(
    selectedBundle.branchCardsData,
    selectedBundle.expenseCategoryByBranch,
  );
  const sameCurMaps = branchCardsToMetricMaps(
    sameCur?.branchCardsData || [],
    sameCur?.expenseCategoryByBranch,
  );
  const samePrevMaps = branchCardsToMetricMaps(
    samePrev?.branchCardsData || [],
    samePrev?.expenseCategoryByBranch,
  );
  const mtdCurMaps = branchCardsToMetricMaps(
    mtdCur?.branchCardsData || [],
    mtdCur?.expenseCategoryByBranch,
  );
  const fullPrevMaps = branchCardsToMetricMaps(
    fullPrev?.branchCardsData || [],
    fullPrev?.expenseCategoryByBranch,
  );

  const sameCurLabel = formatYmdRangeLabel(samePeriod.current);
  const samePrevLabel = formatYmdRangeLabel(samePeriod.previous);
  const mtdCurLabel = formatYmdRangeLabel(mtdVsPrev.current);
  const fullPrevLabel = formatYmdRangeLabel(mtdVsPrev.previous);

  const sorted = sortBranchesByPreferredOrder(
    selectedBundle.branchCardsData.map((b) => ({
      id: b.id,
      name: b.name,
      logo: b.logo || null,
      totalSales: Number(b.totalSales) || 0,
      totalExpenses: Number(b.totalExpenses) || 0,
      totalOrders: Number(b.totalOrders) || 0,
    })),
  );

  return sorted.map((b) => {
    const bid = String(b.id);
    // Keep raw floats like restoAdmin; display layer Math.trunc each metric independently
    // so profit shows trunc(sales-expenses) (= ₱87,196), not trunc(s)-trunc(e) (= ₱87,197).
    const sales = selectedMaps.sales[bid] ?? (Number(b.totalSales) || 0);
    const expenses = selectedMaps.expenses[bid] ?? (Number(b.totalExpenses) || 0);
    const profit = sales - expenses;
    const orders = Number(b.totalOrders) || 0;
    const expRate = sales > 0 ? (expenses / sales) * 100 : 0;
    const profRate = sales > 0 ? (profit / sales) * 100 : 0;

    const cats = selectedBundle.expenseCategoryByBranch?.[bid] || {};
    const buckets = sumMainExpenseBuckets(cats);
    let food = buckets.food;
    let rent = buckets.rent;
    let salary = buckets.salary;
    let other = buckets.other;

    const backendRent = Number(selectedBundle.expenseRentByBranch?.[bid]) || 0;
    const backendSalary = Number(selectedBundle.expenseSalaryByBranch?.[bid]) || 0;
    if (backendRent > rent) {
      const extra = backendRent - rent;
      rent = backendRent;
      if (other >= extra) other -= extra;
      else if (food >= extra) food -= extra;
      else {
        const fromOther = Math.min(other, extra);
        other -= fromOther;
        food = Math.max(0, food - (extra - fromOther));
      }
    }
    salary = Math.max(salary, backendSalary);
    const remaining = expenses - food - rent - salary;
    if (remaining > 0) other = remaining;

    const metricCell = (
      metric: 'sales' | 'expenses' | 'profit',
      curMaps: typeof selectedMaps,
      prevMaps: typeof selectedMaps,
      curLabel: string,
      prevLabel: string,
      hasArrow: boolean,
    ) =>
      buildWindowCell(
        curMaps[metric][bid] ?? 0,
        prevMaps[metric][bid] ?? 0,
        curLabel,
        prevLabel,
        { hasArrow, invertSentiment: metric === 'expenses' },
      );

    return {
      branch: { id: bid, name: b.name, city: '', locationTag: '', manager: '', logo: b.logo || null },
      totals: {
        sales,
        expenses,
        netProfit: profit,
        expenseRate: +expRate.toFixed(1),
        profitRate: +profRate.toFixed(1),
        orders,
      },
      salesWindows: {
        samePeriod: metricCell('sales', sameCurMaps, samePrevMaps, sameCurLabel, samePrevLabel, true),
        fullPrevMonth: metricCell('sales', mtdCurMaps, fullPrevMaps, mtdCurLabel, fullPrevLabel, false),
        threeMonthAvg: emptyWindowCell(),
      },
      expensesWindows: {
        samePeriod: metricCell('expenses', sameCurMaps, samePrevMaps, sameCurLabel, samePrevLabel, true),
        fullPrevMonth: metricCell('expenses', mtdCurMaps, fullPrevMaps, mtdCurLabel, fullPrevLabel, false),
        threeMonthAvg: emptyWindowCell(),
      },
      profitWindows: {
        samePeriod: metricCell('profit', sameCurMaps, samePrevMaps, sameCurLabel, samePrevLabel, true),
        fullPrevMonth: metricCell('profit', mtdCurMaps, fullPrevMaps, mtdCurLabel, fullPrevLabel, false),
        threeMonthAvg: emptyWindowCell(),
      },
      mainExpenses: {
        foodLiquor: buildMainExpenseCategory('food', COMPARE_METRIC_LABELS.foodSupplies, food, sales),
        rent: buildMainExpenseCategory('rent', COMPARE_METRIC_LABELS.rent, rent, sales),
        labor: buildMainExpenseCategory('labor', COMPARE_METRIC_LABELS.salary, salary, sales),
        others: buildMainExpenseCategory('others', COMPARE_METRIC_LABELS.others, other, sales),
      },
    };
  });
}

// ─── Daily Sales Trend ───

export async function fetchDailyTrend(
  branchId?: string,
  force = false,
  range?: DateRange,
): Promise<DailySalesPoint[]> {
  // Always load trend for the selected scope (all vs one branch)
  const activeRange = range || getCurrentMonthRange();
  const bundle = await fetchDashboard(force, branchId, activeRange);

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const rangeStart = parseDateKey(activeRange.start_date);
  const rangeEnd = parseDateKey(activeRange.end_date);
  const year = rangeStart.getFullYear();
  const month = rangeStart.getMonth();

  const byDate = new Map<string, { totalSales: number; totalExpenses: number }>();
  for (const d of bundle?.trendData || []) {
    let dateObj: Date;
    if (d.date && /^\d{4}-\d{2}-\d{2}/.test(String(d.date))) {
      const raw = String(d.date);
      dateObj = raw.includes('T')
        ? new Date(raw)
        : new Date(raw.slice(0, 10) + 'T12:00:00');
    } else {
      const dayNum = parseInt(String(d.name), 10) || 1;
      dateObj = new Date(year, month, dayNum);
    }
    if (Number.isNaN(dateObj.getTime())) continue;
    const key = toDateKey(dateObj);
    const prev = byDate.get(key) || { totalSales: 0, totalExpenses: 0 };
    byDate.set(key, {
      totalSales: prev.totalSales + (Number(d.totalSales) || 0),
      totalExpenses: prev.totalExpenses + (Number(d.totalExpenses) || 0),
    });
  }

  // Fill every calendar day in the selected range (zeros where no sales).
  // Current month is MTD (1 → today); past months stay full month via getMonthRange.
  const fillStart = new Date(
    rangeStart.getFullYear(),
    rangeStart.getMonth(),
    rangeStart.getDate(),
  );
  const fillEnd = new Date(
    rangeEnd.getFullYear(),
    rangeEnd.getMonth(),
    rangeEnd.getDate(),
  );

  const points: DailySalesPoint[] = [];
  for (let d = new Date(fillStart); d <= fillEnd; d.setDate(d.getDate() + 1)) {
    const key = toDateKey(d);
    const hit = byDate.get(key);
    const gross = hit?.totalSales || 0;
    const exp = hit?.totalExpenses || 0;
    const dow = d.getDay();
    const dayNum = d.getDate();
    points.push({
      dateStr: d.toLocaleDateString('en-US', { month: 'short', day: '2-digit' }),
      fullDate: key,
      dayName: dayNames[dow],
      dayNumber: dayNum,
      isSaturday: dow === 6,
      isSunday: dow === 0,
      totalSales: gross,
      refund: 0,
      discount: 0,
      netSales: gross,
      grossProfit: Math.max(0, gross - exp),
    });
  }
  return points;
}

// ─── Top Selling Items ───

export async function fetchTopSelling(
  limit = 10,
  branchId?: string,
  dayName?: string,
  range?: DateRange,
): Promise<TopSellingItem[]> {
  const { start_date, end_date } = range || getCurrentMonthRange();
  const params: Record<string, string> = { start_date, end_date, limit: String(limit) };
  if (branchId) params.branch_id = branchId;
  if (dayName) params.day_name = dayName;

  const data = await apiFetch<any>('/analytics/top-selling', params);
  if (!data?.data?.length) return [];

  return data.data.map((item: any, idx: number) => ({
    rank: idx + 1,
    menuId: String(item.menu_id || ''),
    name: item.MENU_NAME || '',
    branchId: String(item.branch_id || ''),
    branchName: item.branch_name || '',
    revenue: Number(item.total_revenue || 0),
    qtySold: Number(item.total_quantity || 0),
    unitPrice: Number(item.unit_price || 0),
  }));
}

export interface MenuDailyPoint {
  date: string;
  label: string;
  dayNum: number;
  dayName: string;
  qty: number;
  revenue: number;
  isSaturday: boolean;
  isSunday: boolean;
}

export async function fetchMenuDaily(
  menuId: string,
  menuName: string,
  branchId?: string,
  range?: DateRange,
): Promise<MenuDailyPoint[]> {
  const { start_date, end_date } = range || getCurrentMonthRange();
  const params: Record<string, string> = { start_date, end_date };
  // Prefer name match (stable); menu_id when available
  if (menuName) params.menu_name = menuName;
  if (menuId) params.menu_id = menuId;
  if (branchId) params.branch_id = branchId;

  const data = await apiFetch<any>('/analytics/menu-daily', params);

  const pad = (n: number) => String(n).padStart(2, '0');
  const toLocalDate = (val: any): string => {
    const d = val instanceof Date ? val : new Date(val);
    if (!Number.isNaN(d.getTime())) {
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }
    const s = String(val);
    return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : s;
  };

  const byDate = new Map<string, { qty: number; revenue: number; dayName?: string }>();
  for (const r of data?.data || []) {
    const date = toLocalDate(r.sale_date);
    byDate.set(date, {
      qty: Number(r.qty) || 0,
      revenue: Number(r.revenue) || 0,
      dayName: r.day_name || undefined,
    });
  }

  // Fill every calendar day in the MTD range (zeros where no sales)
  const start = new Date(start_date + 'T12:00:00');
  const end = new Date(end_date + 'T12:00:00');
  const points: MenuDailyPoint[] = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const dow = d.getDay();
    const hit = byDate.get(date);
    points.push({
      date,
      label: d.toLocaleDateString('en-US', { month: 'short', day: '2-digit' }),
      dayNum: d.getDate(),
      dayName: hit?.dayName || DAY_ORDER_NAMES[(dow + 6) % 7],
      qty: hit?.qty || 0,
      revenue: hit?.revenue || 0,
      isSaturday: dow === 6,
      isSunday: dow === 0,
    });
  }
  return points;
}

const DAY_ORDER_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// ─── Daily Sales Per Branch (weakness analysis) ───

export interface DailyBranchSales {
  branchId: string;
  branchName: string;
  date: string;
  dayName: string;
  netSales: number;
  orderCount: number;
}

export async function fetchDailyPerBranch(range?: DateRange): Promise<DailyBranchSales[]> {
  const { start_date, end_date } = range || getCurrentMonthRange();
  const data = await apiFetch<any>('/analytics/daily-per-branch', { start_date, end_date });
  if (!data?.data?.length) return [];
  return data.data.map((r: any) => {
    const date = normalizeSaleDateKey(r.sale_date);
    // Prefer gross total_sales (paid+discount) so week/day views match Daily Trend + restoAdmin chart
    const gross = Number(r.total_sales);
    const net = Number(r.net_sales);
    return {
      branchId: String(r.branch_id),
      branchName: r.branch_name,
      date,
      dayName: r.day_name,
      netSales: Number.isFinite(gross) && gross > 0 ? gross : (Number.isFinite(net) ? net : 0),
      orderCount: Number(r.order_count) || 0,
    };
  });
}

// ─── MoM (current MTD vs same days last month) ───

export interface MomTotals {
  sales: number;
  expenses: number;
  profit: number;
  orders: number;
  margin: number;
  expenseRate: number;
}

export interface MomDelta {
  sales: number;
  salesPct: number;
  profit: number;
  profitPct: number;
  expenses: number;
  expensesPct: number;
  orders: number;
  ordersPct: number;
  marginPts: number;
}

export interface MomBranchRow {
  branchId: string;
  branchName: string;
  current: MomTotals & { branchId?: string; branchName?: string };
  previous: MomTotals & { branchId?: string; branchName?: string };
  delta: MomDelta;
}

export interface MomComparison {
  currentLabel: string;
  previousLabel: string;
  fleet: { current: MomTotals; previous: MomTotals; delta: MomDelta };
  branches: MomBranchRow[];
}

export async function fetchMomComparison(branchId?: string): Promise<MomComparison | null> {
  const params: Record<string, string> = {};
  if (branchId) params.branch_id = branchId;
  const data = await apiFetch<any>('/analytics/mom-comparison', params);
  if (!data?.success || !data.fleet) return null;
  return {
    currentLabel: data.currentLabel,
    previousLabel: data.previousLabel,
    fleet: data.fleet,
    branches: data.branches || [],
  };
}

export interface PeriodComparePoint {
  dayNumber: number;
  current: number;
  previous: number;
}

export interface PeriodCompare {
  currentLabel: string;
  previousLabel: string;
  current: MomTotals;
  previous: MomTotals;
  delta: MomDelta;
  chart: PeriodComparePoint[];
}

function trendSalesByDay(bundle: DashboardBundle | null): Map<number, number> {
  const map = new Map<number, number>();
  for (const d of bundle?.trendData || []) {
    const day = parseInt(String(d.name), 10) || (d.date ? new Date(d.date + 'T12:00:00').getDate() : 0);
    if (!day) continue;
    map.set(day, (map.get(day) || 0) + (Number(d.totalSales) || 0));
  }
  return map;
}

function totalsFromBundle(bundle: DashboardBundle | null): MomTotals {
  const sales = Number(bundle?.summary?.totalSales) || 0;
  const expenses = Number(bundle?.summary?.totalExpenses) || 0;
  const profit = sales - expenses;
  const orders = (bundle?.branchCardsData || []).reduce((s, b) => s + (Number(b.totalOrders) || 0), 0);
  return {
    sales,
    expenses,
    profit,
    orders,
    margin: sales > 0 ? (profit / sales) * 100 : 0,
    expenseRate: sales > 0 ? (expenses / sales) * 100 : 0,
  };
}

function deltaFromTotals(current: MomTotals, previous: MomTotals): MomDelta {
  const pct = (cur: number, prev: number) => (prev !== 0 ? ((cur - prev) / Math.abs(prev)) * 100 : cur !== 0 ? 100 : 0);
  return {
    sales: current.sales - previous.sales,
    salesPct: pct(current.sales, previous.sales),
    profit: current.profit - previous.profit,
    profitPct: pct(current.profit, previous.profit),
    expenses: current.expenses - previous.expenses,
    expensesPct: pct(current.expenses, previous.expenses),
    orders: current.orders - previous.orders,
    ordersPct: pct(current.orders, previous.orders),
    marginPts: current.margin - previous.margin,
  };
}

function monthLabelFromRange(range: DateRange) {
  const start = new Date(range.start_date + 'T12:00:00');
  const end = new Date(range.end_date + 'T12:00:00');
  if (start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth()) {
    return start.toLocaleString('en-US', { month: 'short', year: 'numeric' });
  }
  if (start.getMonth() === 0 && start.getDate() === 1) {
    return String(start.getFullYear());
  }
  return `${start.toLocaleString('en-US', { month: 'short', year: 'numeric' })} – ${end.toLocaleString('en-US', { month: 'short', year: 'numeric' })}`;
}

function trendSalesByMonth(bundle: DashboardBundle | null): Map<number, number> {
  const map = new Map<number, number>();
  for (const d of bundle?.trendData || []) {
    let month = 0;
    if (d.date && /^\d{4}-\d{2}-\d{2}/.test(String(d.date))) {
      month = new Date(String(d.date).slice(0, 10) + 'T12:00:00').getMonth() + 1;
    }
    if (!month) continue;
    map.set(month, (map.get(month) || 0) + (Number(d.totalSales) || 0));
  }
  return map;
}

function isYearLikeRange(range: DateRange) {
  const start = new Date(range.start_date + 'T12:00:00');
  const end = new Date(range.end_date + 'T12:00:00');
  return !(start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth());
}

/** Selected period vs prior comparable period — KPIs + trend graph. */
export async function fetchPeriodCompare(
  branchId?: string,
  range?: DateRange,
): Promise<PeriodCompare | null> {
  const curRange = range || getCurrentMonthRange();
  const prevRange = getPrevPeriodRange(curRange);
  const isCurrentMtd =
    !range ||
    (curRange.start_date === getCurrentMonthRange().start_date &&
      curRange.end_date === getCurrentMonthRange().end_date);

  // MoM API is current-month only; for other periods build from dashboard bundles.
  if (isCurrentMtd) {
    const [mom, curDash, prevDash] = await Promise.all([
      fetchMomComparison(branchId),
      fetchDashboard(true, branchId, curRange),
      fetchDashboard(true, branchId, prevRange),
    ]);
    if (!mom) return null;

    let current = mom.fleet.current;
    let previous = mom.fleet.previous;
    let delta = mom.fleet.delta;
    if (branchId) {
      const row = mom.branches.find(b => String(b.branchId) === String(branchId));
      if (row) {
        current = row.current;
        previous = row.previous;
        delta = row.delta;
      }
    }

    const curMap = trendSalesByDay(curDash);
    const prevMap = trendSalesByDay(prevDash);
    const endDay = parseInt(curRange.end_date.split('-')[2], 10) || 31;
    const maxDay = Math.max(endDay, ...curMap.keys(), ...prevMap.keys(), 1);
    const chart: PeriodComparePoint[] = [];
    for (let d = 1; d <= maxDay; d++) {
      chart.push({
        dayNumber: d,
        current: curMap.get(d) || 0,
        previous: prevMap.get(d) || 0,
      });
    }

    return {
      currentLabel: mom.currentLabel,
      previousLabel: mom.previousLabel,
      current,
      previous,
      delta,
      chart,
    };
  }

  const [curDash, prevDash] = await Promise.all([
    fetchDashboard(true, branchId, curRange),
    fetchDashboard(true, branchId, prevRange),
  ]);
  if (!curDash && !prevDash) return null;

  const current = totalsFromBundle(curDash);
  const previous = totalsFromBundle(prevDash);
  const chart: PeriodComparePoint[] = [];

  if (isYearLikeRange(curRange)) {
    const curMap = trendSalesByMonth(curDash);
    const prevMap = trendSalesByMonth(prevDash);
    const endMonth = parseInt(curRange.end_date.split('-')[1], 10) || 12;
    const maxMonth = Math.max(endMonth, ...curMap.keys(), ...prevMap.keys(), 1);
    for (let m = 1; m <= maxMonth; m++) {
      chart.push({
        dayNumber: m,
        current: curMap.get(m) || 0,
        previous: prevMap.get(m) || 0,
      });
    }
  } else {
    const curMap = trendSalesByDay(curDash);
    const prevMap = trendSalesByDay(prevDash);
    const endDay = parseInt(curRange.end_date.split('-')[2], 10) || 31;
    const maxDay = Math.max(endDay, ...curMap.keys(), ...prevMap.keys(), 1);
    for (let d = 1; d <= maxDay; d++) {
      chart.push({
        dayNumber: d,
        current: curMap.get(d) || 0,
        previous: prevMap.get(d) || 0,
      });
    }
  }

  return {
    currentLabel: monthLabelFromRange(curRange),
    previousLabel: monthLabelFromRange(prevRange),
    current,
    previous,
    delta: deltaFromTotals(current, previous),
    chart,
  };
}

// ─── Helpers ───

export function getBranchColor(idx: number) { return BRANCH_COLORS[idx % BRANCH_COLORS.length]; }

/** Match restoAdmin AdminDashboard: truncate (not round) before display. */
function truncAmount(val: number) {
  const n = Number(val);
  return Math.trunc(Number.isFinite(n) ? n : 0);
}

export function formatPeso(val: number) {
  const n = truncAmount(val);
  if (Math.abs(n) >= 1_000_000) return `₱${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `₱${(n / 1_000).toFixed(0)}K`;
  return `₱${n.toLocaleString('en-PH', { maximumFractionDigits: 0 })}`;
}

/** Compact amount without ₱ — for dense mobile tables / chart axes */
export function formatCompact(val: number) {
  const n = Math.abs(truncAmount(val));
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return `${n}`;
}

export function formatFullPeso(val: number) {
  const n = truncAmount(val);
  return `₱${n.toLocaleString('en-PH', { maximumFractionDigits: 0 })}`;
}

/** Preferred display order for active branches */
const BRANCH_SORT_ORDER = [
  "kim's brothers",
  'kims brothers',
  'blue moon',
  'kumho',
  'kum ho',
  'prime bbq',
  'prime',
  'eesome cafe',
  'eesome',
];

export function sortBranchesByPreferredOrder<T extends { branch?: { name: string }; name?: string }>(list: T[]): T[] {
  const rank = (item: T) => {
    const name = (item.branch?.name || item.name || '').toLowerCase().trim();
    const idx = BRANCH_SORT_ORDER.findIndex(key => name.includes(key) || key.includes(name));
    return idx === -1 ? 999 : idx;
  };
  return [...list].sort((a, b) => rank(a) - rank(b));
}

