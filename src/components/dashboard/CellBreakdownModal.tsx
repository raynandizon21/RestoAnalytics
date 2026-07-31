import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Calculator, Calendar, ArrowUpRight, ArrowDownRight, Percent, Info, TrendingUp, TrendingDown } from 'lucide-react';
import { PopupModalState } from '../../types';

interface Props {
  modalState: PopupModalState;
  onClose: () => void;
}

export const CellBreakdownModal: React.FC<Props> = ({ modalState, onClose }) => {
  if (!modalState.isOpen) return null;

  const {
    type,
    title,
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
    formulaDescription,
  } = modalState;

  const formatCurrency = (val: number) =>
    `₱${val.toLocaleString('en-PH', { maximumFractionDigits: 0 })}`;

  const isUp = indexPercent >= 100;
  const diffAmount = amount - baselineAmount;
  const changePercent = indexPercent - 100;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, y: 50, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 50, scale: 0.95 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800"
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-purple-700 px-6 py-5 text-white flex items-center justify-between relative">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-2xl bg-white/15 backdrop-blur-md flex items-center justify-center border border-white/20">
                <Calculator className="w-5 h-5 text-amber-300" />
              </div>
              <div>
                <span className="text-xs uppercase tracking-wider text-blue-200 font-medium">
                  {branchName} • Context Breakdown
                </span>
                <h3 className="text-lg font-bold text-white leading-tight">
                  {title}
                </h3>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-white/20 text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Modal Content */}
          <div className="p-6 space-y-5 text-slate-800 dark:text-slate-100 max-h-[75vh] overflow-y-auto">
            {/* TYPE 1: Total Rate (% of Sales) */}
            {type === 'total_rate' && (
              <div className="space-y-4">
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60 space-y-3">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-500 dark:text-slate-400 font-medium">{metricLabel} Amount ({categoryName || 'Total'})</span>
                    <span className="font-bold text-slate-900 dark:text-white text-base">{formatCurrency(amount)}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm border-t border-slate-200 dark:border-slate-700 pt-2">
                    <span className="text-slate-500 dark:text-slate-400 font-medium">Total Sales</span>
                    <span className="font-bold text-slate-900 dark:text-white text-base">{formatCurrency(sales)}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm border-t border-slate-200 dark:border-slate-700 pt-2 text-indigo-600 dark:text-indigo-400 font-semibold">
                    <span>Calculated Ratio ({metricLabel} %)</span>
                    <span className="text-xl font-extrabold">{rate.toFixed(1)}%</span>
                  </div>
                </div>

                {/* Formula box */}
                <div className="p-4 rounded-2xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/50 space-y-2">
                  <div className="flex items-center space-x-2 text-blue-700 dark:text-blue-300 text-xs font-bold uppercase tracking-wide">
                    <Info className="w-4 h-4" />
                    <span>Calculation Formula</span>
                  </div>
                  <div className="font-mono text-xs p-3 rounded-xl bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-900 text-blue-900 dark:text-blue-200 font-medium">
                    Rate = (Amount ÷ Sales) × 100
                    <br />
                    Rate = ({formatCurrency(amount)} ÷ {formatCurrency(sales)}) × 100 = <span className="font-bold text-indigo-600 dark:text-indigo-400">{rate.toFixed(1)}%</span>
                  </div>
                </div>
              </div>
            )}

            {/* TYPE 2: Comparison Window Details */}
            {type === 'comparison' && (
              <div className="space-y-4">
                {/* Index Card */}
                <div className={`p-4 rounded-2xl border flex items-center justify-between ${
                  isUp 
                    ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/60 text-emerald-900 dark:text-emerald-200'
                    : 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800/60 text-rose-900 dark:text-rose-200'
                }`}>
                  <div>
                    <span className="text-xs uppercase font-bold tracking-wide opacity-80">
                      Comparative Index Performance
                    </span>
                    <div className="flex items-baseline space-x-2 mt-1">
                      <span className="text-3xl font-black">{indexPercent.toFixed(1)}%</span>
                      <span className="text-sm font-semibold">
                        ({changePercent >= 0 ? '+' : ''}{changePercent.toFixed(1)}% vs Baseline)
                      </span>
                    </div>
                  </div>
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
                    isUp ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/20 text-rose-600 dark:text-rose-400'
                  }`}>
                    {isUp ? <TrendingUp className="w-6 h-6" /> : <TrendingDown className="w-6 h-6" />}
                  </div>
                </div>

                {/* Period Grid */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 space-y-1">
                    <div className="flex items-center space-x-1.5 text-xs text-slate-500 dark:text-slate-400 font-medium">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>Current Window</span>
                    </div>
                    <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      {dateRangeCurrent || 'Selected Date Range'}
                    </div>
                    <div className="text-base font-extrabold text-slate-900 dark:text-white mt-1">
                      {formatCurrency(amount)}
                    </div>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 space-y-1">
                    <div className="flex items-center space-x-1.5 text-xs text-slate-500 dark:text-slate-400 font-medium">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>Baseline Window</span>
                    </div>
                    <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      {dateRangeBaseline || 'Baseline Range'}
                    </div>
                    <div className="text-base font-extrabold text-slate-900 dark:text-white mt-1">
                      {formatCurrency(baselineAmount)}
                    </div>
                  </div>
                </div>

                {/* Formula Breakdown */}
                <div className="p-4 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/50 space-y-2">
                  <div className="flex items-center space-x-2 text-indigo-700 dark:text-indigo-300 text-xs font-bold uppercase tracking-wide">
                    <Info className="w-4 h-4" />
                    <span>Index Calculation Formula</span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    Index percentage represents current performance relative to baseline (100% = identical, &gt;100% = growth, &lt;100% = contraction).
                  </p>
                  <div className="font-mono text-xs p-3 rounded-xl bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-900 text-indigo-950 dark:text-indigo-200 font-medium">
                    Index = (Current ÷ Baseline) × 100
                    <br />
                    Index = ({formatCurrency(amount)} ÷ {formatCurrency(baselineAmount)}) × 100 = <span className="font-bold text-indigo-600 dark:text-indigo-400">{indexPercent.toFixed(1)}%</span>
                  </div>
                </div>
              </div>
            )}

            {/* TYPE 3: Main Expense Breakdown */}
            {type === 'main_expense' && (
              <div className="space-y-4">
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 space-y-3">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-500 dark:text-slate-400 font-medium">Expense Category</span>
                    <span className="font-bold text-slate-900 dark:text-white">{categoryName}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm border-t border-slate-200 dark:border-slate-700 pt-2">
                    <span className="text-slate-500 dark:text-slate-400 font-medium">Category Expense Amount</span>
                    <span className="font-bold text-slate-900 dark:text-white text-base">{formatCurrency(amount)}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm border-t border-slate-200 dark:border-slate-700 pt-2">
                    <span className="text-slate-500 dark:text-slate-400 font-medium">Branch Total Sales</span>
                    <span className="font-bold text-slate-900 dark:text-white text-base">{formatCurrency(sales)}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm border-t border-slate-200 dark:border-slate-700 pt-2 text-amber-600 dark:text-amber-400 font-bold">
                    <span>% of Total Sales</span>
                    <span className="text-xl">{rate.toFixed(1)}%</span>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/50 space-y-2">
                  <div className="flex items-center space-x-2 text-amber-700 dark:text-amber-300 text-xs font-bold uppercase tracking-wide">
                    <Percent className="w-4 h-4" />
                    <span>Expense Ratio Formula</span>
                  </div>
                  <div className="font-mono text-xs p-3 rounded-xl bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-900 text-amber-950 dark:text-amber-200 font-medium">
                    Category % = (Category Amount ÷ Total Sales) × 100
                    <br />
                    Category % = ({formatCurrency(amount)} ÷ {formatCurrency(sales)}) × 100 = <span className="font-bold text-amber-600 dark:text-amber-400">{rate.toFixed(1)}%</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer close button */}
          <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 flex justify-end">
            <button
              onClick={onClose}
              className="px-6 py-2.5 rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-bold text-sm shadow-md hover:opacity-90 transition-opacity"
            >
              Done / Close
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
