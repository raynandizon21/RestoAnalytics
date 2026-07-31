import React from 'react';
import {
  X,
  Sparkles,
  Utensils,
  BarChart2,
  TrendingUp,
  Calendar,
  Layers,
  Info
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid
} from 'recharts';
interface MenuItemAnalyticsDetail {
  id: string; name: string; category: string; branchName: string; subtitle: string;
  currentSales: number; currentQty: number; currentUnitPrice: number;
  comparisonWindows: { samePeriod: any; fullPrevMonth: any; threeMonthAvg: any };
  sixMonthTrend: { year: number; points: any[]; avgQty: number; avgSales: number };
}

interface MenuItemAnalyticsPanelProps {
  data: MenuItemAnalyticsDetail;
  onClose?: () => void;
  isModal?: boolean;
}

export const MenuItemAnalyticsPanel: React.FC<MenuItemAnalyticsPanelProps> = ({
  data,
  onClose,
  isModal = false,
}) => {
  const formatCurrency = (val: number) =>
    `₱${val.toLocaleString('en-PH', { maximumFractionDigits: 0 })}`;

  const formatCompactNumber = (val: number) => {
    if (val >= 1000000) return `₱${(val / 1000000).toFixed(1)}M`;
    if (val >= 1000) return `₱${(val / 1000).toFixed(0)}k`;
    return `₱${val}`;
  };

  const windows = [
    data.comparisonWindows.samePeriod,
    data.comparisonWindows.fullPrevMonth,
    data.comparisonWindows.threeMonthAvg,
  ];

  return (
    <div
      className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-lg flex flex-col overflow-hidden transition-colors ${
        isModal ? 'w-full max-w-3xl' : 'w-full h-full'
      }`}
    >
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-5 text-white flex items-center justify-between border-b border-white/10">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300">
            <Utensils className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="text-lg font-black text-white">{data.name}</h3>
              <span className="px-2 py-0.5 rounded-md bg-amber-400/20 text-amber-300 border border-amber-400/30 font-bold text-[10px]">
                {data.category}
              </span>
            </div>
            <p className="text-xs text-indigo-200/80 font-medium">
              {data.subtitle}
            </p>
          </div>
        </div>

        {onClose && (
          <button
            onClick={onClose}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Main Panel Content */}
      <div className="p-4 sm:p-5 space-y-5 flex-1 overflow-y-auto">
        {/* Current Key Performance Badges */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3">
          <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-800">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Current Period Sales
            </span>
            <span className="text-base font-black text-indigo-600 dark:text-indigo-400">
              {formatCurrency(data.currentSales)}
            </span>
          </div>

          <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-800">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Qty Sold (MTD)
            </span>
            <span className="text-base font-black text-slate-900 dark:text-white">
              {data.currentQty.toLocaleString()} pcs
            </span>
          </div>

          <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-800">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Unit Selling Price
            </span>
            <span className="text-base font-black text-emerald-600 dark:text-emerald-400">
              {formatCurrency(data.currentUnitPrice)}
            </span>
          </div>
        </div>

        {/* Section 1: Comparison Windows Table */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-1">
            <div className="flex items-center space-x-2">
              <Sparkles className="w-4 h-4 text-indigo-500" />
              <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                Multi-Window Performance Index Comparison
              </h4>
            </div>
            <span className="text-[10px] text-slate-400 font-medium">
              Baseline values · No trend arrows
            </span>
          </div>

          <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-x-auto shadow-sm scrollbar-thin">
            <table className="w-full min-w-[480px] text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 font-bold uppercase text-[10px] border-b border-slate-200 dark:border-slate-800">
                  <th className="p-3">Comparison Metric</th>
                  <th className="p-3">Qty Sold</th>
                  <th className="p-3">Total Sales</th>
                  <th className="p-3">Unit Price</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 bg-white dark:bg-slate-900">
                {windows.map((w, idx) => {
                  const qtyGreen = w.qtyIndexPercent >= 100;
                  const salesGreen = w.salesIndexPercent >= 100;
                  const priceGreen = w.unitPriceIndexPercent >= 100;

                  return (
                    <tr
                      key={idx}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      <td className="p-3 font-extrabold text-slate-900 dark:text-white">
                        <div>{w.title}</div>
                        <div className="text-[10px] font-normal text-slate-400">
                          {w.currentPeriodLabel} vs {w.baselinePeriodLabel}
                        </div>
                      </td>
                      <td className="p-3">
                        <span className="font-semibold text-slate-800 dark:text-slate-200 mr-1.5">
                          {w.qtyBaseline.toLocaleString()} pcs
                        </span>
                        <span
                          className={`font-extrabold text-[11px] ${
                            qtyGreen
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          ({w.qtyIndexPercent.toFixed(1)}%)
                        </span>
                      </td>
                      <td className="p-3">
                        <span className="font-semibold text-slate-800 dark:text-slate-200 mr-1.5">
                          {formatCurrency(w.salesBaseline)}
                        </span>
                        <span
                          className={`font-extrabold text-[11px] ${
                            salesGreen
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          ({w.salesIndexPercent.toFixed(1)}%)
                        </span>
                      </td>
                      <td className="p-3">
                        <span className="font-semibold text-slate-800 dark:text-slate-200 mr-1.5">
                          {formatCurrency(w.unitPriceBaseline)}
                        </span>
                        <span
                          className={`font-extrabold text-[11px] ${
                            priceGreen
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          ({w.unitPriceIndexPercent.toFixed(1)}%)
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Section 2: 6-Month Monthly Trend (Qty + Sales) */}
        <div className="space-y-4 pt-2">
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 dark:border-slate-800 pt-4">
            <div className="flex items-center space-x-2">
              <BarChart2 className="w-4 h-4 text-purple-500" />
              <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                6-Month Monthly Trend ({data.sixMonthTrend.year})
              </h4>
            </div>

            <div className="flex items-center space-x-3 text-[11px] text-slate-500 font-bold">
              <span>6-Mo Avg Qty: <strong className="text-slate-900 dark:text-white">{data.sixMonthTrend.avgQty} pcs</strong></span>
              <span>•</span>
              <span>6-Mo Avg Sales: <strong className="text-emerald-600 dark:text-emerald-400">{formatCurrency(data.sixMonthTrend.avgSales)}</strong></span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Chart 1: Qty Sold (Purple Bars) */}
            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-purple-700 dark:text-purple-300">
                  Qty Sold (Monthly Pcs)
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 font-extrabold">
                  Jul = MTD
                </span>
              </div>
              <div className="h-44 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.sixMonthTrend.points} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.15} />
                    <XAxis dataKey="monthShort" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                    <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
                    <Tooltip
                      formatter={(val: any) => [`${val} pcs`, 'Qty Sold']}
                      labelFormatter={(label) => `Month: ${label} (${data.sixMonthTrend.year})`}
                      contentStyle={{ backgroundColor: '#0f172a', borderRadius: '12px', border: '1px solid #334155', color: '#fff', fontSize: '11px' }}
                    />
                    <Bar dataKey="qtySold" fill="#a855f7" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Chart 2: Total Sales (Green Area/Line) */}
            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
                  Total Sales (Monthly Revenue)
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-extrabold">
                  Jul = MTD
                </span>
              </div>
              <div className="h-44 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.sixMonthTrend.points} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.15} />
                    <XAxis dataKey="monthShort" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                    <YAxis tickFormatter={formatCompactNumber} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                    <Tooltip
                      formatter={(val: any) => [formatCurrency(Number(val)), 'Total Sales']}
                      labelFormatter={(label) => `Month: ${label} (${data.sixMonthTrend.year})`}
                      contentStyle={{ backgroundColor: '#0f172a', borderRadius: '12px', border: '1px solid #334155', color: '#fff', fontSize: '11px' }}
                    />
                    <Area type="monotone" dataKey="totalSales" stroke="#10b981" strokeWidth={2.5} fillOpacity={1} fill="url(#salesGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
