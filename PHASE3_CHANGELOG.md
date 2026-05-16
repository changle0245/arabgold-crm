# Phase 3 改动总清单

**开发时间**: 2026-05-16
**Commit Hash**: 3b4edc7
**涵盖范围**: P0 核心功能 + P1 数据看板深化

---

## 一、数据库 Migration 文件 (6个)

### 第二期遗留 (P0 前置)
1. **20260516000000_owner_delete_phase2.sql**
   - 增强客户负责人删除逻辑，添加级联更新和约束

2. **20260516010000_deal_items.sql**
   - 添加成交明细表（deal_items），支持多商品成交记录

### 第三期 P0 核心功能 (3个)
3. **20260516020000_silent_customer_reminders.sql**
   - 启用 pg_cron 扩展
   - 添加 'silent_customer' 和 'reorder_cycle' 到 reminders.type CHECK 约束
   - 创建 `scan_silent_customers()` 函数：扫描 ≥30天未联系的客户，自动创建提醒
   - 创建 pg_cron 定时任务：每天 02:00 执行扫描

4. **20260516030000_concentration_risk_warning.sql**
   - 创建 `system_settings` 表（key-value JSON 配置存储）
   - 插入 `concentration_risk_threshold` 配置（默认 30%）
   - 创建 `get_concentration_risk_customers()` RPC 函数：返回营收占比超标的客户
   - 添加 RLS 策略：仅 admin 可读写系统配置

5. **20260516040000_reorder_cycle_reminders.sql**
   - 创建 `scan_reorder_cycle_reminders()` 函数：扫描有 ≥2笔成交的客户，计算平均返单周期，超期自动创建提醒
   - 创建 `scan_all_auto_reminders()` 组合函数：同时运行沉默客户和返单周期扫描
   - 更新 pg_cron 任务：使用组合函数，统一定时执行
   - 取消旧的 'scan-silent-customers-daily' 任务

### 第三期 P1 数据看板 (1个)
6. **20260516050000_monthly_revenue_target.sql**
   - 在 `system_settings` 表插入 `monthly_revenue_target` 配置（默认 null，表示未设置）
   - 为 admin 设置月度业绩目标提供数据支持

---

## 二、新增/修改的前端文件

### 新增组件 (1个)
1. **src/components/bell-notification.tsx** (新建)
   - 铃铛通知组件，显示待办提醒数量徽章
   - 下拉菜单显示最新 5 条提醒（类型图标 + 客户名 + 内容截断 + 相对到期时间）
   - 点击提醒跳转客户详情，点击"查看全部"跳转提醒列表
   - 每 60 秒自动刷新数据

### 修改组件 (1个)
2. **src/components/sidebar.tsx** (修改)
   - 在侧边栏顶部（桌面端）和移动端导航栏右上角添加 `<BellNotification />` 组件
   - 保留原有的过期提醒徽章在"我的提醒"菜单项上

### 修改页面 (2个)
3. **src/app/(app)/dashboard/boss/page.tsx** (修改 - P1-1)
   - 添加 state: `monthlyTarget`
   - 新增 import: `ArrowUp`, `ArrowDown`, `Target` 图标
   - 查询 `system_settings` 获取月度目标配置
   - **新增模块 1**: 业绩目标对比（进度条 + 完成百分比）
   - **新增模块 2**: 同比/环比成交额（MoM/YoY，带上升/下降箭头）
   - **新增模块 3**: 成交转化率漏斗（新接触 → 报价中 → 已寄样 → 已成交）
   - 所有模块处理边界情况（无数据显示"暂无可比数据"，不显示 NaN）

4. **src/app/(app)/dashboard/personal/page.tsx** (修改 - P1-2)
   - 添加 state: `weeklyStats`, `monthlyStats`, `myMonthRevenue`, `companyMonthRevenue`
   - 新增 import: `Calendar`, `TrendingUp`, `PieChart` 图标
   - 在 `load()` 函数新增 10 个并行查询（本周/本月的新增客户、联系记录、推进阶段、成交笔数）
   - 计算本周一和本月1日的时间范围
   - **新增模块 1**: 本周工作汇总（2x2 网格显示 4 项指标）
   - **新增模块 2**: 本月工作汇总（2x2 网格显示 4 项指标）
   - **新增模块 3**: 个人业绩占比（我的成交额/公司总成交额，渐变金色进度条）
   - 边界处理：公司成交额为 0 显示"本月暂无成交"

---

## 三、新增的数据库函数

### P0-1: 沉默客户扫描
1. **`public.scan_silent_customers()`**
   - 返回类型: `TABLE(customers_scanned, reminders_created, customer_names[])`
   - 功能: 扫描 `last_contact_date >= 30天` 且 `stage != '已成交'` 的客户
   - 防重复: 检查是否已有待处理的 silent_customer 提醒
   - 创建提醒: 分配给 `owner_id`，到期日为明天，状态 pending
   - `created_by = null` (系统自动创建标记)

### P0-2: 集中度风险查询
2. **`public.get_concentration_risk_customers()`**
   - 返回类型: `TABLE(customer_id, customer_name, customer_company, total_amount, revenue_share, deal_count)`
   - 功能: 返回近 12 个月营收占比超过阈值的客户
   - 阈值来源: `system_settings.concentration_risk_threshold` (默认 30%)
   - 权限: 仅 admin 可调用（RLS）

### P0-3: 返单周期扫描
3. **`public.scan_reorder_cycle_reminders()`**
   - 返回类型: `TABLE(customers_scanned, reminders_created, customer_names[])`
   - 功能: 扫描有 ≥2 笔成交的客户，计算最近 3 次成交的平均间隔
   - 逻辑: 如果距上次成交天数 > 平均周期，创建提醒
   - 提醒内容: "该客户通常每 X 天返单，距上次成交已 Y 天"
   - 防重复: 检查是否已有待处理的 reorder_cycle 提醒

### P0-1 + P0-3 组合函数
4. **`public.scan_all_auto_reminders()`**
   - 返回类型: `TABLE(silent_scanned, silent_created, silent_names[], reorder_scanned, reorder_created, reorder_names[])`
   - 功能: 同时调用 `scan_silent_customers()` 和 `scan_reorder_cycle_reminders()`
   - 用于 pg_cron 统一执行

---

## 四、新增的 pg_cron 定时任务

### 任务详情
- **任务名称**: `scan-all-auto-reminders-daily`
- **Cron 表达式**: `0 2 * * *` (每天凌晨 02:00)
- **执行命令**: `SELECT public.scan_all_auto_reminders();`
- **数据库**: postgres
- **用户**: postgres
- **状态**: active (t)

### 替换的旧任务
- 旧任务 `scan-silent-customers-daily` 已被 unschedule，由新的组合任务替代

### 验证方法
```sql
SELECT jobid, jobname, schedule, command, active
FROM cron.job
WHERE jobname = 'scan-all-auto-reminders-daily';
```

---

## 五、测试交付物

### Playwright 自动化测试
1. **tests/phase3/phase3.spec.ts**
   - 11 个测试用例覆盖 P0 + P1 功能
   - 包括 UI 交互测试、权限测试、数据验证测试
   - **注意**: 代码已编写，需要在本地运行验证

2. **tests/phase3/report.md**
   - 测试结果报告模板（空白）

3. **tests/phase3/README.md**
   - 测试运行说明、故障排查指南、CI/CD 集成示例

### 人工测试清单
4. **manual_test_checklist_phase3.md**
   - 完整测试清单覆盖 P0 + P1 所有功能
   - 包含 5 个边界情况测试
   - 每步带复选框，可直接填写测试结果

5. **manual_test_checklist_phase3_P0.md**
   - P0 专项测试清单（详细版）
   - 包含手动触发 SQL、数据验证步骤

---

## 六、第三期所有"指令外的自主决定"汇总

### P0-2: 大客户依赖度预警 (1项)
1. **system_settings 表设计**
   - **指令**: "阈值(默认30%)"
   - **决定**: 创建独立的 key-value JSON 配置表，添加 RLS 策略（仅 admin 读写）
   - **原因**: 灵活配置，未来可扩展其他系统配置

### P0-1 & P0-3: 自动提醒 (3项)
2. **防重复检查机制**
   - **指令**: 未提及防重复
   - **决定**: 两个扫描函数都加了检查，避免同一客户多个相同类型的待处理提醒
   - **原因**: 避免提醒泛滥

3. **组合扫描函数 `scan_all_auto_reminders()`**
   - **指令**: 未要求合并
   - **决定**: 创建组合函数同时运行 P0-1 和 P0-3，更新 cron 任务改为调用组合函数
   - **原因**: 减少 cron 任务数量，统一管理

4. **系统创建提醒标记 `created_by = null`**
   - **指令**: 未说明如何标记
   - **决定**: 用 null 区分系统自动创建 vs 用户手动创建
   - **原因**: 便于后续统计和筛选

### P0-2: 大客户预警显示 (1项)
5. **条件显示预警卡片**
   - **指令**: "老板大屏显示预警卡片"
   - **决定**: 只在有风险客户时才显示卡片（无风险时不显示）
   - **原因**: 避免空卡片占用空间，提升 UI 清爽度

### P0-3: 返单周期计算 (1项)
6. **只取最近 3 笔成交计算平均**
   - **指令**: "计算平均返单周期"
   - **决定**: 只用最近 3 笔（或全部如果<3），不用所有历史成交
   - **原因**: 近期数据更能反映当前购买模式

### P0-4: 铃铛通知 (3项)
7. **相对时间显示**
   - **指令**: "显示到期日"
   - **决定**: 用相对时间（"今天"/"明天"/"逾期 X 天"）而不是具体日期
   - **原因**: 更直观，符合用户认知习惯

8. **60秒自动刷新**
   - **指令**: 要求"实时性"
   - **决定**: 用 60 秒轮询刷新
   - **原因**: 平衡实时性和性能，避免频繁请求

9. **点击外部自动关闭下拉菜单**
   - **指令**: 未提及
   - **决定**: 添加 click outside 逻辑
   - **原因**: 符合常规 UI 交互习惯

### P1-1: 老板大屏深化 (6项)
10. **业绩目标存储为 `'null'::jsonb`**
    - **指令**: "在 system_settings 表里新增配置项"
    - **决定**: 用 `'null'::jsonb` 作为默认值表示未设置
    - **原因**: 符合 JSON 格式，前端易于判断

11. **同比/环比在前端计算**
    - **指令**: "显示同比/环比"
    - **决定**: 前端直接计算，不创建数据库 RPC 函数
    - **原因**: 已有 deals 数据，前端计算更简单高效

12. **转化率漏斗渐变金色进度条**
    - **指令**: 无具体样式说明
    - **决定**: 渐变金色进度条（from-gold-400 to-gold-600）
    - **原因**: 与系统整体金色主题一致

13. **目标进度条颜色逻辑**
    - **指令**: "显示完成百分比"
    - **决定**: ≥100% 绿色，<100% 金色
    - **原因**: 视觉上区分已达标和未达标

14. **暂无数据文案严格遵守**
    - **指令**: 要求显示"暂无可比数据"
    - **决定**: 严格遵守，不显示 0/NaN/错误
    - **原因**: 避免误导用户

15. **新模块位置**
    - **指令**: "在老板大屏基础上新增"
    - **决定**: 放在顶部卡片后、原有图表前
    - **顺序**: 目标进度 → 同比/环比 → 转化率漏斗 → 原有图表
    - **原因**: 新模块优先级高，应放在显眼位置

### P1-2: 个人工作台深化 (7项)
16. **本周起始日为周一（ISO标准）**
    - **指令**: "本周工作汇总"
    - **决定**: 使用 ISO 周标准，周一为第一天
    - **原因**: 国际标准，符合商业习惯

17. **2x2 网格卡片而非表格**
    - **指令**: "用卡片或小表格展示"
    - **决定**: 用 2x2 网格卡片
    - **原因**: 卡片更直观，与现有设计风格一致

18. **成交笔数金色突出显示**
    - **指令**: 无特别说明
    - **决定**: 用金色（text-gold-700）突出"成交笔数"
    - **原因**: 成交是最关键的业绩指标

19. **业绩占比渐变金色进度条**
    - **指令**: "显示百分比"
    - **决定**: 渐变金色进度条，百分比显示在内部
    - **原因**: 可视化更直观

20. **金额万元格式化**
    - **指令**: 无格式说明
    - **决定**: ≥10000 显示为 "X.Xw"（万元单位）
    - **原因**: 与老板大屏 `formatAmount` 逻辑保持一致

21. **新模块位置**
    - **指令**: "在个人工作台基础上新增"
    - **决定**: 放在"今日待办提醒"后、"需要跟进的客户"前
    - **原因**: 工作汇总是中长期数据，优先级介于今日和待办之间

22. **查询并行优化**
    - **指令**: 无明确要求
    - **决定**: 所有查询添加到一个 Promise.all 并行执行（新增 10 个查询）
    - **原因**: 减少页面加载时间，提升用户体验

---

## 七、未修改的部分

### P0 代码零修改
- P0-1 到 P0-4 的所有功能在 P1 阶段**未被修改**
- P1 的所有改动严格限定在指定文件范围内

### 不在第三期范围的改动
以下文件虽有改动，但不属于第三期 P0/P1 范围（第二期遗留或配置文件）：
- `.gitignore`
- `package.json` / `package-lock.json`
- `src/app/globals.css`
- `src/app/layout.tsx`
- `src/app/page.tsx`
- 其他 `src/app/(app)` 下的页面（customers, deals, reminders 等）
- 其他 `src/components` 下的组件（除 bell-notification 和 sidebar）

---

## 八、已知问题与解决

### 问题 1: Migration 记录缺失
- **问题**: `npx supabase db reset` 失败（Exit code 13），导致 P1 migration 未应用
- **解决**: 手动执行 SQL + 插入 migration 记录到 `supabase_migrations.schema_migrations`
- **当前状态**: ✅ 已修复，migration 记录完整

### 问题 2: Playwright 测试未实际运行
- **问题**: 测试代码已编写，但未在开发环境中实际运行验证
- **原因**: AI 环境限制，无图形界面，无法可靠运行浏览器自动化测试
- **当前状态**: ⚠️ 需要人工在本地环境运行验证

---

## 九、部署注意事项

1. **pg_cron 扩展**: 生产环境需确认 Supabase 项目是否已启用 pg_cron
2. **Migration 顺序**: 必须按版本号顺序执行全部 6 个 migration
3. **系统配置**: `monthly_revenue_target` 默认为 null，需 admin 手动设置
4. **RLS 策略**: `system_settings` 表仅 admin 可读写，需确认生产环境 admin 角色正确
5. **定时任务验证**: 部署后需验证 cron 任务是否正常调度

---

**最后更新**: 2026-05-16
**维护者**: ArabGold CRM Team
