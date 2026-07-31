import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import mysql from "mysql2/promise";

dotenv.config();

// ─── MySQL Connection (same DB as restoAdmin) ───
const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "restaurant",
  port: Number(process.env.DB_PORT) || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

(async () => {
  try {
    const conn = await pool.getConnection();
    console.log(`✅ Connected to MySQL at ${process.env.DB_HOST || "localhost"}:${process.env.DB_PORT || 3306} - DB: ${process.env.DB_NAME || "restaurant"}`);
    conn.release();
  } catch (err: any) {
    console.error("❌ MySQL connection failed:", err.message);
  }
})();

// ─── Helper: date range for current month ───
function getCurrentMonthRange() {
  const today = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    start_date: `${today.getFullYear()}-${pad(today.getMonth() + 1)}-01`,
    end_date: `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`,
  };
}

const EXCLUDED_BRANCHES = ['NOIR BY EESOME', '3Core', '3CORE'];

/** Same calendar days last month (fair MTD vs MTD). Caps at last day of prev month. */
function getPrevMonthSamePeriodRange() {
  const today = new Date();
  const day = today.getDate();
  const prev = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const lastDayPrev = new Date(today.getFullYear(), today.getMonth(), 0).getDate();
  const endDay = Math.min(day, lastDayPrev);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    start_date: `${prev.getFullYear()}-${pad(prev.getMonth() + 1)}-01`,
    end_date: `${prev.getFullYear()}-${pad(prev.getMonth() + 1)}-${pad(endDay)}`,
  };
}

function periodLabel(start: string, end: string) {
  const s = new Date(start + "T12:00:00");
  const e = new Date(end + "T12:00:00");
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  return `${s.toLocaleDateString("en-US", opts)}–${e.toLocaleDateString("en-US", opts)}`;
}

// ─── Start Server ───
async function startServer() {
  const app = express();
  const PORT = 3000;
  app.use(express.json());

  let aiClient: GoogleGenAI | null = null;
  function getAI() {
    if (!aiClient) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (apiKey) aiClient = new GoogleGenAI({ apiKey });
    }
    return aiClient;
  }

  // ─── Health ───
  app.get("/api/health", async (_req, res) => {
    try {
      const conn = await pool.getConnection();
      conn.release();
      res.json({ status: "ok", db: "connected", timestamp: new Date().toISOString() });
    } catch {
      res.json({ status: "ok", db: "disconnected", timestamp: new Date().toISOString() });
    }
  });

  // ─── Branches ───
  app.get("/api/branches", async (_req, res) => {
    try {
      const placeholders = EXCLUDED_BRANCHES.map(() => '?').join(',');
      const [rows] = await pool.execute(
        `SELECT IDNo as id, BRANCH_CODE as code, BRANCH_NAME as name FROM branches WHERE ACTIVE = 1 AND BRANCH_NAME NOT IN (${placeholders}) ORDER BY BRANCH_NAME`,
        EXCLUDED_BRANCHES
      );
      res.json({ success: true, data: rows });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── Admin Dashboard Bundle (main analytics endpoint) ───
  app.get("/api/analytics/admin-dashboard-bundle", async (req, res) => {
    try {
      const { start_date, end_date } = req.query.start_date
        ? { start_date: req.query.start_date as string, end_date: req.query.end_date as string }
        : getCurrentMonthRange();

      const branchIdFilter = req.query.branch_id ? Number(req.query.branch_id) : null;

      // 1) Branch sales
      let salesQuery = `
        SELECT
          b2.IDNo as branch_id,
          b2.BRANCH_NAME as branch_name,
          COALESCE(SUM(b.AMOUNT_PAID), 0) as total_sales,
          COALESCE(SUM(b.REFUND), 0) as total_refund,
          COALESCE(SUM(b.AMOUNT_PAID) - SUM(COALESCE(b.REFUND, 0)), 0) as net_sales,
          COUNT(DISTINCT b.ORDER_ID) as order_count
        FROM branches b2
        LEFT JOIN billing b ON b.BRANCH_ID = b2.IDNo
          AND b.STATUS IN (1, 2)
          AND DATE(b.ENCODED_DT) BETWEEN ? AND ?
        WHERE b2.ACTIVE = 1 AND b2.BRANCH_NAME NOT IN (${EXCLUDED_BRANCHES.map(() => '?').join(',')})
      `;
      const salesParams: any[] = [start_date, end_date, ...EXCLUDED_BRANCHES];
      if (branchIdFilter) {
        salesQuery += ` AND b2.IDNo = ?`;
        salesParams.push(branchIdFilter);
      }
      salesQuery += ` GROUP BY b2.IDNo, b2.BRANCH_NAME ORDER BY net_sales DESC`;

      const [branchSales] = await pool.execute(salesQuery, salesParams);

      // 2) Daily sales trend (all branches or filtered)
      let dailyQuery = `
        SELECT
          DATE(b.ENCODED_DT) as sale_date,
          COALESCE(SUM(b.AMOUNT_PAID), 0) as total_sales,
          COALESCE(SUM(b.REFUND), 0) as total_refund
        FROM billing b
        WHERE b.STATUS IN (1, 2)
          AND DATE(b.ENCODED_DT) BETWEEN ? AND ?
      `;
      const dailyParams: any[] = [start_date, end_date];
      if (branchIdFilter) {
        dailyQuery += ` AND b.BRANCH_ID = ?`;
        dailyParams.push(branchIdFilter);
      }
      dailyQuery += ` GROUP BY DATE(b.ENCODED_DT) ORDER BY sale_date`;

      const [dailySales] = await pool.execute(dailyQuery, dailyParams);

      // 3) Expense totals by branch (same active branches only)
      let expenseQuery = `
        SELECT
          e.BRANCH_ID as branch_id,
          COALESCE(SUM(e.EXP_AMOUNT), 0) as total_expense
        FROM expenses e
        INNER JOIN branches b2 ON b2.IDNo = e.BRANCH_ID
        WHERE e.ACTIVE = 1
          AND b2.ACTIVE = 1
          AND b2.BRANCH_NAME NOT IN (${EXCLUDED_BRANCHES.map(() => '?').join(',')})
          AND DATE(e.ENCODED_DT) BETWEEN ? AND ?
      `;
      const expParams: any[] = [...EXCLUDED_BRANCHES, start_date, end_date];
      if (branchIdFilter) {
        expenseQuery += ` AND e.BRANCH_ID = ?`;
        expParams.push(branchIdFilter);
      }
      expenseQuery += ` GROUP BY e.BRANCH_ID`;

      const [expenseRows] = await pool.execute(expenseQuery, expParams) as any[];

      // 4) Expense category breakdown by branch
      let expCatQuery = `
        SELECT
          e.BRANCH_ID as branch_id,
          COALESCE(mc.CATEGORY_NAME, 'Others') as exp_cat,
          COALESCE(e.EXP_DESC, 'Other') as exp_name,
          COALESCE(SUM(e.EXP_AMOUNT), 0) as total_amount
        FROM expenses e
        LEFT JOIN master_categories mc ON e.MASTER_CAT_ID = mc.IDNo
        WHERE e.ACTIVE = 1
          AND DATE(e.ENCODED_DT) BETWEEN ? AND ?
      `;
      const expCatParams: any[] = [start_date, end_date];
      if (branchIdFilter) {
        expCatQuery += ` AND e.BRANCH_ID = ?`;
        expCatParams.push(branchIdFilter);
      }
      expCatQuery += ` GROUP BY e.BRANCH_ID, mc.CATEGORY_NAME, e.EXP_DESC`;

      const [expCatRows] = await pool.execute(expCatQuery, expCatParams) as any[];

      // 5) Top selling items
      let topQuery = `
        SELECT
          m.MENU_NAME,
          m.CATEGORY_ID,
          SUM(oi.QTY) as total_quantity,
          SUM(oi.LINE_TOTAL) as total_revenue
        FROM order_items oi
        JOIN orders o ON oi.ORDER_ID = o.IDNo
        JOIN menu m ON oi.MENU_ID = m.IDNo
        WHERE DATE(o.ENCODED_DT) BETWEEN ? AND ?
      `;
      const topParams: any[] = [start_date, end_date];
      if (branchIdFilter) {
        topQuery += ` AND o.BRANCH_ID = ?`;
        topParams.push(branchIdFilter);
      }
      topQuery += ` GROUP BY m.IDNo, m.MENU_NAME, m.CATEGORY_ID ORDER BY total_revenue DESC LIMIT 10`;

      const [topItems] = await pool.execute(topQuery, topParams);

      // 6) Daily expenses for trend
      let dailyExpQuery = `
        SELECT
          DATE(e.ENCODED_DT) as expense_date,
          COALESCE(SUM(e.EXP_AMOUNT), 0) as total_expense
        FROM expenses e
        WHERE e.ACTIVE = 1
          AND DATE(e.ENCODED_DT) BETWEEN ? AND ?
      `;
      const dailyExpParams: any[] = [start_date, end_date];
      if (branchIdFilter) {
        dailyExpQuery += ` AND e.BRANCH_ID = ?`;
        dailyExpParams.push(branchIdFilter);
      }
      dailyExpQuery += ` GROUP BY DATE(e.ENCODED_DT) ORDER BY expense_date`;

      const [dailyExpenses] = await pool.execute(dailyExpQuery, dailyExpParams) as any[];

      // ─── Build response ───
      const expenseByBranch: Record<string, number> = {};
      for (const r of expenseRows) {
        expenseByBranch[String(r.branch_id)] = Number(r.total_expense) || 0;
      }

      const expenseCategoryByBranch: Record<string, Record<string, number>> = {};
      for (const r of expCatRows) {
        const bid = String(r.branch_id);
        if (!expenseCategoryByBranch[bid]) expenseCategoryByBranch[bid] = {};
        const key = `${r.exp_cat}|${r.exp_name}`;
        expenseCategoryByBranch[bid][key] = (expenseCategoryByBranch[bid][key] || 0) + Number(r.total_amount);
      }

      const branchCardsData = (branchSales as any[]).map((b: any) => ({
        id: b.branch_id,
        name: b.branch_name,
        totalSales: Number(b.net_sales) || 0,
        reportSalesPos: Number(b.net_sales) || 0,
        totalExpenses: expenseByBranch[String(b.branch_id)] || 0,
        totalOrders: Number(b.order_count) || 0,
        reconTotal: 0,
      }));

      const totalSales = branchCardsData.reduce((s: number, b: any) => s + b.totalSales, 0);
      const totalExpenses = branchCardsData.reduce((s: number, b: any) => s + b.totalExpenses, 0);

      // Build daily trend data (normalize MySQL DATE → local YYYY-MM-DD)
      const toDateKey = (val: any): string => {
        if (val instanceof Date && !Number.isNaN(val.getTime())) {
          const pad = (n: number) => String(n).padStart(2, "0");
          return `${val.getFullYear()}-${pad(val.getMonth() + 1)}-${pad(val.getDate())}`;
        }
        const s = String(val);
        if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
          // ISO midnight UTC often shifts a day in PH — prefer local parse
          const d = new Date(s);
          if (!Number.isNaN(d.getTime()) && s.includes("T")) {
            const pad = (n: number) => String(n).padStart(2, "0");
            return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
          }
          return s.slice(0, 10);
        }
        return s.slice(0, 10);
      };

      const dailySalesMap = new Map<string, number>();
      const dailyExpMap = new Map<string, number>();
      for (const r of dailySales as any[]) {
        const d = toDateKey(r.sale_date);
        dailySalesMap.set(d, (dailySalesMap.get(d) || 0) + Number(r.total_sales) - Number(r.total_refund || 0));
      }
      for (const r of dailyExpenses) {
        const d = toDateKey(r.expense_date);
        dailyExpMap.set(d, (dailyExpMap.get(d) || 0) + Number(r.total_expense));
      }

      const allDates = new Set([...dailySalesMap.keys(), ...dailyExpMap.keys()]);
      const trendData = Array.from(allDates)
        .sort()
        .map((date) => ({
          name: String(new Date(date + "T12:00:00").getDate()),
          date,
          totalSales: dailySalesMap.get(date) || 0,
          totalExpenses: dailyExpMap.get(date) || 0,
        }));

    res.json({
        summary: { totalSales, totalExpenses, totalRevenue: totalSales - totalExpenses },
        branchCardsData,
        branchRevenueDistribution: branchCardsData.map((b: any) => ({ name: b.name, value: b.totalSales })),
        topProductsData: (topItems as any[]).slice(0, 5).map((i: any) => ({ name: i.MENU_NAME, sales: i.total_quantity })),
        dailySalesForCards: dailySales,
        trendData,
        trendPeriod: "daily",
        expenseCategoryByBranch,
        expenseRentByBranch: {},
        expenseSalaryByBranch: {},
        branchChartsById: {},
      });
    } catch (err: any) {
      console.error("[admin-dashboard-bundle] Error:", err.message);
      res.status(500).json({ error: err.message, fallback: true });
    }
  });

  // ─── Top Selling Items (incl. Room Charge like restoAdmin top-profit-drivers) ───
  app.get("/api/analytics/top-selling", async (req, res) => {
    try {
      const { start_date, end_date } = req.query.start_date
        ? { start_date: req.query.start_date as string, end_date: req.query.end_date as string }
        : getCurrentMonthRange();
      const limit = Number(req.query.limit) || 10;
      const branchId = req.query.branch_id ? Number(req.query.branch_id) : null;
      const dayName = req.query.day_name ? String(req.query.day_name) : null;
      const dayOfWeekMap: Record<string, number> = {
        Sunday: 1, Monday: 2, Tuesday: 3, Wednesday: 4, Thursday: 5, Friday: 6, Saturday: 7,
      };
      const dayFilterSql =
        dayName && dayOfWeekMap[dayName]
          ? ` AND DAYOFWEEK(DATE(b.ENCODED_DT)) = ${dayOfWeekMap[dayName]}`
          : "";

      const baseParams: any[] = [start_date, end_date];
      let branchSql = "";
      if (branchId) {
        branchSql = ` AND b.BRANCH_ID = ?`;
        baseParams.push(branchId);
      }

      const menuQuery = `
        SELECT
          m.IDNo as menu_id,
          m.MENU_NAME,
          SUM(oi.QTY) as total_quantity,
          SUM(oi.LINE_TOTAL) as total_revenue,
          ROUND(AVG(oi.UNIT_PRICE), 2) as unit_price,
          b.BRANCH_ID as branch_id,
          br.BRANCH_NAME as branch_name
        FROM order_items oi
        JOIN orders o ON oi.ORDER_ID = o.IDNo
        JOIN billing b ON b.ORDER_ID = o.IDNo AND b.STATUS IN (1, 2)
        JOIN menu m ON oi.MENU_ID = m.IDNo
        LEFT JOIN categories c ON c.IDNo = m.CATEGORY_ID
        LEFT JOIN branches br ON b.BRANCH_ID = br.IDNo
        WHERE DATE(b.ENCODED_DT) BETWEEN ? AND ?
          ${branchSql}
          ${dayFilterSql}
          AND UPPER(TRIM(COALESCE(m.MENU_NAME, ''))) <> 'ROOM CHARGE'
          AND UPPER(TRIM(COALESCE(c.CAT_NAME, ''))) <> 'ROOM CHARGE'
        GROUP BY m.IDNo, m.MENU_NAME, b.BRANCH_ID, br.BRANCH_NAME
        HAVING SUM(oi.LINE_TOTAL) > 0
      `;

      const roomChargeQuery = `
        SELECT
          -9998 as menu_id,
          'Room Charge' as MENU_NAME,
          SUM(rc.sales_qty) as total_quantity,
          SUM(rc.total_sales) as total_revenue,
          CASE WHEN SUM(rc.sales_qty) > 0
            THEN ROUND(SUM(rc.total_sales) / SUM(rc.sales_qty), 2)
            ELSE 0 END as unit_price,
          rc.branch_id as branch_id,
          COALESCE(MAX(br.BRANCH_NAME), '') as branch_name
        FROM (
          SELECT
            b.BRANCH_ID as branch_id,
            COUNT(DISTINCT o.IDNo) as sales_qty,
            COALESCE(SUM(o.SERVICE_CHARGE), 0) as total_sales
          FROM orders o
          JOIN billing b ON b.ORDER_ID = o.IDNo AND b.STATUS IN (1, 2)
          LEFT JOIN restaurant_tables rt ON rt.IDNo = o.TABLE_ID
          WHERE COALESCE(o.SERVICE_CHARGE, 0) > 0
            AND COALESCE(rt.ROOM_CHARGE, 0) > 0
            AND DATE(b.ENCODED_DT) BETWEEN ? AND ?
            ${branchSql}
            ${dayFilterSql}
          GROUP BY b.BRANCH_ID

          UNION ALL

          SELECT
            b.BRANCH_ID as branch_id,
            COALESCE(SUM(oi.QTY), 0) as sales_qty,
            COALESCE(SUM(oi.LINE_TOTAL), 0) as total_sales
          FROM orders o
          JOIN billing b ON b.ORDER_ID = o.IDNo AND b.STATUS IN (1, 2)
          JOIN order_items oi ON oi.ORDER_ID = o.IDNo
          JOIN menu m ON m.IDNo = oi.MENU_ID
          LEFT JOIN categories c ON c.IDNo = m.CATEGORY_ID
          WHERE UPPER(TRIM(COALESCE(c.CAT_NAME, ''))) = 'ROOM CHARGE'
            AND UPPER(TRIM(COALESCE(m.MENU_NAME, ''))) <> 'ROOM CHARGE'
            AND DATE(b.ENCODED_DT) BETWEEN ? AND ?
            ${branchSql}
            ${dayFilterSql}
          GROUP BY b.BRANCH_ID
        ) rc
        LEFT JOIN branches br ON br.IDNo = rc.branch_id
        GROUP BY rc.branch_id
        HAVING SUM(rc.total_sales) > 0
      `;

      // Params: menu (base) + room header (base) + room category items (base)
      const params = [...baseParams, ...baseParams, ...baseParams];
      const query = `
        SELECT menu_id, MENU_NAME, total_quantity, total_revenue, unit_price, branch_id, branch_name
        FROM (
          ${menuQuery}
          UNION ALL
          ${roomChargeQuery}
        ) combined
        ORDER BY total_revenue DESC
        LIMIT ?
      `;
      params.push(limit);

      const [rows] = await pool.execute(query, params);
      res.json({ success: true, data: rows });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── Menu item daily sales (for Top Revenue popup; Room Charge supported) ───
  app.get("/api/analytics/menu-daily", async (req, res) => {
    try {
      const { start_date, end_date } = req.query.start_date
        ? { start_date: req.query.start_date as string, end_date: req.query.end_date as string }
        : getCurrentMonthRange();
      const menuIdRaw = req.query.menu_id ? Number(req.query.menu_id) : NaN;
      const menuId = Number.isFinite(menuIdRaw) ? menuIdRaw : null;
      const menuName = req.query.menu_name ? String(req.query.menu_name) : null;
      const branchIdRaw = req.query.branch_id ? Number(req.query.branch_id) : NaN;
      const branchId = Number.isFinite(branchIdRaw) ? branchIdRaw : null;

      if (!menuId && !menuName) {
        return res.status(400).json({ error: "menu_id or menu_name required" });
      }

      const isRoomCharge =
        menuId === -9998 ||
        (menuName && menuName.trim().toUpperCase() === "ROOM CHARGE");

      if (isRoomCharge) {
        let branchSql = "";
        const params: any[] = [start_date, end_date];
        if (branchId) {
          branchSql = ` AND b.BRANCH_ID = ?`;
          params.push(branchId);
        }
        // Same params for both UNION branches
        const params2 = [...params];
        const query = `
          SELECT
            sale_date,
            DAYNAME(sale_date) as day_name,
            SUM(qty) as qty,
            SUM(revenue) as revenue
          FROM (
            SELECT
              DATE(b.ENCODED_DT) as sale_date,
              COUNT(DISTINCT o.IDNo) as qty,
              COALESCE(SUM(o.SERVICE_CHARGE), 0) as revenue
            FROM orders o
            JOIN billing b ON b.ORDER_ID = o.IDNo AND b.STATUS IN (1, 2)
            LEFT JOIN restaurant_tables rt ON rt.IDNo = o.TABLE_ID
            WHERE COALESCE(o.SERVICE_CHARGE, 0) > 0
              AND COALESCE(rt.ROOM_CHARGE, 0) > 0
              AND DATE(b.ENCODED_DT) BETWEEN ? AND ?
              ${branchSql}
            GROUP BY DATE(b.ENCODED_DT)

            UNION ALL

            SELECT
              DATE(b.ENCODED_DT) as sale_date,
              COALESCE(SUM(oi.QTY), 0) as qty,
              COALESCE(SUM(oi.LINE_TOTAL), 0) as revenue
            FROM orders o
            JOIN billing b ON b.ORDER_ID = o.IDNo AND b.STATUS IN (1, 2)
            JOIN order_items oi ON oi.ORDER_ID = o.IDNo
            JOIN menu m ON m.IDNo = oi.MENU_ID
            LEFT JOIN categories c ON c.IDNo = m.CATEGORY_ID
            WHERE UPPER(TRIM(COALESCE(c.CAT_NAME, ''))) = 'ROOM CHARGE'
              AND UPPER(TRIM(COALESCE(m.MENU_NAME, ''))) <> 'ROOM CHARGE'
              AND DATE(b.ENCODED_DT) BETWEEN ? AND ?
              ${branchSql}
            GROUP BY DATE(b.ENCODED_DT)
          ) daily_rc
          GROUP BY sale_date
          ORDER BY sale_date
        `;
        const [rows] = await pool.execute(query, [...params, ...params2]);
        return res.json({ success: true, data: rows });
      }

      let query = `
        SELECT
          DATE(b.ENCODED_DT) as sale_date,
          DAYNAME(DATE(b.ENCODED_DT)) as day_name,
          SUM(oi.QTY) as qty,
          SUM(oi.LINE_TOTAL) as revenue
        FROM order_items oi
        JOIN orders o ON oi.ORDER_ID = o.IDNo
        JOIN billing b ON b.ORDER_ID = o.IDNo AND b.STATUS IN (1, 2)
        JOIN menu m ON oi.MENU_ID = m.IDNo
        WHERE DATE(b.ENCODED_DT) BETWEEN ? AND ?
      `;
      const params: any[] = [start_date, end_date];
      if (menuId) {
        query += ` AND m.IDNo = ?`;
        params.push(menuId);
      } else if (menuName) {
        query += ` AND m.MENU_NAME = ?`;
        params.push(menuName);
      }
      if (branchId) {
        query += ` AND b.BRANCH_ID = ?`;
        params.push(branchId);
      }
      query += ` GROUP BY DATE(b.ENCODED_DT), DAYNAME(DATE(b.ENCODED_DT)) ORDER BY sale_date`;

      const [rows] = await pool.execute(query, params);
      res.json({ success: true, data: rows });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── Daily Sales ───
  app.get("/api/analytics/daily-sales", async (req, res) => {
    try {
      const { start_date, end_date } = req.query.start_date
        ? { start_date: req.query.start_date as string, end_date: req.query.end_date as string }
        : getCurrentMonthRange();
      const branchId = req.query.branch_id ? Number(req.query.branch_id) : null;

      let query = `
        SELECT
          DATE(b.ENCODED_DT) as sale_date,
          SUM(b.AMOUNT_PAID) as total_sales,
          SUM(COALESCE(b.REFUND, 0)) as total_refund,
          0 as total_discount,
          SUM(b.AMOUNT_PAID - COALESCE(b.REFUND, 0)) as net_sales,
          COUNT(DISTINCT b.ORDER_ID) as order_count
        FROM billing b
        WHERE b.STATUS IN (1, 2)
          AND DATE(b.ENCODED_DT) BETWEEN ? AND ?
      `;
      const params: any[] = [start_date, end_date];
      if (branchId) {
        query += ` AND b.BRANCH_ID = ?`;
        params.push(branchId);
      }
      query += ` GROUP BY DATE(b.ENCODED_DT) ORDER BY sale_date`;

      const [rows] = await pool.execute(query, params);
      res.json({ success: true, data: rows });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── Branch Sales ───
  app.get("/api/analytics/branch-sales", async (req, res) => {
    try {
      const { start_date, end_date } = req.query.start_date
        ? { start_date: req.query.start_date as string, end_date: req.query.end_date as string }
        : getCurrentMonthRange();

      const [rows] = await pool.execute(
        `SELECT
          b2.IDNo as branch_id,
          b2.BRANCH_NAME as branch_name,
          COALESCE(SUM(b.AMOUNT_PAID - COALESCE(b.REFUND, 0)), 0) as net_sales,
          COALESCE(SUM(b.AMOUNT_PAID), 0) as total_sales,
          COUNT(DISTINCT b.ORDER_ID) as order_count
        FROM branches b2
        LEFT JOIN billing b ON b.BRANCH_ID = b2.IDNo
          AND b.STATUS IN (1, 2)
          AND DATE(b.ENCODED_DT) BETWEEN ? AND ?
        WHERE b2.ACTIVE = 1 AND b2.BRANCH_NAME NOT IN (${EXCLUDED_BRANCHES.map(() => '?').join(',')})
        GROUP BY b2.IDNo, b2.BRANCH_NAME
        ORDER BY net_sales DESC`,
        [start_date, end_date, ...EXCLUDED_BRANCHES]
      );
      res.json({ success: true, data: rows });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── Expense Summary ───
  app.get("/api/analytics/expense-summary", async (req, res) => {
    try {
      const { start_date, end_date } = req.query.start_date
        ? { start_date: req.query.start_date as string, end_date: req.query.end_date as string }
        : getCurrentMonthRange();
      const branchId = req.query.branch_id ? Number(req.query.branch_id) : null;

      let query = `
        SELECT COALESCE(SUM(e.EXP_AMOUNT), 0) as total_expense
        FROM expenses e
        WHERE e.ACTIVE = 1 AND DATE(e.ENCODED_DT) BETWEEN ? AND ?
      `;
      const params: any[] = [start_date, end_date];
      if (branchId) {
        query += ` AND e.BRANCH_ID = ?`;
        params.push(branchId);
      }

      const [rows] = await pool.execute(query, params);
      res.json({ success: true, total_expense: (rows as any[])[0]?.total_expense || 0 });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── Expense Breakdown by Category ───
  app.get("/api/analytics/expense-breakdown", async (req, res) => {
    try {
      const { start_date, end_date } = req.query.start_date
        ? { start_date: req.query.start_date as string, end_date: req.query.end_date as string }
        : getCurrentMonthRange();
      const branchId = req.query.branch_id ? Number(req.query.branch_id) : null;

      let query = `
        SELECT
          e.BRANCH_ID as branch_id,
          COALESCE(mc.CATEGORY_NAME, 'Others') as exp_cat,
          COALESCE(e.EXP_DESC, 'Other') as exp_name,
          SUM(e.EXP_AMOUNT) as total_amount
        FROM expenses e
        LEFT JOIN master_categories mc ON e.MASTER_CAT_ID = mc.IDNo
        WHERE e.ACTIVE = 1 AND DATE(e.ENCODED_DT) BETWEEN ? AND ?
      `;
      const params: any[] = [start_date, end_date];
      if (branchId) {
        query += ` AND e.BRANCH_ID = ?`;
        params.push(branchId);
      }
      query += ` GROUP BY e.BRANCH_ID, mc.CATEGORY_NAME, e.EXP_DESC ORDER BY total_amount DESC`;

      const [rows] = await pool.execute(query, params);
      res.json({ success: true, data: rows });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── MoM comparison (current MTD vs same days last month) ───
  app.get("/api/analytics/mom-comparison", async (req, res) => {
    try {
      const cur = getCurrentMonthRange();
      const prev = getPrevMonthSamePeriodRange();
      const branchIdFilter = req.query.branch_id ? Number(req.query.branch_id) : null;
      const excl = EXCLUDED_BRANCHES.map(() => "?").join(",");

      async function loadPeriod(start_date: string, end_date: string) {
        let salesQ = `
          SELECT
            b2.IDNo as branch_id,
            b2.BRANCH_NAME as branch_name,
            COALESCE(SUM(b.AMOUNT_PAID - COALESCE(b.REFUND, 0)), 0) as net_sales,
            COUNT(DISTINCT b.ORDER_ID) as order_count
          FROM branches b2
          LEFT JOIN billing b ON b.BRANCH_ID = b2.IDNo
            AND b.STATUS IN (1, 2)
            AND DATE(b.ENCODED_DT) BETWEEN ? AND ?
          WHERE b2.ACTIVE = 1 AND b2.BRANCH_NAME NOT IN (${excl})
        `;
        const salesParams: any[] = [start_date, end_date, ...EXCLUDED_BRANCHES];
        if (branchIdFilter) {
          salesQ += ` AND b2.IDNo = ?`;
          salesParams.push(branchIdFilter);
        }
        salesQ += ` GROUP BY b2.IDNo, b2.BRANCH_NAME`;

        let expQ = `
          SELECT e.BRANCH_ID as branch_id, COALESCE(SUM(e.EXP_AMOUNT), 0) as total_expense
          FROM expenses e
          JOIN branches b2 ON e.BRANCH_ID = b2.IDNo
          WHERE e.ACTIVE = 1
            AND DATE(e.ENCODED_DT) BETWEEN ? AND ?
            AND b2.ACTIVE = 1 AND b2.BRANCH_NAME NOT IN (${excl})
        `;
        const expParams: any[] = [start_date, end_date, ...EXCLUDED_BRANCHES];
        if (branchIdFilter) {
          expQ += ` AND e.BRANCH_ID = ?`;
          expParams.push(branchIdFilter);
        }
        expQ += ` GROUP BY e.BRANCH_ID`;

        const [salesRows] = await pool.execute(salesQ, salesParams) as any[];
        const [expRows] = await pool.execute(expQ, expParams) as any[];
        const expMap: Record<string, number> = {};
        for (const r of expRows) expMap[String(r.branch_id)] = Number(r.total_expense) || 0;

        return (salesRows as any[]).map((b: any) => {
          const sales = Number(b.net_sales) || 0;
          const expenses = expMap[String(b.branch_id)] || 0;
          const profit = sales - expenses;
          const orders = Number(b.order_count) || 0;
          return {
            branchId: String(b.branch_id),
            branchName: b.branch_name as string,
            sales,
            expenses,
            profit,
            orders,
            margin: sales > 0 ? (profit / sales) * 100 : 0,
            expenseRate: sales > 0 ? (expenses / sales) * 100 : 0,
          };
        });
      }

      const [currentBranches, previousBranches] = await Promise.all([
        loadPeriod(cur.start_date, cur.end_date),
        loadPeriod(prev.start_date, prev.end_date),
      ]);

      const prevById = new Map(previousBranches.map(b => [b.branchId, b]));
      const branches = currentBranches.map(c => {
        const p = prevById.get(c.branchId) || {
          branchId: c.branchId, branchName: c.branchName,
          sales: 0, expenses: 0, profit: 0, orders: 0, margin: 0, expenseRate: 0,
        };
        const pct = (now: number, was: number) =>
          was === 0 ? (now > 0 ? 100 : 0) : ((now - was) / Math.abs(was)) * 100;
        return {
          branchId: c.branchId,
          branchName: c.branchName,
          current: c,
          previous: p,
          delta: {
            sales: c.sales - p.sales,
            salesPct: pct(c.sales, p.sales),
            profit: c.profit - p.profit,
            profitPct: pct(c.profit, p.profit),
            expenses: c.expenses - p.expenses,
            expensesPct: pct(c.expenses, p.expenses),
            orders: c.orders - p.orders,
            ordersPct: pct(c.orders, p.orders),
            marginPts: c.margin - p.margin,
          },
        };
      });

      const sum = (rows: typeof currentBranches, key: 'sales' | 'expenses' | 'profit' | 'orders') =>
        rows.reduce((s, b) => s + b[key], 0);
      const curTot = {
        sales: sum(currentBranches, 'sales'),
        expenses: sum(currentBranches, 'expenses'),
        profit: sum(currentBranches, 'profit'),
        orders: sum(currentBranches, 'orders'),
      };
      const prevTot = {
        sales: sum(previousBranches, 'sales'),
        expenses: sum(previousBranches, 'expenses'),
        profit: sum(previousBranches, 'profit'),
        orders: sum(previousBranches, 'orders'),
      };
      const pct = (now: number, was: number) =>
        was === 0 ? (now > 0 ? 100 : 0) : ((now - was) / Math.abs(was)) * 100;
      const fleet = {
        current: {
          ...curTot,
          margin: curTot.sales > 0 ? (curTot.profit / curTot.sales) * 100 : 0,
          expenseRate: curTot.sales > 0 ? (curTot.expenses / curTot.sales) * 100 : 0,
        },
        previous: {
          ...prevTot,
          margin: prevTot.sales > 0 ? (prevTot.profit / prevTot.sales) * 100 : 0,
          expenseRate: prevTot.sales > 0 ? (prevTot.expenses / prevTot.sales) * 100 : 0,
        },
        delta: {
          sales: curTot.sales - prevTot.sales,
          salesPct: pct(curTot.sales, prevTot.sales),
          profit: curTot.profit - prevTot.profit,
          profitPct: pct(curTot.profit, prevTot.profit),
          expenses: curTot.expenses - prevTot.expenses,
          expensesPct: pct(curTot.expenses, prevTot.expenses),
          orders: curTot.orders - prevTot.orders,
          ordersPct: pct(curTot.orders, prevTot.orders),
          marginPts: (curTot.sales > 0 ? (curTot.profit / curTot.sales) * 100 : 0)
            - (prevTot.sales > 0 ? (prevTot.profit / prevTot.sales) * 100 : 0),
        },
      };

      res.json({
        success: true,
        currentLabel: periodLabel(cur.start_date, cur.end_date),
        previousLabel: periodLabel(prev.start_date, prev.end_date),
        currentRange: cur,
        previousRange: prev,
        fleet,
        branches,
      });
    } catch (err: any) {
      console.error("[mom-comparison] Error:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ─── Daily Sales Per Branch (for weakness/strength analysis) ───
  app.get("/api/analytics/daily-per-branch", async (req, res) => {
    try {
      const { start_date, end_date } = req.query.start_date
        ? { start_date: req.query.start_date as string, end_date: req.query.end_date as string }
        : getCurrentMonthRange();

      const excl = EXCLUDED_BRANCHES.map(() => '?').join(',');
      const [rows] = await pool.execute(
        `SELECT
          b2.IDNo as branch_id,
          b2.BRANCH_NAME as branch_name,
          DATE(b.ENCODED_DT) as sale_date,
          DAYNAME(DATE(b.ENCODED_DT)) as day_name,
          COALESCE(SUM(b.AMOUNT_PAID - COALESCE(b.REFUND, 0)), 0) as net_sales,
          COUNT(DISTINCT b.ORDER_ID) as order_count
        FROM branches b2
        LEFT JOIN billing b ON b.BRANCH_ID = b2.IDNo
          AND b.STATUS IN (1,2)
          AND DATE(b.ENCODED_DT) BETWEEN ? AND ?
        WHERE b2.ACTIVE = 1 AND b2.BRANCH_NAME NOT IN (${excl})
        GROUP BY b2.IDNo, b2.BRANCH_NAME, DATE(b.ENCODED_DT)
        HAVING sale_date IS NOT NULL
        ORDER BY b2.BRANCH_NAME, sale_date`,
        [start_date, end_date, ...EXCLUDED_BRANCHES]
      );
      res.json({ success: true, data: rows });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── AI Advisor ───
  app.post("/api/ai-insights", async (req, res) => {
    try {
      const { prompt, branchData, question } = req.body;
      const ai = getAI();

      if (!ai) {
        return res.json({
          insight:
            "Gemini API key is not configured. Focus on reducing food waste at high-expense branches and optimize kitchen labor during non-peak hours.",
          suggestedActions: [
            "Renegotiate wholesale prices with suppliers",
            "Adjust shift schedules to match peak hours",
            "Promote high-margin combo meals",
          ],
        });
      }

      const systemPrompt = `You are an expert Restaurant Operations & Financial Analyst for a multi-branch restaurant owner. Analyze branch performance data and answer questions accurately in Tagalog/English with clear, actionable bullet points. Keep response concise, friendly, and practical.`;
      const userContent = `Branch Performance Data:\n${JSON.stringify(branchData, null, 2)}\n\nUser Question: ${question || prompt || "Provide top 3 strategic recommendations for improving overall profitability across branches."}`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts: [{ text: systemPrompt + "\n\n" + userContent }] }],
      });

      res.json({ insight: response.text || "No insights generated." });
    } catch (error: any) {
      console.error("AI Insights Error:", error);
      res.status(500).json({ error: error.message || "Failed to generate AI insights" });
    }
  });

  // ─── Vite middleware ───
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`3Core Analytics running on http://0.0.0.0:${PORT}`);
    console.log(`Direct MySQL connection to ${process.env.DB_HOST || "localhost"}:${process.env.DB_PORT || 3306}/${process.env.DB_NAME || "restaurant"}`);
  });
}

startServer();
