import React, { useState, useEffect, useRef } from 'react';
import {
  Building2, ChevronDown, ChevronLeft, ChevronRight, Loader2, AlertCircle, ShoppingBag, X, Columns2
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, LabelList,
  XAxis, YAxis, Tooltip, CartesianGrid, Cell
} from 'recharts';
import {
  fetchDailyTrend, fetchBranchComparison, fetchTopSelling,
  fetchDailyPerBranch, fetchMenuDaily, fetchPeriodCompare, formatFullPeso, formatPeso, formatCompact, getBranchColor, sortBranchesByPreferredOrder,
  getCurrentMonthRange, getMonthRange, getYearRange, shiftViewRange,
  formatRangeLabel, daysInRange, aggregateTrendByMonth, parseDateKey, todayKey,
  type DailySalesPoint, type TopSellingItem, type DailyBranchSales, type MenuDailyPoint, type PeriodCompare, type ViewPeriod, type DateRange,
} from '../../services/analyticsService';
import { BranchComparisonData } from '../../types';
import { ModalPortal } from '../layout/ModalPortal';
import { BranchComparisonModal } from './BranchComparisonModal';

const nowInit = new Date();
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
const DAY_LETTER = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const;

/** Dense day labels on one line — compact so 1–31 all fit. */
function DayAxisTick({
  x, y, payload, points, dayKey = 'dayNumber', fontSize = 7,
}: {
  x?: number; y?: number; payload?: { value: number | string };
  points: Array<{
    isSaturday?: boolean;
    isSunday?: boolean;
    dayNumber?: number;
    dayNum?: number;
  }>;
  dayKey?: 'dayNumber' | 'dayNum';
  fontSize?: number;
}) {
  const day = Number(payload?.value);
  const point = points.find((d) =>
    Number(dayKey === 'dayNum' ? d.dayNum : d.dayNumber) === day,
  );
  const fill = point?.isSaturday ? '#f87171' : point?.isSunday ? '#34d399' : '#94a3b8';
  return (
      <text
      x={x}
      y={(y ?? 0) + (fontSize >= 9 ? 12 : 10)}
        textAnchor="middle"
      fill={fill}
      fontSize={fontSize}
      fontWeight={700}
      style={{ fontVariantNumeric: 'tabular-nums' }}
    >
      {day}
      </text>
  );
}

function shortBranchLabel(name: string) {
  return name
    .replace(/\s+Restaurant$/i, '')
    .replace(/^Kim'?s\s+Brothers$/i, "Kim's")
    .replace(/^Blue Moon$/i, 'Blue Moon')
    .replace(/^PRIME BBQ$/i, 'PRIME')
    .replace(/^EESOME CAFE$/i, 'EESOME')
    .replace(/^KumHo$/i, 'KumHo');
}

function dayNameFromDate(dateStr: string, fallback?: string): string {
  if (fallback && (DAY_ORDER as readonly string[]).includes(fallback)) return fallback;
  const d = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T12:00:00`);
  if (Number.isNaN(d.getTime())) return fallback || '';
  return DAY_ORDER[(d.getDay() + 6) % 7]; // JS Sun=0 → Mon-first index
}

export const SalesAnalytics: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewPeriod, setViewPeriod] = useState<ViewPeriod>('month');
  const [activeRange, setActiveRange] = useState<DateRange>(() => getCurrentMonthRange());
  const [branches, setBranches] = useState<BranchComparisonData[]>([]);
  const [daily, setDaily] = useState<DailySalesPoint[]>([]);
  const [topItems, setTopItems] = useState<TopSellingItem[]>([]);
  const [dailyPerBranch, setDailyPerBranch] = useState<DailyBranchSales[]>([]);
  const [selectedBranch, setSelectedBranch] = useState('all');
  const [dayPopup, setDayPopup] = useState<{
    branchId: string;
    branchName: string;
    dayName: string;
    avgSales: number;
    totalSales: number;
    dayCount: number;
    branchDailyAvg: number;
    strongDayName?: string;
    strongAvg?: number;
    isWeak: boolean;
  } | null>(null);
  const [dayTopItems, setDayTopItems] = useState<TopSellingItem[]>([]);
  const [dayLoading, setDayLoading] = useState(false);
  const [menuPopup, setMenuPopup] = useState<TopSellingItem | null>(null);
  const [menuDaily, setMenuDaily] = useState<MenuDailyPoint[]>([]);
  const [menuLoading, setMenuLoading] = useState(false);
  const menuCardRef = useRef<HTMLDivElement>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareData, setCompareData] = useState<PeriodCompare | null>(null);
  const [branchCompareOpen, setBranchCompareOpen] = useState(false);
  const [branchMenuOpen, setBranchMenuOpen] = useState(false);
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [pickerMode, setPickerMode] = useState<'month' | 'year'>('month');
  const [pickerYear, setPickerYear] = useState(nowInit.getFullYear());
  const branchMenuRef = useRef<HTMLDivElement>(null);
  const monthPickerRef = useRef<HTMLDivElement>(null);
  const menuSwipeX = useRef<number | null>(null);
  const [isDesktop, setIsDesktop] = useState(false);
  const [isDark, setIsDark] = useState(
    () => typeof document !== 'undefined' && document.documentElement.classList.contains('dark'),
  );

  const dateRange = activeRange;
  const periodLabel = formatRangeLabel(activeRange, viewPeriod);
  const today = new Date();
  const maxYear = today.getFullYear();
  const isYearView = viewPeriod === 'year';
  const currentMonthRange = getCurrentMonthRange();
  const isCurrentPeriod =
    viewPeriod === 'month' &&
    activeRange.start_date === currentMonthRange.start_date &&
    activeRange.end_date === currentMonthRange.end_date;
  const canGoNext = !!shiftViewRange(activeRange, viewPeriod, 1);
  const decadeStart = Math.floor(pickerYear / 10) * 10;
  const yearOptions = Array.from({ length: 12 }, (_, i) => decadeStart + i);

  const applyRange = (period: ViewPeriod, range: DateRange) => {
    setViewPeriod(period);
    setActiveRange(range);
    setMonthPickerOpen(false);
    setPickerMode(period);
  };

  const goPrev = () => {
    const next = shiftViewRange(activeRange, viewPeriod, -1);
    if (next) setActiveRange(next);
  };
  const goNext = () => {
    const next = shiftViewRange(activeRange, viewPeriod, 1);
    if (next) setActiveRange(next);
  };

  const openMonthPicker = () => {
    if (monthPickerOpen) {
      setMonthPickerOpen(false);
      return;
    }
    const s = parseDateKey(activeRange.start_date);
    setPickerYear(s.getFullYear());
    setPickerMode(viewPeriod);
    setMonthPickerOpen(true);
  };

  const pickMonth = (year: number, monthIndex: number) => {
    const max = new Date(today.getFullYear(), today.getMonth(), 1);
    if (new Date(year, monthIndex, 1) > max) return;
    applyRange('month', getMonthRange(year, monthIndex));
  };

  const pickFullYear = (year: number) => {
    if (year > maxYear) return;
    applyRange('year', getYearRange(year));
  };

  const isMonthDisabled = (year: number, monthIndex: number) => {
    const max = new Date(today.getFullYear(), today.getMonth(), 1);
    return new Date(year, monthIndex, 1) > max;
  };

  useEffect(() => {
    if (!branchCompareOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [branchCompareOpen]);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const sync = () => setIsDesktop(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    const el = document.documentElement;
    const sync = () => setIsDark(el.classList.contains('dark'));
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(el, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!branchMenuOpen) return;
    const onDoc = (e: MouseEvent | TouchEvent) => {
      if (!branchMenuRef.current?.contains(e.target as Node)) setBranchMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('touchstart', onDoc);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('touchstart', onDoc);
    };
  }, [branchMenuOpen]);

  useEffect(() => {
    if (!monthPickerOpen) return;
    const onDoc = (e: MouseEvent | TouchEvent) => {
      if (!monthPickerRef.current?.contains(e.target as Node)) setMonthPickerOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('touchstart', onDoc);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('touchstart', onDoc);
    };
  }, [monthPickerOpen]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const range = activeRange;
        const branchId = selectedBranch === 'all' ? undefined : selectedBranch;
        const [bData, dData, tData, dpb] = await Promise.all([
          fetchBranchComparison(true, range),
          fetchDailyTrend(branchId, true, range),
          fetchTopSelling(5, branchId, undefined, range),
          fetchDailyPerBranch(range),
        ]);
        if (cancelled) return;
        if (!bData?.length) { setError('Cannot connect to database.'); return; }
        setBranches(sortBranchesByPreferredOrder(bData));
        setDaily(dData);
        setTopItems(tData);
        setDailyPerBranch(dpb);
      } catch { if (!cancelled) setError('Failed to load data.'); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [activeRange.start_date, activeRange.end_date, viewPeriod]);

  useEffect(() => {
    if (!branches.length || loading) return;
    let cancelled = false;
    (async () => {
      const branchId = selectedBranch === 'all' ? undefined : selectedBranch;
      const range = activeRange;
      const [dData, tData] = await Promise.all([
        fetchDailyTrend(branchId, true, range),
        fetchTopSelling(5, branchId, undefined, range),
      ]);
      if (cancelled) return;
      setDaily(dData);
      setTopItems(tData);
    })();
    return () => { cancelled = true; };
    // Reload daily/top when branch changes only (period load handled above)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBranch]);

  const openDayPopup = async (branchId: string, branchName: string, dayName: string, avgSales: number) => {
    if (avgSales <= 0) return;
    const branchDays = dailyPerBranch.filter(d => {
      if (d.branchId !== branchId) return false;
      const name = dayNameFromDate(d.date, d.dayName);
      return name === dayName;
    });
    const totalSales = branchDays.reduce((s, d) => s + d.netSales, 0);
    const dayCount = branchDays.length || 1;

    const allBranchDays = dailyPerBranch.filter(d => d.branchId === branchId);
    const branchDailyAvg = allBranchDays.length
      ? allBranchDays.reduce((s, d) => s + d.netSales, 0) / allBranchDays.length
      : 0;

    const dowTotals: Record<string, { total: number; count: number }> = {};
    allBranchDays.forEach(d => {
      const name = dayNameFromDate(d.date, d.dayName);
      if (!name) return;
      if (!dowTotals[name]) dowTotals[name] = { total: 0, count: 0 };
      dowTotals[name].total += d.netSales;
      dowTotals[name].count += 1;
    });
    const dowAvgs = DAY_ORDER
      .map(name => ({
        name,
        avg: dowTotals[name] ? dowTotals[name].total / dowTotals[name].count : 0,
      }))
      .filter(d => d.avg > 0);
    const strong = [...dowAvgs].sort((a, c) => c.avg - a.avg)[0];
    const isWeak = branchDailyAvg > 0 && avgSales < branchDailyAvg * 0.85;

    setDayPopup({
      branchId, branchName, dayName, avgSales, totalSales, dayCount,
      branchDailyAvg, isWeak,
      strongDayName: strong?.name,
      strongAvg: strong?.avg,
    });
    setDayLoading(true);
    setDayTopItems([]);
    try {
      setDayTopItems(await fetchTopSelling(5, branchId, dayName, dateRange));
    } finally {
      setDayLoading(false);
    }
  };

  const openMenuPopup = async (item: TopSellingItem) => {
    setMenuPopup(item);
    setMenuLoading(true);
    setMenuDaily([]);
    try {
      const branchId = selectedBranch === 'all' ? (item.branchId || undefined) : selectedBranch;
      setMenuDaily(await fetchMenuDaily(item.menuId, item.name, branchId, dateRange));
    } finally {
      setMenuLoading(false);
    }
  };

  const shiftMenuPopup = async (dir: -1 | 1) => {
    if (!menuPopup || !topItems.length) return;
    const idx = topItems.findIndex(
      t => String(t.menuId) === String(menuPopup.menuId) && String(t.branchId) === String(menuPopup.branchId)
    );
    const next = topItems[idx + dir];
    if (!next) return;
    await openMenuPopup(next);
  };

  useEffect(() => {
    if (!menuPopup) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuPopup(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuPopup]);

  const openCompare = async () => {
    setCompareOpen(true);
    setCompareLoading(true);
    setCompareData(null);
    try {
      const branchId = selectedBranch === 'all' ? undefined : selectedBranch;
      setCompareData(await fetchPeriodCompare(branchId, dateRange));
    } finally {
      setCompareLoading(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-full text-slate-400"><Loader2 className="w-8 h-8 animate-spin" /></div>;
  if (error) return <div className="flex flex-col items-center justify-center h-full text-rose-400 gap-2"><AlertCircle className="w-10 h-10" /><span className="font-bold">{error}</span></div>;

  const totalSales = branches.reduce((s, b) => s + b.totals.sales, 0);
  const totalExpenses = branches.reduce((s, b) => s + b.totals.expenses, 0);
  const totalProfit = branches.reduce((s, b) => s + b.totals.netProfit, 0);
  const totalOrders = branches.reduce((s, b) => s + (b.totals.orders || 0), 0);
  // Calendar days in selected range for accurate /day
  const daysCount = daysInRange(dateRange);
  const viewYearNum = parseDateKey(activeRange.start_date).getFullYear();
  const chartData = isYearView ? aggregateTrendByMonth(daily, viewYearNum) : daily;
  const profitMargin = totalSales > 0 ? (totalProfit / totalSales) * 100 : 0;
  const expenseRate = totalSales > 0 ? (totalExpenses / totalSales) * 100 : 0;

  const cur = selectedBranch === 'all' ? null : branches.find(b => String(b.branch.id) === String(selectedBranch));
  const cSales = cur ? cur.totals.sales : totalSales;
  const cExpenses = cur ? cur.totals.expenses : totalExpenses;
  const cProfit = cur ? cur.totals.netProfit : totalProfit;
  const cMargin = cur ? cur.totals.profitRate : profitMargin;
  const cExpRate = cur ? cur.totals.expenseRate : expenseRate;

  const branchDailyMap = new Map<string, DailyBranchSales[]>();
  dailyPerBranch.forEach(d => {
    const arr = branchDailyMap.get(d.branchId) || [];
    arr.push(d);
    branchDailyMap.set(d.branchId, arr);
  });

  const branchWeakDays = branches.map(b => {
    const days = branchDailyMap.get(b.branch.id) || [];
    if (!days.length) return null;
    const avg = days.reduce((s, d) => s + d.netSales, 0) / days.length;
    const dayTotals: Record<string, { total: number; count: number }> = {};
    days.forEach(d => {
      const name = dayNameFromDate(d.date, d.dayName);
      if (!name) return;
      if (!dayTotals[name]) dayTotals[name] = { total: 0, count: 0 };
      dayTotals[name].total += d.netSales;
      dayTotals[name].count += 1;
    });
    const dayAvgs = DAY_ORDER.map(name => ({
      name,
      avg: dayTotals[name] ? dayTotals[name].total / dayTotals[name].count : 0,
    }));
    const withSales = dayAvgs.filter(d => d.avg > 0);
    const byAvg = [...withSales].sort((a, c) => a.avg - c.avg);
    return {
      branch: b,
      avgDaily: avg,
      weakestDayOfWeek: byAvg[0],
      strongestDayOfWeek: byAvg[byAvg.length - 1],
      dayAvgs,
    };
  }).filter(Boolean) as Array<{
    branch: BranchComparisonData;
    avgDaily: number;
    weakestDayOfWeek: { name: string; avg: number };
    strongestDayOfWeek: { name: string; avg: number };
    dayAvgs: Array<{ name: string; avg: number }>;
  }>;

  // Always show every branch (same as Sales by Branch); highlight via selectedBranch.
  const weekdayRows = branchWeakDays;

  const branchLabel = selectedBranch === 'all'
    ? 'All Branches'
    : (branches.find(b => String(b.branch.id) === String(selectedBranch))?.branch.name || 'Branch');

  const pnlTitle = selectedBranch === 'all'
    ? 'Multi-Branch P&L'
    : `${shortBranchLabel(branchLabel)} P&L`;

  return (
    <div className={`w-full md:h-full md:min-h-0 flex flex-col md:grid md:grid-rows-[auto_auto_minmax(160px,1fr)_minmax(200px,1.1fr)] gap-2.5 md:gap-2 px-3 sm:px-4 py-3 md:py-2 font-sans overflow-x-hidden md:overflow-hidden ${
      isDesktop ? 'pb-2' : 'pb-[calc(4.25rem+env(safe-area-inset-bottom))]'
    }`}>
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 min-w-0">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white truncate" title={pnlTitle}>
            {pnlTitle}
          </h1>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Desktop / website — compact branch dropdown next to date */}
          <div className="relative hidden md:block" ref={isDesktop ? branchMenuRef : undefined}>
          <button
              type="button"
              onClick={() => setBranchMenuOpen(o => !o)}
              className="flex items-center gap-1.5 pl-2.5 pr-2 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-500 transition shadow-sm max-w-[180px]"
            >
              <Building2 className="w-3.5 h-3.5 text-white/80 shrink-0" />
              <span className="truncate">{branchLabel}</span>
              <ChevronDown className={`w-3.5 h-3.5 text-white/80 shrink-0 transition-transform ${branchMenuOpen ? 'rotate-180' : ''}`} />
            </button>
            {branchMenuOpen && isDesktop && (
              <div className="absolute right-0 top-full mt-1.5 z-50 w-52 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => { setSelectedBranch('all'); setBranchMenuOpen(false); }}
                  className={`w-full text-left px-3 py-2 text-sm font-semibold ${
                    selectedBranch === 'all' ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-300' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  All Branches
                </button>
                {branches.map(b => (
                  <button
                    key={b.branch.id}
                    type="button"
                    onClick={() => { setSelectedBranch(b.branch.id); setBranchMenuOpen(false); }}
                    className={`w-full text-left px-3 py-2 text-sm font-semibold ${
                      String(selectedBranch) === String(b.branch.id) ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-300' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    {b.branch.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => setBranchCompareOpen(true)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 text-xs font-semibold hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition shadow-sm shrink-0"
            title="Multi-Branch Board"
          >
            <Columns2 className="w-3.5 h-3.5" />
            <span>Compare</span>
          </button>
          <div className="relative flex items-center gap-0.5 shrink-0" ref={monthPickerRef}>
            <button
              type="button"
              onClick={goPrev}
              className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-800 dark:hover:text-white transition"
              title={isYearView ? 'Previous year' : 'Previous month'}
              aria-label={isYearView ? 'Previous year' : 'Previous month'}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={openMonthPicker}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs sm:text-sm tabular-nums font-semibold transition border ${
                monthPickerOpen
                  ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800'
                  : 'text-slate-700 dark:text-slate-200 border-transparent hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
              title="Pick month or year"
              aria-expanded={monthPickerOpen}
            >
              {periodLabel}
              {isYearView && (
                <span className="text-[9px] font-bold uppercase tracking-wide text-indigo-500 dark:text-indigo-400">Year</span>
              )}
            </button>
            <button
              type="button"
              onClick={goNext}
              disabled={!canGoNext}
              className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-800 dark:hover:text-white transition disabled:opacity-30 disabled:pointer-events-none"
              title={isYearView ? 'Next year' : 'Next month'}
              aria-label={isYearView ? 'Next year' : 'Next month'}
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            {monthPickerOpen && (
              <div className="absolute right-0 top-full mt-1.5 z-50 w-[248px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl p-3">
                <div className="grid grid-cols-2 gap-1 p-0.5 mb-2.5 rounded-lg bg-slate-100 dark:bg-slate-800">
                  <button
                    type="button"
                    onClick={() => setPickerMode('month')}
                    className={`py-1.5 rounded-md text-[11px] font-bold transition ${
                      pickerMode === 'month'
                        ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                        : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                    }`}
                  >
                    Month
                  </button>
                  <button
                    type="button"
                    onClick={() => setPickerMode('year')}
                    className={`py-1.5 rounded-md text-[11px] font-bold transition ${
                      pickerMode === 'year'
                        ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                        : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                    }`}
                  >
                    Year
                  </button>
                </div>

                {pickerMode === 'month' ? (
                  <>
                    <div className="flex items-center justify-between mb-2.5">
                      <button type="button" onClick={() => setPickerYear(y => y - 1)} className="p-1 rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Previous year">
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <span className="text-sm font-bold text-slate-900 dark:text-white tabular-nums">{pickerYear}</span>
                      <button type="button" onClick={() => setPickerYear(y => Math.min(maxYear, y + 1))} disabled={pickerYear >= maxYear} className="p-1 rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none" aria-label="Next year">
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-1">
                      {MONTH_SHORT.map((m, i) => {
                        const active = parseDateKey(activeRange.start_date);
                        const selected =
                          viewPeriod === 'month' &&
                          active.getFullYear() === pickerYear &&
                          active.getMonth() === i;
                        const disabled = isMonthDisabled(pickerYear, i);
                        const isNow = pickerYear === today.getFullYear() && i === today.getMonth();
                        return (
                          <button
                            key={m}
                            type="button"
                            disabled={disabled}
                            onClick={() => pickMonth(pickerYear, i)}
                            className={`py-2 rounded-lg text-xs font-semibold transition ${
                              disabled
                                ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed'
                                : selected
                                  ? 'bg-indigo-600 text-white'
                                  : isNow
                                    ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-950/70'
                                    : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                            }`}
                          >
                            {m}
                          </button>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-2.5">
                      <button type="button" onClick={() => setPickerYear(decadeStart - 10)} className="p-1 rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Previous years">
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <span className="text-sm font-bold text-slate-900 dark:text-white tabular-nums">{decadeStart}–{decadeStart + 11}</span>
                      <button type="button" onClick={() => setPickerYear(Math.min(maxYear, decadeStart + 10))} disabled={decadeStart + 10 > maxYear} className="p-1 rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none" aria-label="Next years">
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-1">
                      {yearOptions.map(y => {
                        const selected = isYearView && parseDateKey(activeRange.start_date).getFullYear() === y;
                        const disabled = y > maxYear;
                        const isNow = y === today.getFullYear();
                        return (
                          <button
                            key={y}
                            type="button"
                            disabled={disabled}
                            onClick={() => pickFullYear(y)}
                            className={`py-2 rounded-lg text-xs font-semibold tabular-nums transition ${
                              selected
                                ? 'bg-indigo-600 text-white'
                                : disabled
                                  ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed'
                                  : isNow
                                    ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-950/70'
                                    : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                            }`}
                          >
                            {y}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}

                {!isCurrentPeriod && (
                  <button
                    type="button"
                    onClick={() => applyRange('month', getCurrentMonthRange())}
                    className="mt-2.5 w-full py-1.5 rounded-lg text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition"
                  >
                    Current month
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* KPIs — mobile: Sales solo + Expenses|Profit · desktop: 1 row of 3 */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 min-w-0">
        <div className="col-span-2 md:col-span-1 min-w-0">
          <KPI
            label="Sales"
            value={formatFullPeso(cSales)}
            valueFull={formatFullPeso(cSales)}
            sub={`${formatFullPeso(Math.round(cSales / daysCount))} daily sales average`}
            color="indigo"
            size="hero"
          />
        </div>
        <KPI
          label="Expenses"
          value={formatFullPeso(cExpenses)}
          valueFull={formatFullPeso(cExpenses)}
          sub={`${cExpRate.toFixed(1)}% of sales`}
          color="orange"
          size="hero"
        />
        <KPI
          label="Profit"
          value={formatFullPeso(cProfit)}
          valueFull={formatFullPeso(cProfit)}
          sub={`${cMargin.toFixed(1)}% margin`}
          color={cProfit >= 0 ? 'emerald' : 'rose'}
          size="hero"
        />
      </div>

      {/* Chart + Top Items */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 md:gap-2 md:min-h-0">
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-3 pb-2 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col min-h-[230px] h-[250px] sm:h-[280px] md:h-auto md:min-h-0">
          <div className="flex items-center justify-between gap-2 shrink-0 mb-1.5">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                  {isYearView ? 'Monthly Trend' : 'Daily Trend'}
                </h2>
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                  {periodLabel}
                </span>
              </div>
              {(() => {
                const today = todayKey();
                const forAvg = isYearView
                  ? chartData.filter(d => d.totalSales > 0)
                  : chartData.filter(d => d.fullDate <= today);
                const n = forAvg.length || 1;
                const avgSales = forAvg.reduce((s, d) => s + d.totalSales, 0) / n;
                return (
                  <div className="mt-1 text-[11px] tabular-nums text-slate-500">
                    Avg <span className="font-bold text-indigo-400">{formatPeso(Math.round(avgSales))}</span>
                    /{isYearView ? 'mo' : 'day'}
                    {isYearView && (
                      <span className="text-slate-400"> · {forAvg.length} months with sales</span>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
          <div className="flex-1 min-h-0 w-full max-w-full overflow-visible">
          <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: isYearView ? 18 : 4, right: 2, left: 0, bottom: 4 }}
                barCategoryGap={isYearView ? '12%' : '8%'}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.1} />
                <XAxis
                  dataKey={isYearView ? 'dateStr' : 'dayNumber'}
                  interval={0}
                  tick={
                    isYearView
                      ? { fontSize: isDesktop ? 10 : 8, fill: '#94a3b8', fontWeight: 700 }
                      : <DayAxisTick points={chartData} dayKey="dayNumber" fontSize={isDesktop ? 10 : 7} />
                  }
                  height={isDesktop ? 22 : 18}
                  tickLine={false}
                  axisLine={{ stroke: '#334155', strokeOpacity: 0.35 }}
                />
                <YAxis
                  tickFormatter={v => formatCompact(v)}
                  tick={{ fontSize: isDesktop ? 11 : 7, fill: '#64748b' }}
                  width={isDesktop ? 36 : 26}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  formatter={(v: any) => [formatFullPeso(Number(v)), 'Sales']}
                  labelFormatter={(_, payload: any) => {
                    const p = payload?.[0]?.payload;
                    if (!p) return '';
                    if (isYearView) return `${p.dateStr} ${viewYearNum}`;
                    return `${p.dateStr} (${p.dayName})`;
                  }}
                  contentStyle={{ backgroundColor: '#0f172a', borderRadius: '12px', border: '1px solid #334155', fontSize: '12px', boxShadow: '0 12px 40px rgba(0,0,0,.45)' }}
                  labelStyle={{ color: '#f8fafc', fontWeight: 700 }}
                  itemStyle={{ color: '#e2e8f0', fontWeight: 600 }}
                />
                <Bar
                  dataKey="totalSales"
                  radius={[2, 2, 0, 0]}
                  fill="#818cf8"
                  isAnimationActive={false}
                  cursor={isYearView ? 'pointer' : undefined}
                  onClick={isYearView ? (data: any) => {
                    const fullDate = data?.fullDate || data?.payload?.fullDate;
                    if (!fullDate) return;
                    const d = parseDateKey(fullDate);
                    if (isMonthDisabled(d.getFullYear(), d.getMonth())) return;
                    pickMonth(d.getFullYear(), d.getMonth());
                  } : undefined}
                >
                  {isYearView && (
                    <LabelList
                      dataKey="totalSales"
                      position="top"
                      formatter={(v: number) => (Number(v) > 0 ? formatCompact(Number(v)) : '')}
                      style={{ fontSize: isDesktop ? 9 : 7, fill: '#94a3b8', fontWeight: 700 }}
                    />
                  )}
                </Bar>
              </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

        <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col min-h-[280px] md:min-h-0 h-full">
          <h2 className="text-base font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-1.5 shrink-0">
            <ShoppingBag className="w-4 h-4 text-amber-500" /> Top Revenue
            <span className="ml-auto text-[11px] font-normal text-slate-500 hidden sm:inline">click → daily sales</span>
          </h2>
          <div className="flex flex-col gap-1 flex-1 justify-evenly min-h-0">
            {topItems.length === 0 && <p className="text-sm text-slate-400">No items yet</p>}
            {topItems.slice(0, 5).map(item => {
              const branchIdx = branches.findIndex(b => String(b.branch.id) === String(item.branchId));
              return (
              <button
                key={`${item.menuId}-${item.branchId}-${item.rank}`}
                type="button"
                onClick={() => openMenuPopup(item)}
                className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-2 text-sm text-left rounded-lg px-1 py-0.5 -mx-1 hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-colors cursor-pointer"
              >
                <span className="w-7 h-7 rounded-md bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-300 flex items-center justify-center text-xs font-black">
                  {item.rank}
                </span>
                <div className="min-w-0 overflow-hidden">
                  <div className="font-semibold text-slate-800 dark:text-slate-200 truncate" title={item.name}>
                    {item.name}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-slate-400 min-w-0">
                    <span className="shrink-0">{item.qtySold.toLocaleString()} sold</span>
                    {selectedBranch === 'all' && item.branchName && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[10px] font-semibold text-slate-600 dark:text-slate-300 truncate max-w-full">
                        <span
                          className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ background: getBranchColor(branchIdx >= 0 ? branchIdx : item.rank - 1) }}
                        />
                        {item.branchName}
                      </span>
                    )}
                  </div>
                </div>
                <span className="font-bold text-emerald-600 dark:text-emerald-400 text-right tabular-nums whitespace-nowrap text-[12px] sm:text-sm">
                  {formatFullPeso(item.revenue)}
                </span>
              </button>
              );
            })}
          </div>
          </div>
        </div>

      {/* Bottom: Branch + Weekday — equal card sizes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-2 md:min-h-0 md:items-stretch">
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col min-h-[280px] md:min-h-0 h-full">
          <div className="px-3 sm:px-4 py-2 border-b border-slate-200 dark:border-slate-800 shrink-0 flex items-center justify-between gap-2">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">Sales by Branch</h2>
            <span className="text-[11px] text-slate-500 hidden sm:inline">tap branch → daily</span>
          </div>
          <div className="flex-1 min-h-0 overflow-x-hidden overflow-y-auto">
            <table className="w-full table-fixed border-collapse text-[10px] sm:text-sm md:h-full">
              <colgroup>
                <col className="w-[22%] sm:w-[22%]" />
                <col className="w-[26%] sm:w-[20%]" />
                <col className="w-[12%] sm:w-[12%]" />
                <col className="hidden sm:table-column sm:w-[12%]" />
                <col className="w-[24%] sm:w-[20%]" />
                <col className="w-[16%] sm:w-[14%]" />
              </colgroup>
            <thead>
                <tr className="bg-slate-50 dark:bg-slate-800 text-slate-500 font-bold uppercase text-[8px] sm:text-[10px] tracking-wide">
                  <th className="px-1 sm:px-2 py-2 text-left">Branch</th>
                  <th className="px-0.5 sm:px-2 py-2 text-right">Sales</th>
                  <th className="px-0.5 sm:px-2 py-2 text-right">Share</th>
                  <th className="px-1 sm:px-2 py-2 text-right hidden sm:table-cell">Orders</th>
                  <th className="px-0.5 sm:px-2 py-2 text-right">Profit</th>
                  <th className="px-0.5 sm:px-2 py-2 text-right">Margin</th>
              </tr>
            </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                {branches.map((b, i) => {
                  const share = totalSales > 0 ? (b.totals.sales / totalSales) * 100 : 0;
                  const active = String(selectedBranch) === String(b.branch.id);
                  const profitTone = b.totals.netProfit >= 0 ? 'text-emerald-500' : 'text-rose-500';
                return (
                  <tr
                    key={b.branch.id}
                    onClick={() => setSelectedBranch(b.branch.id)}
                    className={`cursor-pointer transition-colors ${
                      active
                        ? 'bg-indigo-100/70 dark:bg-indigo-900/40 ring-1 ring-inset ring-indigo-400/40'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <td className="px-1 sm:px-2 py-2 font-bold text-slate-900 dark:text-white truncate">
                      <span className="inline-block w-2 h-2 rounded-full mr-1 align-middle shrink-0" style={{ background: getBranchColor(i) }} />
                      <span className="sm:hidden">{shortBranchLabel(b.branch.name)}</span>
                      <span className="hidden sm:inline">{b.branch.name}</span>
                    </td>
                    <td className="px-0.5 sm:px-2 py-2 text-right font-semibold tabular-nums truncate" title={formatFullPeso(b.totals.sales)}>
                      <span className="sm:hidden">{formatPeso(b.totals.sales)}</span>
                      <span className="hidden sm:inline">{formatFullPeso(b.totals.sales)}</span>
                    </td>
                    <td className="px-0.5 sm:px-2 py-2 text-right text-slate-500 tabular-nums">{share.toFixed(0)}%</td>
                    <td className="px-1 sm:px-2 py-2 text-right tabular-nums hidden sm:table-cell">{(b.totals.orders || 0).toLocaleString()}</td>
                    <td className={`px-0.5 sm:px-2 py-2 text-right font-bold tabular-nums truncate ${profitTone}`} title={formatFullPeso(b.totals.netProfit)}>
                      <span className="sm:hidden">{formatPeso(b.totals.netProfit)}</span>
                      <span className="hidden sm:inline">{formatFullPeso(b.totals.netProfit)}</span>
                    </td>
                    <td className="px-0.5 sm:px-2 py-2 text-right">
                      <span className={`font-bold tabular-nums ${profitTone}`}>
                        {b.totals.profitRate.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                );
              })}
                <tr
                  onClick={() => setSelectedBranch('all')}
                  className={`font-bold cursor-pointer transition-colors ${
                    selectedBranch === 'all'
                      ? 'bg-indigo-100/70 dark:bg-indigo-900/40'
                      : 'bg-indigo-50/40 dark:bg-indigo-950/20 hover:bg-indigo-100/50 dark:hover:bg-indigo-900/30'
                  }`}
                >
                  <td className="px-1 sm:px-2 py-2 text-indigo-800 dark:text-indigo-200">TOTAL</td>
                  <td className="px-0.5 sm:px-2 py-2 text-right tabular-nums truncate" title={formatFullPeso(totalSales)}>
                    <span className="sm:hidden">{formatPeso(totalSales)}</span>
                    <span className="hidden sm:inline">{formatFullPeso(totalSales)}</span>
                  </td>
                  <td className="px-0.5 sm:px-2 py-2 text-right tabular-nums">100%</td>
                  <td className="px-1 sm:px-2 py-2 text-right tabular-nums hidden sm:table-cell">{totalOrders.toLocaleString()}</td>
                  <td className={`px-0.5 sm:px-2 py-2 text-right tabular-nums truncate ${totalProfit >= 0 ? 'text-emerald-600' : 'text-rose-500'}`} title={formatFullPeso(totalProfit)}>
                    <span className="sm:hidden">{formatPeso(totalProfit)}</span>
                    <span className="hidden sm:inline">{formatFullPeso(totalProfit)}</span>
                  </td>
                  <td className={`px-0.5 sm:px-2 py-2 text-right tabular-nums ${totalProfit >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>{profitMargin.toFixed(1)}%</td>
                </tr>
            </tbody>
          </table>
        </div>
      </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col min-h-[280px] md:min-h-0 h-full">
          <div className="px-3 sm:px-4 py-2 border-b border-slate-200 dark:border-slate-800 shrink-0 flex items-center justify-between gap-2">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Sales by Weekday <span className="text-[10px] font-normal text-slate-500">₱K</span>
            </h2>
            <div className="flex items-center gap-2.5 text-[10px] sm:text-[11px] text-slate-500 shrink-0">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-rose-500" />Slow</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-emerald-500" />Best</span>
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
            {weekdayRows.length === 0 ? (
              <p className="text-sm text-slate-400 p-3">No daily sales data yet.</p>
            ) : (
              <table className="w-full table-fixed border-collapse text-[11px] sm:text-sm h-full">
                <colgroup>
                  <col style={{ width: '22%' }} />
                  {DAY_SHORT.map(d => (
                    <col key={d} />
                  ))}
                </colgroup>
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800 text-slate-500 font-bold uppercase text-[9px] sm:text-[10px] tracking-wide">
                    <th className="px-1.5 sm:px-2 py-2 text-left">Branch</th>
                    {DAY_SHORT.map((d, i) => (
                      <th key={d} className="px-0.5 py-2 text-center font-bold">
                        {DAY_LETTER[i]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                  {weekdayRows.map((bw, idx) => {
                    const weakName = bw.weakestDayOfWeek?.name;
                    const strongName = bw.strongestDayOfWeek?.name;
                    const colorIdx = branches.findIndex(b => String(b.branch.id) === String(bw.branch.branch.id));
                    const active = selectedBranch !== 'all' && String(selectedBranch) === String(bw.branch.branch.id);
                    return (
                    <tr
                      key={bw.branch.branch.id}
                      onClick={() => setSelectedBranch(bw.branch.branch.id)}
                      className={`cursor-pointer transition-colors ${
                        active
                          ? 'bg-indigo-100/70 dark:bg-indigo-900/40 ring-1 ring-inset ring-indigo-400/40'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                      }`}
                    >
                      <td className="px-1.5 sm:px-2 py-2 font-bold text-slate-900 dark:text-white truncate">
                        <span className="inline-block w-2 h-2 rounded-full mr-1 align-middle shrink-0" style={{ background: getBranchColor(colorIdx >= 0 ? colorIdx : idx) }} />
                        {shortBranchLabel(bw.branch.branch.name)}
                      </td>
                      {bw.dayAvgs.map(da => {
                      const isSlowest = !!weakName && da.name === weakName && da.avg > 0;
                      const isBest = !!strongName && da.name === strongName && da.avg > 0 && strongName !== weakName;
                      const clickable = da.avg > 0;
                      return (
                        <td key={da.name} className="px-0.5 py-2 text-center align-middle">
                          <button
                            type="button"
                            disabled={!clickable}
                            onClick={() => openDayPopup(bw.branch.branch.id, bw.branch.branch.name, da.name, da.avg)}
                            className={`w-full min-h-[28px] rounded-md px-0.5 py-1.5 font-semibold tabular-nums leading-none transition-all ${
                              !clickable ? 'text-slate-600 cursor-default' :
                              isSlowest ? 'bg-rose-500/20 text-rose-400 cursor-pointer' :
                              isBest ? 'bg-emerald-500/20 text-emerald-400 cursor-pointer' :
                              'text-slate-400 hover:text-slate-200 cursor-pointer'
                            }`}
                            title={
                              !clickable ? undefined :
                              isSlowest ? `Slowest — ${bw.branch.branch.name} · ${da.name}` :
                              isBest ? `Best — ${bw.branch.branch.name} · ${da.name}` :
                              `${bw.branch.branch.name} · ${da.name}`
                            }
                          >
                            {da.avg === 0 ? '—' : da.avg >= 1000 ? Math.round(da.avg / 1000) : Math.round(da.avg)}
                          </button>
                        </td>
                      );
                    })}
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Day cell popup — fit, no scroll */}
      {dayPopup && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md" onClick={() => setDayPopup(null)}>
          <div
            className="w-full max-w-[400px] md:max-w-[440px] bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/60 dark:border-slate-700/80 shadow-2xl shadow-black/50 overflow-hidden flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-4 pt-3.5 pb-2.5 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between gap-3 shrink-0">
              <div className="min-w-0 flex-1">
                <div className={`text-[10px] font-bold uppercase tracking-widest ${dayPopup.isWeak ? 'text-rose-400' : 'text-indigo-400'}`}>
                  {dayPopup.isWeak ? 'Dead day' : 'Weekday'}
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white mt-0.5 leading-tight">
                  {shortBranchLabel(dayPopup.branchName)}
                  <span className="text-slate-500 font-semibold"> · {dayPopup.dayName}</span>
            </h3>
          </div>
              <button
                type="button"
                onClick={() => setDayPopup(null)}
                className="p-2 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-white shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2 px-4 py-2.5 shrink-0">
              <div className="rounded-xl bg-slate-50 dark:bg-slate-800/70 px-2 py-2 text-center min-w-0">
                <div className="text-[9px] font-bold uppercase text-slate-500 tracking-wide">Day</div>
                <div className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">{dayPopup.dayName.slice(0, 3)}</div>
              </div>
              <div className="rounded-xl bg-slate-50 dark:bg-slate-800/70 px-2 py-2 text-center min-w-0">
                <div className="text-[9px] font-bold uppercase text-slate-500 tracking-wide">Avg</div>
                <div className={`text-sm font-bold tabular-nums mt-0.5 ${dayPopup.isWeak ? 'text-rose-400' : 'text-indigo-400'}`}>
                  {formatPeso(Math.round(dayPopup.avgSales))}
                </div>
              </div>
              <div className="rounded-xl bg-slate-50 dark:bg-slate-800/70 px-2 py-2 text-center min-w-0">
                <div className="text-[9px] font-bold uppercase text-slate-500 tracking-wide">Total</div>
                <div className="text-sm font-bold text-emerald-400 tabular-nums mt-0.5 truncate">
                  {formatPeso(Math.round(dayPopup.totalSales))}
            </div>
          </div>
            </div>

            <div className="px-4 pb-3.5 shrink-0">
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1.5">
                Top menus · {dayPopup.dayName}
              </div>
              {dayLoading ? (
                <div className="flex items-center justify-center py-8 text-slate-400">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
              ) : dayTopItems.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-6">No menu sales for this day.</p>
              ) : (
                <div className="space-y-0">
                  {dayTopItems.slice(0, 5).map(item => (
                    <div key={item.rank} className="grid grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-2 px-0.5 py-1.5 min-w-0">
                      <span className="w-6 h-6 rounded-md bg-indigo-500/15 text-indigo-300 flex items-center justify-center text-[11px] font-bold shrink-0">
                        {item.rank}
                      </span>
                      <div className="min-w-0 overflow-hidden">
                        <div className="text-[12px] font-semibold text-slate-900 dark:text-white truncate">{item.name}</div>
                        <div className="text-[10px] text-slate-500 truncate">{item.qtySold.toLocaleString()} sold</div>
                      </div>
                      <span className="text-[12px] font-bold text-emerald-400 tabular-nums shrink-0 whitespace-nowrap">
                        {formatPeso(item.revenue)}
                      </span>
              </div>
                  ))}
            </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Daily sales — centered small popup, fit width, no side scroll */}
      {menuPopup && (() => {
        const withSales = menuDaily.filter(d => d.qty > 0);
        const best = withSales.length
          ? [...withSales].sort((a, c) => c.qty - a.qty || c.revenue - a.revenue)[0]
          : null;
        const totalQty = menuDaily.reduce((s, d) => s + d.qty, 0);
        const totalRev = menuDaily.reduce((s, d) => s + d.revenue, 0);
        const menuIdx = topItems.findIndex(
          t => String(t.menuId) === String(menuPopup.menuId) && String(t.branchId) === String(menuPopup.branchId)
        );
        const canPrev = menuIdx > 0;
        const canNext = menuIdx >= 0 && menuIdx < topItems.length - 1;
        const tickSize = isDesktop ? 10 : (menuDaily.length > 20 ? 6 : 7);
        return (
          <ModalPortal>
            <div
              className="fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-5 md:p-8 bg-slate-950/55 dark:bg-slate-950/70 backdrop-blur-[2px]"
              onClick={() => setMenuPopup(null)}
            >
              <div
                ref={menuCardRef}
                role="dialog"
                aria-label="Daily sales"
                className="w-full max-w-[min(100%,420px)] sm:max-w-[560px] md:max-w-[820px] lg:max-w-[960px] max-h-[min(90dvh,720px)] md:max-h-[min(92dvh,860px)] overflow-x-hidden overflow-y-auto rounded-2xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 p-3 sm:p-4 md:p-5 shadow-2xl shadow-slate-900/20 dark:shadow-black/50 touch-pan-y"
                onClick={e => e.stopPropagation()}
                onTouchStart={e => { menuSwipeX.current = e.touches[0]?.clientX ?? null; }}
                onTouchEnd={e => {
                  const start = menuSwipeX.current;
                  menuSwipeX.current = null;
                  if (start == null || menuLoading) return;
                  const end = e.changedTouches[0]?.clientX;
                  if (end == null) return;
                  const dx = end - start;
                  if (Math.abs(dx) < 50) return;
                  void shiftMenuPopup(dx < 0 ? 1 : -1);
                }}
              >
                <div className="mb-3 md:mb-4 border-b border-slate-100 dark:border-slate-700 pb-2.5 md:pb-3 flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] md:text-xs font-bold uppercase tracking-widest text-amber-500 dark:text-amber-400">
                      Daily sales
                      {menuIdx >= 0 && (
                        <span className="text-slate-400 dark:text-slate-500 font-semibold normal-case tracking-normal ml-1">
                          · {menuIdx + 1}/{topItems.length}
                        </span>
                      )}
                    </p>
                    <p className="text-sm sm:text-base md:text-xl font-bold tracking-wide text-indigo-600 dark:text-indigo-400 mt-0.5 line-clamp-2" title={menuPopup.name}>
                      {menuPopup.name}
                    </p>
                    {menuPopup.branchName && (
                      <p className="mt-0.5 text-xs md:text-sm leading-snug text-slate-500 dark:text-slate-400 truncate">{menuPopup.branchName}</p>
                    )}
                    <p className="md:hidden text-[9px] text-slate-400 mt-0.5">Swipe ← → next item</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      disabled={!canPrev || menuLoading}
                      onClick={() => void shiftMenuPopup(-1)}
                      className="p-1.5 md:p-2 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-300 hover:text-slate-800 dark:hover:text-white disabled:opacity-30 disabled:pointer-events-none"
                      aria-label="Previous item"
                      title="Previous"
                    >
                      <ChevronLeft className="w-4 h-4 md:w-5 md:h-5" />
                    </button>
                    <button
                      type="button"
                      disabled={!canNext || menuLoading}
                      onClick={() => void shiftMenuPopup(1)}
                      className="p-1.5 md:p-2 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-300 hover:text-slate-800 dark:hover:text-white disabled:opacity-30 disabled:pointer-events-none"
                      aria-label="Next item"
                      title="Next"
                    >
                      <ChevronRight className="w-4 h-4 md:w-5 md:h-5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setMenuPopup(null)}
                      className="p-1.5 md:p-2 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-white"
                      aria-label="Close"
                    >
                      <X className="w-3.5 h-3.5 md:w-4 md:h-4" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-1.5 sm:gap-2 md:gap-3 mb-3 md:mb-4">
                  <div className="rounded-lg md:rounded-xl bg-slate-50 dark:bg-slate-800/80 px-1.5 sm:px-2 md:px-3 py-2 md:py-3 text-center min-w-0 border border-slate-100 dark:border-slate-700/60">
                    <div className="text-[8px] sm:text-[9px] md:text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wide">Best day</div>
                    <div className="text-xs sm:text-sm md:text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-0.5 truncate">
                      {best ? `${best.dayNum} · ${best.dayName.slice(0, 3)}` : '—'}
                    </div>
                  </div>
                  <div className="rounded-lg md:rounded-xl bg-slate-50 dark:bg-slate-800/80 px-1.5 sm:px-2 md:px-3 py-2 md:py-3 text-center min-w-0 border border-slate-100 dark:border-slate-700/60">
                    <div className="text-[8px] sm:text-[9px] md:text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wide">Day sales</div>
                    <div
                      className="text-xs sm:text-sm md:text-lg font-bold text-emerald-600 dark:text-emerald-400 tabular-nums mt-0.5 truncate"
                      title={best ? formatFullPeso(best.revenue) : undefined}
                    >
                      {best ? (isDesktop ? formatFullPeso(best.revenue) : formatPeso(best.revenue)) : '—'}
                    </div>
                    <div className="text-[9px] sm:text-[10px] md:text-xs text-indigo-500 dark:text-indigo-400 font-semibold tabular-nums mt-0.5 truncate">
                      {best ? `${best.qty.toLocaleString()} sold` : ''}
                    </div>
                  </div>
                  <div className="rounded-lg md:rounded-xl bg-slate-50 dark:bg-slate-800/80 px-1.5 sm:px-2 md:px-3 py-2 md:py-3 text-center min-w-0 border border-slate-100 dark:border-slate-700/60">
                    <div className="text-[8px] sm:text-[9px] md:text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wide">Month</div>
                    <div
                      className="text-xs sm:text-sm md:text-lg font-bold text-emerald-600 dark:text-emerald-400 tabular-nums mt-0.5 truncate"
                      title={formatFullPeso(totalRev)}
                    >
                      {isDesktop ? formatFullPeso(totalRev) : formatPeso(totalRev)}
                    </div>
                    <div className="text-[9px] sm:text-[10px] md:text-xs text-indigo-500 dark:text-indigo-400 font-semibold tabular-nums mt-0.5 truncate">
                      {totalQty.toLocaleString()} sold
                    </div>
                  </div>
                </div>

                <div className="rounded-lg md:rounded-xl bg-slate-50 dark:bg-slate-800/50 px-1.5 sm:px-2.5 md:px-3 py-2.5 md:py-3 border border-slate-100 dark:border-slate-700 overflow-hidden">
                  <div className="flex items-center justify-between mb-1.5 md:mb-2 gap-2 px-1">
                    <p className="text-[10px] sm:text-[11px] md:text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 truncate">{periodLabel}</p>
                    <p className="text-[9px] sm:text-[10px] md:text-xs text-slate-400 dark:text-slate-500 shrink-0">Green = peak</p>
                  </div>
                  <div className="h-[170px] sm:h-[220px] md:h-[320px] lg:h-[360px] w-full max-w-full overflow-hidden">
                    {menuLoading ? (
                      <div className="flex items-center justify-center h-full text-slate-400"><Loader2 className="w-5 h-5 animate-spin" /></div>
                    ) : menuDaily.length === 0 ? (
                      <p className="text-xs text-slate-400 text-center py-8">No daily sales for this item.</p>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                        <BarChart
                          data={menuDaily}
                          margin={{ top: 8, right: isDesktop ? 8 : 2, left: isDesktop ? 0 : -6, bottom: 2 }}
                          barCategoryGap={isDesktop ? '12%' : '8%'}
                        >
                          <CartesianGrid
                            strokeDasharray="3 3"
                            vertical={false}
                            stroke={isDark ? '#334155' : '#e2e8f0'}
                          />
                          <XAxis
                            dataKey="dayNum"
                            interval={0}
                            height={isDesktop ? 22 : 18}
                            tick={<DayAxisTick points={menuDaily} dayKey="dayNum" fontSize={tickSize} />}
                            tickLine={false}
                            axisLine={{ stroke: isDark ? '#475569' : '#cbd5e1', strokeOpacity: 0.8 }}
                          />
                          <YAxis
                            tick={{ fontSize: isDesktop ? 11 : tickSize + 1, fill: '#94a3b8' }}
                            width={isDesktop ? 32 : 22}
                            tickCount={5}
                            allowDecimals={false}
                            axisLine={false}
                            tickLine={false}
                          />
                          <Tooltip
                            formatter={(v: any, _name: any, props: any) => {
                              const rev = Number(props?.payload?.revenue) || 0;
                              return [
                                `${Number(v).toLocaleString()} sold · ${formatFullPeso(rev)}`,
                                'Day sales',
                              ];
                            }}
                            labelFormatter={(_, payload: any) => {
                              const p = payload?.[0]?.payload;
                              return p ? `${p.label} (${p.dayName})` : '';
                            }}
                            contentStyle={{
                              backgroundColor: isDark ? '#0f172a' : '#ffffff',
                              borderRadius: '10px',
                              border: isDark ? '1px solid #334155' : '1px solid #e2e8f0',
                              fontSize: '11px',
                              boxShadow: '0 8px 24px rgba(0,0,0,.18)',
                            }}
                            labelStyle={{ color: isDark ? '#f8fafc' : '#0f172a', fontWeight: 700, marginBottom: 2 }}
                            itemStyle={{ color: isDark ? '#e2e8f0' : '#334155', fontWeight: 600 }}
                            cursor={{ fill: isDark ? 'rgba(148, 163, 184, 0.12)' : 'rgba(100, 116, 139, 0.1)' }}
                          />
                          <Bar dataKey="qty" name="qty" radius={[2, 2, 0, 0]} isAnimationActive={false}>
                            {menuDaily.map((e, i) => (
                              <Cell
                                key={i}
                                fill={
                                  best && e.date === best.date
                                    ? '#10b981'
                                    : e.qty > 0
                                      ? '#818cf8'
                                      : (isDark ? '#334155' : '#e2e8f0')
                                }
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </ModalPortal>
        );
      })()}

      {/* MoM Compare — prev vs current */}
      {compareOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md" onClick={() => setCompareOpen(false)}>
          <div
            className="w-full max-w-[520px] md:max-w-[640px] bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/60 dark:border-slate-700/80 shadow-2xl shadow-black/50 overflow-hidden flex flex-col max-h-[min(90dvh,720px)]"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-4 pt-3.5 pb-2.5 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between gap-3 shrink-0">
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-widest text-indigo-400">Compare</div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white mt-0.5 truncate">
                  {pnlTitle}
                </h3>
                {compareData && (
                  <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                    {compareData.previousLabel} → {compareData.currentLabel}
                  </div>
                )}
              </div>
              <button type="button" onClick={() => setCompareOpen(false)} className="p-2 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-white shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>

            {compareLoading || !compareData ? (
              <div className="flex items-center justify-center py-16 text-slate-400">
                <Loader2 className="w-7 h-7 animate-spin" />
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-2 px-3 sm:px-4 py-3 shrink-0">
                  {([
                    { label: 'Sales', cur: compareData.current.sales, prev: compareData.previous.sales, pct: compareData.delta.salesPct, color: 'text-indigo-400' },
                    { label: 'Expenses', cur: compareData.current.expenses, prev: compareData.previous.expenses, pct: compareData.delta.expensesPct, color: 'text-rose-400' },
                    { label: 'Profit', cur: compareData.current.profit, prev: compareData.previous.profit, pct: compareData.delta.profitPct, color: 'text-emerald-400' },
                  ] as const).map(m => (
                    <div key={m.label} className="rounded-xl bg-slate-50 dark:bg-slate-800/70 px-2 py-2 min-w-0">
                      <div className={`text-[9px] font-bold uppercase tracking-wide ${m.color}`}>{m.label}</div>
                      <div className={`text-[12px] sm:text-sm font-black tabular-nums mt-1 truncate ${m.color}`} title={formatFullPeso(m.cur)}>
                        {formatFullPeso(m.cur)}
                      </div>
                      <div className="text-[10px] text-orange-400 tabular-nums mt-0.5 truncate" title={formatFullPeso(m.prev)}>
                        was {formatPeso(m.prev)}
                      </div>
                      <div className={`text-[10px] font-bold tabular-nums mt-0.5 ${m.pct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {m.pct >= 0 ? '+' : ''}{Math.round(m.pct)}%
                      </div>
                    </div>
                  ))}
                </div>

                <div className="px-3 sm:px-4 flex items-center justify-between shrink-0 mb-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Daily sales</span>
                  <div className="flex items-center gap-3 text-[10px] text-slate-500">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-orange-400" /> Prev</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-indigo-400" /> Current</span>
                  </div>
                </div>

                <div className="px-2 pb-3 h-[220px] sm:h-[260px] shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={compareData.chart} margin={{ top: 4, right: 4, left: 0, bottom: 2 }} barCategoryGap="18%" barGap={1}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.12} />
                      <XAxis
                        dataKey="dayNumber"
                        interval={isYearView ? 0 : (isDesktop ? 1 : 2)}
                        tick={{ fontSize: 8, fill: '#94a3b8' }}
                        tickFormatter={isYearView ? (m: number) => chartData[m - 1]?.dateStr || String(m) : undefined}
                        tickLine={false}
                        axisLine={{ stroke: '#334155', strokeOpacity: 0.35 }}
                        height={16}
                      />
                      <YAxis
                        tickFormatter={v => formatCompact(v)}
                        tick={{ fontSize: 8, fill: '#64748b' }}
                        width={28}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        formatter={(v: any, name: any) => [formatFullPeso(Number(v)), name === 'previous' ? 'Previous' : 'Current']}
                        labelFormatter={d => isYearView ? (chartData[Number(d) - 1]?.dateStr || `M${d}`) : `Day ${d}`}
                        contentStyle={{ backgroundColor: '#0f172a', borderRadius: '12px', border: '1px solid #334155', fontSize: '12px' }}
                        labelStyle={{ color: '#f8fafc', fontWeight: 700 }}
                        itemStyle={{ color: '#e2e8f0', fontWeight: 600 }}
                      />
                      <Bar dataKey="previous" name="previous" fill="#fb923c" radius={[2, 2, 0, 0]} isAnimationActive={false} />
                      <Bar dataKey="current" name="current" fill="#818cf8" radius={[2, 2, 0, 0]} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Mobile-only floating branch picker — same colors as desktop */}
      {!dayPopup && !menuPopup && !compareOpen && !branchCompareOpen && !isDesktop && (
      <div
        ref={branchMenuRef}
        className="fixed bottom-0 inset-x-0 z-50 px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] pointer-events-none md:hidden"
      >
        <div className="pointer-events-auto mx-auto w-[min(68%,280px)] relative">
          {branchMenuOpen && (
            <div className="absolute bottom-full left-0 right-0 mb-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl overflow-hidden">
              <button
                type="button"
                onClick={() => { setSelectedBranch('all'); setBranchMenuOpen(false); }}
                className={`w-full text-left px-3 py-2.5 text-sm font-semibold ${
                  selectedBranch === 'all'
                    ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-300'
                    : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                All Branches
              </button>
              {branches.map(b => (
                <button
                  key={b.branch.id}
                  type="button"
                  onClick={() => { setSelectedBranch(b.branch.id); setBranchMenuOpen(false); }}
                  className={`w-full text-left px-3 py-2.5 text-sm font-semibold ${
                    String(selectedBranch) === String(b.branch.id)
                      ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-300'
                      : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  {b.branch.name}
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => setBranchMenuOpen(o => !o)}
            className="w-full flex items-center gap-2 pl-3 pr-2.5 py-2.5 rounded-xl bg-indigo-600 text-white font-semibold text-sm shadow-sm hover:bg-indigo-500 active:scale-[0.99] transition"
          >
            <Building2 className="w-4 h-4 text-white/80 shrink-0" />
            <span className="truncate flex-1 text-left text-[13px]">{branchLabel}</span>
            <ChevronDown className={`w-4 h-4 text-white/80 shrink-0 transition-transform ${branchMenuOpen ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>
      )}

      <BranchComparisonModal
        open={branchCompareOpen}
        onClose={() => setBranchCompareOpen(false)}
        initialRange={dateRange}
      />
    </div>
  );
};

const KPI: React.FC<{
  label: string;
  labelFull?: string;
  value: string;
  valueFull?: string;
  sub: string;
  color: string;
  size?: 'hero' | 'compact';
}> = ({ label, labelFull, value, valueFull, sub, color, size = 'compact' }) => {
  const accent: Record<string, string> = {
    indigo: 'text-indigo-400',
    rose: 'text-rose-400',
    emerald: 'text-emerald-400',
    orange: 'text-orange-400',
    amber: 'text-amber-400',
    sky: 'text-sky-400',
    violet: 'text-violet-400',
  };
  const isHero = size === 'hero';
  return (
    <div className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 min-w-0 rounded-xl h-full ${
      isHero ? 'px-3 py-2.5 md:px-4 md:py-3' : 'px-2.5 py-2'
    }`}>
      <span
        className={`font-bold uppercase tracking-wide block truncate ${accent[color] || accent.indigo} ${
          isHero ? 'text-[10px] md:text-xs' : 'text-[9px]'
        }`}
        title={labelFull || label}
      >
        {label}
      </span>
      <div
        className={`font-black leading-none truncate mt-1 tabular-nums ${accent[color] || accent.indigo} ${
          isHero ? 'text-xl md:text-2xl lg:text-3xl' : 'text-sm'
        }`}
        title={valueFull || value}
      >
        {value}
          </div>
      <div className={`truncate mt-1.5 leading-none font-semibold ${accent[color] || accent.indigo} ${isHero ? 'text-[11px] md:text-sm' : 'text-[10px]'}`}>
        {sub}
      </div>
    </div>
  );
};
