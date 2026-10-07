# RestoAnalytics — Multi-Branch P&L

Analytics dashboard for the restaurant group. It shows sales, expenses, profit, the daily trend, top revenue
items, a weekly per-branch grid, and a branch comparison board. It reads **directly from the restoAdmin MySQL
database** (`restaurants`). It only reads, except that it upgrades a legacy password hash on login.

- **Frontend:** React 19 + Vite + Tailwind + Recharts (`src/`)
- **Backend:** Express in one file ([server.ts](server.ts)), `mysql2` pool, JWT auth, Gemini AI (optional)
- **Production:** PM2 app `resto-analytics` on port **2998** (`ecosystem.config.cjs`)
- **Entry points:** browser login (admin only), or the Telegram Mini App opened from the restoAdmin bot

> Detailed rules for agents and developers: [.claude/skills/resto-analytics/SKILL.md](.claude/skills/resto-analytics/SKILL.md)

---

## 1. Branch scope (most important rule)

Only these five branches are fetched and computed. **All other branches are demo or internal data and are
excluded from every query.** This covers sales, expenses, profit, top items, charts, and the branch dropdown.

| IDNo | Code  | Branch            |
|------|-------|-------------------|
| 2    | BR002 | Kim's Brothers    |
| 3    | BR003 | Blue Moon         |
| 9    | BR006 | KumHo Restaurant  |
| 10   | BR007 | EESOME CAFE       |
| 12   | BR009 | PRIME BBQ         |

Excluded: `3Core` (4), `NOIR BY EESOME` (11), `Resto Demo` (14), `Daraejung` (1, inactive), `test` (13, inactive).

- **Source of truth:** `ALLOWED_BRANCH_IDS` in [server.ts](server.ts), inlined into SQL as `IN (${ALLOWED_BRANCH_IN})`.
- **`branch_id` param:** narrows results within the whitelist and never widens them. `branch_id=14` returns empty or zero results.
- **Frontend:** has **no** hardcoded branch list. It renders whatever `branchCardsData` returns.

---

## 2. Architecture

```
 Browser / Telegram Mini App
        │  (React SPA, token in localStorage)
        ▼
 Express server.ts  :2998
   ├─ /api/health, /api/login, /api/me, /api/telegram-auth     (public)
   ├─ requireAuth (Bearer JWT)                                  (all routes below)
   ├─ /api/branches, /api/analytics/*                           (MySQL, whitelisted branches)
   ├─ /api/ai-insights                                          (Gemini 2.5 Flash)
   ├─ /uploads/*  → static branch/menu logos (../restoAdmin/server/public/uploads)
   └─ SPA: Vite middleware (dev) | dist/ static + index.html fallback (prod)
        │
        ▼
 MySQL `restaurants` (shared with restoAdmin)
   branches · billing · orders · order_items · menu · categories · restaurant_tables
   expenses · master_categories · operation_category · cash_reconciliation
   user_info · telegram_settings
```

---

## 3. Flow breakdown

### 3.1 Server startup
1. `dotenv` loads `.env`. The server reads `JWT_SECRET`, `JWT_EXPIRES_IN` (default `24h`), and `TELEGRAM_MINIAPP_SECRET`.
2. It creates a MySQL pool (10 connections) and logs `✅ Connected` or `❌ MySQL connection failed`.
3. `resolveUploadsDir()` checks, in order: `BRANCH_UPLOADS_DIR` → `../restoAdmin/server/public/uploads` → `public/uploads`. The first one that exists is served at `/uploads`.
4. It registers the public routes, then `app.use("/api", requireAuth)`, then the protected routes.
5. In dev (`NODE_ENV !== production`) it uses the Vite middleware. In prod it serves `dist/` with a fallback to `index.html`.
6. It listens on `0.0.0.0:${PORT || 2998}`.

### 3.2 App boot (frontend)
1. `main.tsx` runs `bootstrapTelegramWebApp()`. Inside Telegram this means: ready, expand, fullscreen, header colors, and safe-area CSS vars.
2. `UserProvider` restores `user` and `token` from `localStorage`.
3. `App.tsx` `checkSession()` runs these steps in order:
   1. It reads URL params `tg_t`, `tg_sig`, and `view`. If the app was opened from Telegram or `view=compare`, it forces `?view=branch-comparison`.
   2. **If a token exists:** it calls `GET /api/me`. A valid token syncs the user and shows the dashboard. An invalid one clears the session.
   3. **If there is no valid token and the app was opened from Telegram:** it does Telegram SSO (3.4).
   4. Otherwise it shows `LoginView`.
4. While checking, the screen shows "Checking session…" or "Opening comparison…".
5. The theme (dark is the default) is stored in `localStorage['restoAnalytics.theme']`.

### 3.3 Login (browser)
1. `LoginView` rejects any username other than `admin` on the client side, before calling the API.
2. `POST /api/login {username, password}`:
   1. The server again allows `admin` only (403 for anyone else).
   2. It loads `user_info` where `USERNAME = ? AND ACTIVE = 1` (401 if none).
   3. It verifies the password: **argon2** if the hash starts with `$argon2`, otherwise legacy `md5(SALT + password)`.
   4. `PERMISSIONS = 2` (tablet-only account) gets 401.
   5. A legacy MD5 user is upgraded in place: `UPDATE user_info SET PASSWORD = argon2, SALT = ''`.
   6. `PERMISSIONS = 1` (admin) gets `available_branches` (whitelisted). Any other permission must have exactly one assigned active branch.
   7. It signs a JWT (`issuer resto-analytics`, `audience resto-analytics-app`, `expiresIn 24h`).
3. The client stores `token` and `user` in `localStorage` and shows the dashboard.
4. **Logout** (Navbar) clears storage and does `location.replace('/')`.
5. **Any 401 from `/api/*`** (`apiFetch`) also clears storage and redirects to `/`.

### 3.4 Telegram Mini App SSO
1. The restoAdmin bot keyboard opens the app with `?tg_t=<unix>&tg_sig=<hmac>&view=branch-comparison`.
2. The client sends `POST /api/telegram-auth {tg_t, tg_sig, initData}`. It retries reading `initData` up to 8×150ms.
3. The server accepts either check:
   - **Bypass signature:** `HMAC_SHA256(TELEGRAM_MINIAPP_SECRET, "branch-comparison:<tg_t>")`, compared with timingSafeEqual. The signature must be no older than 2 days.
   - **Telegram `initData`:** the standard WebApp HMAC using the bot token (`TELEGRAM_BOT_TOKEN` env, or `telegram_settings.BOT_TOKEN` where `ID = 1`). It must be no older than 2 days.
4. On success, `buildAdminSessionPayload()` logs in **as the `admin` user** and returns the JWT plus the whitelisted branches.
5. The client strips `tg_t` and `tg_sig` from the URL. The Branch Comparison modal then opens automatically (`view=branch-comparison`).

### 3.5 Main dashboard load (`SalesAnalytics`)
**Trigger:** the first render, or a period change (month/year picker, ◀ ▶ arrows, "This month").

These four calls run in parallel:

| Call | API | Feeds |
|------|-----|-------|
| `fetchBranchComparison(range)` | `admin-dashboard-bundle` | KPI cards, Sales by Branch table, branch dropdown |
| `fetchDailyTrend(branch, range)` | `admin-dashboard-bundle` (`trendData`) | Daily Trend chart (Monthly Trend in year view) |
| `fetchTopSelling(5, branch, range)` | `top-selling` | Top Revenue list |
| `fetchDailyPerBranch(range)` | `daily-per-branch` | "This week" grid |

- **No branch data:** if the bundle has no branch data, the screen shows "Cannot connect to database."
- **Branch order:** branches are sorted with `sortBranchesByPreferredOrder`: Kim's → Blue Moon → KumHo → PRIME → EESOME.
- **Branch change:** changing the branch (dropdown, table row, or grid row) reloads only the Daily Trend and Top Revenue.
- **Cache:** the `fetchDashboard` in-memory cache lasts 60s per `branch:start:end`. The dashboard passes `force = true`.

### 3.6 Computations

**Branch sales (`admin-dashboard-bundle`, per branch)**
```
paid       = Σ billing.AMOUNT_PAID      (billing.STATUS IN (1,2), joined order not cancelled)
refund     = Σ billing.REFUND
posBase    = max(0, paid − refund)
reconTotal = Σ cash_reconciliation.AMOUNT (ACTIVE=1, BUSINESS_DATE in range)
totalSales = posBase + reconTotal
orders     = COUNT(DISTINCT billing.ORDER_ID)
```
- Dates use Manila day bounds (`phLocalDayRangeFilter` on `ENCODED_DT`, +08:00).
- Cancelled orders and billing (`STATUS -1/-2`) are ignored.

**Expenses**
```
totalExpenses = Σ expenses.EXP_AMOUNT
  where e.ACTIVE=1 and master_category → operation_category is ACTIVE (category must map to an op-category)
```
- The bundle also returns these breakdowns:
  - `expenseCategoryByBranch[branchId]["<opCat>|<name>"]`
  - `expenseRentByBranch`
  - `expenseSalaryByBranch`
- Rent and salary are detected by keyword (rent, lease, 월세, 임대 / salary, wage, 급여, 가불, c.a, dj, promoter …).

**Profit & ratios**
```
profit       = totalSales − totalExpenses
margin %     = profit / totalSales × 100
expense rate = totalExpenses / totalSales × 100
share %      = branch totalSales / Σ totalSales
daily avg    = totalSales / calendar days in range
```

**Daily Trend chart**
- **Bar value:** gross sales per Manila day = Σ(`AMOUNT_PAID + DISCOUNT_AMOUNT`). Cash reconciliation is not added here.
- **Gaps:** every calendar day in the range is filled with 0 when there are no sales.
- **Average:** the average counts days up to today only.
- **Year view:** months are summed into bars. Clicking a bar opens that month.
- **Known difference:** the chart total ≠ the Sales card, because the chart is gross (with discount, no refund or recon). The Sales card is paid − refund + recon.

**Top Revenue (`top-selling`)**
- **Ranking:** menu items grouped by menu and branch, ranked by Σ `LINE_TOTAL`, limit 5.
- **Room Charge** is built as a synthetic item (`menu_id -9998`) from two parts:
  - `orders.SERVICE_CHARGE` on tables where `ROOM_CHARGE > 0`
  - items in the "ROOM CHARGE" category
- **Date filter:** `DATE(b.ENCODED_DT)`, which is the server-timezone date (not Manila bounds).

**This week grid (`daily-per-branch`)**
- **Columns:** Sunday → Saturday of the week containing today. If today is outside the range, the week ends on the range end.
- **Cell value:** gross `total_sales` per branch per day (falls back to net). It is shown in ₱K.
- **Highlights:** the **Slow** (red) and **Best** (green) cells are each branch's lowest and highest day so far this week.

### 3.7 Drill-downs
| Action | Calls | Shows |
|--------|-------|-------|
| Tap a Top Revenue item | `menu-daily?menu_id/menu_name&branch_id` | Daily qty and revenue for that item. Swipe or ◀ ▶ moves to the next item |
| Tap a "This week" cell | local data + `top-selling` for that single day and branch | That day vs the previous calendar day (Δ, weak flag) plus that day's top 5 items |
| **Compare** button / `?view=branch-comparison` | `BranchComparisonModal` → `fetchBranchComparisonBoard` | Branch board (below) |

**Branch Comparison board** (`fetchBranchComparisonBoard`) makes 5 parallel calls to `admin-dashboard-bundle`:
1. The selected range
2. **Same period, current** (전월 동기 대비, 3 days before the end): start → end − 3 days
3. **Same period, previous:** the same window one month earlier
4. **MTD:** 1st → end
5. **Full previous month** (전월 대비)

- **Per branch:** sales, expenses (`max(Σ category breakdown, card total)`), profit, plus index % vs each baseline.
- **Main expense buckets:**
  - 식자재 및 주류 (food/inventory/mart)
  - 임대료 (rent)
  - 급여 (salary/labor/benefits)
  - 그밖에 (other)
- **Cell breakdown:** tapping a cell opens `CellBreakdownModal`.

### 3.8 AI Advisor
- **Request:** `POST /api/ai-insights {branchData, question}` → Gemini `gemini-2.5-flash` answers in Tagalog/English bullets.
- **Without `GEMINI_API_KEY`:** it returns static fallback advice.
- **Status:** `AIAdvisorModal` is currently **not wired** into the UI.

### 3.9 Dormant code (present but not rendered)
These exist for possible reuse:
- `AdminDashboard`, `SingleBranchAuditModal`, `AIAdvisorModal`, `LivePOSFeedModal`, `dashboard/MenuItemAnalyticsModal`, `MobileFlutterFrame`
- `branchImprovement.ts` helpers
- The `openCompare` / `fetchPeriodCompare` period-compare modal in `SalesAnalytics` (defined, with no trigger)

---

## 4. API reference

All `/api/*` routes except `health`, `login`, `me`, and `telegram-auth` require `Authorization: Bearer <token>`.
- **Dates:** `start_date` / `end_date` as `YYYY-MM-DD`. They default to the current month-to-date in Manila.
- **Branch filter:** an optional `branch_id`, always within the whitelist.

| Route | Purpose |
|-------|---------|
| `GET /api/health` | DB connectivity check |
| `POST /api/login` | Admin login → JWT + branches |
| `GET /api/me` | Validate token → user |
| `POST /api/telegram-auth` | Telegram Mini App SSO → JWT |
| `GET /api/branches` | Allowed branches (id, code, name, logo) |
| `GET /api/analytics/admin-dashboard-bundle` | **Main endpoint**: summary, branchCardsData, trendData, expense breakdowns, rent/salary |
| `GET /api/analytics/top-selling` | Top items incl. Room Charge (`limit`, `day_name`) |
| `GET /api/analytics/menu-daily` | Daily qty and revenue of one item (`menu_id` / `menu_name`) |
| `GET /api/analytics/daily-sales` | Daily gross/net sales |
| `GET /api/analytics/daily-per-branch` | Per-branch daily sales (week grid) |
| `GET /api/analytics/branch-sales` | Net sales per branch |
| `GET /api/analytics/expense-summary` | Total expenses |
| `GET /api/analytics/expense-breakdown` | Expenses by branch, category, and description |
| `GET /api/analytics/mom-comparison` | Current MTD vs the same days last month (fleet + per branch) |
| `POST /api/ai-insights` | Gemini advisor |

---

## 5. Setup

**Prerequisites:** Node.js 20+ and access to the MySQL `restaurants` database.

1. `npm install`
2. Create `.env`:
   ```env
   DB_HOST=localhost
   DB_PORT=3306
   DB_USER=...
   DB_PASSWORD=...
   DB_NAME=restaurants
   JWT_SECRET=change_me_in_production       # falls back to an insecure default if unset
   JWT_EXPIRES_IN=24h
   TELEGRAM_MINIAPP_SECRET=...              # must match restoAdmin's signer
   TELEGRAM_BOT_TOKEN=...                   # optional; else telegram_settings table
   BRANCH_UPLOADS_DIR=...                   # optional logo dir override
   GEMINI_API_KEY=...                       # optional (AI advisor)
   ```
3. Dev: `npm run dev` runs `tsx server.ts` with Vite HMR on :2998.

## 6. Build and deploy

```bash
npm run build                    # vite build → dist/ ; esbuild server.ts → dist/server.cjs
pm2 restart resto-analytics      # first time: pm2 start ecosystem.config.cjs
pm2 logs resto-analytics         # logs/out.log, logs/err.log
```

**Changes to `server.ts` or `src/` take effect only after a build and restart.**

## 7. Project map

```
server.ts                         Express API + auth + SQL (single file)
src/main.tsx, App.tsx             Boot, session check, Telegram SSO, layout
src/context/UserContext.tsx       user/token in localStorage, login/logout
src/services/analyticsService.ts  apiFetch, all fetchers, date ranges, formatting, branch order/colors
src/components/analytics/
  SalesAnalytics.tsx              Main screen (KPIs, trend, top revenue, branch table, week grid, popups)
  BranchComparisonModal.tsx       Branch comparison board
src/components/dashboard/CellBreakdownModal.tsx   Board cell drill-down
src/components/layout/            Navbar, ModalPortal
src/utils/branchComparison.ts     Comparison windows, expense buckets, Korean labels
src/utils/branchLogo.ts           Logo URL + name-based fallback
src/utils/telegramWebApp.ts       Telegram WebApp bootstrap/initData
```
