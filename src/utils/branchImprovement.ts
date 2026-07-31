import { formatFullPeso, formatPeso, type MomBranchRow, type MomComparison, type MomDelta, type MomTotals, type TopSellingItem } from '../services/analyticsService';

export type ImproveTone = 'rose' | 'amber' | 'emerald';

export interface ImproveAction {
  problem: string;
  why: string;
  doThis: string;
  tone: ImproveTone;
  /** When set, clicking the card selects this branch */
  branchId?: string;
}

export type BranchDayHint = {
  branchId: string;
  branchName: string;
  weakest?: { name: string; avg: number } | null;
  strongest?: { name: string; avg: number } | null;
};

function signedPct(n: number) {
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 500) return n > 0 ? 'sharp ↑' : 'sharp ↓';
  const v = Math.round(n);
  return `${v >= 0 ? '+' : ''}${v}%`;
}

function signedPeso(n: number) {
  const abs = formatPeso(Math.round(Math.abs(n)));
  return n >= 0 ? `+${abs}` : `−${abs}`;
}

function shortName(name: string) {
  return name
    .replace(/\s+Restaurant$/i, '')
    .replace(/^Kim'?s\s+Brothers$/i, "Kim's")
    .replace(/^PRIME BBQ$/i, 'PRIME')
    .replace(/^EESOME CAFE$/i, 'EESOME')
    .replace(/^Blue Moon$/i, 'Blue Moon')
    .trim();
}

/** All-branches: top 3 branch-specific short-term actions (sales ↑ or expenses check). */
export function buildFleetImproveActions(opts: {
  momBranches: MomBranchRow[];
  dayHints: BranchDayHint[];
}): ImproveAction[] {
  const { momBranches, dayHints } = opts;
  const hintOf = (id: string) => dayHints.find(h => h.branchId === id);
  const actions: ImproveAction[] = [];
  const used = new Set<string>();

  const byExpenseSpike = [...momBranches]
    .filter(b => b.delta.expenses > 0 && b.delta.expensesPct >= 15)
    .sort((a, c) => c.delta.expensesPct - a.delta.expensesPct);

  const bySalesDrop = [...momBranches]
    .filter(b => b.delta.sales < 0 && Math.abs(b.delta.salesPct) >= 5)
    .sort((a, c) => a.delta.salesPct - c.delta.salesPct);

  const byProfitDrop = [...momBranches]
    .filter(b => b.delta.profit < 0 && Math.abs(b.delta.profitPct) >= 5)
    .sort((a, c) => a.delta.profit - c.delta.profit);

  // 1) Expense spike — name the branch
  for (const b of byExpenseSpike) {
    if (actions.length >= 3) break;
    if (used.has(b.branchId)) continue;
    used.add(b.branchId);
    actions.push({
      problem: `${shortName(b.branchName)}: expenses spiked`,
      why: `Expenses ${signedPeso(b.delta.expenses)} (${signedPct(b.delta.expensesPct)}) vs last month`,
      doThis: 'Check food invoices, OT & waste',
      tone: 'rose',
      branchId: b.branchId,
    });
  }

  // 2) Sales down — push short-term sales
  for (const b of bySalesDrop) {
    if (actions.length >= 3) break;
    if (used.has(b.branchId)) continue;
    used.add(b.branchId);
    const weak = hintOf(b.branchId)?.weakest;
    actions.push({
      problem: `${shortName(b.branchName)}: sales down`,
      why: `Sales ${signedPeso(b.delta.sales)} (${signedPct(b.delta.salesPct)}) · orders ${signedPct(b.delta.ordersPct)}`,
      doThis: weak
        ? `${weak.name} promo + push Top Revenue`
        : 'Local promo + feature Top Revenue',
      tone: 'rose',
      branchId: b.branchId,
    });
  }

  // 3) Profit down without sales drop = cost issue already partly covered; else sales recovery
  for (const b of byProfitDrop) {
    if (actions.length >= 3) break;
    if (used.has(b.branchId)) continue;
    used.add(b.branchId);
    const costDriven = b.delta.expensesPct >= 10 && b.delta.salesPct >= -3;
    actions.push({
      problem: costDriven
        ? `${shortName(b.branchName)}: check expenses`
        : `${shortName(b.branchName)}: need more sales`,
      why: `Profit ${signedPeso(b.delta.profit)} (${signedPct(b.delta.profitPct)}) vs last month`,
      doThis: costDriven
        ? 'Review expense list — food, labor, suppliers'
        : 'Set+drink deal + upsell every table',
      tone: costDriven ? 'amber' : 'rose',
      branchId: b.branchId,
    });
  }

  // 4) Fill with dead-day sales lift (branch-named)
  if (actions.length < 3) {
    const gaps = dayHints
      .filter(h => h.weakest && h.strongest && (h.strongest.avg > h.weakest.avg * 1.25))
      .map(h => ({
        ...h,
        gap: (h.strongest!.avg - h.weakest!.avg),
      }))
      .sort((a, c) => c.gap - a.gap);

    for (const h of gaps) {
      if (actions.length >= 3) break;
      if (used.has(h.branchId)) continue;
      used.add(h.branchId);
      actions.push({
        problem: `${shortName(h.branchName)}: lift ${h.weakest!.name}`,
        why: `${h.weakest!.name} ${formatPeso(Math.round(h.weakest!.avg))} vs ${h.strongest!.name} ${formatPeso(Math.round(h.strongest!.avg))}`,
        doThis: `${h.weakest!.name}-only combo to add sales`,
        tone: 'amber',
        branchId: h.branchId,
      });
    }
  }

  if (actions.length === 0 && momBranches[0]) {
    const best = [...momBranches].sort((a, c) => c.delta.profitPct - a.delta.profitPct)[0];
    actions.push({
      problem: `${shortName(best.branchName)}: keep growing`,
      why: `Profit ${signedPct(best.delta.profitPct)} vs last month`,
      doThis: 'One promo day + upsell drink/dessert',
      tone: 'emerald',
      branchId: best.branchId,
    });
  }

  return actions.slice(0, 3);
}

/** Single-branch: short-term MoM sales / expense actions. */
export function buildImproveActions(opts: {
  scopeName: string;
  currentLabel: string;
  previousLabel: string;
  current: MomTotals;
  previous: MomTotals;
  delta: MomDelta;
  weekendLift: number;
  weekendAvg: number;
  weekdayAvg: number;
  weakestDay?: { name: string; avg: number } | null;
  strongestDay?: { name: string; avg: number } | null;
  topMenuName?: string;
  branchId?: string;
}): ImproveAction[] {
  const {
    scopeName, delta, current, previous,
    weekendLift, weakestDay, strongestDay, topMenuName, branchId,
  } = opts;
  const actions: ImproveAction[] = [];
  const name = shortName(scopeName);

  if (delta.expenses > 0 && delta.expensesPct >= 15) {
    actions.push({
      problem: `${name}: expenses spiked`,
      why: `Expenses ${signedPeso(delta.expenses)} (${signedPct(delta.expensesPct)}) vs last month`,
      doThis: 'This week: check food invoices, overtime & waste',
      tone: 'rose',
      branchId,
    });
  }

  if (delta.sales < 0 && Math.abs(delta.salesPct) >= 5) {
    actions.push({
      problem: `${name}: sales down`,
      why: `Sales ${signedPeso(delta.sales)} (${signedPct(delta.salesPct)}) · orders ${signedPct(delta.ordersPct)}`,
      doThis: weakestDay
        ? `This week: ${weakestDay.name} promo + push ${topMenuName || 'Top Revenue'}`
        : `This week: local promo + feature ${topMenuName || 'Top Revenue'}`,
      tone: 'rose',
      branchId,
    });
  }

  if (delta.profit < 0 && Math.abs(delta.profitPct) >= 5 && actions.length < 3) {
    const costDriven = delta.expensesPct >= 10 && delta.salesPct >= -3;
    if (!actions.some(a => a.problem.includes('expenses'))) {
      actions.push({
        problem: costDriven ? `${name}: check expenses` : `${name}: need more sales`,
        why: `Profit ${signedPeso(delta.profit)} (${signedPct(delta.profitPct)}) vs last month`,
        doThis: costDriven
          ? 'This week: review food, labor & supplier costs'
          : 'This week: set+drink deal + staff upsell',
        tone: costDriven ? 'amber' : 'rose',
        branchId,
      });
    }
  }

  if (delta.sales > 0 && delta.salesPct >= 8 && delta.profitPct < delta.salesPct - 5 && actions.length < 3) {
    actions.push({
      problem: `${name}: sales up, costs high`,
      why: `Sales ${signedPct(delta.salesPct)} but profit ${signedPct(delta.profitPct)} · margin ${current.margin.toFixed(0)}% (was ${previous.margin.toFixed(0)}%)`,
      doThis: 'This week: cut waste/OT — keep the sales, protect the gain',
      tone: 'amber',
      branchId,
    });
  }

  if (weakestDay && strongestDay && strongestDay.avg > weakestDay.avg * 1.2 && actions.length < 3) {
    actions.push({
      problem: `${name}: lift ${weakestDay.name}`,
      why: `${weakestDay.name} ${formatPeso(Math.round(weakestDay.avg))} vs ${strongestDay.name} ${formatPeso(Math.round(strongestDay.avg))}`,
      doThis: `This week: ${weakestDay.name} combo${topMenuName ? ` + ${topMenuName}` : ''} to add sales`,
      tone: 'amber',
      branchId,
    });
  }

  if (weekendLift < -8 && actions.length < 3) {
    actions.push({
      problem: `${name}: weekend soft`,
      why: `Weekend ${Math.abs(weekendLift).toFixed(0)}% below weekday`,
      doThis: 'This weekend: set menu + group promo',
      tone: 'amber',
      branchId,
    });
  }

  if (actions.length === 0) {
    actions.push({
      problem: `${name}: grow sales`,
      why: `Profit ${signedPct(delta.profitPct)} · sales ${formatFullPeso(current.sales)}`,
      doThis: weakestDay
        ? `This week: ${weakestDay.name} promo + upsell drink`
        : 'This week: one promo day + upsell drink/dessert',
      tone: 'emerald',
      branchId,
    });
  }

  return actions.slice(0, 3);
}

/** @deprecated use buildFleetImproveActions — kept for callers that only need worst branch */
export function worstProfitMomBranch(mom: MomComparison | null): MomBranchRow | null {
  if (!mom?.branches?.length) return null;
  return [...mom.branches]
    .filter(b => b.previous.profit !== 0 || b.current.profit !== 0)
    .sort((a, c) => a.delta.profitPct - c.delta.profitPct)[0] || null;
}

/** Solutions when viewing a specific weekday (esp. weak / dead day). */
export function buildDeadDaySolutions(opts: {
  dayName: string;
  avgSales: number;
  branchDailyAvg: number;
  strongDayName?: string;
  strongAvg?: number;
  weakTopMenus: TopSellingItem[];
  strongTopMenus: TopSellingItem[];
}): ImproveAction[] {
  const { dayName, avgSales, branchDailyAvg, strongDayName, strongAvg, weakTopMenus, strongTopMenus } = opts;
  const isWeak = branchDailyAvg > 0 && avgSales < branchDailyAvg * 0.85;
  const gap = (strongAvg || 0) - avgSales;
  const actions: ImproveAction[] = [];

  if (isWeak) {
    actions.push({
      problem: `${dayName}: dead day`,
      why: `Avg ${formatPeso(Math.round(avgSales))} below daily avg ${formatPeso(Math.round(branchDailyAvg))}`,
      doThis: `This ${dayName}: set+drink deal — post AM, staff suggest first`,
      tone: 'rose',
    });
  }

  if (strongDayName && strongAvg && gap > 0) {
    const missing = strongTopMenus
      .map(s => s.name)
      .filter(n => !weakTopMenus.some(w => w.name === n))
      .slice(0, 2);
    actions.push({
      problem: `Add sales vs ${strongDayName}`,
      why: `${strongDayName} makes ${formatPeso(Math.round(gap))} more / day`,
      doThis: missing.length
        ? `Push on ${dayName}: ${missing.join(' · ')}`
        : `Copy ${strongDayName} set pricing this ${dayName}`,
      tone: 'amber',
    });
  }

  if (weakTopMenus[0]) {
    actions.push({
      problem: `Push #1: ${weakTopMenus[0].name}`,
      why: `${weakTopMenus[0].qtySold.toLocaleString()} sold on ${dayName}`,
      doThis: `This ${dayName}: table tent + combo upsell`,
      tone: 'emerald',
    });
  }

  if (actions.length === 0) {
    actions.push({
      problem: `${dayName}: add-on sales`,
      why: `Near daily average`,
      doThis: 'Suggest drink/dessert on every check',
      tone: 'emerald',
    });
  }

  return actions.slice(0, 3);
}
