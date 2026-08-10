import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { PopupModalState } from '../../types';
import { ModalPortal } from '../layout/ModalPortal';

interface Props {
  modalState: PopupModalState;
  onClose: () => void;
}

/** restoAdmin-style anchored floating card — not a centered popup modal. */
export const CellBreakdownModal: React.FC<Props> = ({ modalState, onClose }) => {
  const cardRef = useRef<HTMLDivElement>(null);

  const {
    isOpen,
    type,
    metricLabel,
    branchName,
    amount = 0,
    sales = 0,
    rate = 0,
    baselineAmount = 0,
    indexPercent = 100,
    dateRangeCurrent,
    dateRangeBaseline,
    categoryName,
    invertSentiment = false,
    anchor,
  } = modalState;

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onDoc = (e: MouseEvent) => {
      const el = cardRef.current;
      if (!el) return;
      if (!el.contains(e.target as Node)) onClose();
    };
    window.addEventListener('keydown', onKey);
    // Defer so the opening click does not immediately close the card
    const t = window.setTimeout(() => {
      document.addEventListener('mousedown', onDoc, true);
    }, 0);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDoc, true);
    };
  }, [isOpen, onClose]);

  useLayoutEffect(() => {
    if (!isOpen || !cardRef.current) return;
    const el = cardRef.current;
    const pad = 8;
    const rect = el.getBoundingClientRect();
    const mobile = window.innerWidth < 640;
    let top = anchor?.top ?? Math.max(pad, (window.innerHeight - rect.height) / 2);
    let left = anchor?.left ?? Math.max(pad, (window.innerWidth - rect.width) / 2);
    if (mobile) {
      left = Math.max(pad, (window.innerWidth - rect.width) / 2);
    }
    if (top + rect.height > window.innerHeight - pad) {
      top = Math.max(pad, window.innerHeight - rect.height - pad);
    }
    if (left + rect.width > window.innerWidth - pad) {
      left = Math.max(pad, window.innerWidth - rect.width - pad);
    }
    if (top < pad) top = pad;
    if (left < pad) left = pad;
    el.style.top = `${top}px`;
    el.style.left = `${left}px`;
  }, [isOpen, anchor?.top, anchor?.left, type, amount, rate, indexPercent]);

  if (!isOpen) return null;

  const peso = (val: number) =>
    `₱${Math.round(val).toLocaleString('en-PH', { maximumFractionDigits: 0 })}`;

  const isUp = indexPercent >= 100;
  const isGood = invertSentiment ? !isUp : isUp;

  const rows =
    type === 'comparison'
      ? [
          {
            label: 'Current',
            sub: dateRangeCurrent || undefined,
            value: peso(amount),
            tone: undefined as 'up' | 'down' | undefined,
          },
          {
            label: 'Baseline',
            sub: dateRangeBaseline || undefined,
            value: peso(baselineAmount),
            tone: undefined as 'up' | 'down' | undefined,
          },
          {
            label: 'Index',
            value: `${indexPercent.toFixed(1)}%`,
            tone: (isGood ? 'up' : 'down') as 'up' | 'down',
          },
        ]
      : type === 'main_expense'
        ? [
            {
              label: categoryName || metricLabel,
              sub: dateRangeCurrent || undefined,
              value: peso(amount),
              tone: undefined as undefined,
            },
            { label: 'Sales', value: peso(sales), tone: undefined as undefined },
            { label: 'Rate', value: `${rate.toFixed(1)}%`, tone: undefined as undefined },
          ]
        : [
            {
              label: metricLabel,
              sub: dateRangeCurrent || categoryName || undefined,
              value: peso(amount),
              tone: undefined as undefined,
            },
            { label: 'Sales', value: peso(sales), tone: undefined as undefined },
            { label: 'Rate', value: `${rate.toFixed(1)}%`, tone: undefined as undefined },
          ];

  const formulaLines =
    type === 'comparison'
      ? [
          'Index = 100 + ((Current − Baseline) ÷ |Baseline| × 100)',
          `= 100 + ((${peso(amount)} − ${peso(baselineAmount)}) ÷ ${peso(Math.abs(baselineAmount) || 1)} × 100)`,
          `≈ ${indexPercent.toFixed(1)}%`,
        ]
      : [
          `Rate = ${metricLabel || categoryName || 'Amount'} ÷ Sales × 100`,
          `= ${peso(amount)} ÷ ${peso(sales)} × 100`,
          `≈ ${rate.toFixed(1)}%`,
        ];

  const subtitle =
    type === 'comparison'
      ? metricLabel || 'Period comparison'
      : '% of Sales';

  return (
    <ModalPortal>
      <div
        ref={cardRef}
        data-compare-breakdown-popup
        role="dialog"
        aria-label="Computation breakdown"
        className="fixed z-[90] w-[min(360px,calc(100vw-16px))] max-h-[min(480px,calc(100dvh-16px))] overflow-y-auto rounded-xl border border-indigo-200/60 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-xl shadow-slate-900/10 dark:shadow-black/40"
        style={{
          top: anchor?.top ?? 80,
          left: anchor?.left ?? 16,
        }}
      >
        <div className="mb-3 border-b border-slate-100 dark:border-slate-800 pb-2.5 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-bold tracking-wide text-indigo-600 dark:text-indigo-400">
              {branchName}
            </p>
            <p className="mt-0.5 text-xs leading-snug text-slate-500 dark:text-slate-400">
              {subtitle}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 p-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-white transition"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-2.5">
          {rows.map((line) => {
            const valueColor =
              line.tone === 'up'
                ? 'text-emerald-600 dark:text-emerald-400'
                : line.tone === 'down'
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-slate-800 dark:text-slate-100';
            return (
              <div key={`${line.label}-${line.sub ?? ''}`} className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">{line.label}</p>
                  {line.sub ? (
                    <p className="text-[11px] leading-snug text-slate-400 dark:text-slate-500">{line.sub}</p>
                  ) : null}
                </div>
                <p className={`shrink-0 text-xs font-bold tabular-nums ${valueColor}`}>{line.value}</p>
              </div>
            );
          })}
        </div>

        <div className="mt-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 px-3 py-3 border border-slate-100 dark:border-slate-700/80">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
            How % is computed
          </p>
          <div className="space-y-1 font-mono text-[11px] leading-5 text-slate-600 dark:text-slate-400 break-words">
            {formulaLines.map((line, i) => (
              <p
                key={`f-${i}`}
                className={
                  i === 0
                    ? 'font-semibold text-slate-700 dark:text-slate-200'
                    : line.startsWith('≈')
                      ? 'font-bold text-slate-800 dark:text-slate-100'
                      : 'pl-2 text-slate-500 dark:text-slate-500'
                }
              >
                {line}
              </p>
            ))}
          </div>
        </div>
      </div>
    </ModalPortal>
  );
};
