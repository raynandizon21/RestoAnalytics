import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Calendar, ChevronDown, ChevronLeft, ChevronRight, Home,
  Info, Loader2, TrendingDown, TrendingUp,
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

/** Compact ₱K/M on mobile; full fetched amount on desktop. */
function MoneyText({
  n,
  className,
  forceCompact,
}: {
  n: number;
  className?: string;
  /** Phone landscape: never jump to full ₱ / md: font sizes. */
  forceCompact?: boolean;
}) {
  const full = formatFullPeso(n);
  return (
    <span className={`${className ?? ''} whitespace-nowrap`} title={full}>
      {forceCompact ? (
        <span>{formatPeso(n)}</span>
      ) : (
        <>
          <span className="md:hidden [@media(orientation:landscape)_and_(max-height:720px)]:inline">
            {formatPeso(n)}
          </span>
          <span className="hidden md:inline [@media(orientation:landscape)_and_(max-height:720px)]:hidden">
            {full}
          </span>
        </>
      )}
    </span>
  );
}

function BranchLogo({
  name,
  logo,
  className = 'w-7 h-7 md:w-14 md:h-14',
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
      className={`${className} rounded-full overflow-hidden flex items-center justify-center shrink-0 ${show ? 'bg-transparent border-0' : 'bg-slate-100 dark:bg-slate-800 border-0'}`}
      title={name}
    >
      {show ? (
        <img
          src={url!}
          alt=""
          className="w-full h-full object-contain"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="text-[10px] md:text-lg font-black uppercase text-indigo-600 dark:text-indigo-300 w-full h-full flex items-center justify-center">
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
  compact,
}: {
  pct: number;
  peersAvg: number;
  onClick: (e: React.MouseEvent<HTMLElement>) => void;
  /** Portrait-like sizing (avoid md: blow-up on phone landscape). */
  compact?: boolean;
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
      className={`inline-flex items-center gap-0.5 rounded-md font-bold tabular-nums ${tone} ${
        compact ? 'px-1 py-0 !text-[8px] leading-none' : 'px-1.5 py-0.5 text-[8px] md:text-[11px]'
      }`}
      title="% of sales vs peer average"
    >
      {safe.toFixed(1)}%
      <Info className={`opacity-60 ${compact ? 'w-2 h-2' : 'w-2.5 h-2.5 md:w-3 md:h-3'}`} />
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
  compact,
}: {
  cell: ComparisonWindowCell;
  onClick: (e: React.MouseEvent<HTMLElement>) => void;
  compact?: boolean;
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
      className="w-full flex flex-col items-start gap-0.5 text-left active:bg-slate-100 dark:active:bg-slate-800/80 rounded-md px-0.5 py-0.5 transition min-w-0"
    >
      <MoneyText
        n={cell.baselineAmount}
        forceCompact={compact}
        className={`font-semibold text-slate-800 dark:text-slate-200 tabular-nums max-w-full ${
          compact ? '!text-[10px]' : 'text-[10px] md:text-sm'
        }`}
      />
      {cell.sentiment === 'neutral' ? (
        <span className={`font-medium text-slate-500 ${compact ? '!text-[8px]' : 'text-[8px] md:text-[11px]'}`}>—</span>
      ) : (
        <span className={`inline-flex items-center gap-0.5 font-medium tabular-nums ${pctTone} ${compact ? '!text-[8px]' : 'text-[8px] md:text-[11px]'}`}>
          {cell.hasArrow && (
            cell.arrowDirection === 'up'
              ? <TrendingUp className={`shrink-0 ${compact ? 'w-2.5 h-2.5' : 'w-2.5 h-2.5 md:w-3 md:h-3'}`} />
              : <TrendingDown className={`shrink-0 ${compact ? 'w-2.5 h-2.5' : 'w-2.5 h-2.5 md:w-3 md:h-3'}`} />
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
  /** True desktop only — phone landscape often has width ≥768 but short height. */
  const [desktopFit, setDesktopFit] = useState(false);
  /** Phone landscape — keep chrome tight (Telegram Close is side chrome, not top). */
  const [isLandscape, setIsLandscape] = useState(false);
  /** True when board still overflows after min scale — allow scroll as last resort. */
  const [mobileNeedsScroll, setMobileNeedsScroll] = useState(false);

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

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px) and (min-height: 560px)');
    const sync = () => setDesktopFit(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    const sync = () => {
      setIsLandscape(
        window.matchMedia('(orientation: landscape)').matches ||
          window.innerWidth > window.innerHeight,
      );
    };
    sync();
    window.addEventListener('resize', sync);
    window.addEventListener('orientationchange', sync);
    return () => {
      window.removeEventListener('resize', sync);
      window.removeEventListener('orientationchange', sync);
    };
  }, []);

  /**
   * Desktop: scale to fit width+height.
   * Mobile portrait: scale to fit 100% (no scroll).
   * Mobile landscape: width-fit + vertical scroll; uniform cells, no blank gaps.
   */
  useLayoutEffect(() => {
    if (!open || loading) return;
    const wrap = fitWrapRef.current;
    const content = fitContentRef.current;
    if (!wrap || !content) return;

    const fit = () => {
      content.style.zoom = '1';
      content.style.transform = 'none';
      content.style.width = '';
      content.style.maxWidth = '';
      content.style.minHeight = '';
      content.style.height = '';
      content.style.display = '';
      content.style.flexDirection = '';
      void content.offsetHeight;

      const sh = Math.max(content.scrollHeight, 1);
      const sw = Math.max(content.scrollWidth, 1);
      const roomH = wrap.clientHeight;
      const roomW = wrap.clientWidth;
      if (roomH <= 0 || roomW <= 0) {
        content.style.zoom = '';
        setFitScale(1);
        setMobileNeedsScroll(false);
        return;
      }

      const isDesktop = window.matchMedia('(min-width: 768px) and (min-height: 560px)').matches;
      const isLandscape =
        window.matchMedia('(orientation: landscape)').matches ||
        window.innerWidth > window.innerHeight;

      if (isDesktop) {
        const s = Math.max(0.45, Math.min(roomW / sw, roomH / sh, 1));
        const next = Number.isFinite(s) ? Number(s.toFixed(4)) : 1;
        content.style.zoom = next < 0.999 ? String(next) : '';
        setMobileNeedsScroll(false);
        setFitScale((prev) => (Math.abs(prev - next) < 0.004 ? prev : next));
        return;
      }

      if (isLandscape) {
        // Landscape: fit width only, keep natural height + scroll (like a list).
        const scaleW = sw > roomW ? roomW / sw : 1;
        const s = Math.max(0.72, Math.min(scaleW, 1));
        const next = Number.isFinite(s) ? Number(s.toFixed(4)) : 1;
        content.style.zoom = next < 0.999 ? String(next) : '';
        setMobileNeedsScroll(true);
        setFitScale((prev) => (Math.abs(prev - next) < 0.004 ? prev : next));
        return;
      }

      // Portrait: fit entire board — no scroll.
      const scaleW = roomW / sw;
      const scaleH = roomH / sh;
      const s = Math.max(0.5, Math.min(scaleW, scaleH, 1.2));
      const next = Number.isFinite(s) ? Number(s.toFixed(4)) : 1;
      content.style.zoom =
        next < 0.999 || next > 1.001 ? String(next) : '';
      setMobileNeedsScroll(false);
      setFitScale((prev) => (Math.abs(prev - next) < 0.004 ? prev : next));
    };

    fit();
    const ro = new ResizeObserver(() => {
      requestAnimationFrame(fit);
    });
    ro.observe(wrap);
    ro.observe(content);
    window.addEventListener('resize', fit);
    window.addEventListener('orientationchange', fit);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', fit);
      window.removeEventListener('orientationchange', fit);
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
  const landscapeUniform = isLandscape && !desktopFit;
  /** Match portrait type scale exactly — never let md: inflate landscape. */
  const moneyCls = landscapeUniform
    ? '!text-[10px] font-semibold tabular-nums max-w-full leading-none'
    : 'text-[10px] md:text-sm font-semibold tabular-nums max-w-full';
  const expenseRatioCls = landscapeUniform
    ? '!text-[8px] text-sky-600 dark:text-sky-400 font-medium tabular-nums leading-none'
    : 'text-[9px] md:text-[11px] text-sky-600 dark:text-sky-400 font-medium tabular-nums';
  /** border-b on the cell itself — tr borders vanish on sticky columns */
  /** Desktop sizes matched to restoAdmin; compact py so board fits without scroll */
  const metricSticky = landscapeUniform
    ? 'sticky left-0 z-10 bg-white dark:bg-slate-900 border-r border-b border-slate-200 dark:border-slate-800 !h-9 max-h-9 px-1 py-0 !text-[10px] font-semibold leading-tight text-left align-middle overflow-hidden'
    : 'sticky left-0 z-10 bg-white dark:bg-slate-900 border-r border-b border-slate-200 dark:border-slate-800 px-1 md:px-3 py-1 md:py-1.5 text-[10px] md:text-sm font-semibold leading-tight text-left align-middle';
  const metricLabelWhite = `${metricSticky} text-slate-900 dark:text-white`;
  const metricLabelOrange = `${metricSticky} text-orange-500 dark:text-orange-400`;
  const metricValueCell = landscapeUniform
    ? '!h-9 max-h-9 px-0.5 py-0 border-l border-b border-slate-200/60 dark:border-slate-800/60 align-middle overflow-hidden'
    : 'px-0.5 md:px-3 py-1 md:py-1.5 border-l border-b border-slate-200/60 dark:border-slate-800/60 align-middle';
  const windowValueCell = landscapeUniform
    ? '!h-9 max-h-9 px-0.5 py-0 border-l border-b border-slate-200/60 dark:border-slate-800/60 align-middle overflow-hidden'
    : 'px-0.5 md:px-3 py-0.5 md:py-1 border-l border-b border-slate-200/60 dark:border-slate-800/60 align-middle';
  /** Same height for 매출액 / 비용 / 순이익 (sales has no badge) */
  const totalsCellInner = landscapeUniform
    ? 'flex flex-col items-start justify-center gap-0 min-w-0 h-full max-h-9 overflow-hidden'
    : 'flex flex-col items-start justify-center gap-1 min-w-0 min-h-[2.75rem] md:min-h-[3rem]';
  const sectionHeaderCell = landscapeUniform
    ? `px-1 py-0 !h-9 max-h-9 text-center !text-[10px] font-bold tracking-wide border-y border-sky-400/20 align-middle overflow-hidden`
    : `px-2 md:px-3 py-1 md:py-1.5 text-center text-[10px] md:text-sm font-black uppercase tracking-[0.12em] border-y border-sky-400/20`;
  const equalColPct = `${(100 / (colCount + 1)).toFixed(4)}%`;
  const mobileMonthLabel = monthLabel
    .replace(/\s+\d{4}/, '')
    .replace(/\s*\(MTD\)/i, '')
    .replace(/\s*MTD/i, '')
    .trim();

  const boardControls = (
    <div
      className={`flex items-center shrink-0 ${desktopFit ? 'gap-1.5' : 'gap-1 justify-center w-full'}`}
      ref={pickerRef}
    >
      <div className="relative min-w-0">
        <button
          type="button"
          onClick={() => {
            const d = new Date(`${range.start_date}T12:00:00`);
            setPickerYear(d.getFullYear());
            setMonthPickerOpen((o) => !o);
          }}
          className={`inline-flex items-center font-semibold text-slate-700 dark:text-slate-100 transition ${
            desktopFit
              ? 'justify-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm'
              : 'justify-center gap-0.5 pl-1.5 pr-2 py-1 rounded-full border border-sky-400/40 bg-sky-500/15 text-[10px] leading-none active:scale-[0.98]'
          }`}
          title="Multi-Branch Board"
          aria-label={`Multi-Branch Board, ${monthLabel}`}
        >
          <Calendar className={`shrink-0 ${desktopFit ? 'w-4 h-4 text-sky-500 dark:text-sky-400' : 'w-3 h-3 text-sky-400'}`} />
          <span className="tabular-nums whitespace-nowrap">
            {desktopFit ? monthLabel : mobileMonthLabel}
          </span>
        </button>

        {monthPickerOpen && (
          <div
            className={`absolute top-full mt-1.5 z-50 w-[min(16rem,70vw)] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl p-3 ${
              desktopFit ? 'right-0' : 'left-0'
            }`}
          >
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
        className={`inline-flex items-center gap-1.5 shrink-0 font-semibold text-white bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] transition shadow-sm ${
          desktopFit
            ? 'px-3 py-2 rounded-lg text-sm'
            : 'px-2.5 py-1.5 rounded-xl text-[11px]'
        }`}
        aria-label="Back to Home"
      >
        <Home className={desktopFit ? 'w-4 h-4' : 'w-3.5 h-3.5'} />
        <span>Back to Home</span>
      </button>
    </div>
  );

  return (
    <ModalPortal>
      <>
        <div
          className={`fixed inset-0 z-[70] flex justify-center bg-slate-950/50 dark:bg-slate-950/90 ${
            desktopFit ? 'items-center p-3 md:p-4' : 'items-stretch p-0'
          }`}
          onClick={onClose}
        >
          <div
            className={`relative flex flex-col bg-white dark:bg-slate-900 overflow-hidden ${
              desktopFit
                ? 'w-[min(1600px,96vw)] h-[min(960px,94dvh)] max-h-[94dvh] rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl'
                : 'w-screen max-w-[100vw] h-[100dvh] max-h-[100dvh] rounded-none border-0 shadow-none'
            }`}
            style={
              desktopFit
                ? undefined
                : ({
                    // Portrait: reserve space under Telegram Close. Landscape: pin chrome flush to top.
                    paddingTop: isLandscape
                      ? '0px'
                      : 'max(0.5rem, env(safe-area-inset-top, 0px), var(--tg-content-safe-area-inset-top, 3.25rem), var(--tg-safe-area-inset-top, 0px))',
                    paddingBottom: isLandscape
                      ? 'max(0.15rem, env(safe-area-inset-bottom, 0px))'
                      : 'max(0.35rem, env(safe-area-inset-bottom, 0px), var(--tg-content-safe-area-inset-bottom, 0px), var(--tg-safe-area-inset-bottom, 0px))',
                  } as React.CSSProperties)
            }
            onClick={(e) => e.stopPropagation()}
          >
            {/* Desktop: top bar. Mobile: reserved toolbar so date isn't under Telegram Close. */}
            {desktopFit ? (
              <div className="shrink-0 px-2 sm:px-3 md:px-4 py-1.5 md:py-2 border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-end gap-1.5 min-w-0">
                  {boardControls}
                </div>
              </div>
            ) : (
              <div
                ref={pickerRef}
                className={`shrink-0 relative z-[80] flex items-center justify-center px-2 border-b border-slate-200/10 dark:border-slate-700/60 bg-white dark:bg-slate-900 ${
                  isLandscape ? 'py-0.5' : 'py-1.5'
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    const d = new Date(`${range.start_date}T12:00:00`);
                    setPickerYear(d.getFullYear());
                    setMonthPickerOpen((o) => !o);
                  }}
                  className={`inline-flex items-center gap-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 shadow-sm active:scale-95 ${
                    isLandscape ? 'gap-2 px-3.5 py-1.5' : 'px-3 py-1.5'
                  }`}
                  title="Multi-Branch Board"
                  aria-label={`Multi-Branch Board, ${monthLabel}`}
                  aria-expanded={monthPickerOpen}
                >
                  <Calendar className={`text-sky-400 shrink-0 ${isLandscape ? 'w-4 h-4' : 'w-3.5 h-3.5'}`} />
                  <span className={`font-semibold tabular-nums ${isLandscape ? 'text-sm' : 'text-xs'}`}>{mobileMonthLabel}</span>
                  <ChevronDown className={`text-slate-400 transition-transform ${monthPickerOpen ? 'rotate-180' : ''} ${isLandscape ? 'w-4 h-4' : 'w-3.5 h-3.5'}`} />
                </button>
                {monthPickerOpen && (
                  <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1.5 z-50 w-[min(16rem,70vw)] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl p-3">
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
            )}

            {/* Table — portrait: fit; landscape: scroll; desktop: fit */}
            <div
              ref={fitWrapRef}
              className={`flex-1 min-h-0 overscroll-contain [-webkit-overflow-scrolling:touch] ${
                desktopFit || !mobileNeedsScroll
                  ? 'overflow-hidden flex items-center justify-center'
                  : 'overflow-y-auto overflow-x-hidden'
              }`}
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
                  className={`w-full max-w-full ${mobileNeedsScroll ? 'origin-top' : 'origin-center'}`}
                  style={
                    fitScale < 0.999 || fitScale > 1.001
                      ? ({ zoom: fitScale } as React.CSSProperties)
                      : undefined
                  }
                >
                <table className={`w-full table-fixed border-separate border-spacing-0 ${landscapeUniform ? 'table-fixed' : ''}`}>
                  <colgroup>
                    {landscapeUniform ? (
                      Array.from({ length: colCount + 1 }, (_, i) => (
                        <col key={i} style={{ width: equalColPct }} />
                      ))
                    ) : (
                      <>
                        <col className="w-[22%] sm:w-[20%] md:w-[18%]" />
                        {data.map((item) => (
                          <col key={item.branch.id} />
                        ))}
                      </>
                    )}
                  </colgroup>
                  <thead className="bg-white dark:bg-slate-900">
                    <tr>
                      <th
                        className={`sticky top-0 left-0 z-40 bg-white dark:bg-slate-900 border-r border-b-2 border-slate-200 dark:border-slate-600 px-1 md:px-3 font-bold tracking-wide text-indigo-600 dark:text-indigo-300 text-center align-middle overflow-hidden ${
                          landscapeUniform
                            ? '!h-9 max-h-9 py-0 !text-[10px]'
                            : isLandscape && !desktopFit
                              ? 'py-1 text-[10px]'
                              : 'py-2 md:py-2.5 text-xs md:text-base'
                        }`}
                      >
                        <span className="block leading-tight whitespace-nowrap">
                          업장별 비교
                        </span>
                      </th>
                      {data.map((item) => (
                        <th
                          key={item.branch.id}
                          className={`sticky top-0 z-30 bg-white dark:bg-slate-900 px-0.5 md:px-3 text-left border-l border-b-2 border-slate-200 dark:border-slate-600 overflow-hidden ${
                            landscapeUniform
                              ? '!h-9 max-h-9 py-0'
                              : isLandscape && !desktopFit
                                ? 'py-1'
                                : 'py-1.5 md:py-2'
                          }`}
                        >
                          <div
                            className={`flex items-center min-w-0 ${
                              desktopFit
                                ? 'flex-row justify-start gap-3'
                                : isLandscape
                                  ? 'flex-row justify-start gap-1'
                                  : 'flex-col justify-center gap-0.5'
                            }`}
                          >
                            <BranchLogo
                              name={item.branch.name}
                              logo={item.branch.logo}
                              className={
                                desktopFit
                                  ? 'w-14 h-14'
                                  : isLandscape
                                    ? 'w-4 h-4'
                                    : 'w-7 h-7'
                              }
                            />
                            <span
                              className={`font-bold text-slate-900 dark:text-white leading-tight line-clamp-1 px-0.5 min-w-0 ${
                                desktopFit
                                  ? 'text-base text-left'
                                  : '!text-[8px] ' + (isLandscape ? 'text-left' : 'text-center')
                              }`}
                              title={item.branch.name}
                            >
                              <span className={desktopFit ? 'hidden' : ''}>{shortName(item.branch.name)}</span>
                              <span className={desktopFit ? '' : 'hidden'}>{item.branch.name}</span>
                            </span>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody className={desktopFit || mobileNeedsScroll ? undefined : 'h-full'}>
                    <tr className={landscapeUniform ? undefined : '[&>td]:min-h-[2.75rem] md:[&>td]:min-h-[3.25rem]'}>
                      <td className={metricLabelWhite}>{COMPARE_METRIC_LABELS.totalSales}</td>
                      {data.map((item) => (
                        <td key={item.branch.id} className={metricValueCell}>
                          <div className={totalsCellInner}>
                            <MoneyText
                              n={item.totals.sales}
                              forceCompact={landscapeUniform}
                              className={`${moneyCls} text-sky-600 dark:text-sky-400`}
                            />
                          </div>
                        </td>
                      ))}
                    </tr>

                    <tr className={landscapeUniform ? undefined : '[&>td]:min-h-[2.75rem] md:[&>td]:min-h-[3.25rem]'}>
                      <td className={metricLabelOrange}>{COMPARE_METRIC_LABELS.totalExpenses}</td>
                      {data.map((item) => {
                        return (
                          <td key={item.branch.id} className={metricValueCell}>
                            <div className={totalsCellInner}>
                              <MoneyText
                                n={item.totals.expenses}
                                forceCompact={landscapeUniform}
                                className={`${moneyCls} text-orange-500 dark:text-orange-400`}
                              />
                              <PeerPctBadge
                                pct={item.totals.expenseRate}
                                peersAvg={avgExpenseRate}
                                compact={landscapeUniform}
                                onClick={(e) =>
                                  openRate(e, item.branch.name, item.branch.id, COMPARE_METRIC_LABELS.totalExpenses, item.totals.expenses, item.totals.sales, item.totals.expenseRate)
                                }
                              />
                            </div>
                          </td>
                        );
                      })}
                    </tr>

                    <tr className={landscapeUniform ? undefined : '[&>td]:min-h-[2.75rem] md:[&>td]:min-h-[3.25rem]'}>
                      <td className={metricLabelWhite}>{COMPARE_METRIC_LABELS.totalProfit}</td>
                      {data.map((item) => {
                        return (
                          <td key={item.branch.id} className={metricValueCell}>
                            <div className={totalsCellInner}>
                              <MoneyText
                                n={item.totals.netProfit}
                                forceCompact={landscapeUniform}
                                className={`${moneyCls} ${item.totals.netProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}
                              />
                              <PeerPctBadge
                                pct={item.totals.profitRate}
                                peersAvg={avgProfitRate}
                                compact={landscapeUniform}
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
                        ['sales', COMPARE_METRIC_LABELS.sections.sales, 'samePeriod', 'fullPrevMonth', 'text-slate-900 dark:text-white'] as const,
                        ['expenses', COMPARE_METRIC_LABELS.sections.expenses, 'samePeriod', 'fullPrevMonth', 'text-orange-500 dark:text-orange-400'] as const,
                        ['profit', COMPARE_METRIC_LABELS.sections.profit, 'samePeriod', 'fullPrevMonth', 'text-slate-900 dark:text-white'] as const,
                      ]
                    ).map(([section, sectionLabel, sameKey, momKey, sectionColor]) => {
                      const windowsKey =
                        section === 'sales' ? 'salesWindows' : section === 'expenses' ? 'expensesWindows' : 'profitWindows';
                      return (
                        <React.Fragment key={section}>
                          <tr className="bg-sky-500/10">
                            <td
                              colSpan={colCount + 1}
                              className={`${sectionHeaderCell} ${sectionColor}`}
                            >
                              {sectionLabel}
                            </td>
                          </tr>
                          <tr>
                            <td className={metricLabelWhite} title={COMPARE_METRIC_LABELS.vsSamePeriod}>
                              <span className="line-clamp-3 md:line-clamp-none font-semibold">{COMPARE_METRIC_LABELS.vsSamePeriod}</span>
                            </td>
                            {data.map((item) => {
                              const cell = item[windowsKey][sameKey];
                              return (
                                <td key={item.branch.id} className={windowValueCell}>
                                  <WindowCellView
                                    cell={cell}
                                    compact={landscapeUniform}
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
                          <tr>
                            <td className={metricLabelWhite}>{COMPARE_METRIC_LABELS.vsLastMonth}</td>
                            {data.map((item) => {
                              const cell = item[windowsKey][momKey];
                              return (
                                <td key={item.branch.id} className={windowValueCell}>
                                  <WindowCellView
                                    cell={cell}
                                    compact={landscapeUniform}
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

                    <tr className="bg-sky-500/10">
                      <td
                        colSpan={colCount + 1}
                        className={`${sectionHeaderCell} text-slate-900 dark:text-white`}
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
                      <tr key={key}>
                        <td className={metricLabelWhite} title={label}>
                          <span className="line-clamp-2 font-semibold">{label}</span>
                        </td>
                        {data.map((item) => {
                          const cat = item.mainExpenses[key];
                          return (
                            <td key={item.branch.id} className={metricValueCell}>
                              <button
                                type="button"
                                onClick={(e) =>
                                  openMainExpense(e, item.branch.name, item.branch.id, label, cat.amount, item.totals.sales, cat.ratioOfSales)
                                }
                                className="flex flex-col items-start gap-0.5 text-left w-full min-w-0 active:bg-slate-100 dark:active:bg-slate-800/60 rounded-md"
                              >
                                <MoneyText
                                  n={cat.amount}
                                  forceCompact={landscapeUniform}
                                  className={`${moneyCls} text-slate-900 dark:text-white`}
                                />
                                <span className={expenseRatioCls}>
                                  ({cat.ratioOfSales.toFixed(1)}%)
                                </span>
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              )}
            </div>

            {/* Mobile: compact footer — never covers table rows */}
            {!desktopFit && (
              <div
                className={`shrink-0 z-[80] flex justify-center px-2 border-t border-slate-200/10 dark:border-slate-700/60 bg-white dark:bg-slate-900 ${
                  isLandscape ? 'py-0.5' : 'py-1.5'
                }`}
              >
                <button
                  type="button"
                  onClick={onClose}
                  className={`inline-flex w-auto items-center justify-center gap-1.5 px-3 rounded-xl bg-indigo-600 text-white font-semibold shadow-sm hover:bg-indigo-500 active:scale-[0.99] transition ${
                    isLandscape ? 'py-0.5 text-xs' : 'py-1.5 text-sm'
                  }`}
                  aria-label="Back to Home"
                >
                  <Home className={`text-white/80 shrink-0 ${isLandscape ? 'w-3.5 h-3.5' : 'w-4 h-4'}`} />
                  <span className="whitespace-nowrap">Back to Home</span>
                </button>
              </div>
            )}
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
