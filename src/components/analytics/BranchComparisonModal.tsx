import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Calendar, ChevronLeft, ChevronRight,
  Info, Loader2, TrendingDown, TrendingUp, X,
} from 'lucide-react';
import {
  fetchBranchComparisonBoard, formatFullPeso, formatPeso, getCurrentMonthRange, getMonthRange,
  type DateRange,
} from '../../services/analyticsService';
import { BranchComparisonData, ComparisonWindowCell, PopupModalState } from '../../types';
import { CellBreakdownModal } from '../dashboard/CellBreakdownModal';
import { ModalPortal } from '../layout/ModalPortal';
import {
  COMPARE_METRIC_LABELS,
  formatMonthChooserLabel,
  formatYmdRangeLabel,
} from '../../utils/branchComparison';
import { resolveBranchLogoUrl } from '../../utils/branchLogo';

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

interface Props {
  open: boolean;
  onClose: () => void;
  initialRange?: DateRange;
}

function shortName(name: string) {
  return name
    .replace(/\s+Restaurant$/i, '')
    .replace(/^Kim'?s\s+Brothers$/i, "Kim's")
    .replace(/^PRIME BBQ$/i, 'PRIME')
    .replace(/^EESOME CAFE$/i, 'EESOME')
    .replace(/^KumHo$/i, 'KumHo');
}

/** Mobile: compact ₱K/M · Desktop: full peso (no shortcut). */
function MoneyText({
  n,
  className,
}: {
  n: number;
  className?: string;
}) {
  return (
    <span className={className} title={formatFullPeso(n)}>
      <span className="md:hidden">{formatPeso(n)}</span>
      <span className="hidden md:inline whitespace-nowrap">{formatFullPeso(n)}</span>
    </span>
  );
}

function BranchLogo({
  name,
  logo,
  className = 'w-6 h-6 md:w-12 md:h-12',
}: {
  name: string;
  logo?: string | null;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const url = resolveBranchLogoUrl(logo, name);
  const show = Boolean(url) && !failed;

  useEffect(() => {
    setFailed(false);
  }, [url]);

  return (
    <span
      className={`${className} rounded-full bg-white border border-slate-600 overflow-hidden flex items-center justify-center shrink-0`}
      title={name}
    >
      {show ? (
        <img
          src={url!}
          alt=""
          className="w-full h-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="text-[9px] md:text-base font-black uppercase text-indigo-600 dark:text-indigo-300 bg-slate-100 dark:bg-slate-800 w-full h-full flex items-center justify-center">
          {name.trim().charAt(0) || '?'}
        </span>
      )}
    </span>
  );
}

/** restoAdmin peer-avg pill: ≥ peers avg = green, else amber (same for expense & profit %). */
function PeerPctBadge({
  pct,
  peersAvg,
  onClick,
}: {
  pct: number;
  peersAvg: number;
  onClick: (e: React.MouseEvent<HTMLElement>) => void;
}) {
  const safe = Number.isFinite(pct) ? Math.max(0, pct) : 0;
  const aboveAvg = safe >= peersAvg;
  const tone = aboveAvg
    ? 'bg-emerald-500/15 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400'
    : 'bg-amber-500/15 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[8px] md:text-[11px] font-bold tabular-nums ${tone}`}
      title="% of sales vs peer average"
    >
      {safe.toFixed(1)}%
      <Info className="w-2.5 h-2.5 opacity-60" />
    </button>
  );
}

/**
 * restoAdmin comparison cell:
 * - amount = neutral
 * - % text green (good) / red (bad) — expenses already inverted in `sentiment`
 * - arrow only when hasArrow (전월 동기)
 */
function WindowCellView({
  cell,
  onClick,
}: {
  cell: ComparisonWindowCell;
  onClick: (e: React.MouseEvent<HTMLElement>) => void;
}) {
  const pctTone =
    cell.sentiment === 'neutral'
      ? 'text-slate-500'
      : cell.sentiment === 'positive'
        ? 'text-emerald-600 dark:text-emerald-400'
        : 'text-red-600 dark:text-red-400';

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex flex-col items-center md:items-start gap-0.5 text-center md:text-left active:bg-slate-100 dark:active:bg-slate-800/80 rounded-md px-0.5 py-0.5 transition min-w-0"
    >
      <MoneyText
        n={cell.baselineAmount}
        className="text-[10px] md:text-sm font-semibold text-slate-800 dark:text-slate-200 tabular-nums max-w-full md:whitespace-nowrap"
      />
      {cell.sentiment === 'neutral' ? (
        <span className="text-[8px] md:text-[11px] font-medium text-slate-500">—</span>
      ) : (
        <span className={`inline-flex items-center gap-0.5 text-[8px] md:text-[11px] font-medium tabular-nums ${pctTone}`}>
          {cell.hasArrow && (
            cell.arrowDirection === 'up'
              ? <TrendingUp className="w-2.5 h-2.5 md:w-3 md:h-3 shrink-0" />
              : <TrendingDown className="w-2.5 h-2.5 md:w-3 md:h-3 shrink-0" />
          )}
          ({cell.indexPercent.toFixed(1)}%)
        </span>
      )}
    </button>
  );
}

export const BranchComparisonModal: React.FC<Props> = ({ open, onClose, initialRange }) => {
  const [range, setRange] = useState<DateRange>(() => initialRange || getCurrentMonthRange());
  const [data, setData] = useState<BranchComparisonData[]>([]);
  const [loading, setLoading] = useState(false);
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(() => new Date().getFullYear());
  const pickerRef = useRef<HTMLDivElement>(null);
  const fitWrapRef = useRef<HTMLDivElement>(null);
  const fitContentRef = useRef<HTMLDivElement>(null);
  const [fitScale, setFitScale] = useState(1);

  const [modalState, setModalState] = useState<PopupModalState>({
    isOpen: false,
    type: 'comparison',
    title: '',
    metricLabel: '',
    branchName: '',
    branchId: '',
  });

  const today = new Date();
  const maxYear = today.getFullYear();

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setRange(initialRange || getCurrentMonthRange());
  }, [open, initialRange?.start_date, initialRange?.end_date]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const rows = await fetchBranchComparisonBoard(range);
        if (!cancelled) setData(rows || []);
      } catch {
        if (!cancelled) setData([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, range.start_date, range.end_date]);

  useEffect(() => {
    if (!monthPickerOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!pickerRef.current?.contains(e.target as Node)) setMonthPickerOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [monthPickerOpen]);

  /** Scale board on very short mobile viewports only; always allow vertical scroll so Main Expenses rows stay reachable. */
  useLayoutEffect(() => {
    if (!open || loading) return;
    const wrap = fitWrapRef.current;
    const content = fitContentRef.current;
    if (!wrap || !content) return;

    const fit = () => {
      // Desktop & normal phones: full size + vertical scroll (all Main Expenses rows visible)
      if (window.matchMedia('(min-width: 768px)').matches) {
        setFitScale(1);
        return;
      }
      content.style.transform = 'none';
      const sh = Math.max(content.scrollHeight, 1);
      const room = wrap.clientHeight;
      // Only gentle shrink if content is slightly taller; never clip rows — parent still scrolls
      if (room > 0 && sh > room * 1.35) {
        const s = Math.max(0.82, Math.min(room / sh, 1));
        setFitScale(Number.isFinite(s) ? s : 1);
      } else {
        setFitScale(1);
      }
    };

    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);
    ro.observe(content);
    window.addEventListener('resize', fit);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', fit);
    };
  }, [open, loading, data, range.start_date]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (modalState.isOpen) setModalState((s) => ({ ...s, isOpen: false }));
        else onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, modalState.isOpen]);

  const avgExpenseRate = useMemo(
    () => data.reduce((s, b) => s + b.totals.expenseRate, 0) / (data.length || 1),
    [data],
  );
  const avgProfitRate = useMemo(
    () => data.reduce((s, b) => s + b.totals.profitRate, 0) / (data.length || 1),
    [data],
  );

  const subtitle = useMemo(() => {
    if (data.length <= 2) return data.map((b) => shortName(b.branch.name)).join(' vs ') || '—';
    return `${data.slice(0, 2).map((b) => shortName(b.branch.name)).join(' vs ')} +${data.length - 2}`;
  }, [data]);

  const monthLabel = formatMonthChooserLabel(range.start_date, range.end_date);

  const pickMonth = (year: number, monthIndex: number) => {
    setRange(getMonthRange(year, monthIndex));
    setMonthPickerOpen(false);
  };

  const isMonthDisabled = (year: number, monthIndex: number) => {
    if (year > today.getFullYear()) return true;
    if (year === today.getFullYear() && monthIndex > today.getMonth()) return true;
    return false;
  };

  const anchorFromEvent = (e: React.MouseEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { top: rect.bottom + 8, left: rect.left };
  };

  const openRate = (
    e: React.MouseEvent<HTMLElement>,
    branchName: string,
    branchId: string,
    metricLabel: string,
    amount: number,
    sales: number,
    rate: number,
    categoryName?: string,
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
      dateRangeCurrent: formatYmdRangeLabel({ start: range.start_date, end: range.end_date }),
      anchor: anchorFromEvent(e),
    });
  };

  const openComparison = (
    e: React.MouseEvent<HTMLElement>,
    branchName: string,
    branchId: string,
    metricTitle: string,
    metricLabel: string,
    cell: ComparisonWindowCell,
    invertSentiment = false,
  ) => {
    e.stopPropagation();
    setModalState({
      isOpen: true,
      type: 'comparison',
      title: `${metricTitle} — ${metricLabel}`,
      metricLabel,
      branchName,
      branchId,
      amount: cell.currentAmount,
      baselineAmount: cell.baselineAmount,
      indexPercent: cell.indexPercent,
      dateRangeCurrent: cell.dateRangeCurrent,
      dateRangeBaseline: cell.dateRangeBaseline,
      invertSentiment,
      anchor: anchorFromEvent(e),
    });
  };

  const openMainExpense = (
    e: React.MouseEvent<HTMLElement>,
    branchName: string,
    branchId: string,
    categoryLabel: string,
    amount: number,
    sales: number,
    ratio: number,
  ) => {
    e.stopPropagation();
    setModalState({
      isOpen: true,
      type: 'main_expense',
      title: `Main Expense — ${categoryLabel}`,
      metricLabel: categoryLabel,
      branchName,
      branchId,
      amount,
      sales,
      rate: ratio,
      categoryName: categoryLabel,
      dateRangeCurrent: formatYmdRangeLabel({ start: range.start_date, end: range.end_date }),
      anchor: anchorFromEvent(e),
    });
  };

  if (!open) return null;

  const colCount = Math.max(data.length, 1);
  const metricSticky =
    'sticky left-0 z-10 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 px-1 md:px-2 py-1 text-[9px] md:text-[11px] font-semibold leading-tight';

  return (
    <ModalPortal>
      <>
        <div
          className="fixed inset-0 z-[70] flex items-stretch md:items-center justify-center p-0 md:p-3 lg:p-5 bg-slate-950/50 dark:bg-slate-950/90 backdrop-blur-md"
          onClick={onClose}
        >
          <div
            className="w-screen max-w-[100vw] h-[100dvh] md:h-[min(96dvh,1080px)] md:w-[min(99vw,1800px)] md:max-w-[1800px] flex flex-col bg-white dark:bg-slate-900 rounded-none md:rounded-2xl shadow-2xl border-0 md:border md:border-slate-200 dark:md:border-slate-700/80 overflow-hidden pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="shrink-0 px-3 md:px-5 pt-3 md:pt-4 pb-2.5 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-start justify-between gap-2 min-w-0">
                <div className="min-w-0 flex-1">
                  <div className="text-[9px] md:text-[10px] font-bold uppercase tracking-widest text-amber-500 dark:text-amber-400">
                    Branch Comparison
                  </div>
                  <h2 className="text-base md:text-xl font-bold text-slate-900 dark:text-white tracking-tight mt-0.5 truncate">
                    Multi-Branch Board
                  </h2>
                  <p className="text-[11px] md:text-sm text-slate-500 font-medium mt-0.5 truncate">
                    {subtitle}
                  </p>
                </div>

                <div className="flex items-start gap-1.5 shrink-0">
                  <div className="relative" ref={pickerRef}>
                    <button
                      type="button"
                      onClick={() => {
                        const d = new Date(`${range.start_date}T12:00:00`);
                        setPickerYear(d.getFullYear());
                        setMonthPickerOpen((o) => !o);
                      }}
                      className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-[11px] md:text-xs font-semibold text-slate-700 dark:text-slate-200"
                    >
                      <Calendar className="w-3.5 h-3.5 text-sky-500 dark:text-sky-400 shrink-0" />
                      <span className="tabular-nums whitespace-nowrap">{monthLabel}</span>
                    </button>

                    {monthPickerOpen && (
                      <div className="absolute right-0 top-full mt-1.5 z-50 w-[min(16rem,70vw)] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl p-3">
                        <div className="flex items-center justify-between mb-2">
                          <button type="button" onClick={() => setPickerYear((y) => y - 1)} className="p-1.5 rounded-md text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Previous year">
                            <ChevronLeft className="w-4 h-4" />
                          </button>
                          <span className="text-sm font-bold text-slate-900 dark:text-white tabular-nums">{pickerYear}</span>
                          <button type="button" onClick={() => setPickerYear((y) => Math.min(maxYear, y + 1))} disabled={pickerYear >= maxYear} className="p-1.5 rounded-md text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30" aria-label="Next year">
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="grid grid-cols-3 gap-1">
                          {MONTH_SHORT.map((m, i) => {
                            const start = new Date(`${range.start_date}T12:00:00`);
                            const selected = start.getFullYear() === pickerYear && start.getMonth() === i;
                            const disabled = isMonthDisabled(pickerYear, i);
                            return (
                              <button
                                key={m}
                                type="button"
                                disabled={disabled}
                                onClick={() => pickMonth(pickerYear, i)}
                                className={`py-2.5 rounded-lg text-xs font-bold ${
                                  selected
                                    ? 'bg-indigo-600 text-white'
                                    : disabled
                                      ? 'text-slate-300 dark:text-slate-600'
                                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                                }`}
                              >
                                {m}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={onClose}
                    className="p-2 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-white shrink-0"
                    aria-label="Close"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Table — scale-to-fit so desktop has no side/down scroll */}
            <div
              ref={fitWrapRef}
              className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain [-webkit-overflow-scrolling:touch]"
            >
              {loading ? (
                <div className="flex items-center justify-center h-full py-24 text-indigo-400 gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="text-sm font-semibold">Loading…</span>
                </div>
              ) : data.length === 0 ? (
                <div className="flex items-center justify-center h-full py-24 text-slate-500 text-sm px-4 text-center">
                  No branch data for this month.
                </div>
              ) : (
                <div
                  ref={fitContentRef}
                  className="origin-top-left w-full"
                  style={{ transform: `scale(${fitScale})` }}
                >
                <table className="w-full text-left border-collapse table-fixed">
                  <colgroup>
                    <col className="w-[18%] md:w-[16%]" />
                    {data.map((item) => (
                      <col key={item.branch.id} />
                    ))}
                  </colgroup>
                  <thead className="bg-white dark:bg-slate-900">
                    <tr className="border-b border-slate-200 dark:border-slate-800">
                      <th className="sticky left-0 z-30 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 px-1 md:px-3 py-2 md:py-3 text-[8px] md:text-xs font-bold uppercase tracking-wide text-indigo-600 dark:text-indigo-300">
                        Comparison Metric
                      </th>
                      {data.map((item) => (
                        <th
                          key={item.branch.id}
                          className="px-0.5 md:px-3 py-1.5 md:py-3 text-center md:text-left border-l border-slate-200/80 dark:border-slate-800/80"
                        >
                          {/* Mobile: logo above name · Desktop: logo left + name right */}
                          <div className="flex flex-col md:flex-row items-center md:items-center justify-center md:justify-start gap-0.5 md:gap-2.5 min-w-0">
                            <BranchLogo name={item.branch.name} logo={item.branch.logo} />
                            <span
                              className="text-[8px] md:text-sm lg:text-base font-bold text-slate-900 dark:text-white leading-tight line-clamp-2 md:line-clamp-2 px-0.5 min-w-0 md:text-left"
                              title={item.branch.name}
                            >
                              <span className="md:hidden">{shortName(item.branch.name)}</span>
                              <span className="hidden md:inline">{item.branch.name}</span>
                            </span>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody>
                    <tr className="border-b border-slate-200/80 dark:border-slate-800/80">
                      <td className={`${metricSticky} text-slate-600 dark:text-slate-300`}>{COMPARE_METRIC_LABELS.totalSales}</td>
                      {data.map((item) => (
                        <td key={item.branch.id} className="px-0.5 md:px-3 py-1.5 md:py-2 border-l border-slate-200/60 dark:border-slate-800/60 align-top">
                          <div className="flex flex-col items-center md:items-start gap-0.5 min-w-0">
                            <MoneyText
                              n={item.totals.sales}
                              className="text-[10px] md:text-sm font-bold text-sky-600 dark:text-sky-400 tabular-nums max-w-full md:whitespace-nowrap"
                            />
                          </div>
                        </td>
                      ))}
                    </tr>

                    <tr className="border-b border-slate-200/80 dark:border-slate-800/80">
                      <td className={`${metricSticky} text-orange-500 dark:text-orange-400`}>{COMPARE_METRIC_LABELS.totalExpenses}</td>
                      {data.map((item) => {
                        return (
                          <td key={item.branch.id} className="px-0.5 md:px-3 py-1.5 md:py-2 border-l border-slate-200/60 dark:border-slate-800/60 align-top">
                            <div className="flex flex-col items-center md:items-start gap-0.5 min-w-0">
                              <MoneyText
                                n={item.totals.expenses}
                                className="text-[10px] md:text-sm font-bold text-orange-500 dark:text-orange-400 tabular-nums max-w-full md:whitespace-nowrap"
                              />
                              <PeerPctBadge
                                pct={item.totals.expenseRate}
                                peersAvg={avgExpenseRate}
                                onClick={(e) =>
                                  openRate(e, item.branch.name, item.branch.id, COMPARE_METRIC_LABELS.totalExpenses, item.totals.expenses, item.totals.sales, item.totals.expenseRate)
                                }
                              />
                            </div>
                          </td>
                        );
                      })}
                    </tr>

                    <tr className="border-b border-slate-200/80 dark:border-slate-800/80">
                      <td className={`${metricSticky} text-slate-600 dark:text-slate-300`}>{COMPARE_METRIC_LABELS.totalProfit}</td>
                      {data.map((item) => {
                        return (
                          <td key={item.branch.id} className="px-0.5 md:px-3 py-1.5 md:py-2 border-l border-slate-200/60 dark:border-slate-800/60 align-top">
                            <div className="flex flex-col items-center md:items-start gap-0.5 min-w-0">
                              <MoneyText
                                n={item.totals.netProfit}
                                className={`text-[10px] md:text-sm font-bold tabular-nums max-w-full md:whitespace-nowrap ${item.totals.netProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}
                              />
                              <PeerPctBadge
                                pct={item.totals.profitRate}
                                peersAvg={avgProfitRate}
                                onClick={(e) =>
                                  openRate(e, item.branch.name, item.branch.id, COMPARE_METRIC_LABELS.totalProfit, item.totals.netProfit, item.totals.sales, item.totals.profitRate)
                                }
                              />
                            </div>
                          </td>
                        );
                      })}
                    </tr>

                    {(
                      [
                        ['sales', COMPARE_METRIC_LABELS.sections.sales, 'samePeriod', 'fullPrevMonth'] as const,
                        ['expenses', COMPARE_METRIC_LABELS.sections.expenses, 'samePeriod', 'fullPrevMonth'] as const,
                        ['profit', COMPARE_METRIC_LABELS.sections.profit, 'samePeriod', 'fullPrevMonth'] as const,
                      ]
                    ).map(([section, sectionLabel, sameKey, momKey]) => {
                      const windowsKey =
                        section === 'sales' ? 'salesWindows' : section === 'expenses' ? 'expensesWindows' : 'profitWindows';
                      return (
                        <React.Fragment key={section}>
                          <tr className="bg-sky-500/10 border-y border-sky-400/20">
                            <td
                              colSpan={colCount + 1}
                              className="px-2 py-1.5 md:py-2 text-center text-[10px] md:text-xs font-black uppercase tracking-[0.16em] text-sky-600 dark:text-sky-400"
                            >
                              {sectionLabel}
                            </td>
                          </tr>
                          <tr className="border-b border-slate-200/80 dark:border-slate-800/80">
                            <td className={`${metricSticky} text-slate-500 dark:text-slate-400`} title={COMPARE_METRIC_LABELS.vsSamePeriod}>
                              <span className="line-clamp-3 md:line-clamp-none">{COMPARE_METRIC_LABELS.vsSamePeriod}</span>
                            </td>
                            {data.map((item) => {
                              const cell = item[windowsKey][sameKey];
                              return (
                                <td key={item.branch.id} className="px-0.5 md:px-2 py-1 md:py-1.5 border-l border-slate-200/60 dark:border-slate-800/60 align-top">
                                  <WindowCellView
                                    cell={cell}
                                    onClick={(e) =>
                                      openComparison(
                                        e,
                                        item.branch.name,
                                        item.branch.id,
                                        sectionLabel,
                                        COMPARE_METRIC_LABELS.vsSamePeriod,
                                        cell,
                                        section === 'expenses',
                                      )
                                    }
                                  />
                                </td>
                              );
                            })}
                          </tr>
                          <tr className="border-b border-slate-200/80 dark:border-slate-800/80">
                            <td className={`${metricSticky} text-slate-500 dark:text-slate-400`}>{COMPARE_METRIC_LABELS.vsLastMonth}</td>
                            {data.map((item) => {
                              const cell = item[windowsKey][momKey];
                              return (
                                <td key={item.branch.id} className="px-0.5 md:px-2 py-1 md:py-1.5 border-l border-slate-200/60 dark:border-slate-800/60 align-top">
                                  <WindowCellView
                                    cell={cell}
                                    onClick={(e) =>
                                      openComparison(
                                        e,
                                        item.branch.name,
                                        item.branch.id,
                                        sectionLabel,
                                        COMPARE_METRIC_LABELS.vsLastMonth,
                                        cell,
                                        section === 'expenses',
                                      )
                                    }
                                  />
                                </td>
                              );
                            })}
                          </tr>
                        </React.Fragment>
                      );
                    })}

                    <tr className="bg-sky-500/10 border-y border-sky-400/20">
                      <td
                        colSpan={colCount + 1}
                        className="px-2 py-1.5 md:py-2 text-center text-[10px] md:text-xs font-black uppercase tracking-[0.16em] text-sky-600 dark:text-sky-400"
                      >
                        {COMPARE_METRIC_LABELS.sections.mainExpenses}
                      </td>
                    </tr>
                    {(
                      [
                        ['foodLiquor', COMPARE_METRIC_LABELS.foodSupplies],
                        ['rent', COMPARE_METRIC_LABELS.rent],
                        ['labor', COMPARE_METRIC_LABELS.salary],
                        ['others', COMPARE_METRIC_LABELS.others],
                      ] as const
                    ).map(([key, label]) => (
                      <tr key={key} className="border-b border-slate-200/80 dark:border-slate-800/80">
                        <td className={`${metricSticky} text-slate-800 dark:text-slate-200 text-[10px] md:text-[13px]`} title={label}>
                          <span className="line-clamp-2 font-semibold">{label}</span>
                        </td>
                        {data.map((item) => {
                          const cat = item.mainExpenses[key];
                          return (
                            <td key={item.branch.id} className="px-0.5 md:px-3 py-2 md:py-2.5 border-l border-slate-200/60 dark:border-slate-800/60 align-top">
                              <button
                                type="button"
                                onClick={(e) =>
                                  openMainExpense(e, item.branch.name, item.branch.id, label, cat.amount, item.totals.sales, cat.ratioOfSales)
                                }
                                className="flex flex-col items-center md:items-start gap-0.5 md:gap-1 text-center md:text-left w-full min-w-0 active:bg-slate-100 dark:active:bg-slate-800/60 rounded-md"
                              >
                                <MoneyText
                                  n={cat.amount}
                                  className="text-[11px] md:text-base font-bold text-slate-900 dark:text-white tabular-nums max-w-full md:whitespace-nowrap"
                                />
                                <span className="text-[9px] md:text-sm text-sky-600 dark:text-sky-400 font-semibold tabular-nums">
                                  ({cat.ratioOfSales.toFixed(1)}%)
                                </span>
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                    {/* Spacer so last Main Expenses row isn't flush under mobile home indicator */}
                    <tr aria-hidden className="md:hidden">
                      <td colSpan={colCount + 1} className="h-4 border-0 p-0" />
                    </tr>
                  </tbody>
                </table>
                </div>
              )}
            </div>
          </div>
        </div>

        <CellBreakdownModal
          modalState={modalState}
          onClose={() => setModalState((s) => ({ ...s, isOpen: false }))}
        />
      </>
    </ModalPortal>
  );
};
