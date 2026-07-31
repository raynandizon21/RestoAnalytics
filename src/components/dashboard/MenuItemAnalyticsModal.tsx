import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  UtensilsCrossed,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Award,
  DollarSign,
  PieChart,
  Calendar,
  Layers,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';
import { MenuItemData } from '../../types';
const MOCK_MENU_ITEMS: MenuItemData[] = [];

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const MenuItemAnalyticsModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');

  if (!isOpen) return null;

  const categories = ['All', 'Popular Mains', 'Appetizers', 'Beverages', 'Desserts'];

  const filteredItems = MOCK_MENU_ITEMS.filter((item) => {
    const matchesCat = selectedCategory === 'All' || item.category === selectedCategory;
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesSearch;
  });

  const formatCurrency = (val: number) =>
    `₱${val.toLocaleString('en-PH', { maximumFractionDigits: 0 })}`;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/70 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 30 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 30 }}
          className="w-full max-w-5xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden max-h-[90vh] flex flex-col"
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-slate-900 via-purple-950 to-indigo-900 p-6 text-white flex items-center justify-between border-b border-white/10">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20">
                <UtensilsCrossed className="w-6 h-6 text-amber-300" />
              </div>
              <div>
                <div className="flex items-center space-x-2 text-purple-300 text-xs font-bold uppercase tracking-wider">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>Menu Item Performance & Cost Analytics</span>
                </div>
                <h2 className="text-xl sm:text-2xl font-black text-white">
                  Menu Item Sales & Food Cost Breakdown
                </h2>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Filter Bar */}
          <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            {/* Category Pills */}
            <div className="flex flex-wrap items-center gap-1.5">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    selectedCategory === cat
                      ? 'bg-indigo-600 text-white shadow-md'
                      : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Search Input */}
            <input
              type="text"
              placeholder="Search menu item..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="px-3.5 py-1.5 rounded-xl text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full sm:w-56"
            />
          </div>

          {/* Modal Scroll Content */}
          <div className="p-6 overflow-y-auto space-y-6 flex-1 text-slate-800 dark:text-slate-100">
            {/* Top Metrics Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 rounded-2xl bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60 space-y-1">
                <span className="text-xs text-indigo-600 dark:text-indigo-400 font-bold uppercase tracking-wider">
                  Top Revenue Dish
                </span>
                <div className="text-lg font-black text-slate-900 dark:text-white">
                  Wagyu Beef Ribeye
                </div>
                <div className="text-xs text-slate-500">
                  Total Sales: <span className="font-bold text-slate-900 dark:text-white">₱777,000</span> (420 orders)
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 space-y-1">
                <span className="text-xs text-emerald-600 dark:text-emerald-400 font-bold uppercase tracking-wider">
                  Highest Profit Margin
                </span>
                <div className="text-lg font-black text-slate-900 dark:text-white">
                  Craft House Brew IPA
                </div>
                <div className="text-xs text-slate-500">
                  Margin Rate: <span className="font-bold text-emerald-600 dark:text-emerald-400">80.0% Profit Margin</span>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 space-y-1">
                <span className="text-xs text-amber-600 dark:text-amber-400 font-bold uppercase tracking-wider">
                  Food Cost Alert
                </span>
                <div className="text-lg font-black text-slate-900 dark:text-white">
                  Seafood Paella
                </div>
                <div className="text-xs text-amber-700 dark:text-amber-300 font-medium">
                  High Cost Ratio: 40.0% (Target: ≤ 28%)
                </div>
              </div>
            </div>

            {/* Menu Items Detailed Comparison Table */}
            <div className="bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
              <div className="p-4 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 font-bold text-sm text-slate-900 dark:text-white flex items-center justify-between">
                <span>Dish & Margin Breakdown Table</span>
                <span className="text-xs font-normal text-slate-500">
                  {filteredItems.length} Items Listed
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs sm:text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 font-bold uppercase text-[11px] bg-slate-100/50 dark:bg-slate-800/50">
                      <th className="p-3.5">Menu Dish</th>
                      <th className="p-3.5">Selling Price</th>
                      <th className="p-3.5">Cost / Plate</th>
                      <th className="p-3.5">Food Cost %</th>
                      <th className="p-3.5">Profit Margin %</th>
                      <th className="p-3.5 text-center">Top Branch</th>
                      <th className="p-3.5 text-right">Total Revenue</th>
                      <th className="p-3.5 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {filteredItems.map((item) => {
                      const isHighCost = item.foodCostPercent >= 35;
                      return (
                        <tr key={item.id} className="hover:bg-slate-100/70 dark:hover:bg-slate-800/60 transition-colors">
                          <td className="p-3.5 font-bold text-slate-900 dark:text-white">
                            <div className="flex items-center space-x-3">
                              <img
                                src={item.image}
                                alt={item.name}
                                className="w-10 h-10 rounded-xl object-cover border border-slate-200 dark:border-slate-700 shadow-sm"
                              />
                              <div>
                                <div className="font-extrabold text-slate-900 dark:text-white">
                                  {item.name}
                                </div>
                                <div className="text-[10px] text-slate-400 font-medium">
                                  {item.category}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="p-3.5 font-semibold text-slate-800 dark:text-slate-200">
                            {formatCurrency(item.price)}
                          </td>
                          <td className="p-3.5 text-slate-600 dark:text-slate-400 font-medium">
                            {formatCurrency(item.cost)}
                          </td>
                          <td className="p-3.5">
                            <span
                              className={`px-2 py-0.5 rounded-lg font-bold text-xs ${
                                isHighCost
                                  ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                                  : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                              }`}
                            >
                              {item.foodCostPercent.toFixed(1)}%
                            </span>
                          </td>
                          <td className="p-3.5 font-extrabold text-indigo-600 dark:text-indigo-400">
                            {item.marginPercent.toFixed(1)}%
                          </td>
                          <td className="p-3.5 text-center">
                            <span className="px-2 py-1 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold">
                              {item.bestBranchName}
                            </span>
                          </td>
                          <td className="p-3.5 text-right font-black text-slate-900 dark:text-white">
                            {formatCurrency(item.totalRevenue)}
                          </td>
                          <td className="p-3.5 text-center">
                            <span
                              className={`px-2.5 py-1 rounded-full text-[10px] font-black ${
                                item.status === 'Best Seller'
                                  ? 'bg-amber-400 text-slate-950'
                                  : item.status === 'High Margin'
                                  ? 'bg-emerald-500 text-white'
                                  : item.status === 'Slow Mover'
                                  ? 'bg-slate-300 text-slate-800 dark:bg-slate-700 dark:text-slate-200'
                                  : 'bg-rose-500 text-white'
                              }`}
                            >
                              {item.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Modal Footer */}
          <div className="p-4 bg-slate-100 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-800 flex justify-end">
            <button
              onClick={onClose}
              className="px-6 py-2.5 rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-bold text-xs shadow-md"
            >
              Close Window
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
