import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Sparkles,
  Utensils,
  TrendingUp,
  AlertTriangle,
  Users,
  ChevronRight,
  Target,
  ArrowUpRight,
  ShieldAlert,
  Lightbulb,
  CheckCircle2
} from 'lucide-react';
import { BranchComparisonData } from '../../types';

const MOCK_BRANCH_COMPARISON: BranchComparisonData[] = [];

interface SingleBranchAuditModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultBranchId?: string;
}

export const SingleBranchAuditModal: React.FC<SingleBranchAuditModalProps> = ({
  isOpen,
  onClose,
  defaultBranchId = 'branch-1'
}) => {
  const [selectedBranchId, setSelectedBranchId] = useState<string>(defaultBranchId);
  const [activeTab, setActiveTab] = useState<'menu' | 'upsell' | 'foodcost' | 'tables'>('menu');

  if (!isOpen) return null;

  const currentBranch = MOCK_BRANCH_COMPARISON.find((b) => b.branch.id === selectedBranchId) || MOCK_BRANCH_COMPARISON[0];

  const formatCurrency = (val: number) =>
    `₱${val.toLocaleString('en-PH', { maximumFractionDigits: 0 })}`;

  // Menu Engineering Items with Critical Decision Actions
  const menuMatrix = [
    { name: 'S2 Premium Set B (4Pax)', category: '🌟 Star Item', popularity: 'High (512 sold)', profitMargin: 'High (68%)', action: 'Feature on front page & train servers as primary group recommendation', status: 'star' },
    { name: 'S1 Premium Set A (2Pax)', category: '🌟 Star Item', popularity: 'High (598 sold)', profitMargin: 'High (64%)', action: 'Offer optional beverage upgrade bundle for +₱120', status: 'star' },
    { name: 'I1 Iberico Kkot Moksal', category: '🐎 Workhorse', popularity: 'Very High (1,148 sold)', profitMargin: 'Medium (42%)', action: 'Reduce plate garnishes or renegotiate bulk supplier rate (+5% profit gain)', status: 'plowhorse' },
    { name: 'Chamisul Soju', category: '🌟 High-Margin Beverage', popularity: 'High (1,376 sold)', profitMargin: 'High (75%)', action: 'Bundle with Korean Fried Chicken for late dinner hours', status: 'star' },
    { name: 'M4 Moksal Kimchi Jjigae', category: '🧩 Underpromoted', popularity: 'Low (294 sold)', profitMargin: 'High (71%)', action: 'Reposition as a lunch set addon at a 10% discount', status: 'puzzle' },
    { name: 'M9 Seafood Pancake', category: '⚠️ Low Margin & Low Sales', popularity: 'Low (112 sold)', popularityCount: 112, profitMargin: 'Low (32%)', action: 'Remove from menu to avoid raw seafood spoilage and simplify prep', status: 'dog' },
  ];

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/70 backdrop-blur-md overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.2 }}
          className="relative w-full max-w-4xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden my-auto max-h-[92vh] flex flex-col"
        >
          {/* Header */}
          <div className="p-5 sm:p-6 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800">
            <div className="flex items-center space-x-3.5">
              <div className="p-3 bg-indigo-500/20 rounded-2xl border border-indigo-400/30 text-indigo-400">
                <Target className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <span className="px-2.5 py-0.5 rounded-full bg-amber-400 text-slate-950 text-[10px] font-black uppercase tracking-wider">
                    Branch Improvement Diagnostic
                  </span>
                  <span className="text-xs text-indigo-300 font-semibold">
                    {currentBranch.branch.city}
                  </span>
                </div>
                <h2 className="text-xl sm:text-2xl font-black text-white mt-0.5">
                  {currentBranch.branch.name} — Profit & Efficiency Levers
                </h2>
              </div>
            </div>

            {/* Branch Selector Dropdown */}
            <div className="flex items-center space-x-3">
              <select
                value={selectedBranchId}
                onChange={(e) => setSelectedBranchId(e.target.value)}
                className="bg-slate-800/90 hover:bg-slate-800 text-white text-xs font-extrabold px-3.5 py-2 rounded-xl border border-slate-700 outline-none cursor-pointer"
              >
                {MOCK_BRANCH_COMPARISON.map((b) => (
                  <option key={b.branch.id} value={b.branch.id}>
                    📍 {b.branch.name} ({b.branch.city})
                  </option>
                ))}
              </select>

              <button
                onClick={onClose}
                className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Quick Critical Metrics Summary Bar */}
          <div className="bg-slate-50 dark:bg-slate-800/60 p-4 border-b border-slate-200 dark:border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200/80 dark:border-slate-800">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Monthly Sales</span>
              <span className="text-base font-black text-slate-900 dark:text-white">{formatCurrency(currentBranch.totals.sales)}</span>
            </div>
            <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200/80 dark:border-slate-800">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Food Cost (COGS) Ratio</span>
              <span className="text-base font-black text-rose-600 dark:text-rose-400">
                {currentBranch.mainExpenses.foodLiquor.ratioOfSales.toFixed(1)}% of sales
              </span>
            </div>
            <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200/80 dark:border-slate-800">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Net Profit Margin</span>
              <span className="text-base font-black text-emerald-600 dark:text-emerald-400">
                {currentBranch.totals.profitRate.toFixed(1)}% ({formatCurrency(currentBranch.totals.netProfit)})
              </span>
            </div>
            <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200/80 dark:border-slate-800">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Target Profit Boost</span>
              <span className="text-base font-black text-indigo-600 dark:text-indigo-400">
                +{formatCurrency(Math.round(currentBranch.totals.sales * 0.08))} / mo
              </span>
            </div>
          </div>

          {/* Diagnostic Tabs */}
          <div className="flex border-b border-slate-200 dark:border-slate-800 px-5 bg-white dark:bg-slate-900 overflow-x-auto scrollbar-none gap-2 pt-3">
            {[
              { id: 'menu', label: '1. Menu Profitability Matrix', icon: Utensils },
              { id: 'upsell', label: '2. Average Check & Upsell Levers', icon: TrendingUp },
              { id: 'foodcost', label: '3. Food Cost & Spoilage Control', icon: AlertTriangle },
              { id: 'tables', label: '4. Table Turnover & Speed', icon: Users },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center space-x-2 py-3 px-4 border-b-2 font-bold text-xs whitespace-nowrap transition-colors ${
                    isActive
                      ? 'border-indigo-600 dark:border-indigo-400 text-indigo-600 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/30 rounded-t-xl'
                      : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Modal Body */}
          <div className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1 bg-slate-50/50 dark:bg-slate-900/50">
            {/* TAB 1: MENU PROFITABILITY MATRIX */}
            {activeTab === 'menu' && (
              <div className="space-y-4">
                <div className="bg-indigo-50 dark:bg-indigo-950/40 p-4 rounded-2xl border border-indigo-200 dark:border-indigo-800/60 flex items-start space-x-3">
                  <Sparkles className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
                  <div className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed">
                    <strong className="text-indigo-900 dark:text-indigo-300">Where to improve menu profit:</strong> Focus floor staff on selling high-margin "Stars", while trimming ingredient waste on "Low-Margin/Low-Sales" items.
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {menuMatrix.map((item, idx) => {
                    let badgeBg = 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/80 dark:text-amber-300';
                    if (item.status === 'star') badgeBg = 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/80 dark:text-emerald-300';
                    if (item.status === 'dog') badgeBg = 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/80 dark:text-rose-300';
                    if (item.status === 'puzzle') badgeBg = 'bg-indigo-100 text-indigo-800 border-indigo-300 dark:bg-indigo-950/80 dark:text-indigo-300';

                    return (
                      <div key={idx} className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2 shadow-sm">
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="font-bold text-sm text-slate-900 dark:text-white">{item.name}</h4>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border shrink-0 ${badgeBg}`}>
                            {item.category}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs text-slate-500">
                          <div>Volume: <span className="font-semibold text-slate-900 dark:text-slate-200">{item.popularity}</span></div>
                          <div>Profit Margin: <span className="font-semibold text-slate-900 dark:text-slate-200">{item.profitMargin}</span></div>
                        </div>
                        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-start space-x-1.5 text-xs text-indigo-600 dark:text-indigo-400 font-medium">
                          <ChevronRight className="w-4 h-4 shrink-0 mt-0.5 text-indigo-500" />
                          <span><strong>Action Plan:</strong> {item.action}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* TAB 2: AVERAGE CHECK & UPSELL LEVERS */}
            {activeTab === 'upsell' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                  <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-1.5">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Average Spend / Guest</span>
                    <div className="text-2xl font-black text-slate-900 dark:text-white">₱645</div>
                    <p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">Target: ₱750 (+₱105 gap)</p>
                  </div>
                  <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-1.5">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Beverage Attachment</span>
                    <div className="text-2xl font-black text-indigo-600 dark:text-indigo-400">48.5%</div>
                    <p className="text-xs text-slate-500">Only 1 in 2 orders has drinks</p>
                  </div>
                  <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-1.5">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Dessert Attachment</span>
                    <div className="text-2xl font-black text-amber-600 dark:text-amber-400">14.2%</div>
                    <p className="text-xs text-slate-500">Low dessert upselling at check-out</p>
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
                  <h4 className="font-extrabold text-slate-900 dark:text-white text-sm flex items-center space-x-2">
                    <Lightbulb className="w-4 h-4 text-amber-500" />
                    <span>How to increase spend per customer for {currentBranch.branch.name}</span>
                  </h4>
                  <ul className="space-y-2.5 text-xs text-slate-700 dark:text-slate-300">
                    <li className="flex items-start space-x-2.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                      <div>
                        <strong>Drink Suggestion Script:</strong> Train floor servers to recommend specific signature beverages (e.g., Iced Fruit Tea or Soju cocktail) instead of asking "Do you want water?". Estimated gain: <strong>+₱65 / guest</strong>.
                      </div>
                    </li>
                    <li className="flex items-start space-x-2.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                      <div>
                        <strong>Combo Meal Upgrade:</strong> Add a simple +₱99 "Side + Beverage Bundle" to every main meat entry on POS.
                      </div>
                    </li>
                  </ul>
                </div>
              </div>
            )}

            {/* TAB 3: FOOD COST & SPOILAGE CONTROL */}
            {activeTab === 'foodcost' && (
              <div className="space-y-4">
                <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white">Where Food Expenses are Leaking</h4>
                      <p className="text-xs text-slate-500">Actual COGS is {currentBranch.mainExpenses.foodLiquor.ratioOfSales.toFixed(1)}% vs Industry Benchmark (28.0%)</p>
                    </div>
                    <span className="px-3 py-1 rounded-full bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 text-xs font-black">
                      Over Budget by {formatCurrency(Math.round(currentBranch.totals.sales * 0.05))}
                    </span>
                  </div>

                  <div className="space-y-3">
                    <div className="bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800">
                      <div className="flex justify-between text-xs mb-1 font-bold text-slate-900 dark:text-white">
                        <span>1. Meat Portioning Over-serving (Kitchen Trimmings)</span>
                        <span className="text-rose-600">~₱48,500 monthly loss</span>
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Kitchen staff are over-portioning meat cuts by ~8-10% per plate without digital scale verification.
                      </p>
                    </div>

                    <div className="bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800">
                      <div className="flex justify-between text-xs mb-1 font-bold text-slate-900 dark:text-white">
                        <span>2. Raw Seafood & Fresh Produce Spoilage</span>
                        <span className="text-amber-600">~₱22,000 monthly loss</span>
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Unsold fresh produce ordering exceeds demand on low-volume weekday shifts.
                      </p>
                    </div>
                  </div>

                  <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl border border-emerald-200 dark:border-emerald-800/60 text-xs text-emerald-900 dark:text-emerald-200 flex items-center justify-between">
                    <span>🎯 Total Achievable Cost Recovery with Portion Controls:</span>
                    <span className="font-black text-sm text-emerald-700 dark:text-emerald-300">Save ₱70,500 / month</span>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 4: TABLE TURNOVER & SPEED */}
            {activeTab === 'tables' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Service Speed Diagnostics</h4>
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between font-semibold">
                        <span>Average Kitchen Order Time:</span>
                        <span className="font-bold text-rose-600">18.5 mins (Target: 12 mins)</span>
                      </div>
                      <div className="flex justify-between font-semibold">
                        <span>Average Dining Dwell Time:</span>
                        <span className="font-bold text-amber-600">65 mins per table</span>
                      </div>
                      <div className="flex justify-between font-semibold">
                        <span>Table Turnover Rate:</span>
                        <span className="font-bold text-slate-900 dark:text-white">2.2 turns / dinner shift</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
                    <h4 className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">⚡ Throughput Improvement Strategy</h4>
                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      Reducing table dwell time from <strong>65 mins to 50 mins</strong> allows <strong>{currentBranch.branch.name}</strong> to serve 1 extra wave of customers during peak weekend hours (+₱140,000 monthly revenue).
                    </p>
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 font-medium">
                      • Recommendation: Use mobile tablet POS for instant table checkouts and pre-seating digital menu orders.
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer Action */}
          <div className="p-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div className="text-xs text-slate-500 font-medium">
              Diagnostic updated for <strong>{currentBranch.branch.name}</strong>
            </div>
            <button
              onClick={onClose}
              className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md transition-all"
            >
              Close Diagnostic
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

