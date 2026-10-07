---
name: resto-analytics
description: Complete system map of RestoAnalytics (Multi-Branch P&L). Covers the branch whitelist, auth/login/Telegram SSO flow, dashboard data flow, sales/expense/profit formulas, every API endpoint, frontend screens and drill-downs, and build/deploy. Use before changing server.ts SQL or endpoints, any analytics figure or chart, auth, or frontend data fetching, or when debugging a number that looks wrong.
---

# RestoAnalytics: system skill

This is a read-mostly analytics app on top of the **restoAdmin MySQL DB** (`restaurants`). The backend is a
single Express file, `server.ts`. The frontend is a React SPA (`src/`), and the main screen is
`src/components/analytics/SalesAnalytics.tsx`. Production runs as PM2 `resto-analytics` on port 2998.

---

## RULE 1: Branch whitelist (never break this)

Only these branches are fetched and computed:

| IDNo | Code  | Name              |
|------|-------|-------------------|
| 2    | BR002 | Kim's Brothers    |
| 3    | BR003 | Blue Moon         |
| 9    | BR006 | KumHo Restaurant  |
| 10   | BR007 | EESOME CAFE       |
| 12   | BR009 | PRIME BBQ         |

Excluded demo/internal rows: 3Core (4), NOIR BY EESOME (11), Resto Demo (14), Daraejung (1, inactive), test (13, inactive).

```ts
// server.ts
const ALLOWED_BRANCH_IDS: number[] = [2, 3, 9, 10, 12];
const ALLOWED_BRANCH_IN = ALLOWED_BRANCH_IDS.join(",");   // inlined: IN (${ALLOWED_BRANCH_IN})
```

- **Every query must filter by the whitelist.** This applies to any query on `branches`, `billing`, `orders`, `order_items`, `expenses`, or `cash_reconciliation`:
  `br.IDNo IN (…)`, `b.BRANCH_ID IN (…)`, `e.BRANCH_ID IN (…)`, `BRANCH_ID IN (…)`. Menu and item queries must join `billing` and filter `b.BRANCH_ID`.
- **Filter by `IDNo`, never by `BRANCH_NAME`.**
- **The optional `branch_id` is applied with `AND`, on top of the whitelist.** Pattern:
  ```ts
  let branchSql = ` AND b.BRANCH_ID IN (${ALLOWED_BRANCH_IN})`;
  if (branchId) { branchSql += ` AND b.BRANCH_ID = ?`; params.push(branchId); }
  ```
- **The IDs are inlined constants, not `?` params.** Do not convert them to placeholders without re-checking param order.
- **The frontend must not hardcode branch lists.** It renders `branchCardsData` from the API.
  `BRANCH_SORT_ORDER` (display order) and `branchLogo.ts` (logo fallback) only match names and do not decide scope.

**Adding or removing a branch:**
1. Look up the id: `SELECT IDNo, BRANCH_CODE, BRANCH_NAME, ACTIVE FROM branches ORDER BY IDNo;`
2. Edit `ALLOWED_BRANCH_IDS` and its comment.
3. Update the tables in this file and in `README.md`.
4. Optionally add a name to `BRANCH_SORT_ORDER` and `branchLogo.ts`.
5. Build and restart.

---

## Flow 1: Server startup (`server.ts`)
1. `dotenv`. Secrets:
   - `JWT_SECRET` (insecure default if missing)
   - `JWT_EXPIRES_IN` (24h)
   - `TELEGRAM_MINIAPP_SECRET`
2. MySQL pool, 10 connections, configured with `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, and `DB_NAME`.
3. `/uploads` is served statically from the first existing dir in this order: `BRANCH_UPLOADS_DIR` → `../restoAdmin/server/public/uploads` → `public/uploads`.
4. **Public routes:** `/api/health`, `/api/login`, `/api/me`, `/api/telegram-auth`.
5. `app.use("/api", requireAuth)`. Everything after this needs a Bearer JWT (issuer `resto-analytics`, audience `resto-analytics-app`).
6. **Dev:** Vite middleware. **Prod:** `dist/` static plus a SPA fallback.

## Flow 2: Frontend boot and session (`main.tsx` → `App.tsx`)
1. `bootstrapTelegramWebApp()` sets up the Telegram WebView if present: expand, fullscreen, colors, and safe-area vars.
2. `UserProvider` restores `localStorage.user` and `localStorage.token`.
3. `checkSession()`:
   1. If `?tg_t&tg_sig` are present, or the app is inside Telegram, or `?view=compare`, it ensures `?view=branch-comparison`.
   2. **Token present** → `GET /api/me`. Valid: show the dashboard. Invalid: `clearSession()`.
   3. **No valid token and opened from Telegram** → Flow 4.
   4. Else → `LoginView`.
4. The theme is stored in `localStorage['restoAnalytics.theme']` (dark by default).

## Flow 3: Login
1. **Client side:** usernames other than `admin` are blocked before the API call.
2. **Server `POST /api/login`:**
   1. Only `admin` is allowed (403 otherwise).
   2. Loads `user_info` where `ACTIVE = 1`.
   3. Verifies the password with **argon2**, or legacy `md5(SALT + pw)`. **A legacy hash is rewritten as argon2.**
   4. `PERMISSIONS = 2` (tablet-only) gets 401.
   5. Admin (`PERMISSIONS = 1`) gets `available_branches` (whitelisted). Other roles need exactly one assigned branch.
   6. Signs and returns the JWT.
3. **Client:** `login()` stores the token and user.
4. **`apiFetch` on 401:** clears storage and redirects to `/`. Navbar logout does the same.

## Flow 4: Telegram Mini App SSO
1. The restoAdmin bot opens `/?tg_t=<unix>&tg_sig=<hex>&view=branch-comparison`.
2. The client sends `POST /api/telegram-auth {tg_t, tg_sig, initData}`. It retries `initData` 8×150ms.
3. The server accepts **either** check (each valid for at most 2 days):
   - `tg_sig == HMAC_SHA256(TELEGRAM_MINIAPP_SECRET, "branch-comparison:"+tg_t)`
   - a valid WebApp `initData` HMAC, using the bot token from `TELEGRAM_BOT_TOKEN` or `telegram_settings.BOT_TOKEN` (ID 1)
4. **Success:** a session as the `admin` user (`buildAdminSessionPayload`) and a JWT.
5. **Client:** strips `tg_*` from the URL. `SalesAnalytics` sees `view=branch-comparison` and opens `BranchComparisonModal`.

## Flow 5: Dashboard load (`SalesAnalytics.tsx`)
- **Default range:** current month-to-date (Manila). The month/year picker and ◀ ▶ arrows change `activeRange`.
- **Load runs on a range change.** These run in parallel:

| Fetcher (`analyticsService.ts`) | Endpoint | UI |
|---|---|---|
| `fetchBranchComparison` | `admin-dashboard-bundle` | SALES / EXPENSES / PROFIT cards, Sales by Branch table, branch dropdown |
| `fetchDailyTrend` | `admin-dashboard-bundle` → `trendData` | Daily Trend (Monthly Trend in year view) |
| `fetchTopSelling(5)` | `top-selling` | Top Revenue |
| `fetchDailyPerBranch` | `daily-per-branch` | This week grid |

- **Empty bundle:** "Cannot connect to database."
- **Branch selection** (dropdown, table row, or week row) reloads only the trend and the top items, with `branch_id`.
- **KPI cards:** for All Branches they are client-side sums over `branches[]`. For one branch they are that branch's totals.
- **Cache:** `fetchDashboard` keeps an in-memory cache for 60s, keyed by `branch:start:end`. The dashboard always passes `force = true`.

## Flow 6: Formulas (match restoAdmin; do not change without asking)

**Branch sales** (`admin-dashboard-bundle` → `branchCardsData[].totalSales`)
```
posBase    = max(0, Σ AMOUNT_PAID − Σ REFUND)
             billing.STATUS IN (1,2), joined orders.STATUS NOT IN (-1,-2), Manila day bounds
reconTotal = Σ cash_reconciliation.AMOUNT (ACTIVE=1, BUSINESS_DATE in range)
totalSales = posBase + reconTotal
orders     = COUNT(DISTINCT ORDER_ID)
```

**Expenses**
```
Σ expenses.EXP_AMOUNT
  e.ACTIVE=1, master_categories.ACTIVE, operation_category.ACTIVE (INNER JOIN, so unmapped categories drop out)
  Manila day bounds on ENCODED_DT
```

**Profit and ratios**
```
profit       = sales − expenses
margin       = profit / sales
expense rate = expenses / sales
share        = branch sales / total
daily avg    = sales / days in range
```

**Daily Trend bar**
- Gross = Σ(`AMOUNT_PAID + DISCOUNT_AMOUNT`) per Manila day. No refund and no reconciliation.
- **So the chart total ≠ the SALES card. This is expected.**

**Top Revenue**
- Σ `LINE_TOTAL` grouped by menu × branch.
- Room Charge is a synthetic item (`menu_id -9998`) built from `orders.SERVICE_CHARGE` (rooms with `ROOM_CHARGE > 0`) plus items in the "ROOM CHARGE" category.
- It uses `DATE(b.ENCODED_DT)`, the server date, not Manila bounds.

**Week grid**
- **Columns:** Sun→Sat of the week containing today (or the range end).
- **Cell:** gross `total_sales`, shown in ₱K.
- **Slow / Best:** the lowest / highest day so far for that branch.

**Date helpers (server)**
- `phLocalDayRangeFilter(col, start, end)` returns sargable +08:00 bounds. **It adds 4 params: start, start, end, end.**
- `getCurrentMonthRange()` gives Manila MTD.
- `getPrevMonthSamePeriodRange()` gives the same days last month.

**Expense buckets (board)** — `branchComparison.ts` `classifyMainExpenseKey` on the `"opCat|name"` keys:

| Bucket | Matches |
|---|---|
| 식자재 및 주류 | food, inventory, mart, 식자재 |
| 임대료 | rent, lease, 월세, 임대 |
| 급여 | salary, wage, payroll, 급여, 인건, 가불, c.a, dj, promoter, labor/benefits |
| 그밖에 | everything else |

## Flow 7: Drill-downs
- **Top Revenue item** → `menu-daily` (`menu_id`/`menu_name`, `branch_id`). Shows daily qty and revenue. Swipe or ◀ ▶ moves to the next item.
- **Week cell** → compares the day with the previous calendar day (from the loaded `daily-per-branch`), plus `top-selling` for that single date and branch.
- **Compare button** or `?view=branch-comparison` → `BranchComparisonModal` → `fetchBranchComparisonBoard`.
  It makes 5 parallel bundle calls:
  1. The selected range
  2. Same-period current: start → end−3d (`SAME_PERIOD_LOOKBACK_DAYS = 3`)
  3. Same-period previous: one month back
  4. MTD (1st → end)
  5. The full previous month
  - Expenses per branch = `max(Σ breakdown, card total)`.
  - Tapping a cell opens `CellBreakdownModal`.
- **Year view:** clicking a month bar jumps to that month.

## Flow 8: AI advisor
- **Request:** `POST /api/ai-insights {branchData, question}` → Gemini `gemini-2.5-flash` (Tagalog/English bullets).
- **No `GEMINI_API_KEY`:** static fallback.
- **Status:** the UI modal (`AIAdvisorModal`) is not currently mounted.

## Dormant code (exists, not rendered)
- `dashboard/AdminDashboard`, `SingleBranchAuditModal`, `AIAdvisorModal`, `LivePOSFeedModal`, `dashboard/MenuItemAnalyticsModal`, `layout/MobileFlutterFrame`
- `utils/branchImprovement.ts`
- `openCompare` / `fetchPeriodCompare` in `SalesAnalytics` (defined, with no button)

Before reviving any of these, check that they use whitelisted endpoints.

---

## Endpoints (all whitelisted)

| Route | Notes |
|---|---|
| `GET /api/health` | public |
| `POST /api/login` · `GET /api/me` · `POST /api/telegram-auth` | public auth |
| `GET /api/branches` | allowed branches |
| `GET /api/analytics/admin-dashboard-bundle` | main: summary, branchCardsData, trendData, dailySalesForCards, expenseCategoryByBranch, expenseRentByBranch, expenseSalaryByBranch, topProductsData |
| `GET /api/analytics/top-selling` | `limit` (≤100, inlined), `day_name`, Room Charge |
| `GET /api/analytics/menu-daily` | `menu_id` / `menu_name` |
| `GET /api/analytics/daily-sales` | gross/net per day |
| `GET /api/analytics/daily-per-branch` | week grid |
| `GET /api/analytics/branch-sales` | net per branch |
| `GET /api/analytics/expense-summary` / `expense-breakdown` | |
| `GET /api/analytics/mom-comparison` | current MTD vs the same days last month |
| `POST /api/ai-insights` | Gemini |

- **Common params:** `start_date` and `end_date` (`YYYY-MM-DD`, default Manila MTD), plus an optional `branch_id`.
- **mysql2 prepared statements reject `LIMIT ?`.** Inline a clamped integer instead.

---

## Build, deploy, verify

```bash
npm run lint                      # tsc --noEmit
npm run build                     # vite → dist/, esbuild server.ts → dist/server.cjs
pm2 restart resto-analytics
pm2 logs resto-analytics --lines 20 --nostream
```
Nothing goes live until you build and restart.

**Verify the whitelist after any SQL change.** Make a short-lived token with the same secret, issuer, and audience as `generateAccessToken`, then run:
```bash
curl -s -H "Authorization: Bearer $T" localhost:2998/api/branches                     # exactly 5 branches
curl -s -H "Authorization: Bearer $T" "localhost:2998/api/analytics/admin-dashboard-bundle?branch_id=14"  # zeros, empty
```

**Check that:**
- `summary.totalSales == Σ branchCardsData.totalSales`
- every endpoint only lists ids 2, 3, 9, 10, 12

**Audit for unfiltered queries:**
```bash
grep -n "FROM billing\|FROM expenses\|FROM order_items\|FROM orders\|FROM cash_reconciliation\|FROM branches" server.ts
```
