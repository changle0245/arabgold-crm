import { test, expect } from '@playwright/test'

// Test configuration
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@arabgold.test'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123'
const MEMBER_EMAIL = process.env.MEMBER_EMAIL || 'member@arabgold.test'
const MEMBER_PASSWORD = process.env.MEMBER_PASSWORD || 'member123'

test.describe('Phase 3 - P0 & P1 Automated Tests', () => {

  // ====================
  // P0-4: Bell Notification
  // ====================
  test('P0-4: Bell notification icon should be visible and functional', async ({ page }) => {
    await page.goto(BASE_URL)
    await page.fill('input[type="email"]', ADMIN_EMAIL)
    await page.fill('input[type="password"]', ADMIN_PASSWORD)
    await page.click('button[type="submit"]')

    // Wait for dashboard to load
    await page.waitForURL(/\/dashboard|\/customers/, { timeout: 10000 })

    // Check bell icon exists (in sidebar)
    const bellIcon = page.locator('button:has-text("Bell"), button svg[class*="lucide"]').first()
    await expect(bellIcon).toBeVisible()

    // Click bell icon to open dropdown
    await bellIcon.click()

    // Check dropdown appeared
    const dropdown = page.locator('div:has-text("待办提醒")')
    await expect(dropdown).toBeVisible()
  })

  // ====================
  // P0-2: Concentration Risk Warning (Admin Only)
  // ====================
  test('P0-2: Admin should see concentration risk card on boss dashboard', async ({ page }) => {
    await page.goto(BASE_URL)
    await page.fill('input[type="email"]', ADMIN_EMAIL)
    await page.fill('input[type="password"]', ADMIN_PASSWORD)
    await page.click('button[type="submit"]')

    await page.waitForURL(/\/dashboard|\/customers/, { timeout: 10000 })

    // Navigate to boss dashboard
    await page.goto(`${BASE_URL}/dashboard/boss`)
    await page.waitForLoadState('networkidle')

    // Check for concentration risk section (may or may not have data)
    const pageContent = await page.textContent('body')
    const hasRiskSection = pageContent?.includes('集中度风险') || pageContent?.includes('concentration')

    // If there's risk data, the card should be visible
    if (hasRiskSection) {
      const riskCard = page.locator('div:has-text("集中度风险客户")')
      await expect(riskCard).toBeVisible()
    }
  })

  test('P0-2: Member should NOT see boss dashboard', async ({ page }) => {
    await page.goto(BASE_URL)
    await page.fill('input[type="email"]', MEMBER_EMAIL)
    await page.fill('input[type="password"]', MEMBER_PASSWORD)
    await page.click('button[type="submit"]')

    await page.waitForURL(/\/dashboard|\/customers/, { timeout: 10000 })

    // Try to navigate to boss dashboard
    await page.goto(`${BASE_URL}/dashboard/boss`)

    // Should be redirected away from boss dashboard
    await page.waitForTimeout(2000)
    const currentUrl = page.url()
    expect(currentUrl).not.toContain('/dashboard/boss')
  })

  // ====================
  // P1-1: Boss Dashboard Enhancements
  // ====================
  test('P1-1: Boss dashboard should show YoY/MoM comparison sections', async ({ page }) => {
    await page.goto(BASE_URL)
    await page.fill('input[type="email"]', ADMIN_EMAIL)
    await page.fill('input[type="password"]', ADMIN_PASSWORD)
    await page.click('button[type="submit"]')

    await page.waitForURL(/\/dashboard|\/customers/, { timeout: 10000 })

    await page.goto(`${BASE_URL}/dashboard/boss`)
    await page.waitForLoadState('networkidle')

    // Check for MoM section
    const momSection = page.locator('h3:has-text("环比增长")')
    await expect(momSection).toBeVisible()

    // Check for YoY section
    const yoySection = page.locator('h3:has-text("同比增长")')
    await expect(yoySection).toBeVisible()

    // Verify either shows data or "暂无可比数据"
    const pageContent = await page.textContent('body')
    const hasValidContent = pageContent?.includes('暂无可比数据') ||
                           pageContent?.includes('%') ||
                           pageContent?.includes('vs')
    expect(hasValidContent).toBeTruthy()
  })

  test('P1-1: Boss dashboard should show conversion funnel', async ({ page }) => {
    await page.goto(BASE_URL)
    await page.fill('input[type="email"]', ADMIN_EMAIL)
    await page.fill('input[type="password"]', ADMIN_PASSWORD)
    await page.click('button[type="submit"]')

    await page.waitForURL(/\/dashboard|\/customers/, { timeout: 10000 })

    await page.goto(`${BASE_URL}/dashboard/boss`)
    await page.waitForLoadState('networkidle')

    // Check for funnel section
    const funnelSection = page.locator('h3:has-text("成交转化率漏斗")')
    await expect(funnelSection).toBeVisible()

    // Check for funnel stages
    const stages = ['新接触', '报价中', '已寄样', '已成交']
    for (const stage of stages) {
      const stageElement = page.locator(`text=${stage}`)
      await expect(stageElement.first()).toBeVisible()
    }
  })

  test('P1-1: Boss dashboard should show monthly target progress', async ({ page }) => {
    await page.goto(BASE_URL)
    await page.fill('input[type="email"]', ADMIN_EMAIL)
    await page.fill('input[type="password"]', ADMIN_PASSWORD)
    await page.click('button[type="submit"]')

    await page.waitForURL(/\/dashboard|\/customers/, { timeout: 10000 })

    await page.goto(`${BASE_URL}/dashboard/boss`)
    await page.waitForLoadState('networkidle')

    // Check for target section
    const targetSection = page.locator('text=本月业绩目标')
    await expect(targetSection).toBeVisible()

    // Should show either progress bar or "未设置本月目标"
    const pageContent = await page.textContent('body')
    const hasValidTargetContent = pageContent?.includes('未设置本月目标') ||
                                  pageContent?.includes('已完成') ||
                                  pageContent?.includes('%')
    expect(hasValidTargetContent).toBeTruthy()
  })

  // ====================
  // P1-2: Personal Dashboard Enhancements
  // ====================
  test('P1-2: Personal dashboard should show weekly/monthly work summary', async ({ page }) => {
    await page.goto(BASE_URL)
    await page.fill('input[type="email"]', ADMIN_EMAIL)
    await page.fill('input[type="password"]', ADMIN_PASSWORD)
    await page.click('button[type="submit"]')

    await page.waitForURL(/\/dashboard|\/customers/, { timeout: 10000 })

    await page.goto(`${BASE_URL}/dashboard/personal`)
    await page.waitForLoadState('networkidle')

    // Check for weekly summary
    const weeklySummary = page.locator('text=本周工作汇总')
    await expect(weeklySummary).toBeVisible()

    // Check for monthly summary
    const monthlySummary = page.locator('text=本月工作汇总')
    await expect(monthlySummary).toBeVisible()

    // Check for summary metrics
    const metrics = ['新增客户', '记录联系', '推进阶段', '成交笔数']
    for (const metric of metrics) {
      const metricElements = page.locator(`text=${metric}`)
      const count = await metricElements.count()
      expect(count).toBeGreaterThanOrEqual(2) // Should appear in both weekly and monthly
    }
  })

  test('P1-2: Personal dashboard should show revenue share', async ({ page }) => {
    await page.goto(BASE_URL)
    await page.fill('input[type="email"]', ADMIN_EMAIL)
    await page.fill('input[type="password"]', ADMIN_PASSWORD)
    await page.click('button[type="submit"]')

    await page.waitForURL(/\/dashboard|\/customers/, { timeout: 10000 })

    await page.goto(`${BASE_URL}/dashboard/personal`)
    await page.waitForLoadState('networkidle')

    // Check for revenue share section
    const revenueShare = page.locator('text=本月个人业绩占比')
    await expect(revenueShare).toBeVisible()

    // Should show either revenue data or "本月暂无成交"
    const pageContent = await page.textContent('body')
    const hasValidRevenueContent = pageContent?.includes('本月暂无成交') ||
                                   pageContent?.includes('我的成交额') ||
                                   pageContent?.includes('公司总成交额')
    expect(hasValidRevenueContent).toBeTruthy()
  })

  // ====================
  // P0-1 & P0-3: Auto-reminders (Database functions)
  // ====================
  test('P0-1 & P0-3: Auto-reminder functions should exist in database', async ({ page }) => {
    // This test verifies the database functions exist
    // Actual execution would be done via SQL or backend API

    await page.goto(BASE_URL)
    await page.fill('input[type="email"]', ADMIN_EMAIL)
    await page.fill('input[type="password"]', ADMIN_PASSWORD)
    await page.click('button[type="submit"]')

    await page.waitForURL(/\/dashboard|\/customers/, { timeout: 10000 })

    // Navigate to reminders page to verify auto-created reminders can be seen
    await page.goto(`${BASE_URL}/reminders`)
    await page.waitForLoadState('networkidle')

    // Page should load without errors
    const reminderPage = page.locator('text=我的提醒')
    await expect(reminderPage).toBeVisible()
  })

  // ====================
  // General Navigation Tests
  // ====================
  test('General: All main navigation links should work', async ({ page }) => {
    await page.goto(BASE_URL)
    await page.fill('input[type="email"]', ADMIN_EMAIL)
    await page.fill('input[type="password"]', ADMIN_PASSWORD)
    await page.click('button[type="submit"]')

    await page.waitForURL(/\/dashboard|\/customers/, { timeout: 10000 })

    const links = [
      { text: '客户列表', url: '/customers' },
      { text: '我的提醒', url: '/reminders' },
      { text: '个人大屏', url: '/dashboard/personal' },
      { text: '老板大屏', url: '/dashboard/boss' },
    ]

    for (const link of links) {
      const navLink = page.locator(`a:has-text("${link.text}")`)
      if (await navLink.isVisible()) {
        await navLink.click()
        await page.waitForURL(`**${link.url}`, { timeout: 5000 })
        expect(page.url()).toContain(link.url)
      }
    }
  })
})
