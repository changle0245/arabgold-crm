# Phase 3 部署前检查清单

**目标环境**: Vercel (前端) + Supabase 正式项目 (数据库)
**部署时间**: ___________
**部署人员**: ___________

---

## 一、数据库准备

### 1.1 Supabase 项目配置
- [ ] 确认 Supabase 正式项目已创建
- [ ] 记录项目 URL: ___________________________
- [ ] 记录项目 API Key (anon/public): ___________________________
- [ ] 记录项目 Service Role Key (secret): ___________________________

### 1.2 pg_cron 扩展启用
- [ ] **重要**: 在 Supabase Dashboard 启用 `pg_cron` 扩展
  - 路径: Database → Extensions → 搜索 "pg_cron" → Enable
  - 或执行 SQL: `CREATE EXTENSION IF NOT EXISTS pg_cron;`
- [ ] 验证扩展已启用:
  ```sql
  SELECT * FROM pg_extension WHERE extname = 'pg_cron';
  ```
- [ ] **预期结果**: 返回 1 行记录，extname = 'pg_cron'

### 1.3 Migration 执行
- [ ] 确认所有 migration 文件已上传到代码仓库
- [ ] 按顺序执行以下 6 个 migration（通过 Supabase CLI 或 Dashboard SQL Editor）:
  1. [ ] `20260516000000_owner_delete_phase2.sql`
  2. [ ] `20260516010000_deal_items.sql`
  3. [ ] `20260516020000_silent_customer_reminders.sql`
  4. [ ] `20260516030000_concentration_risk_warning.sql`
  5. [ ] `20260516040000_reorder_cycle_reminders.sql`
  6. [ ] `20260516050000_monthly_revenue_target.sql`

- [ ] **方法 A**: 使用 Supabase CLI (推荐)
  ```bash
  # 连接到生产项目
  npx supabase link --project-ref <your-project-ref>

  # 推送所有 migration
  npx supabase db push
  ```

- [ ] **方法 B**: 手动执行 SQL
  - 在 Supabase Dashboard → SQL Editor 中逐个复制粘贴执行

- [ ] 验证所有 migration 已应用:
  ```sql
  SELECT version, name
  FROM supabase_migrations.schema_migrations
  WHERE version >= '20260516000000'
  ORDER BY version;
  ```
- [ ] **预期结果**: 返回 6 行记录，版本号从 20260516000000 到 20260516050000

### 1.4 pg_cron 定时任务验证
- [ ] 验证定时任务已注册:
  ```sql
  SELECT jobid, jobname, schedule, command, active
  FROM cron.job
  WHERE jobname = 'scan-all-auto-reminders-daily';
  ```
- [ ] **预期结果**:
  - jobname = 'scan-all-auto-reminders-daily'
  - schedule = '0 2 * * *'
  - command = 'select public.scan_all_auto_reminders();'
  - active = true

- [ ] 手动测试定时任务函数:
  ```sql
  SELECT * FROM public.scan_all_auto_reminders();
  ```
- [ ] **预期结果**: 返回扫描统计（无报错）

### 1.5 系统配置初始化
- [ ] 验证系统配置表已创建:
  ```sql
  SELECT * FROM public.system_settings;
  ```
- [ ] **预期结果**: 至少包含以下配置项:
  - `concentration_risk_threshold` = 0.30
  - `monthly_revenue_target` = null

- [ ] 如需设置月度目标，执行:
  ```sql
  UPDATE public.system_settings
  SET value = '100000'::jsonb
  WHERE key = 'monthly_revenue_target';
  ```

### 1.6 RLS 策略验证
- [ ] 验证 `system_settings` 表的 RLS 策略:
  ```sql
  SELECT tablename, policyname, permissive, roles, cmd, qual
  FROM pg_policies
  WHERE tablename = 'system_settings';
  ```
- [ ] **预期结果**: 只有 admin 角色可以 SELECT/UPDATE

- [ ] 验证 `get_concentration_risk_customers()` 函数权限:
  ```sql
  SELECT routine_name, security_type
  FROM information_schema.routines
  WHERE routine_name = 'get_concentration_risk_customers';
  ```
- [ ] **预期结果**: security_type = 'DEFINER' (安全定义者模式)

---

## 二、环境变量配置

### 2.1 Vercel 环境变量
在 Vercel Dashboard → Project Settings → Environment Variables 中添加:

- [ ] `NEXT_PUBLIC_SUPABASE_URL`
  - 值: Supabase 项目 URL (如 `https://xxxxx.supabase.co`)

- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - 值: Supabase 项目 anon/public key

- [ ] `SUPABASE_SERVICE_ROLE_KEY` (如果后端需要)
  - 值: Supabase 项目 service role key
  - **注意**: 这是 secret，仅用于服务端，不要暴露到前端

- [ ] 确认所有环境变量已设置为 `Production`, `Preview`, `Development` 三个环境

### 2.2 本地 .env.local 文件（仅供参考）
确保本地开发环境有以下配置：
```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

- [ ] 本地 `.env.local` 文件已更新为生产配置
- [ ] 确认 `.env.local` 在 `.gitignore` 中（不提交到代码仓库）

---

## 三、前端部署

### 3.1 Vercel 项目配置
- [ ] Vercel 项目已创建并连接到 GitHub/GitLab 仓库
- [ ] 项目名称: ___________________________
- [ ] 部署分支: `master` 或 `main`
- [ ] Root Directory: `arabgold-crm` (如果在子目录)
- [ ] Framework Preset: `Next.js`
- [ ] Node.js Version: `18.x` 或更高

### 3.2 构建配置
- [ ] Build Command: `npm run build` (默认)
- [ ] Output Directory: `.next` (默认)
- [ ] Install Command: `npm install` (默认)

### 3.3 部署触发
- [ ] 推送代码到部署分支触发自动部署
- [ ] 或在 Vercel Dashboard 手动触发部署

### 3.4 部署验证
- [ ] 部署成功，无构建错误
- [ ] 访问生产 URL: ___________________________
- [ ] 首页正常加载
- [ ] 登录功能正常
- [ ] 数据库连接正常（无 401/403 错误）

---

## 四、功能验证

### 4.1 用户登录
- [ ] Admin 账号可以登录
- [ ] Member 账号可以登录
- [ ] 登录后正确跳转到 dashboard

### 4.2 P0-4: 铃铛通知
- [ ] 导航栏右上角铃铛图标可见
- [ ] 有待办提醒时显示红色徽章和数字
- [ ] 点击铃铛展开下拉菜单
- [ ] 下拉菜单显示最新 5 条提醒
- [ ] 点击提醒跳转到客户详情
- [ ] 点击"查看全部"跳转到提醒列表

### 4.3 P0-2: 大客户依赖度预警
- [ ] Admin 访问 `/dashboard/boss` 可以看到预警卡片（如有风险数据）
- [ ] Member 访问 `/dashboard/boss` 无法访问或看不到预警卡片
- [ ] 预警数据准确（与数据库查询结果一致）

### 4.4 P1-1: 老板大屏增强
- [ ] "同比增长" 和 "环比增长" 卡片显示正常
  - 有历史数据时显示百分比和箭头
  - 无历史数据时显示 "暂无可比数据"
- [ ] "成交转化率漏斗" 显示正常
  - 四个阶段（新接触 → 报价中 → 已寄样 → 已成交）
  - 每个阶段显示客户数和转化率
- [ ] "本月业绩目标" 显示正常
  - 未设置目标时显示 "未设置本月目标"
  - 已设置目标时显示进度条和完成百分比

### 4.5 P1-2: 个人工作台增强
- [ ] "本周工作汇总" 和 "本月工作汇总" 显示正常
  - 显示新增客户、记录联系、推进阶段、成交笔数
- [ ] "本月个人业绩占比" 显示正常
  - 有成交数据时显示我的成交额、公司总成交额、占比百分比
  - 无成交数据时显示 "本月暂无成交"

### 4.6 P0-1 & P0-3: 自动提醒（等待第二天验证）
- [ ] 第二天凌晨 02:00 后，检查是否自动创建了新的提醒
- [ ] 执行 SQL 查看自动提醒:
  ```sql
  SELECT * FROM public.reminders
  WHERE type IN ('silent_customer', 'reorder_cycle')
    AND created_by IS NULL
  ORDER BY created_at DESC;
  ```
- [ ] **预期结果**: 如有符合条件的客户，应自动创建提醒

---

## 五、性能与监控

### 5.1 页面加载性能
- [ ] 老板大屏加载时间 < 3秒
- [ ] 个人工作台加载时间 < 2秒
- [ ] 铃铛下拉菜单响应时间 < 500ms

### 5.2 Supabase 监控
- [ ] 在 Supabase Dashboard → Database → Logs 查看是否有错误
- [ ] 查看 API 请求量和响应时间
- [ ] 确认 RLS 策略正常工作（无权限泄漏）

### 5.3 Vercel 监控
- [ ] 在 Vercel Dashboard → Analytics 查看页面性能
- [ ] 查看错误日志（如有）
- [ ] 确认 Edge Functions（如有）运行正常

---

## 六、安全检查

### 6.1 API Keys 安全
- [ ] `SUPABASE_SERVICE_ROLE_KEY` 仅在服务端使用，未暴露到前端代码
- [ ] Vercel 环境变量标记为 "Secret"（在 UI 中隐藏值）
- [ ] `.env.local` 文件未提交到代码仓库

### 6.2 RLS 策略验证
- [ ] 普通用户无法访问其他用户的数据
- [ ] Member 无法访问 admin-only 的功能和数据
- [ ] `system_settings` 表只有 admin 可修改

### 6.3 CORS 配置
- [ ] Supabase 项目的 CORS 设置允许 Vercel 域名
- [ ] 如使用自定义域名，确保域名在 CORS 白名单中

---

## 七、回滚计划

### 7.1 数据库回滚
如部署后发现严重问题，需回滚数据库：
- [ ] 备份当前数据库（在 Supabase Dashboard → Database → Backups）
- [ ] 记录回滚前的 migration 版本
- [ ] 如需回滚 migration，手动执行 DOWN migration（需自行编写反向 SQL）

### 7.2 前端回滚
- [ ] 在 Vercel Dashboard → Deployments 中回滚到上一个稳定版本
- [ ] 或在 Git 中 revert 提交后重新部署

---

## 八、用户通知

### 8.1 内部团队
- [ ] 通知团队成员部署时间窗口
- [ ] 说明新功能和使用方法
- [ ] 提供新功能演示（如有）

### 8.2 最终用户
- [ ] 如有停机时间，提前通知用户
- [ ] 部署完成后通知用户新功能上线
- [ ] 提供新功能使用文档或视频

---

## 九、部署后验证清单

### 第一天
- [ ] 所有功能正常运行
- [ ] 无严重错误日志
- [ ] 用户反馈收集

### 第二天（凌晨 02:00 后）
- [ ] pg_cron 定时任务已执行
- [ ] 自动提醒已创建（如有符合条件的客户）
- [ ] 查看 Supabase logs 确认任务执行成功

### 第一周
- [ ] 监控性能指标（页面加载时间、API 响应时间）
- [ ] 收集用户反馈
- [ ] 修复发现的小问题（如有）

---

## 十、文档归档

### 10.1 部署记录
- [ ] 记录实际部署时间: ___________
- [ ] 记录部署人员: ___________
- [ ] 记录遇到的问题和解决方法

### 10.2 配置信息存档
- [ ] Supabase 项目配置信息（URL, Keys）存入密码管理器
- [ ] Vercel 项目配置信息存档
- [ ] 环境变量清单存档

### 10.3 更新项目文档
- [ ] 更新 README.md（如有部署说明变更）
- [ ] 更新 API 文档（如有新接口）
- [ ] 归档本检查清单到项目文档库

---

## 十一、常见问题处理

### 问题 1: pg_cron 扩展未启用
**症状**: 执行 `SELECT * FROM cron.job;` 报错 "schema cron does not exist"

**解决**:
```sql
CREATE EXTENSION IF NOT EXISTS pg_cron;
```

### 问题 2: Migration 执行失败
**症状**: Migration 报错，如 "column already exists" 或 "relation already exists"

**解决**:
1. 检查 migration 是否已部分执行
2. 手动清理冲突对象
3. 重新执行 migration

### 问题 3: RLS 策略阻止数据访问
**症状**: 前端显示 "无权限" 或数据为空

**解决**:
1. 检查用户角色是否正确
2. 验证 RLS 策略是否正确配置
3. 检查 JWT token 中的 role claim

### 问题 4: 环境变量未生效
**症状**: 前端无法连接数据库，显示 401 错误

**解决**:
1. 在 Vercel Dashboard 检查环境变量是否正确设置
2. 确认环境变量应用到 Production 环境
3. 重新部署触发环境变量更新

### 问题 5: 定时任务未执行
**症状**: 第二天检查，没有自动创建提醒

**解决**:
1. 检查 pg_cron 是否启用
2. 检查定时任务是否注册且 active
3. 手动执行函数测试:
   ```sql
   SELECT * FROM public.scan_all_auto_reminders();
   ```
4. 查看 Supabase logs 确认是否有错误

---

## 检查清单签署

**部署前检查完成**: ☐ 是 / ☐ 否
**部署执行完成**: ☐ 是 / ☐ 否
**部署后验证完成**: ☐ 是 / ☐ 否

**签署人**: ___________
**日期**: ___________

---

**附注**: 本检查清单基于 Phase 3 (P0 + P1) 的功能范围。如有后续功能更新，需相应更新本清单。
