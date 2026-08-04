import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  Crown,
  TrendingUp,
  TrendingDown,
  Info,
  Calendar,
  Filter,
  Layers,
  Sparkles,
  Search,
  ArrowUpRight,
  ArrowDownRight,
  ChevronRight,
  HelpCircle,
  Target,
  Loader2
} from 'lucide-react';
import { BranchComparisonData, PopupModalState } from '../../types';
import { fetchBranchComparison } from '../../services/analyticsService';
import { CellBreakdownModal } from './CellBreakdownModal';
import { SingleBranchAuditModal } from '../analytics/SingleBranchAuditModal';

export const COMPARE_METRIC_LABELS = {
  totals: {
    sales: "Total Sales",
    expenses: "Total Expenses",
    profit: "Net Profit",
  },
  windows: {
    samePeriod: "MoM Same Period (3-Day Prior)",
    fullPrevMonth: "MoM Full Month",
    threeMonthAvg: "vs 3-Mo Average",
  },
  sections: {
    sales: "SALES",
    expenses: "EXPENSES",
    profit: "PROFIT",
    mainExpenses: "MAIN EXPENSES",
  },
  mainExpenses: {
    foodLiquor: "Food & Beverage Supplies",
    rent: "Store Rent",
    labor: "Labor & Payroll",
    others: "Utilities & Operations",
  }
};

interface AdminDashboardProps {
  onOpenMenuItemAnalytics?: () => void;
  onOpenAIAdvisor?: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  onOpenMenuItemAnalytics,
  onOpenAIAdvisor,
}) => {
  const [selectedDateRange, setSelectedDateRange] = useState('Jul 1 – Jul 29, 2026');
  const [data, setData] = useState<BranchComparisonData[]>([]);
  const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>([]);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [dataSource, setDataSource] = useState<'api' | 'mock'>('mock');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const liveData = await fetchBranchComparison();
        if (!cancelled && liveData?.length) {
          setData(liveData);
          setSelectedBranchIds(liveData.map(b => b.branch.id));
          setDataSource('api');
          const today = new Date();
          const monthName = today.toLocaleString('en-US', { month: 'short' });
          setSelectedDateRange(`${monthName} 1 – ${monthName} ${today.getDate()}, ${today.getFullYear()}`);
        }
      } catch (err) {
        console.warn('[AdminDashboard] API unavailable, using mock data');
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  // Modal State
  const [modalState, setModalState] = useState<PopupModalState>({
    isOpen: false,
    type: 'comparison',
    title: '',
    metricLabel: '',
    branchName: '',
    branchId: '',
  });

  const activeBranches = data.filter((item) =>
    selectedBranchIds.includes(item.branch.id)
  );

  // Helper formatting
  const formatCurrency = (val: number) =>
    `₱${val.toLocaleString('en-PH', { maximumFractionDigits: 0 })}`;

  // Calculate peer averages for badges
  const avgExpenseRate =
    activeBranches.reduce((acc, b) => acc + b.totals.expenseRate, 0) /
    (activeBranches.length || 1);
  const avgProfitRate =
    activeBranches.reduce((acc, b) => acc + b.totals.profitRate, 0) /
    (activeBranches.length || 1);

  // Row Winners for TOP badges
  // 1. Totals
  const topSalesVal = Math.max(...activeBranches.map((b) => b.totals.sales));
  const topExpensesVal = Math.min(...activeBranches.map((b) => b.totals.expenses)); // lowest is best!
  const topProfitVal = Math.max(...activeBranches.map((b) => b.totals.netProfit));

  // 2. Main Expenses winners (lowest is best)
  const topFoodVal = Math.min(...activeBranches.map((b) => b.mainExpenses.foodLiquor.amount));
  const topRentVal = Math.min(...activeBranches.map((b) => b.mainExpenses.rent.amount));
  const topLaborVal = Math.min(...activeBranches.map((b) => b.mainExpenses.labor.amount));
  const topOthersVal = Math.min(...activeBranches.map((b) => b.mainExpenses.others.amount));

  // Modal Opener Helpers (restoAdmin-style anchored popover)
  const anchorFromEvent = (e: React.MouseEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { top: rect.bottom + 8, left: rect.left };
  };

  const openRateModal = (
    e: React.MouseEvent<HTMLElement>,
    branchName: string,
    branchId: string,
    metricLabel: string,
    amount: number,
    sales: number,
    rate: number,
    categoryName?: string
  ) => {
    e.stopPropagation();
    setModalState({
      isOpen: true,
      type: 'total_rate',
      title: `${metricLabel} 비율 분석 (% of Sales)`,
      metricLabel,
      branchName,
      branchId,
      amount,
      sales,
      rate,
      categoryName,
      anchor: anchorFromEvent(e),
    });
  };

  const openComparisonModal = (
    e: React.MouseEvent<HTMLElement>,
    branchName: string,
    branchId: string,
    metricTitle: string,
    metricLabel: string,
    cellData: {
      currentAmount: number;
      baselineAmount: number;
      indexPercent: number;
      dateRangeCurrent: string;
      dateRangeBaseline: string;
    }
  ) => {
    e.stopPropagation();
    setModalState({
      isOpen: true,
      type: 'comparison',
      title: `${metricTitle} — ${metricLabel}`,
      metricLabel,
      branchName,
      branchId,
      amount: cellData.currentAmount,
      baselineAmount: cellData.baselineAmount,
      indexPercent: cellData.indexPercent,
      dateRangeCurrent: cellData.dateRangeCurrent,
      dateRangeBaseline: cellData.dateRangeBaseline,
      anchor: anchorFromEvent(e),
    });
  };

  const openMainExpenseModal = (
    e: React.MouseEvent<HTMLElement>,
    branchName: string,
    branchId: string,
    categoryLabel: string,
    amount: number,
    sales: number,
    ratio: number
  ) => {
    e.stopPropagation();
    setModalState({
      isOpen: true,
      type: 'main_expense',
      title: `Main Expense Breakdown — ${categoryLabel}`,
      metricLabel: categoryLabel,
      branchName,
      branchId,
      amount,
      sales,
      rate: ratio,
      categoryName: categoryLabel,
      anchor: anchorFromEvent(e),
    });
  };

  return (
    <div className="w-full max-w-7xl mx-auto space-y-5 p-3 sm:p-6 pb-24 text-slate-900 dark:text-slate-100 font-sans">
      {/* Top Header Card */}
      <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
              Branch Comparison Matrix
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5 flex items-center gap-2">
              <span>Multi-Branch Performance & Profitability Matrix</span>
              {loading ? (
                <span className="inline-flex items-center gap-1 text-indigo-500"><Loader2 className="w-3 h-3 animate-spin" /> Loading...</span>
              ) : (
                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${dataSource === 'api' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'}`}>
                  {dataSource === 'api' ? '● LIVE DATABASE' : '● MOCK DATA'}
                </span>
              )}
            </p>
          </div>

          {/* Controls Bar */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setIsAuditModalOpen(true)}
              className="flex items-center space-x-1.5 bg-gradient-to-r from-amber-500 to-indigo-600 hover:from-amber-600 hover:to-indigo-700 text-white px-3 py-1.5 rounded-xl font-extrabold text-xs shadow-sm transition-transform active:scale-95"
            >
              <Target className="w-3.5 h-3.5" />
              <span>Single Branch Audit</span>
            </button>

            {/* Date Range Selector */}
            <div className="flex items-center space-x-1.5 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 font-semibold">
              <Calendar className="w-3.5 h-3.5 text-indigo-500" />
              <span>{selectedDateRange}</span>
            </div>

            {onOpenMenuItemAnalytics && (
              <button
                onClick={onOpenMenuItemAnalytics}
                className="flex items-center space-x-1.5 bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-xl font-semibold text-xs shadow-sm transition-all"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Menu Item Analytics</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Comparison Matrix Container */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-xl border border-slate-200/80 dark:border-slate-800 overflow-hidden">
        {/* Scrollable Matrix Table */}
        <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-700">
          <table className="w-full text-left border-collapse min-w-[700px]">
            {/* Table Header: Branches Columns */}
            <thead>
              <tr className="bg-slate-100/90 dark:bg-slate-800/90 border-b border-slate-200 dark:border-slate-700">
                <th className="p-4 sm:p-5 text-xs font-black uppercase text-slate-500 dark:text-slate-400 sticky left-0 z-20 bg-slate-100 dark:bg-slate-800 w-48 sm:w-60 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                  <div className="flex items-center space-x-2">
                    <Filter className="w-4 h-4 text-indigo-500" />
                    <span>Branches</span>
                  </div>
                </th>
                {activeBranches.map((item) => (
                  <th
                    key={item.branch.id}
                    className="p-4 sm:p-5 text-center text-slate-900 dark:text-white font-bold min-w-[150px] sm:min-w-[180px]"
                  >
                    <div className="flex flex-col items-center">
                      <span className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold tracking-wider">
                        {item.branch.city}
                      </span>
                      <span className="text-sm font-extrabold text-slate-900 dark:text-white">
                        {item.branch.name}
                      </span>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                        {item.branch.manager}
                      </span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs sm:text-sm">
              {/* ========================================================= */}
              {/* 1. TOTALS BLOCK (Top Block) */}
              {/* ========================================================= */}
              
              {/* Row 1: 매출액 (Total Sales) */}
              <tr className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                <td className="p-4 font-bold text-slate-900 dark:text-white sticky left-0 z-10 bg-white dark:bg-slate-900 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                  <div className="flex items-center justify-between">
                    <span>{COMPARE_METRIC_LABELS.totals.sales}</span>
                    <span className="text-[10px] text-slate-400 font-normal">Sales</span>
                  </div>
                </td>
                {activeBranches.map((item) => {
                  const isTop = item.totals.sales === topSalesVal;
                  return (
                    <td key={item.branch.id} className="p-4 text-center">
                      <div className="flex flex-col items-center">
                        {isTop && (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-400 text-slate-950 mb-1 shadow-sm animate-pulse">
                            <Crown className="w-3 h-3 text-slate-950" />
                            <span>TOP</span>
                          </span>
                        )}
                        <span className="font-extrabold text-slate-900 dark:text-white text-sm sm:text-base">
                          {formatCurrency(item.totals.sales)}
                        </span>
                      </div>
                    </td>
                  );
                })}
              </tr>

              {/* Row 2: 비용 (Total Expenses) */}
              <tr className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                <td className="p-4 font-bold text-slate-900 dark:text-white sticky left-0 z-10 bg-white dark:bg-slate-900 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                  <div className="flex items-center justify-between">
                    <span>{COMPARE_METRIC_LABELS.totals.expenses}</span>
                    <span className="text-[10px] text-slate-400 font-normal">Expenses</span>
                  </div>
                </td>
                {activeBranches.map((item) => {
                  const isTop = item.totals.expenses === topExpensesVal; // LOWEST IS BEST
                  const isBelowPeer = item.totals.expenseRate <= avgExpenseRate;
                  return (
                    <td key={item.branch.id} className="p-4 text-center">
                      <div className="flex flex-col items-center">
                        {isTop && (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-400 text-slate-950 mb-1 shadow-sm">
                            <Crown className="w-3 h-3 text-slate-950" />
                            <span>TOP (Lowest)</span>
                          </span>
                        )}
                        <span className="font-bold text-slate-800 dark:text-slate-200">
                          {formatCurrency(item.totals.expenses)}
                        </span>
                        
                        {/* Expense Rate Badge (Clickable Popup) */}
                        <button
                          onClick={(e) =>
                            openRateModal(
                              e,
                              item.branch.name,
                              item.branch.id,
                              'Total Expenses',
                              item.totals.expenses,
                              item.totals.sales,
                              item.totals.expenseRate
                            )
                          }
                          className={`mt-1 inline-flex items-center space-x-1 px-2.5 py-1 rounded-xl text-xs font-bold transition-transform hover:scale-105 active:scale-95 border ${
                            isBelowPeer
                              ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
                              : 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800'
                          }`}
                        >
                          <span>{item.totals.expenseRate.toFixed(1)}%</span>
                          <Info className="w-3 h-3 opacity-60" />
                        </button>
                      </div>
                    </td>
                  );
                })}
              </tr>

              {/* Row 3: 순이익 (Net Profit) */}
              <tr className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors bg-indigo-50/30 dark:bg-indigo-950/20">
                <td className="p-4 font-bold text-slate-900 dark:text-white sticky left-0 z-10 bg-indigo-50/80 dark:bg-slate-900 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                  <div className="flex items-center justify-between">
                    <span className="text-indigo-900 dark:text-indigo-300 font-black">
                      {COMPARE_METRIC_LABELS.totals.profit}
                    </span>
                    <span className="text-[10px] text-indigo-400 font-normal">Profit</span>
                  </div>
                </td>
                {activeBranches.map((item) => {
                  const isTop = item.totals.netProfit === topProfitVal;
                  const isGoodRatio = item.totals.profitRate >= avgProfitRate;
                  return (
                    <td key={item.branch.id} className="p-4 text-center">
                      <div className="flex flex-col items-center">
                        {isTop && (
                          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-400 text-slate-950 mb-1 shadow-sm">
                            <Crown className="w-3 h-3 text-slate-950" />
                            <span>TOP</span>
                          </span>
                        )}
                        <span className="font-black text-indigo-950 dark:text-indigo-200 text-base">
                          {formatCurrency(item.totals.netProfit)}
                        </span>

                        {/* Profit Rate Badge (Clickable Popup) */}
                        <button
                          onClick={(e) =>
                            openRateModal(
                              e,
                              item.branch.name,
                              item.branch.id,
                              'Net Profit',
                              item.totals.netProfit,
                              item.totals.sales,
                              item.totals.profitRate
                            )
                          }
                          className={`mt-1 inline-flex items-center space-x-1 px-2.5 py-1 rounded-xl text-xs font-extrabold transition-transform hover:scale-105 active:scale-95 border ${
                            isGoodRatio
                              ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
                              : 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800'
                          }`}
                        >
                          <span>{item.totals.profitRate.toFixed(1)}%</span>
                          <Info className="w-3 h-3 opacity-60" />
                        </button>
                      </div>
                    </td>
                  );
                })}
              </tr>

              {/* ========================================================= */}
              {/* 2. SALES COMPARISON WINDOWS */}
              {/* ========================================================= */}
              <tr className="bg-slate-100 dark:bg-slate-800/80">
                <td
                  colSpan={activeBranches.length + 1}
                  className="px-4 py-2 text-xs font-black tracking-widest text-slate-600 dark:text-slate-300 uppercase border-y border-slate-200 dark:border-slate-700"
                >
                  ──────── {COMPARE_METRIC_LABELS.sections.sales} ────────
                </td>
              </tr>

              {/* Sales: 전월 동기 대비 (3일전 기준) */}
              <tr className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                <td className="p-4 text-xs font-semibold text-slate-700 dark:text-slate-300 sticky left-0 z-10 bg-white dark:bg-slate-900 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                  {COMPARE_METRIC_LABELS.windows.samePeriod}
                </td>
                {activeBranches.map((item) => {
                  const cell = item.salesWindows.samePeriod;
                  const isUp = cell.indexPercent >= 100;
                  return (
                    <td
                      key={item.branch.id}
                      onClick={(e) =>
                        openComparisonModal(
                          e,
                          item.branch.name,
                          item.branch.id,
                          'SALES',
                          COMPARE_METRIC_LABELS.windows.samePeriod,
                          cell
                        )
                      }
                      className="p-4 text-center cursor-pointer hover:bg-slate-100/50 dark:hover:bg-slate-800/60 transition-colors group"
                    >
                      <div className="flex flex-col items-center">
                        <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                          {formatCurrency(cell.baselineAmount)}
                        </span>
                        <div
                          className={`mt-1 inline-flex items-center space-x-1 font-extrabold text-xs px-2 py-0.5 rounded-lg border ${
                            isUp
                              ? 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800'
                              : 'text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800'
                          }`}
                        >
                          {cell.hasArrow && (
                            isUp ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />
                          )}
                          <span>{cell.indexPercent.toFixed(1)}%</span>
                        </div>
                      </div>
                    </td>
                  );
                })}
              </tr>

              {/* Sales: 전월 대비 */}
              <tr className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                <td className="p-4 text-xs font-semibold text-slate-700 dark:text-slate-300 sticky left-0 z-10 bg-white dark:bg-slate-900 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                  {COMPARE_METRIC_LABELS.windows.fullPrevMonth}
                </td>
                {activeBranches.map((item) => {
                  const cell = item.salesWindows.fullPrevMonth;
                  const isUp = cell.indexPercent >= 100;
                  return (
                    <td
                      key={item.branch.id}
                      onClick={(e) =>
                        openComparisonModal(
                          e,
                          item.branch.name,
                          item.branch.id,
                          'SALES',
                          COMPARE_METRIC_LABELS.windows.fullPrevMonth,
                          cell
                        )
                      }
                      className="p-4 text-center cursor-pointer hover:bg-slate-100/50 dark:hover:bg-slate-800/60 transition-colors"
                    >
                      <div className="flex flex-col items-center">
                        <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                          {formatCurrency(cell.baselineAmount)}
                        </span>
                        <span
                          className={`mt-1 font-extrabold text-xs px-2 py-0.5 rounded-lg border ${
                            isUp
                              ? 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800'
                              : 'text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800'
                          }`}
                        >
                          {cell.indexPercent.toFixed(1)}%
                        </span>
                      </div>
                    </td>
                  );
                })}
              </tr>

              {/* Sales: 평균 대비 */}
              <tr className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                <td className="p-4 text-xs font-semibold text-slate-700 dark:text-slate-300 sticky left-0 z-10 bg-white dark:bg-slate-900 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                  {COMPARE_METRIC_LABELS.windows.threeMonthAvg}
                </td>
                {activeBranches.map((item) => {
                  const cell = item.salesWindows.threeMonthAvg;
                  const isUp = cell.indexPercent >= 100;
                  return (
                    <td
                      key={item.branch.id}
                      onClick={(e) =>
                        openComparisonModal(
                          e,
                          item.branch.name,
                          item.branch.id,
                          'SALES',
                          COMPARE_METRIC_LABELS.windows.threeMonthAvg,
                          cell
                        )
                      }
                      className="p-4 text-center cursor-pointer hover:bg-slate-100/50 dark:hover:bg-slate-800/60 transition-colors"
                    >
                      <div className="flex flex-col items-center">
                        <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                          {formatCurrency(cell.baselineAmount)}
                        </span>
                        <span
                          className={`mt-1 font-extrabold text-xs px-2 py-0.5 rounded-lg border ${
                            isUp
                              ? 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800'
                              : 'text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800'
                          }`}
                        >
                          {cell.indexPercent.toFixed(1)}%
                        </span>
                      </div>
                    </td>
                  );
                })}
              </tr>

              {/* ========================================================= */}
              {/* 3. EXPENSES COMPARISON WINDOWS */}
              {/* ========================================================= */}
              <tr className="bg-slate-100 dark:bg-slate-800/80">
                <td
                  colSpan={activeBranches.length + 1}
                  className="px-4 py-2 text-xs font-black tracking-widest text-slate-600 dark:text-slate-300 uppercase border-y border-slate-200 dark:border-slate-700"
                >
                  ──────── {COMPARE_METRIC_LABELS.sections.expenses} ────────
                </td>
              </tr>

              {/* Expenses: 전월 동기 대비 (3일전 기준) */}
              <tr className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                <td className="p-4 text-xs font-semibold text-slate-700 dark:text-slate-300 sticky left-0 z-10 bg-white dark:bg-slate-900 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                  {COMPARE_METRIC_LABELS.windows.samePeriod}
                </td>
                {activeBranches.map((item) => {
                  const cell = item.expensesWindows.samePeriod;
                  // Inverted logic: lower expense (index <= 100) is green!
                  const isGoodExpense = cell.indexPercent <= 100;
                  return (
                    <td
                      key={item.branch.id}
                      onClick={(e) =>
                        openComparisonModal(
                          e,
                          item.branch.name,
                          item.branch.id,
                          'EXPENSES',
                          COMPARE_METRIC_LABELS.windows.samePeriod,
                          cell
                        )
                      }
                      className="p-4 text-center cursor-pointer hover:bg-slate-100/50 dark:hover:bg-slate-800/60 transition-colors"
                    >
                      <div className="flex flex-col items-center">
                        <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                          {formatCurrency(cell.baselineAmount)}
                        </span>
                        <div
                          className={`mt-1 inline-flex items-center space-x-1 font-extrabold text-xs px-2 py-0.5 rounded-lg border ${
                            isGoodExpense
                              ? 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800'
                              : 'text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800'
                          }`}
                        >
                          {cell.hasArrow && (
                            cell.arrowDirection === 'up' ? (
                              <ArrowUpRight className="w-3.5 h-3.5" />
                            ) : (
                              <ArrowDownRight className="w-3.5 h-3.5" />
                            )
                          )}
                          <span>{cell.indexPercent.toFixed(1)}%</span>
                        </div>
                      </div>
                    </td>
                  );
                })}
              </tr>

              {/* Expenses: 전월 대비 */}
              <tr className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                <td className="p-4 text-xs font-semibold text-slate-700 dark:text-slate-300 sticky left-0 z-10 bg-white dark:bg-slate-900 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                  {COMPARE_METRIC_LABELS.windows.fullPrevMonth}
                </td>
                {activeBranches.map((item) => {
                  const cell = item.expensesWindows.fullPrevMonth;
                  const isGoodExpense = cell.indexPercent <= 100;
                  return (
                    <td
                      key={item.branch.id}
                      onClick={(e) =>
                        openComparisonModal(
                          e,
                          item.branch.name,
                          item.branch.id,
                          'EXPENSES',
                          COMPARE_METRIC_LABELS.windows.fullPrevMonth,
                          cell
                        )
                      }
                      className="p-4 text-center cursor-pointer hover:bg-slate-100/50 dark:hover:bg-slate-800/60 transition-colors"
                    >
                      <div className="flex flex-col items-center">
                        <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                          {formatCurrency(cell.baselineAmount)}
                        </span>
                        <span
                          className={`mt-1 font-extrabold text-xs px-2 py-0.5 rounded-lg border ${
                            isGoodExpense
                              ? 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800'
                              : 'text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800'
                          }`}
                        >
                          {cell.indexPercent.toFixed(1)}%
                        </span>
                      </div>
                    </td>
                  );
                })}
              </tr>

              {/* Expenses: 평균 대비 */}
              <tr className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                <td className="p-4 text-xs font-semibold text-slate-700 dark:text-slate-300 sticky left-0 z-10 bg-white dark:bg-slate-900 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                  {COMPARE_METRIC_LABELS.windows.threeMonthAvg}
                </td>
                {activeBranches.map((item) => {
                  const cell = item.expensesWindows.threeMonthAvg;
                  const isGoodExpense = cell.indexPercent <= 100;
                  return (
                    <td
                      key={item.branch.id}
                      onClick={(e) =>
                        openComparisonModal(
                          e,
                          item.branch.name,
                          item.branch.id,
                          'EXPENSES',
                          COMPARE_METRIC_LABELS.windows.threeMonthAvg,
                          cell
                        )
                      }
                      className="p-4 text-center cursor-pointer hover:bg-slate-100/50 dark:hover:bg-slate-800/60 transition-colors"
                    >
                      <div className="flex flex-col items-center">
                        <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                          {formatCurrency(cell.baselineAmount)}
                        </span>
                        <span
                          className={`mt-1 font-extrabold text-xs px-2 py-0.5 rounded-lg border ${
                            isGoodExpense
                              ? 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800'
                              : 'text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800'
                          }`}
                        >
                          {cell.indexPercent.toFixed(1)}%
                        </span>
                      </div>
                    </td>
                  );
                })}
              </tr>

              {/* ========================================================= */}
              {/* 4. PROFIT COMPARISON WINDOWS */}
              {/* ========================================================= */}
              <tr className="bg-slate-100 dark:bg-slate-800/80">
                <td
                  colSpan={activeBranches.length + 1}
                  className="px-4 py-2 text-xs font-black tracking-widest text-slate-600 dark:text-slate-300 uppercase border-y border-slate-200 dark:border-slate-700"
                >
                  ──────── {COMPARE_METRIC_LABELS.sections.profit} ────────
                </td>
              </tr>

              {/* Profit: 전월 동기 대비 (3일전 기준) */}
              <tr className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                <td className="p-4 text-xs font-semibold text-slate-700 dark:text-slate-300 sticky left-0 z-10 bg-white dark:bg-slate-900 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                  {COMPARE_METRIC_LABELS.windows.samePeriod}
                </td>
                {activeBranches.map((item) => {
                  const cell = item.profitWindows.samePeriod;
                  const isUp = cell.indexPercent >= 100;
                  return (
                    <td
                      key={item.branch.id}
                      onClick={(e) =>
                        openComparisonModal(
                          e,
                          item.branch.name,
                          item.branch.id,
                          'PROFIT',
                          COMPARE_METRIC_LABELS.windows.samePeriod,
                          cell
                        )
                      }
                      className="p-4 text-center cursor-pointer hover:bg-slate-100/50 dark:hover:bg-slate-800/60 transition-colors"
                    >
                      <div className="flex flex-col items-center">
                        <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                          {formatCurrency(cell.baselineAmount)}
                        </span>
                        <div
                          className={`mt-1 inline-flex items-center space-x-1 font-extrabold text-xs px-2 py-0.5 rounded-lg border ${
                            isUp
                              ? 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800'
                              : 'text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800'
                          }`}
                        >
                          {cell.hasArrow && (
                            isUp ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />
                          )}
                          <span>{cell.indexPercent.toFixed(1)}%</span>
                        </div>
                      </div>
                    </td>
                  );
                })}
              </tr>

              {/* Profit: 전월 대비 */}
              <tr className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                <td className="p-4 text-xs font-semibold text-slate-700 dark:text-slate-300 sticky left-0 z-10 bg-white dark:bg-slate-900 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                  {COMPARE_METRIC_LABELS.windows.fullPrevMonth}
                </td>
                {activeBranches.map((item) => {
                  const cell = item.profitWindows.fullPrevMonth;
                  const isUp = cell.indexPercent >= 100;
                  return (
                    <td
                      key={item.branch.id}
                      onClick={(e) =>
                        openComparisonModal(
                          e,
                          item.branch.name,
                          item.branch.id,
                          'PROFIT',
                          COMPARE_METRIC_LABELS.windows.fullPrevMonth,
                          cell
                        )
                      }
                      className="p-4 text-center cursor-pointer hover:bg-slate-100/50 dark:hover:bg-slate-800/60 transition-colors"
                    >
                      <div className="flex flex-col items-center">
                        <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                          {formatCurrency(cell.baselineAmount)}
                        </span>
                        <span
                          className={`mt-1 font-extrabold text-xs px-2 py-0.5 rounded-lg border ${
                            isUp
                              ? 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800'
                              : 'text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800'
                          }`}
                        >
                          {cell.indexPercent.toFixed(1)}%
                        </span>
                      </div>
                    </td>
                  );
                })}
              </tr>

              {/* Profit: 평균 대비 */}
              <tr className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                <td className="p-4 text-xs font-semibold text-slate-700 dark:text-slate-300 sticky left-0 z-10 bg-white dark:bg-slate-900 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                  {COMPARE_METRIC_LABELS.windows.threeMonthAvg}
                </td>
                {activeBranches.map((item) => {
                  const cell = item.profitWindows.threeMonthAvg;
                  const isUp = cell.indexPercent >= 100;
                  return (
                    <td
                      key={item.branch.id}
                      onClick={(e) =>
                        openComparisonModal(
                          e,
                          item.branch.name,
                          item.branch.id,
                          'PROFIT',
                          COMPARE_METRIC_LABELS.windows.threeMonthAvg,
                          cell
                        )
                      }
                      className="p-4 text-center cursor-pointer hover:bg-slate-100/50 dark:hover:bg-slate-800/60 transition-colors"
                    >
                      <div className="flex flex-col items-center">
                        <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                          {formatCurrency(cell.baselineAmount)}
                        </span>
                        <span
                          className={`mt-1 font-extrabold text-xs px-2 py-0.5 rounded-lg border ${
                            isUp
                              ? 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800'
                              : 'text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800'
                          }`}
                        >
                          {cell.indexPercent.toFixed(1)}%
                        </span>
                      </div>
                    </td>
                  );
                })}
              </tr>

              {/* ========================================================= */}
              {/* 5. MAIN EXPENSES BREAKDOWN */}
              {/* ========================================================= */}
              <tr className="bg-slate-100 dark:bg-slate-800/80">
                <td
                  colSpan={activeBranches.length + 1}
                  className="px-4 py-2 text-xs font-black tracking-widest text-slate-600 dark:text-slate-300 uppercase border-y border-slate-200 dark:border-slate-700"
                >
                  ──────── {COMPARE_METRIC_LABELS.sections.mainExpenses} ────────
                </td>
              </tr>

              {/* Category 1: 식자재 및 주류 (Food Supplies & Liquor) */}
              <tr className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                <td className="p-4 text-xs font-semibold text-slate-700 dark:text-slate-300 sticky left-0 z-10 bg-white dark:bg-slate-900 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                  {COMPARE_METRIC_LABELS.mainExpenses.foodLiquor}
                </td>
                {activeBranches.map((item) => {
                  const category = item.mainExpenses.foodLiquor;
                  const isTop = category.amount === topFoodVal; // Lowest expense wins
                  return (
                    <td
                      key={item.branch.id}
                      onClick={(e) =>
                        openMainExpenseModal(
                          e,
                          item.branch.name,
                          item.branch.id,
                          COMPARE_METRIC_LABELS.mainExpenses.foodLiquor,
                          category.amount,
                          item.totals.sales,
                          category.ratioOfSales
                        )
                      }
                      className="p-4 text-center cursor-pointer hover:bg-slate-100/50 dark:hover:bg-slate-800/60 transition-colors"
                    >
                      <div className="flex flex-col items-center">
                        {isTop && (
                          <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded-md text-[9px] font-black bg-emerald-400 text-slate-950 mb-0.5">
                            <Crown className="w-2.5 h-2.5 text-slate-950" />
                            <span>TOP</span>
                          </span>
                        )}
                        <span className="font-bold text-slate-900 dark:text-white text-xs sm:text-sm">
                          {formatCurrency(category.amount)}
                        </span>
                        <span className="text-[11px] text-slate-500 font-semibold mt-0.5">
                          ({category.ratioOfSales.toFixed(1)}%)
                        </span>
                      </div>
                    </td>
                  );
                })}
              </tr>

              {/* Category 2: 임대료 (Rent) */}
              <tr className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                <td className="p-4 text-xs font-semibold text-slate-700 dark:text-slate-300 sticky left-0 z-10 bg-white dark:bg-slate-900 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                  {COMPARE_METRIC_LABELS.mainExpenses.rent}
                </td>
                {activeBranches.map((item) => {
                  const category = item.mainExpenses.rent;
                  const isTop = category.amount === topRentVal;
                  return (
                    <td
                      key={item.branch.id}
                      onClick={(e) =>
                        openMainExpenseModal(
                          e,
                          item.branch.name,
                          item.branch.id,
                          COMPARE_METRIC_LABELS.mainExpenses.rent,
                          category.amount,
                          item.totals.sales,
                          category.ratioOfSales
                        )
                      }
                      className="p-4 text-center cursor-pointer hover:bg-slate-100/50 dark:hover:bg-slate-800/60 transition-colors"
                    >
                      <div className="flex flex-col items-center">
                        {isTop && (
                          <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded-md text-[9px] font-black bg-emerald-400 text-slate-950 mb-0.5">
                            <Crown className="w-2.5 h-2.5 text-slate-950" />
                            <span>TOP</span>
                          </span>
                        )}
                        <span className="font-bold text-slate-900 dark:text-white text-xs sm:text-sm">
                          {formatCurrency(category.amount)}
                        </span>
                        <span className="text-[11px] text-slate-500 font-semibold mt-0.5">
                          ({category.ratioOfSales.toFixed(1)}%)
                        </span>
                      </div>
                    </td>
                  );
                })}
              </tr>

              {/* Category 3: 급여 (Labor) */}
              <tr className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                <td className="p-4 text-xs font-semibold text-slate-700 dark:text-slate-300 sticky left-0 z-10 bg-white dark:bg-slate-900 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                  {COMPARE_METRIC_LABELS.mainExpenses.labor}
                </td>
                {activeBranches.map((item) => {
                  const category = item.mainExpenses.labor;
                  const isTop = category.amount === topLaborVal;
                  return (
                    <td
                      key={item.branch.id}
                      onClick={(e) =>
                        openMainExpenseModal(
                          e,
                          item.branch.name,
                          item.branch.id,
                          COMPARE_METRIC_LABELS.mainExpenses.labor,
                          category.amount,
                          item.totals.sales,
                          category.ratioOfSales
                        )
                      }
                      className="p-4 text-center cursor-pointer hover:bg-slate-100/50 dark:hover:bg-slate-800/60 transition-colors"
                    >
                      <div className="flex flex-col items-center">
                        {isTop && (
                          <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded-md text-[9px] font-black bg-emerald-400 text-slate-950 mb-0.5">
                            <Crown className="w-2.5 h-2.5 text-slate-950" />
                            <span>TOP</span>
                          </span>
                        )}
                        <span className="font-bold text-slate-900 dark:text-white text-xs sm:text-sm">
                          {formatCurrency(category.amount)}
                        </span>
                        <span className="text-[11px] text-slate-500 font-semibold mt-0.5">
                          ({category.ratioOfSales.toFixed(1)}%)
                        </span>
                      </div>
                    </td>
                  );
                })}
              </tr>

              {/* Category 4: 그밖에 (Others) */}
              <tr className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                <td className="p-4 text-xs font-semibold text-slate-700 dark:text-slate-300 sticky left-0 z-10 bg-white dark:bg-slate-900 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                  {COMPARE_METRIC_LABELS.mainExpenses.others}
                </td>
                {activeBranches.map((item) => {
                  const category = item.mainExpenses.others;
                  const isTop = category.amount === topOthersVal;
                  return (
                    <td
                      key={item.branch.id}
                      onClick={(e) =>
                        openMainExpenseModal(
                          e,
                          item.branch.name,
                          item.branch.id,
                          COMPARE_METRIC_LABELS.mainExpenses.others,
                          category.amount,
                          item.totals.sales,
                          category.ratioOfSales
                        )
                      }
                      className="p-4 text-center cursor-pointer hover:bg-slate-100/50 dark:hover:bg-slate-800/60 transition-colors"
                    >
                      <div className="flex flex-col items-center">
                        {isTop && (
                          <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded-md text-[9px] font-black bg-emerald-400 text-slate-950 mb-0.5">
                            <Crown className="w-2.5 h-2.5 text-slate-950" />
                            <span>TOP</span>
                          </span>
                        )}
                        <span className="font-bold text-slate-900 dark:text-white text-xs sm:text-sm">
                          {formatCurrency(category.amount)}
                        </span>
                        <span className="text-[11px] text-slate-500 font-semibold mt-0.5">
                          ({category.ratioOfSales.toFixed(1)}%)
                        </span>
                      </div>
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>

        {/* Matrix Explanatory Footer Bar */}
        <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between text-xs text-slate-500 dark:text-slate-400 gap-2">
          <div className="flex items-center space-x-2">
            <Info className="w-4 h-4 text-indigo-500" />
            <span>
              Click any cell or % badge to inspect calculation formulas & baseline date windows.
            </span>
          </div>
          <div className="flex items-center space-x-3 text-[11px]">
            <span className="flex items-center space-x-1">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
              <span>Positive Performance (≥100% or Low Expense)</span>
            </span>
            <span className="flex items-center space-x-1">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" />
              <span>Contraction / High Expense Ratio</span>
            </span>
          </div>
        </div>
      </div>

      {/* Popup Breakdown Modal */}
      <CellBreakdownModal
        modalState={modalState}
        onClose={() => setModalState({ ...modalState, isOpen: false })}
      />

      {/* Single Branch Improvement Audit Modal */}
      <SingleBranchAuditModal
        isOpen={isAuditModalOpen}
        onClose={() => setIsAuditModalOpen(false)}
        defaultBranchId="branch-1"
      />
    </div>
  );
};
