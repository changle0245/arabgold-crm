# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: phase3\phase3.spec.ts >> Phase 3 - P0 & P1 Automated Tests >> P1-1: Boss dashboard should show YoY/MoM comparison sections
- Location: tests\phase3\phase3.spec.ts:82:7

# Error details

```
TimeoutError: page.waitForURL: Timeout 10000ms exceeded.
=========================== logs ===========================
waiting for navigation until "load"
============================================================
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e3]:
    - generic [ref=e4]:
      - heading "ArabGold CRM" [level=1] [ref=e5]
      - paragraph [ref=e6]: 客户管理系统
    - generic [ref=e7]:
      - generic [ref=e8]:
        - generic [ref=e9]: 邮箱
        - textbox "邮箱" [ref=e10]:
          - /placeholder: your@email.com
          - text: admin@arabgold.test
      - generic [ref=e11]:
        - generic [ref=e12]: 密码
        - textbox "密码" [ref=e13]:
          - /placeholder: ••••••••
          - text: admin123
      - paragraph [ref=e14]: 邮箱或密码错误
      - button "登录" [ref=e15] [cursor=pointer]
    - paragraph [ref=e16]: 账号由管理员创建，如需开通请联系管理员
  - button "Open Next.js Dev Tools" [ref=e22] [cursor=pointer]:
    - img [ref=e23]
  - alert [ref=e26]
```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test'
  2   | 
  3   | // Test configuration
  4   | const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'
  5   | const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@arabgold.test'
  6   | const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123'
  7   | const MEMBER_EMAIL = process.env.MEMBER_EMAIL || 'member@arabgold.test'
  8   | const MEMBER_PASSWORD = process.env.MEMBER_PASSWORD || 'member123'
  9   | 
  10  | test.describe('Phase 3 - P0 & P1 Automated Tests', () => {
  11  | 
  12  |   // ====================
  13  |   // P0-4: Bell Notification
  14  |   // ====================
  15  |   test('P0-4: Bell notification icon should be visible and functional', async ({ page }) => {
  16  |     await page.goto(BASE_URL)
  17  |     await page.fill('input[type="email"]', ADMIN_EMAIL)
  18  |     await page.fill('input[type="password"]', ADMIN_PASSWORD)
  19  |     await page.click('button[type="submit"]')
  20  | 
  21  |     // Wait for dashboard to load
  22  |     await page.waitForURL(/\/dashboard|\/customers/, { timeout: 10000 })
  23  | 
  24  |     // Check bell icon exists (in sidebar)
  25  |     const bellIcon = page.locator('button:has-text("Bell"), button svg[class*="lucide"]').first()
  26  |     await expect(bellIcon).toBeVisible()
  27  | 
  28  |     // Click bell icon to open dropdown
  29  |     await bellIcon.click()
  30  | 
  31  |     // Check dropdown appeared
  32  |     const dropdown = page.locator('div:has-text("待办提醒")')
  33  |     await expect(dropdown).toBeVisible()
  34  |   })
  35  | 
  36  |   // ====================
  37  |   // P0-2: Concentration Risk Warning (Admin Only)
  38  |   // ====================
  39  |   test('P0-2: Admin should see concentration risk card on boss dashboard', async ({ page }) => {
  40  |     await page.goto(BASE_URL)
  41  |     await page.fill('input[type="email"]', ADMIN_EMAIL)
  42  |     await page.fill('input[type="password"]', ADMIN_PASSWORD)
  43  |     await page.click('button[type="submit"]')
  44  | 
  45  |     await page.waitForURL(/\/dashboard|\/customers/, { timeout: 10000 })
  46  | 
  47  |     // Navigate to boss dashboard
  48  |     await page.goto(`${BASE_URL}/dashboard/boss`)
  49  |     await page.waitForLoadState('networkidle')
  50  | 
  51  |     // Check for concentration risk section (may or may not have data)
  52  |     const pageContent = await page.textContent('body')
  53  |     const hasRiskSection = pageContent?.includes('集中度风险') || pageContent?.includes('concentration')
  54  | 
  55  |     // If there's risk data, the card should be visible
  56  |     if (hasRiskSection) {
  57  |       const riskCard = page.locator('div:has-text("集中度风险客户")')
  58  |       await expect(riskCard).toBeVisible()
  59  |     }
  60  |   })
  61  | 
  62  |   test('P0-2: Member should NOT see boss dashboard', async ({ page }) => {
  63  |     await page.goto(BASE_URL)
  64  |     await page.fill('input[type="email"]', MEMBER_EMAIL)
  65  |     await page.fill('input[type="password"]', MEMBER_PASSWORD)
  66  |     await page.click('button[type="submit"]')
  67  | 
  68  |     await page.waitForURL(/\/dashboard|\/customers/, { timeout: 10000 })
  69  | 
  70  |     // Try to navigate to boss dashboard
  71  |     await page.goto(`${BASE_URL}/dashboard/boss`)
  72  | 
  73  |     // Should be redirected away from boss dashboard
  74  |     await page.waitForTimeout(2000)
  75  |     const currentUrl = page.url()
  76  |     expect(currentUrl).not.toContain('/dashboard/boss')
  77  |   })
  78  | 
  79  |   // ====================
  80  |   // P1-1: Boss Dashboard Enhancements
  81  |   // ====================
  82  |   test('P1-1: Boss dashboard should show YoY/MoM comparison sections', async ({ page }) => {
  83  |     await page.goto(BASE_URL)
  84  |     await page.fill('input[type="email"]', ADMIN_EMAIL)
  85  |     await page.fill('input[type="password"]', ADMIN_PASSWORD)
  86  |     await page.click('button[type="submit"]')
  87  | 
> 88  |     await page.waitForURL(/\/dashboard|\/customers/, { timeout: 10000 })
      |                ^ TimeoutError: page.waitForURL: Timeout 10000ms exceeded.
  89  | 
  90  |     await page.goto(`${BASE_URL}/dashboard/boss`)
  91  |     await page.waitForLoadState('networkidle')
  92  | 
  93  |     // Check for MoM section
  94  |     const momSection = page.locator('h3:has-text("环比增长")')
  95  |     await expect(momSection).toBeVisible()
  96  | 
  97  |     // Check for YoY section
  98  |     const yoySection = page.locator('h3:has-text("同比增长")')
  99  |     await expect(yoySection).toBeVisible()
  100 | 
  101 |     // Verify either shows data or "暂无可比数据"
  102 |     const pageContent = await page.textContent('body')
  103 |     const hasValidContent = pageContent?.includes('暂无可比数据') ||
  104 |                            pageContent?.includes('%') ||
  105 |                            pageContent?.includes('vs')
  106 |     expect(hasValidContent).toBeTruthy()
  107 |   })
  108 | 
  109 |   test('P1-1: Boss dashboard should show conversion funnel', async ({ page }) => {
  110 |     await page.goto(BASE_URL)
  111 |     await page.fill('input[type="email"]', ADMIN_EMAIL)
  112 |     await page.fill('input[type="password"]', ADMIN_PASSWORD)
  113 |     await page.click('button[type="submit"]')
  114 | 
  115 |     await page.waitForURL(/\/dashboard|\/customers/, { timeout: 10000 })
  116 | 
  117 |     await page.goto(`${BASE_URL}/dashboard/boss`)
  118 |     await page.waitForLoadState('networkidle')
  119 | 
  120 |     // Check for funnel section
  121 |     const funnelSection = page.locator('h3:has-text("成交转化率漏斗")')
  122 |     await expect(funnelSection).toBeVisible()
  123 | 
  124 |     // Check for funnel stages
  125 |     const stages = ['新接触', '报价中', '已寄样', '已成交']
  126 |     for (const stage of stages) {
  127 |       const stageElement = page.locator(`text=${stage}`)
  128 |       await expect(stageElement.first()).toBeVisible()
  129 |     }
  130 |   })
  131 | 
  132 |   test('P1-1: Boss dashboard should show monthly target progress', async ({ page }) => {
  133 |     await page.goto(BASE_URL)
  134 |     await page.fill('input[type="email"]', ADMIN_EMAIL)
  135 |     await page.fill('input[type="password"]', ADMIN_PASSWORD)
  136 |     await page.click('button[type="submit"]')
  137 | 
  138 |     await page.waitForURL(/\/dashboard|\/customers/, { timeout: 10000 })
  139 | 
  140 |     await page.goto(`${BASE_URL}/dashboard/boss`)
  141 |     await page.waitForLoadState('networkidle')
  142 | 
  143 |     // Check for target section
  144 |     const targetSection = page.locator('text=本月业绩目标')
  145 |     await expect(targetSection).toBeVisible()
  146 | 
  147 |     // Should show either progress bar or "未设置本月目标"
  148 |     const pageContent = await page.textContent('body')
  149 |     const hasValidTargetContent = pageContent?.includes('未设置本月目标') ||
  150 |                                   pageContent?.includes('已完成') ||
  151 |                                   pageContent?.includes('%')
  152 |     expect(hasValidTargetContent).toBeTruthy()
  153 |   })
  154 | 
  155 |   // ====================
  156 |   // P1-2: Personal Dashboard Enhancements
  157 |   // ====================
  158 |   test('P1-2: Personal dashboard should show weekly/monthly work summary', async ({ page }) => {
  159 |     await page.goto(BASE_URL)
  160 |     await page.fill('input[type="email"]', ADMIN_EMAIL)
  161 |     await page.fill('input[type="password"]', ADMIN_PASSWORD)
  162 |     await page.click('button[type="submit"]')
  163 | 
  164 |     await page.waitForURL(/\/dashboard|\/customers/, { timeout: 10000 })
  165 | 
  166 |     await page.goto(`${BASE_URL}/dashboard/personal`)
  167 |     await page.waitForLoadState('networkidle')
  168 | 
  169 |     // Check for weekly summary
  170 |     const weeklySummary = page.locator('text=本周工作汇总')
  171 |     await expect(weeklySummary).toBeVisible()
  172 | 
  173 |     // Check for monthly summary
  174 |     const monthlySummary = page.locator('text=本月工作汇总')
  175 |     await expect(monthlySummary).toBeVisible()
  176 | 
  177 |     // Check for summary metrics
  178 |     const metrics = ['新增客户', '记录联系', '推进阶段', '成交笔数']
  179 |     for (const metric of metrics) {
  180 |       const metricElements = page.locator(`text=${metric}`)
  181 |       const count = await metricElements.count()
  182 |       expect(count).toBeGreaterThanOrEqual(2) // Should appear in both weekly and monthly
  183 |     }
  184 |   })
  185 | 
  186 |   test('P1-2: Personal dashboard should show revenue share', async ({ page }) => {
  187 |     await page.goto(BASE_URL)
  188 |     await page.fill('input[type="email"]', ADMIN_EMAIL)
```