# Phase 3 Automated Tests

第三期（P0 + P1）功能的 Playwright 自动化测试套件。

## 测试文件

- `phase3.spec.ts` - 主测试文件，包含所有 P0 和 P1 功能的测试用例
- `report.md` - 测试结果报告模板

## 快速开始

### 1. 安装依赖

```bash
npm install -D @playwright/test
npx playwright install
```

### 2. 启动开发环境

确保以下服务正在运行：
```bash
# 启动 Supabase 本地实例
npx supabase start

# 启动 Next.js 开发服务器
npm run dev
```

### 3. 运行测试

```bash
# 运行所有测试
npx playwright test tests/phase3/phase3.spec.ts

# 查看 HTML 报告
npx playwright test tests/phase3/phase3.spec.ts --reporter=html
npx playwright show-report

# 调试模式（可视化）
npx playwright test tests/phase3/phase3.spec.ts --headed --debug

# 运行特定测试
npx playwright test tests/phase3/phase3.spec.ts -g "P0-4"
npx playwright test tests/phase3/phase3.spec.ts -g "P1-1"
```

## 测试覆盖范围

### P0 功能
- **P0-1**: 沉默客户自动提醒 (数据库函数验证)
- **P0-2**: 大客户依赖度预警 (Admin/Member 权限测试)
- **P0-3**: 返单周期提醒 (数据库函数验证)
- **P0-4**: 铃铛通知 (UI 交互测试)

### P1 功能
- **P1-1**: 老板大屏
  - 同比/环比成交额显示
  - 成交转化率漏斗
  - 业绩目标对比
- **P1-2**: 个人工作台
  - 本周/本月工作汇总
  - 个人业绩占比

## 配置

### 环境变量

在 `.env.test` 文件中配置测试账号：

```env
BASE_URL=http://localhost:3000
ADMIN_EMAIL=admin@arabgold.test
ADMIN_PASSWORD=admin123
MEMBER_EMAIL=member@arabgold.test
MEMBER_PASSWORD=member123
```

或在命令行中设置：
```bash
export ADMIN_EMAIL=your-admin@email.com
export ADMIN_PASSWORD=your-password
```

### Playwright 配置

编辑 `playwright.config.ts` 以自定义测试配置：
- 超时时间
- 浏览器选择（Chrome, Firefox, Safari）
- 截图和视频录制
- 并行执行设置

## 测试数据要求

测试依赖特定的数据库状态：

1. **必需的测试账号**:
   - Admin 账号（有老板大屏权限）
   - Member 账号（普通成员权限）

2. **推荐的测试数据**:
   - 至少 10 个客户（不同阶段）
   - 至少 5 笔成交记录
   - 至少 3 条待办提醒
   - 一些沉默客户（last_contact_date >= 30天）

3. **运行种子数据** (可选):
   ```bash
   # 如果有 seed 脚本
   npm run db:seed
   ```

## 故障排查

### 测试失败常见原因

1. **开发服务器未运行**
   ```
   Error: page.goto: net::ERR_CONNECTION_REFUSED
   ```
   解决: 确保 `npm run dev` 正在运行

2. **数据库连接失败**
   ```
   Error: Database connection timeout
   ```
   解决: 确保 `npx supabase start` 已执行

3. **登录失败**
   ```
   Error: Timeout waiting for URL
   ```
   解决: 检查测试账号邮箱密码是否正确

4. **元素未找到**
   ```
   Error: locator.click: Target closed
   ```
   解决: 增加等待时间或检查 UI 是否有变化

### 调试技巧

1. **查看浏览器界面**:
   ```bash
   npx playwright test --headed
   ```

2. **逐步调试**:
   ```bash
   npx playwright test --debug
   ```

3. **查看测试截图** (失败时自动生成):
   ```bash
   ls test-results/
   ```

4. **查看详细日志**:
   ```bash
   DEBUG=pw:api npx playwright test
   ```

## CI/CD 集成

### GitHub Actions 示例

```yaml
name: Phase 3 Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npx supabase start
      - run: npm run dev &
      - run: npx playwright test tests/phase3/
      - uses: actions/upload-artifact@v3
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
```

## 维护指南

### 添加新测试

1. 在 `phase3.spec.ts` 中添加新的 `test()` 块
2. 使用描述性的测试名称
3. 添加适当的注释说明测试目的
4. 更新 `report.md` 添加新测试的结果追踪

### 更新测试

当功能变更时：
1. 更新相关的 `locator` 选择器
2. 调整断言逻辑
3. 更新测试文档

## 相关资源

- [Playwright 官方文档](https://playwright.dev/)
- [Playwright 最佳实践](https://playwright.dev/docs/best-practices)
- [测试选择器指南](https://playwright.dev/docs/selectors)
- [调试指南](https://playwright.dev/docs/debug)

---

**最后更新**: 2026-05-16
**维护者**: ArabGold CRM Team
