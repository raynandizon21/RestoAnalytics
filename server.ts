import express, { type Request, type Response, type NextFunction } from "express";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import mysql from "mysql2/promise";
import argon2 from "argon2";
import jwt from "jsonwebtoken";

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret_key_change_in_production";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "24h";

type AuthUser = {
  user_id: string | number;
  username: string;
  permissions: number;
  firstname?: string | null;
  lastname?: string | null;
  branch_id?: string | number | null;
  branch_name?: string | null;
  branch_code?: string | null;
};

type AuthedRequest = Request & { user?: AuthUser };

function isArgonHash(hash: unknown): hash is string {
  return typeof hash === "string" && hash.startsWith("$argon2");
}

function generateMD5(input: string) {
  return crypto.createHash("md5").update(input).digest("hex");
}

function generateAccessToken(payload: AuthUser) {
  return jwt.sign(
    {
      user_id: payload.user_id,
      username: payload.username,
      permissions: payload.permissions,
      firstname: payload.firstname || null,
      lastname: payload.lastname || null,
      branch_id: payload.branch_id || null,
      branch_name: payload.branch_name || null,
      branch_code: payload.branch_code || null,
      type: "access",
    },
    JWT_SECRET,
    {
      expiresIn: JWT_EXPIRES_IN,
      issuer: "resto-analytics",
      audience: "resto-analytics-app",
    } as jwt.SignOptions
  );
}

function verifyAccessToken(token: string): AuthUser {
  const decoded = jwt.verify(token, JWT_SECRET, {
    issuer: "resto-analytics",
    audience: "resto-analytics-app",
  }) as jwt.JwtPayload;
  return {
    user_id: decoded.user_id,
    username: decoded.username || "",
    permissions: Number(decoded.permissions),
    firstname: decoded.firstname ?? null,
    lastname: decoded.lastname ?? null,
    branch_id: decoded.branch_id ?? null,
    branch_name: decoded.branch_name ?? null,
    branch_code: decoded.branch_code ?? null,
  };
}

function getBearerToken(req: Request): string | null {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  return token || null;
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const token = getBearerToken(req);
  if (!token) {
    return res.status(401).json({ success: false, error: "Authentication required" });
  }
  try {
    req.user = verifyAccessToken(token);
    return next();
  } catch {
    return res.status(401).json({ success: false, error: "Invalid or expired token" });
  }
}

function resolveUploadsDir(): string | null {
  const candidates = [
    process.env.BRANCH_UPLOADS_DIR,
    path.resolve(process.cwd(), "../restoAdmin/server/public/uploads"),
    path.resolve(process.cwd(), "public/uploads"),
  ].filter(Boolean) as string[];
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir;
  }
  return null;
}

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

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Asia/Manila calendar parts (same as restoAdmin manilaDateTime). */
function manilaYmdParts(d = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || "00";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
  };
}

/** Current month MTD in Asia/Manila (1st → today PH). */
function getCurrentMonthRange() {
  const { year, month, day } = manilaYmdParts();
  return {
    start_date: `${year}-${pad2(month)}-01`,
    end_date: `${year}-${pad2(month)}-${pad2(day)}`,
  };
}

/**
 * Sargable Asia/Manila (+08:00) inclusive day-range — matches restoAdmin phDateRange.js.
 * Placeholders: start, start, end, end.
 */
function phLocalDayRangeFilter(column: string, startDate: string, endDate: string) {
  const start = String(startDate || "").slice(0, 10);
  const end = String(endDate || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    return { sql: "", params: [] as string[] };
  }
  const sql = ` AND ${column} >= COALESCE(
		CONVERT_TZ(CONCAT(?, ' 00:00:00'), '+08:00', @@session.time_zone),
		DATE_SUB(CONCAT(?, ' 00:00:00'), INTERVAL 8 HOUR)
	) AND ${column} < COALESCE(
		CONVERT_TZ(DATE_ADD(CONCAT(?, ' 00:00:00'), INTERVAL 1 DAY), '+08:00', @@session.time_zone),
		DATE_SUB(DATE_ADD(CONCAT(?, ' 00:00:00'), INTERVAL 1 DAY), INTERVAL 8 HOUR)
	)`;
  return { sql, params: [start, start, end, end] };
}

const EXCLUDED_BRANCHES = ['NOIR BY EESOME', '3Core', '3CORE'];

/** Same calendar days last month (fair MTD vs MTD). Caps at last day of prev month. */
function getPrevMonthSamePeriodRange() {
  const { year, month, day } = manilaYmdParts();
  const prevMonthDate = new Date(Date.UTC(year, month - 2, 1));
  const prevYear = prevMonthDate.getUTCFullYear();
  const prevMonth = prevMonthDate.getUTCMonth() + 1;
  const lastDayPrev = new Date(Date.UTC(year, month - 1, 0)).getUTCDate();
  const endDay = Math.min(day, lastDayPrev);
  return {
    start_date: `${prevYear}-${pad2(prevMonth)}-01`,
    end_date: `${prevYear}-${pad2(prevMonth)}-${pad2(endDay)}`,
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
  const PORT = Number(process.env.PORT) || 2998;
  app.use(express.json());

  const uploadsDir = resolveUploadsDir();
  if (uploadsDir) {
    app.use("/uploads", express.static(uploadsDir));
    console.log(`🖼  Serving branch/menu uploads from ${uploadsDir}`);
  } else {
    console.warn("⚠️  No uploads directory found — branch logos will fall back to initials");
  }

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

  // ─── Auth (same user_info flow as restoAdmin) ───
  app.post("/api/login", async (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ success: false, error: "Username and password are required" });
    }

    if (String(username).trim().toLowerCase() !== "admin") {
      return res.status(403).json({
        success: false,
        error: "Only the admin account can access Resto Analytics.",
      });
    }

    try {
      const [rows] = await pool.execute(
        "SELECT * FROM user_info WHERE USERNAME = ? AND ACTIVE = 1 LIMIT 1",
        [String(username).trim()]
      );
      const user = (rows as any[])[0];
      if (!user) {
        return res.status(401).json({ success: false, error: "User not found or inactive" });
      }

      const storedPassword = user.PASSWORD;
      const salt = user.SALT || "";
      let isValid = false;
      let isLegacy = false;

      if (isArgonHash(storedPassword)) {
        isValid = await argon2.verify(storedPassword, String(password));
      } else {
        isValid = generateMD5(salt + String(password)) === storedPassword;
        isLegacy = true;
      }

      if (!isValid) {
        return res.status(401).json({ success: false, error: "Incorrect password" });
      }

      if (Number(user.PERMISSIONS) === 2) {
        return res.status(401).json({
          success: false,
          error: "This account is for tablet app only. Please use the tablet application to login.",
        });
      }

      if (isLegacy) {
        const newHash = await argon2.hash(String(password));
        await pool.execute("UPDATE user_info SET PASSWORD = ?, SALT = '' WHERE IDNo = ?", [newHash, user.IDNo]);
      }

      let branchId: number | null = null;
      let branchName: string | null = null;
      let branchCode: string | null = null;
      let availableBranches: any[] = [];

      if (Number(user.PERMISSIONS) === 1) {
        const placeholders = EXCLUDED_BRANCHES.map(() => "?").join(",");
        const [branchRows] = await pool.execute(
          `SELECT IDNo, BRANCH_CODE, BRANCH_NAME, BRANCH_LOGO, ACTIVE
           FROM branches
           WHERE ACTIVE = 1 AND BRANCH_NAME NOT IN (${placeholders})
           ORDER BY BRANCH_NAME ASC`,
          EXCLUDED_BRANCHES
        );
        availableBranches = branchRows as any[];
      } else {
        const [branchRows] = await pool.execute(
          `SELECT b.IDNo, b.BRANCH_CODE, b.BRANCH_NAME, b.BRANCH_LOGO, b.ACTIVE
           FROM user_info u
           INNER JOIN branches b ON b.IDNo = u.BRANCH_ID
           WHERE u.IDNo = ? AND b.ACTIVE = 1
           LIMIT 1`,
          [user.IDNo]
        );
        const branches = branchRows as any[];
        if (branches.length !== 1) {
          return res.status(401).json({
            success: false,
            error: "This account is not assigned to a branch yet. Please contact admin.",
          });
        }
        branchId = branches[0].IDNo;
        branchName = branches[0].BRANCH_NAME;
        branchCode = branches[0].BRANCH_CODE;
      }

      const sessionUser: AuthUser = {
        user_id: user.IDNo,
        username: user.USERNAME,
        firstname: user.FIRSTNAME || null,
        lastname: user.LASTNAME || null,
        permissions: Number(user.PERMISSIONS),
        branch_id: branchId,
        branch_name: branchName,
        branch_code: branchCode,
      };

      const accessToken = generateAccessToken(sessionUser);
      return res.json({
        success: true,
        data: {
          ...sessionUser,
          available_branches: availableBranches,
        },
        tokens: {
          accessToken,
          expiresIn: JWT_EXPIRES_IN,
        },
      });
    } catch (error: any) {
      console.error("Login error:", error);
      return res.status(500).json({ success: false, error: "Internal server error" });
    }
  });

  app.get("/api/me", (req, res) => {
    const token = getBearerToken(req);
    if (!token) {
      return res.json({ success: true, data: null });
    }
    try {
      const user = verifyAccessToken(token);
      return res.json({ success: true, data: user });
    } catch {
      return res.json({ success: true, data: null });
    }
  });

  // Protect remaining /api routes (health / login / me registered above)
  app.use("/api", requireAuth);

  // ─── Branches ───
  app.get("/api/branches", async (_req, res) => {
    try {
      const placeholders = EXCLUDED_BRANCHES.map(() => '?').join(',');
      const [rows] = await pool.execute(
        `SELECT IDNo as id, BRANCH_CODE as code, BRANCH_NAME as name, BRANCH_LOGO as logo FROM branches WHERE ACTIVE = 1 AND BRANCH_NAME NOT IN (${placeholders}) ORDER BY BRANCH_NAME`,
        EXCLUDED_BRANCHES
      );
      res.json({ success: true, data: rows });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── Admin Dashboard Bundle (main analytics endpoint) ───
  // Sales / expenses / profit aligned with restoAdmin adminDashboardBundle:
  // net = paid−refund (orders-gated) + cash_reconciliation; expenses via operation_category + Manila day bounds.
  app.get("/api/analytics/admin-dashboard-bundle", async (req, res) => {
    try {
      const { start_date, end_date } = req.query.start_date
        ? { start_date: req.query.start_date as string, end_date: req.query.end_date as string }
        : getCurrentMonthRange();

      const branchIdFilter = req.query.branch_id ? Number(req.query.branch_id) : null;
      const billingRange = phLocalDayRangeFilter("b.ENCODED_DT", start_date, end_date);
      const expenseRange = phLocalDayRangeFilter("e.ENCODED_DT", start_date, end_date);
      const excludedPlaceholders = EXCLUDED_BRANCHES.map(() => "?").join(",");

      // 1) Branch sales — same formula as restoAdmin pyserver branch_sales (paid − refund, orders-gated)
      let salesQuery = `
        SELECT
          br.IDNo as branch_id,
          br.BRANCH_NAME as branch_name,
          br.BRANCH_LOGO as branch_logo,
          COALESCE(SUM(CASE WHEN o.IDNo IS NOT NULL THEN b.AMOUNT_PAID + COALESCE(o.DISCOUNT_AMOUNT, 0) ELSE 0 END), 0) as total_sales,
          COALESCE(SUM(CASE WHEN o.IDNo IS NOT NULL THEN b.AMOUNT_PAID ELSE 0 END), 0) as amount_paid,
          COALESCE(SUM(CASE WHEN o.IDNo IS NOT NULL THEN COALESCE(b.REFUND, 0) ELSE 0 END), 0) as refund_total,
          COUNT(DISTINCT CASE WHEN o.IDNo IS NOT NULL THEN b.ORDER_ID END) as order_count
        FROM branches br
        LEFT JOIN billing b ON b.BRANCH_ID = br.IDNo
          AND b.STATUS IN (1, 2)
          AND b.STATUS NOT IN (-1, -2)
          ${billingRange.sql}
        LEFT JOIN orders o ON o.IDNo = b.ORDER_ID AND o.STATUS NOT IN (-1, -2)
        WHERE br.ACTIVE = 1
          AND br.BRANCH_NAME NOT IN (${excludedPlaceholders})
      `;
      const salesParams: any[] = [...billingRange.params, ...EXCLUDED_BRANCHES];
      if (branchIdFilter) {
        salesQuery += ` AND br.IDNo = ?`;
        salesParams.push(branchIdFilter);
      }
      salesQuery += ` GROUP BY br.IDNo, br.BRANCH_NAME, br.BRANCH_LOGO ORDER BY amount_paid DESC`;

      const [branchSales] = await pool.execute(salesQuery, salesParams);

      // 1b) Cash reconciliation by branch + by business date (for chart bars)
      const reconByBranch: Record<string, number> = {};
      const reconByDate: Record<string, number> = {};
      try {
        let reconQuery = `
          SELECT
            BRANCH_ID,
            DATE_FORMAT(BUSINESS_DATE, '%Y-%m-%d') AS business_date,
            COALESCE(SUM(AMOUNT), 0) AS day_total
          FROM cash_reconciliation
          WHERE ACTIVE = 1
            AND BUSINESS_DATE >= ?
            AND BUSINESS_DATE <= ?
        `;
        const reconParams: any[] = [start_date, end_date];
        if (branchIdFilter) {
          reconQuery += ` AND BRANCH_ID = ?`;
          reconParams.push(branchIdFilter);
        }
        reconQuery += ` GROUP BY BRANCH_ID, DATE_FORMAT(BUSINESS_DATE, '%Y-%m-%d')`;
        const [reconRows] = await pool.execute(reconQuery, reconParams) as any[];
        for (const r of reconRows) {
          const amt = Number(r.day_total) || 0;
          const bid = String(r.BRANCH_ID);
          const d = String(r.business_date || "").slice(0, 10);
          reconByBranch[bid] = (reconByBranch[bid] || 0) + amt;
          if (d) reconByDate[d] = (reconByDate[d] || 0) + amt;
        }
      } catch (err: any) {
        console.warn("[admin-dashboard-bundle] cash_reconciliation unavailable:", err?.message || err);
      }

      // 2) Daily sales trend — same formula as restoAdmin /api/analytics/daily-sales:
      //    total_sales (gross) = paid + discount; net = paid - refund
      let dailyQuery = `
        SELECT
          DATE_FORMAT(COALESCE(
            CONVERT_TZ(b.ENCODED_DT, @@session.time_zone, '+08:00'),
            DATE_ADD(b.ENCODED_DT, INTERVAL 8 HOUR)
          ), '%Y-%m-%d') as sale_date,
          COALESCE(SUM(b.AMOUNT_PAID), 0) as paid_total,
          COALESCE(SUM(COALESCE(o.DISCOUNT_AMOUNT, 0)), 0) as discount,
          COALESCE(SUM(COALESCE(b.REFUND, 0)), 0) as refund
        FROM billing b
        INNER JOIN orders o ON o.IDNo = b.ORDER_ID AND o.STATUS NOT IN (-1, -2)
        INNER JOIN branches br ON br.IDNo = b.BRANCH_ID
          AND br.ACTIVE = 1
          AND br.BRANCH_NAME NOT IN (${excludedPlaceholders})
        WHERE b.STATUS IN (1, 2)
          AND b.STATUS NOT IN (-1, -2)
          ${billingRange.sql}
      `;
      const dailyParams: any[] = [...EXCLUDED_BRANCHES, ...billingRange.params];
      if (branchIdFilter) {
        dailyQuery += ` AND b.BRANCH_ID = ?`;
        dailyParams.push(branchIdFilter);
      }
      dailyQuery += ` GROUP BY sale_date ORDER BY sale_date`;

      const [dailySalesRaw] = await pool.execute(dailyQuery, dailyParams);
      const dailySales = (dailySalesRaw as any[]).map((r) => {
        const paid = Number(r.paid_total) || 0;
        const discount = Number(r.discount) || 0;
        const refund = Number(r.refund) || 0;
        const total_sales = paid + discount;
        const net_sales = Math.max(0, total_sales - discount - refund);
        return {
          sale_date: r.sale_date,
          total_sales,
          total_refund: refund,
          refund,
          discount,
          net_sales,
          paid_total: paid,
        };
      });

      // 3) Expense totals by branch — match restoAdmin ExpenseModel.getTotalsByBranch
      let expenseQuery = `
        SELECT
          e.BRANCH_ID as branch_id,
          COALESCE(SUM(e.EXP_AMOUNT), 0) as total_expense
        FROM expenses e
        INNER JOIN branches b2 ON b2.IDNo = e.BRANCH_ID
        LEFT JOIN master_categories mc ON mc.ACTIVE = 1 AND mc.IDNo = e.MASTER_CAT_ID
        INNER JOIN operation_category oc ON oc.IDNo = mc.OP_CAT_ID AND oc.ACTIVE = 1
        WHERE e.ACTIVE = 1
          AND oc.ACTIVE = 1
          AND b2.ACTIVE = 1
          AND b2.BRANCH_NAME NOT IN (${excludedPlaceholders})
          ${expenseRange.sql}
      `;
      const expParams: any[] = [...EXCLUDED_BRANCHES, ...expenseRange.params];
      if (branchIdFilter) {
        expenseQuery += ` AND e.BRANCH_ID = ?`;
        expParams.push(branchIdFilter);
      }
      expenseQuery += ` GROUP BY e.BRANCH_ID`;

      const [expenseRows] = await pool.execute(expenseQuery, expParams) as any[];

      // 4) Expense category breakdown by branch (same oc + Manila filters)
      let expCatQuery = `
        SELECT
          e.BRANCH_ID as branch_id,
          COALESCE(oc.NAME, 'Others') as exp_cat,
          COALESCE(mc.CATEGORY_NAME, e.EXP_DESC, 'Other') as exp_name,
          COALESCE(SUM(e.EXP_AMOUNT), 0) as total_amount
        FROM expenses e
        LEFT JOIN master_categories mc ON mc.ACTIVE = 1 AND mc.IDNo = e.MASTER_CAT_ID
        INNER JOIN operation_category oc ON oc.IDNo = mc.OP_CAT_ID AND oc.ACTIVE = 1
        INNER JOIN branches b2 ON b2.IDNo = e.BRANCH_ID
        WHERE e.ACTIVE = 1
          AND oc.ACTIVE = 1
          AND b2.ACTIVE = 1
          AND b2.BRANCH_NAME NOT IN (${excludedPlaceholders})
          ${expenseRange.sql}
      `;
      const expCatParams: any[] = [...EXCLUDED_BRANCHES, ...expenseRange.params];
      if (branchIdFilter) {
        expCatQuery += ` AND e.BRANCH_ID = ?`;
        expCatParams.push(branchIdFilter);
      }
      expCatQuery += ` GROUP BY e.BRANCH_ID, oc.NAME, mc.CATEGORY_NAME, e.EXP_DESC`;

      const [expCatRows] = await pool.execute(expCatQuery, expCatParams) as any[];

      // 5) Top selling items
      let topQuery = `
        SELECT
          m.MENU_NAME,
          m.CATEGORY_ID,
          SUM(oi.QTY) as total_quantity,
          SUM(oi.LINE_TOTAL) as total_revenue
        FROM order_items oi
        JOIN orders o ON oi.ORDER_ID = o.IDNo AND o.STATUS NOT IN (-1, -2)
        JOIN billing b ON b.ORDER_ID = o.IDNo AND b.STATUS IN (1, 2) AND b.STATUS NOT IN (-1, -2)
        JOIN menu m ON oi.MENU_ID = m.IDNo
        WHERE 1=1
          ${billingRange.sql}
      `;
      const topParams: any[] = [...billingRange.params];
      if (branchIdFilter) {
        topQuery += ` AND b.BRANCH_ID = ?`;
        topParams.push(branchIdFilter);
      }
      topQuery += ` GROUP BY m.IDNo, m.MENU_NAME, m.CATEGORY_ID ORDER BY total_revenue DESC LIMIT 10`;

      const [topItems] = await pool.execute(topQuery, topParams);

      // 6) Daily expenses for trend
      let dailyExpQuery = `
        SELECT
          DATE(COALESCE(
            CONVERT_TZ(e.ENCODED_DT, @@session.time_zone, '+08:00'),
            DATE_ADD(e.ENCODED_DT, INTERVAL 8 HOUR)
          )) as expense_date,
          COALESCE(SUM(e.EXP_AMOUNT), 0) as total_expense
        FROM expenses e
        LEFT JOIN master_categories mc ON mc.ACTIVE = 1 AND mc.IDNo = e.MASTER_CAT_ID
        INNER JOIN operation_category oc ON oc.IDNo = mc.OP_CAT_ID AND oc.ACTIVE = 1
        INNER JOIN branches b2 ON b2.IDNo = e.BRANCH_ID
        WHERE e.ACTIVE = 1
          AND oc.ACTIVE = 1
          AND b2.ACTIVE = 1
          AND b2.BRANCH_NAME NOT IN (${excludedPlaceholders})
          ${expenseRange.sql}
      `;
      const dailyExpParams: any[] = [...EXCLUDED_BRANCHES, ...expenseRange.params];
      if (branchIdFilter) {
        dailyExpQuery += ` AND e.BRANCH_ID = ?`;
        dailyExpParams.push(branchIdFilter);
      }
      dailyExpQuery += ` GROUP BY expense_date ORDER BY expense_date`;

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

      const branchCardsData = (branchSales as any[]).map((b: any) => {
        const paid = Number(b.amount_paid) || 0;
        const refund = Number(b.refund_total) || 0;
        const posBase = Math.max(0, paid - refund);
        const reconTotal = Number(reconByBranch[String(b.branch_id)] ?? 0) || 0;
        return {
          id: b.branch_id,
          name: b.branch_name,
          logo: b.branch_logo || null,
          totalSales: posBase + reconTotal,
          reportSalesPos: posBase,
          reportSalesGross: Number(b.total_sales) || 0,
          totalExpenses: expenseByBranch[String(b.branch_id)] || 0,
          totalOrders: Number(b.order_count) || 0,
          reconTotal,
        };
      });

      const totalSales = branchCardsData.reduce((s: number, b: any) => s + b.totalSales, 0);
      const totalExpenses = branchCardsData.reduce((s: number, b: any) => s + b.totalExpenses, 0);

      // Build daily trend — restoAdmin Sales Analytics "Total sales" chart basis:
      // gross total_sales (paid + discount) + cash recon for that business date.
      const toDateKey = (val: any): string => {
        if (val instanceof Date && !Number.isNaN(val.getTime())) {
          // Prefer UTC parts for MySQL DATE values serialized as UTC midnight
          return `${val.getUTCFullYear()}-${pad2(val.getUTCMonth() + 1)}-${pad2(val.getUTCDate())}`;
        }
        const s = String(val);
        if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
        return s.slice(0, 10);
      };

      const dailySalesMap = new Map<string, number>();
      const dailyExpMap = new Map<string, number>();
      for (const r of dailySales as any[]) {
        const d = toDateKey(r.sale_date);
        // Chart = gross total_sales (paid + discount) — same as restoAdmin Sales Analytics Total sales bars
        dailySalesMap.set(d, (dailySalesMap.get(d) || 0) + (Number(r.total_sales) || 0));
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

      // 7) Rent / salary by branch (EXP_DESC + category hints) — same as restoAdmin getRentSalaryByBranch
      const expenseRentByBranch: Record<string, number> = {};
      const expenseSalaryByBranch: Record<string, number> = {};
      try {
        const isLaborBenefits = `(
          LOWER(COALESCE(mc.CATEGORY_NAME, '')) LIKE '%labor%'
          OR LOWER(COALESCE(mc.CATEGORY_NAME, '')) LIKE '%benefits%'
          OR mc.CATEGORY_NAME LIKE '%복지%'
          OR (mc.CATEGORY_NAME LIKE '%급여%' AND mc.CATEGORY_NAME LIKE '%복지%')
        )`;
        let rentSalQuery = `
          SELECT
            e.BRANCH_ID AS branch_id,
            COALESCE(SUM(
              CASE
                WHEN (
                  NOT ${isLaborBenefits}
                  AND (
                    LOWER(COALESCE(mc.CATEGORY_NAME, '')) LIKE '%rent%'
                    OR LOWER(COALESCE(mc.CATEGORY_NAME, '')) LIKE '%rental%'
                    OR LOWER(COALESCE(mc.CATEGORY_NAME, '')) LIKE '%lease%'
                    OR mc.CATEGORY_NAME LIKE '%월세%'
                    OR mc.CATEGORY_NAME LIKE '%임대%'
                    OR (
                      (
                        LOWER(COALESCE(e.EXP_DESC, '')) LIKE '%rent%'
                        OR LOWER(COALESCE(e.EXP_DESC, '')) LIKE '%rental%'
                        OR LOWER(COALESCE(e.EXP_DESC, '')) LIKE '%lease%'
                        OR e.EXP_DESC LIKE '%월세%'
                        OR e.EXP_DESC LIKE '%임대%'
                      )
                      AND LOWER(COALESCE(e.EXP_DESC, '')) NOT LIKE '%grinder%'
                      AND LOWER(COALESCE(e.EXP_DESC, '')) NOT LIKE '%fusion%'
                      AND COALESCE(e.EXP_DESC, '') NOT LIKE '%그라인더%'
                      AND NOT (
                        COALESCE(e.EXP_DESC, '') LIKE '%대여%'
                        AND COALESCE(e.EXP_DESC, '') NOT LIKE '%임대%'
                      )
                    )
                  )
                ) THEN e.EXP_AMOUNT
                ELSE 0
              END
            ), 0) AS rent_amount,
            COALESCE(SUM(
              CASE
                WHEN (
                  ${isLaborBenefits}
                  OR LOWER(COALESCE(mc.CATEGORY_NAME, '')) LIKE '%salary%'
                  OR LOWER(COALESCE(mc.CATEGORY_NAME, '')) LIKE '%wage%'
                  OR LOWER(COALESCE(mc.CATEGORY_NAME, '')) LIKE '%payroll%'
                  OR mc.CATEGORY_NAME LIKE '%급여%'
                  OR mc.CATEGORY_NAME LIKE '%인건%'
                  OR mc.CATEGORY_NAME LIKE '%가불%'
                  OR LOWER(COALESCE(mc.CATEGORY_NAME, '')) LIKE '%c.a%'
                  OR LOWER(COALESCE(mc.CATEGORY_NAME, '')) LIKE '%cash advance%'
                  OR LOWER(COALESCE(mc.CATEGORY_NAME, '')) LIKE '%cashadvance%'
                  OR LOWER(COALESCE(mc.CATEGORY_NAME, '')) LIKE '%dj%'
                  OR LOWER(COALESCE(mc.CATEGORY_NAME, '')) LIKE '%promoter%'
                  OR (
                    (oc.NAME LIKE '%급여 / Salary%' OR oc.NAME LIKE '%급여 / salary%' OR UPPER(TRIM(oc.NAME)) = 'SALARY')
                    AND oc.NAME NOT LIKE '%,%'
                  )
                  OR LOWER(COALESCE(e.EXP_DESC, '')) LIKE '%salary%'
                  OR LOWER(COALESCE(e.EXP_DESC, '')) LIKE '%wage%'
                  OR LOWER(COALESCE(e.EXP_DESC, '')) LIKE '%payroll%'
                  OR e.EXP_DESC LIKE '%급여%'
                  OR e.EXP_DESC LIKE '%가불%'
                  OR LOWER(COALESCE(e.EXP_DESC, '')) LIKE '%c.a%'
                  OR LOWER(COALESCE(e.EXP_DESC, '')) LIKE '%cash advance%'
                ) THEN e.EXP_AMOUNT
                ELSE 0
              END
            ), 0) AS salary_amount
          FROM expenses e
          LEFT JOIN master_categories mc ON mc.ACTIVE = 1 AND mc.IDNo = e.MASTER_CAT_ID
          INNER JOIN operation_category oc ON oc.IDNo = mc.OP_CAT_ID AND oc.ACTIVE = 1
          INNER JOIN branches b2 ON b2.IDNo = e.BRANCH_ID
          WHERE e.ACTIVE = 1
            AND oc.ACTIVE = 1
            AND b2.ACTIVE = 1
            AND b2.BRANCH_NAME NOT IN (${excludedPlaceholders})
            ${expenseRange.sql}
        `;
        const rentSalParams: any[] = [...EXCLUDED_BRANCHES, ...expenseRange.params];
        if (branchIdFilter) {
          rentSalQuery += ` AND e.BRANCH_ID = ?`;
          rentSalParams.push(branchIdFilter);
        }
        rentSalQuery += ` GROUP BY e.BRANCH_ID`;
        const [rentSalRows] = await pool.execute(rentSalQuery, rentSalParams) as any[];
        for (const r of rentSalRows) {
          const bid = String(r.branch_id);
          expenseRentByBranch[bid] = Number(r.rent_amount) || 0;
          expenseSalaryByBranch[bid] = Number(r.salary_amount) || 0;
        }
      } catch (err: any) {
        console.warn("[admin-dashboard-bundle] rent/salary by branch failed:", err?.message || err);
      }

    res.json({
        summary: { totalSales, totalExpenses, totalRevenue: totalSales - totalExpenses },
        branchCardsData,
        branchRevenueDistribution: branchCardsData.map((b: any) => ({ name: b.name, value: b.totalSales })),
        topProductsData: (topItems as any[]).slice(0, 5).map((i: any) => ({ name: i.MENU_NAME, sales: i.total_quantity })),
        dailySalesForCards: dailySales,
        trendData,
        trendPeriod: "daily",
        expenseCategoryByBranch,
        expenseRentByBranch,
        expenseSalaryByBranch,
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
      // LIMIT must be inlined — mysql2 prepared stmts reject LIMIT ?
      const safeLimit = Math.min(Math.max(1, Math.floor(limit)), 100);
      const params = [...baseParams, ...baseParams, ...baseParams];
      const query = `
        SELECT menu_id, MENU_NAME, total_quantity, total_revenue, unit_price, branch_id, branch_name
        FROM (
          ${menuQuery}
          UNION ALL
          ${roomChargeQuery}
        ) combined
        ORDER BY total_revenue DESC
        LIMIT ${safeLimit}
      `;

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

  // ─── Daily Sales (restoAdmin daily-sales: gross = paid+discount, net = paid−refund) ───
  app.get("/api/analytics/daily-sales", async (req, res) => {
    try {
      const { start_date, end_date } = req.query.start_date
        ? { start_date: req.query.start_date as string, end_date: req.query.end_date as string }
        : getCurrentMonthRange();
      const branchId = req.query.branch_id ? Number(req.query.branch_id) : null;
      const billingRange = phLocalDayRangeFilter("b.ENCODED_DT", start_date, end_date);

      let query = `
        SELECT
          DATE_FORMAT(COALESCE(
            CONVERT_TZ(b.ENCODED_DT, @@session.time_zone, '+08:00'),
            DATE_ADD(b.ENCODED_DT, INTERVAL 8 HOUR)
          ), '%Y-%m-%d') as sale_date,
          COALESCE(SUM(b.AMOUNT_PAID), 0) as paid_total,
          COALESCE(SUM(COALESCE(o.DISCOUNT_AMOUNT, 0)), 0) as discount,
          COALESCE(SUM(COALESCE(b.REFUND, 0)), 0) as refund
        FROM billing b
        INNER JOIN orders o ON o.IDNo = b.ORDER_ID AND o.STATUS NOT IN (-1, -2)
        WHERE b.STATUS IN (1, 2)
          AND b.STATUS NOT IN (-1, -2)
          ${billingRange.sql}
      `;
      const params: any[] = [...billingRange.params];
      if (branchId) {
        query += ` AND b.BRANCH_ID = ?`;
        params.push(branchId);
      }
      query += ` GROUP BY sale_date ORDER BY sale_date`;

      const [rawRows] = await pool.execute(query, params);
      const rows = (rawRows as any[]).map((r) => {
        const paid = Number(r.paid_total) || 0;
        const discount = Number(r.discount) || 0;
        const refund = Number(r.refund) || 0;
        const total_sales = paid + discount;
        const net_sales = Math.max(0, total_sales - discount - refund);
        return {
          sale_date: r.sale_date,
          total_sales,
          refund,
          discount,
          net_sales,
          total_refund: refund,
          total_discount: discount,
        };
      });
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

  // ─── Daily Sales Per Branch (gross total_sales basis like restoAdmin daily-per-branch) ───
  app.get("/api/analytics/daily-per-branch", async (req, res) => {
    try {
      const { start_date, end_date } = req.query.start_date
        ? { start_date: req.query.start_date as string, end_date: req.query.end_date as string }
        : getCurrentMonthRange();

      const excl = EXCLUDED_BRANCHES.map(() => "?").join(",");
      const billingRange = phLocalDayRangeFilter("b.ENCODED_DT", start_date, end_date);
      const [rows] = await pool.execute(
        `SELECT
          br.IDNo as branch_id,
          br.BRANCH_NAME as branch_name,
          DATE_FORMAT(COALESCE(
            CONVERT_TZ(b.ENCODED_DT, @@session.time_zone, '+08:00'),
            DATE_ADD(b.ENCODED_DT, INTERVAL 8 HOUR)
          ), '%Y-%m-%d') as sale_date,
          DAYNAME(COALESCE(
            CONVERT_TZ(b.ENCODED_DT, @@session.time_zone, '+08:00'),
            DATE_ADD(b.ENCODED_DT, INTERVAL 8 HOUR)
          )) as day_name,
          COALESCE(SUM(b.AMOUNT_PAID + COALESCE(o.DISCOUNT_AMOUNT, 0)), 0) as total_sales,
          COALESCE(SUM(b.AMOUNT_PAID), 0) as amount_paid,
          COALESCE(SUM(COALESCE(b.REFUND, 0)), 0) as refund,
          COALESCE(SUM(COALESCE(o.DISCOUNT_AMOUNT, 0)), 0) as discount,
          COALESCE(SUM(b.AMOUNT_PAID - COALESCE(b.REFUND, 0)), 0) as net_sales,
          COUNT(DISTINCT b.ORDER_ID) as order_count
        FROM branches br
        LEFT JOIN billing b ON b.BRANCH_ID = br.IDNo
          AND b.STATUS IN (1, 2)
          AND b.STATUS NOT IN (-1, -2)
          ${billingRange.sql}
        LEFT JOIN orders o ON o.IDNo = b.ORDER_ID AND o.STATUS NOT IN (-1, -2)
        WHERE br.ACTIVE = 1 AND br.BRANCH_NAME NOT IN (${excl})
        GROUP BY br.IDNo, br.BRANCH_NAME, sale_date, day_name
        HAVING sale_date IS NOT NULL
        ORDER BY br.BRANCH_NAME, sale_date`,
        [...billingRange.params, ...EXCLUDED_BRANCHES]
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
