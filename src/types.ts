export interface Branch {
  id: string;
  name: string;
  city: string;
  locationTag: string;
  manager: string;
  isFlagship?: boolean;
  /** Relative path e.g. /uploads/branches/foo.webp */
  logo?: string | null;
}

export interface BranchTotals {
  sales: number;        // 매출액
  expenses: number;     // 비용
  netProfit: number;    // 순이익 (sales - expenses)
  expenseRate: number;  // (expenses / sales) * 100
  profitRate: number;   // (netProfit / sales) * 100
  orders: number;       // order count
}

export type Sentiment = 'positive' | 'negative' | 'neutral';

export interface ComparisonWindowCell {
  baselineAmount: number; // Baseline amount (전월 or 평균)
  indexPercent: number;   // 100 + % change (e.g. 104.4 for +4.4%)
  hasArrow: boolean;      // Only for 전월 동기 대비
  arrowDirection?: 'up' | 'down';
  sentiment: Sentiment;   // Green/Red logic
  dateRangeCurrent: string;
  dateRangeBaseline: string;
  currentAmount: number;
}

export interface MainExpenseCategoryData {
  id: string;
  labelKorean: string;
  labelEnglish: string;
  amount: number;
  ratioOfSales: number; // (amount / sales) * 100
}

export interface BranchComparisonData {
  branch: Branch;
  totals: BranchTotals;
  salesWindows: {
    samePeriod: ComparisonWindowCell;  // 전월 동기 대비(3일전 기준)
    fullPrevMonth: ComparisonWindowCell; // 전월 대비
    threeMonthAvg: ComparisonWindowCell; // 평균 대비
  };
  expensesWindows: {
    samePeriod: ComparisonWindowCell;
    fullPrevMonth: ComparisonWindowCell;
    threeMonthAvg: ComparisonWindowCell;
  };
  profitWindows: {
    samePeriod: ComparisonWindowCell;
    fullPrevMonth: ComparisonWindowCell;
    threeMonthAvg: ComparisonWindowCell;
  };
  mainExpenses: {
    foodLiquor: MainExpenseCategoryData; // 식자재 및 주류
    rent: MainExpenseCategoryData;       // 임대료
    labor: MainExpenseCategoryData;      // 급여
    others: MainExpenseCategoryData;     // 그밖에
  };
}

export interface MenuItemData {
  id: string;
  name: string;
  category: 'Popular Mains' | 'Appetizers' | 'Beverages' | 'Desserts';
  price: number;
  cost: number;
  marginPercent: number;
  totalSold: number;
  totalRevenue: number;
  bestBranchId: string;
  bestBranchName: string;
  foodCostPercent: number;
  image: string;
  status: 'High Margin' | 'Best Seller' | 'Slow Mover' | 'Low Margin';
}

export interface POSOrder {
  id: string;
  orderNumber: string;
  branchId: string;
  branchName: string;
  type: 'Dine-In' | 'Takeaway' | 'Delivery';
  items: { name: string; qty: number; price: number }[];
  total: number;
  status: 'Preparing' | 'Cooking' | 'Ready' | 'Completed';
  time: string;
  tableNo?: string;
  customerName?: string;
}

export type CellPopupType = 'total_rate' | 'comparison' | 'main_expense';

export interface PopupModalState {
  isOpen: boolean;
  type: CellPopupType;
  title: string;
  metricLabel: string;
  branchName: string;
  branchId: string;
  amount?: number;
  sales?: number;
  rate?: number;
  baselineAmount?: number;
  indexPercent?: number;
  dateRangeCurrent?: string;
  dateRangeBaseline?: string;
  categoryName?: string;
  formulaDescription?: string;
  /** When true (expense compare), index ↑ = bad (red). */
  invertSentiment?: boolean;
  /** Viewport coords for anchored popover (restoAdmin-style). */
  anchor?: { top: number; left: number } | null;
}
