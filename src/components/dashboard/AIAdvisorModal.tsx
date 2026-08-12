import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Sparkles, Send, Bot, User, CheckCircle2, TrendingUp, AlertCircle, Loader2 } from 'lucide-react';
import { BranchComparisonData } from '../../types';
const MOCK_BRANCH_COMPARISON: BranchComparisonData[] = [];

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const AIAdvisorModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<string | null>(null);

  if (!isOpen) return null;

  const quickQuestions = [
    "Paano ko maibaba ang food cost ratio sa Makati & Pasig branches?",
    "Which branch has the highest net profit margin and why?",
    "Give me top 3 labor optimization tips during off-peak hours.",
    "Show menu repricing strategies for high-cost items."
  ];

  const handleAsk = async (qText?: string) => {
    const promptText = qText || question;
    if (!promptText.trim()) return;

    setLoading(true);
    setResponse(null);

    try {
      const token = localStorage.getItem('token') || '';
      const res = await fetch('/api/ai-insights', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          question: promptText,
          branchData: MOCK_BRANCH_COMPARISON.map((b) => ({
            branch: b.branch.name,
            sales: b.totals.sales,
            expenses: b.totals.expenses,
            profit: b.totals.netProfit,
            expenseRate: b.totals.expenseRate,
            foodCostRatio: b.mainExpenses.foodLiquor.ratioOfSales,
            laborRatio: b.mainExpenses.labor.ratioOfSales,
          }))
        })
      });

      const data = await res.json();
      setResponse(data.insight || "No advice returned.");
    } catch (err: any) {
      setResponse("Error connecting to AI Advisor: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/75 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 30 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 30 }}
          className="w-full max-w-3xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden max-h-[90vh] flex flex-col"
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-amber-500 via-orange-600 to-indigo-900 p-6 text-white flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/20">
                <Sparkles className="w-6 h-6 text-amber-200" />
              </div>
              <div>
                <span className="text-xs uppercase font-extrabold tracking-wider text-amber-200">
                  Gemini 2.5 Flash • Powered
                </span>
                <h2 className="text-xl font-black text-white">
                  AI Restaurant Executive Advisor
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

          {/* Chat Body */}
          <div className="p-6 overflow-y-auto space-y-4 flex-1">
            {/* Intro Card */}
            <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-amber-900 dark:text-amber-200 text-xs sm:text-sm leading-relaxed">
              👋 <strong>Kumusta, Bossing!</strong> I am your AI Business Copilot. I automatically scan your branch comparison metrics, food costs, and labor rates to give you practical financial advice!
            </div>

            {/* Quick Questions */}
            <div className="space-y-2">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-400">
                Recommended Queries:
              </span>
              <div className="flex flex-wrap gap-2">
                {quickQuestions.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => handleAsk(q)}
                    className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-indigo-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-colors text-left"
                  >
                    "{q}"
                  </button>
                ))}
              </div>
            </div>

            {/* Response Section */}
            {loading && (
              <div className="p-8 flex flex-col items-center justify-center space-y-3 text-slate-500">
                <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
                <span className="text-xs font-semibold">Analyzing branch data with Gemini AI...</span>
              </div>
            )}

            {response && (
              <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-3">
                <div className="flex items-center space-x-2 text-indigo-600 dark:text-indigo-400 text-xs font-bold uppercase">
                  <Bot className="w-4 h-4" />
                  <span>AI Advisor Guidance</span>
                </div>
                <div className="text-xs sm:text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed font-sans">
                  {response}
                </div>
              </div>
            )}
          </div>

          {/* Input Footer */}
          <div className="p-4 bg-slate-100 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-800 flex items-center space-x-2">
            <input
              type="text"
              placeholder="Tanungin ang AI tungkol sa iyong restaurant performance..."
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAsk()}
              className="flex-1 px-4 py-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            <button
              onClick={() => handleAsk()}
              disabled={loading}
              className="px-5 py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 text-slate-950 font-bold text-xs sm:text-sm shadow-md hover:opacity-95 active:scale-95 disabled:opacity-50 flex items-center space-x-2"
            >
              <Send className="w-4 h-4" />
              <span>Ask</span>
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
