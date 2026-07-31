import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ShoppingBag, Clock, CheckCircle2, Flame, Utensils, RefreshCw } from 'lucide-react';
import { POSOrder } from '../../types';
const MOCK_POS_ORDERS: POSOrder[] = [];

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const LivePOSFeedModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const [orders, setOrders] = useState<POSOrder[]>(MOCK_POS_ORDERS);

  if (!isOpen) return null;

  const formatCurrency = (val: number) =>
    `₱${val.toLocaleString('en-PH', { maximumFractionDigits: 0 })}`;

  const handleStatusAdvance = (orderId: string) => {
    setOrders((prev) =>
      prev.map((ord) => {
        if (ord.id !== orderId) return ord;
        const nextStatus =
          ord.status === 'Preparing'
            ? 'Cooking'
            : ord.status === 'Cooking'
            ? 'Ready'
            : 'Completed';
        return { ...ord, status: nextStatus };
      })
    );
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/70 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 30 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 30 }}
          className="w-full max-w-4xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden max-h-[90vh] flex flex-col"
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-emerald-700 via-teal-800 to-slate-900 p-6 text-white flex items-center justify-between border-b border-white/10">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 rounded-2xl bg-white/15 backdrop-blur-md flex items-center justify-center border border-white/20">
                <ShoppingBag className="w-6 h-6 text-emerald-300" />
              </div>
              <div>
                <div className="flex items-center space-x-2 text-emerald-200 text-xs font-bold uppercase tracking-wider">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  <span>Real-time POS Live Order Stream</span>
                </div>
                <h2 className="text-xl font-black text-white">
                  Multi-Branch Real-Time POS Feed
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

          {/* Orders Content */}
          <div className="p-6 overflow-y-auto space-y-4 flex-1">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {orders.map((ord) => (
                <div
                  key={ord.id}
                  className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-4 shadow-sm relative overflow-hidden"
                >
                  <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700/80 pb-3">
                    <div>
                      <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
                        {ord.branchName}
                      </span>
                      <h4 className="text-base font-black text-slate-900 dark:text-white">
                        {ord.orderNumber}
                      </h4>
                    </div>
                    <div className="text-right">
                      <span
                        className={`px-2.5 py-1 rounded-full text-xs font-black ${
                          ord.status === 'Preparing'
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                            : ord.status === 'Cooking'
                            ? 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300'
                            : ord.status === 'Ready'
                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                            : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                        }`}
                      >
                        {ord.status}
                      </span>
                      <div className="text-[10px] text-slate-400 font-medium mt-1">
                        {ord.time}
                      </div>
                    </div>
                  </div>

                  {/* Item List */}
                  <div className="space-y-1.5 text-xs text-slate-700 dark:text-slate-300 font-medium">
                    {ord.items.map((it, idx) => (
                      <div key={idx} className="flex justify-between">
                        <span>
                          {it.qty}x {it.name}
                        </span>
                        <span className="font-bold">{formatCurrency(it.price * it.qty)}</span>
                      </div>
                    ))}
                  </div>

                  {/* Total & Action */}
                  <div className="pt-3 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-slate-400 font-medium uppercase">Total</span>
                      <div className="text-lg font-black text-slate-900 dark:text-white">
                        {formatCurrency(ord.total)}
                      </div>
                    </div>

                    {ord.status !== 'Completed' && (
                      <button
                        onClick={() => handleStatusAdvance(ord.id)}
                        className="px-3.5 py-1.5 rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-xs font-bold shadow hover:opacity-90 active:scale-95"
                      >
                        Next Status
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="p-4 bg-slate-100 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-800 flex justify-end">
            <button
              onClick={onClose}
              className="px-6 py-2.5 rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-bold text-xs"
            >
              Close Feed
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
