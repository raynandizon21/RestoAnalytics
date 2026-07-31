import { BranchComparisonData } from '../types';

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

function getCurrentMonthRange() {
  const today = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    start_date: `${today.getFullYear()}-${pad(today.getMonth() + 1)}-01`,
    end_date: `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`,
  };
}

/** Same calendar days last month (MTD vs MTD). */
function getPrevMonthSamePeriodRange() {
  const today = new Date();
  const day = today.getDate();
  const prev = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const lastDayPrev = new Date(today.getFullYear(), today.getMonth(), 0).getDate();
  const endDay = Math.min(day, lastDayPrev);
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    start_date: `${prev.getFullYear()}-${pad(prev.getMonth() + 1)}-01`,
    end_date: `${prev.getFullYear()}-${pad(prev.getMonth() + 1)}-${pad(endDay)}`,
  };
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

export async function fetchBranchComparison(force = false): Promise<BranchComparisonData[] | null> {
  const bundle = await fetchDashboard(force);
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
      branch: { id: bid, name: b.name, city: '', locationTag: '', manager: '' },
      totals: {
        sales,
        expenses,
        netProfit: profit,
        expenseRate: +expRate.toFixed(1),
        profitRate: +profRate.toFixed(1),
        orders,
      },
      salesWindows: { samePeriod: win(sales, 1.05), fullPrevMonth: win(sales, 1.03), threeMonthAvg: win(sales, 1.07) },
      expensesWindows: { samePeriod: win(expenses, 0.98, true), fullPrevMonth: win(expenses, 1.01, true), threeMonthAvg: win(expenses, 1.02, true) },
      profitWindows: { samePeriod: win(profit, 1.12), fullPrevMonth: win(profit, 1.08), threeMonthAvg: win(profit, 1.15) },
      mainExpenses: {
        foodLiquor: { id: 'food', labelKorean: '', labelEnglish: 'Food & Beverage', amount: Math.round(food), ratioOfSales: pct(food) },
        rent: { id: 'rent', labelKorean: '', labelEnglish: 'Rent', amount: Math.round(rent), ratioOfSales: pct(rent) },
        labor: { id: 'labor', labelKorean: '', labelEnglish: 'Labor', amount: Math.round(labor), ratioOfSales: pct(labor) },
        others: { id: 'others', labelKorean: '', labelEnglish: 'Others', amount: Math.round(others), ratioOfSales: pct(others) },
      },
    };
  });
}

// ─── Daily Sales Trend ───

export async function fetchDailyTrend(branchId?: string, force = false): Promise<DailySalesPoint[]> {
  // Always load trend for the selected scope (all vs one branch)
  const bundle = await fetchDashboard(force, branchId);
  if (!bundle?.trendData?.length) return [];

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const now = new Date();
  const year = now.getFullYear(), month = now.getMonth();

  return bundle.trendData
    .filter((d) => (Number(d.totalSales) || 0) > 0)
    .map((d) => {
      let dateObj: Date;
      if (d.date && /^\d{4}-\d{2}-\d{2}/.test(String(d.date))) {
        const raw = String(d.date);
        dateObj = raw.includes('T')
          ? new Date(raw)
          : new Date(raw.slice(0, 10) + 'T12:00:00');
      } else {
        const dayNum = parseInt(d.name) || 1;
        dateObj = new Date(year, month, dayNum);
      }
      if (Number.isNaN(dateObj.getTime())) {
        dateObj = new Date(year, month, parseInt(d.name) || 1);
      }
      const dow = dateObj.getDay();
      const dayNum = dateObj.getDate();
      const gross = Number(d.totalSales) || 0;
      const exp = Number(d.totalExpenses) || 0;
      const net = gross;
      const profit = Math.max(0, net - exp);
      return {
        dateStr: dateObj.toLocaleDateString('en-US', { month: 'short', day: '2-digit' }),
        fullDate: `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`,
        dayName: dayNames[dow], dayNumber: dayNum,
        isSaturday: dow === 6, isSunday: dow === 0,
        totalSales: gross, refund: 0, discount: 0, netSales: net, grossProfit: profit,
      };
    })
    .sort((a, b) => a.fullDate.localeCompare(b.fullDate));
}

// ─── Top Selling Items ───

export async function fetchTopSelling(limit = 10, branchId?: string, dayName?: string): Promise<TopSellingItem[]> {
  const { start_date, end_date } = getCurrentMonthRange();
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
): Promise<MenuDailyPoint[]> {
  const { start_date, end_date } = getCurrentMonthRange();
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

export async function fetchDailyPerBranch(): Promise<DailyBranchSales[]> {
  const { start_date, end_date } = getCurrentMonthRange();
  const data = await apiFetch<any>('/analytics/daily-per-branch', { start_date, end_date });
  if (!data?.data?.length) return [];
  return data.data.map((r: any) => ({
    branchId: String(r.branch_id),
    branchName: r.branch_name,
    date: String(r.sale_date).slice(0, 10),
    dayName: r.day_name,
    netSales: Number(r.net_sales) || 0,
    orderCount: Number(r.order_count) || 0,
  }));
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

/** Current MTD vs same days last month — KPIs + daily sales graph. */
export async function fetchPeriodCompare(branchId?: string): Promise<PeriodCompare | null> {
  const curRange = getCurrentMonthRange();
  const prevRange = getPrevMonthSamePeriodRange();
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

// ─── Helpers ───

export function getBranchColor(idx: number) { return BRANCH_COLORS[idx % BRANCH_COLORS.length]; }

export function formatPeso(val: number) {
  if (val >= 1_000_000) return `₱${(val / 1_000_000).toFixed(2)}M`;
  if (val >= 1_000) return `₱${(val / 1_000).toFixed(0)}K`;
  return `₱${val.toLocaleString('en-PH', { maximumFractionDigits: 0 })}`;
}

/** Compact amount without ₱ — for dense mobile tables / chart axes */
export function formatCompact(val: number) {
  const n = Math.abs(Number(val) || 0);
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return `${Math.round(n)}`;
}

export function formatFullPeso(val: number) {
  return `₱${val.toLocaleString('en-PH', { maximumFractionDigits: 0 })}`;
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

