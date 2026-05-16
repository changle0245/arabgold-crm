# Phase 4 部署前检查清单

**目标环境**: Vercel (前端) + Supabase 正式项目 (数据库)
**部署时间**: ___________
**部署人员**: ___________

---

## 一、数据库准备

### 1.1 Supabase 项目确认

- [ ] 确认 Phase 3 已部署完成
- [ ] 确认 Supabase 项目 URL: ___________________________
- [ ] 确认 Supabase API Keys 配置正确

### 1.2 Migration 执行

- [ ] 确认 Phase 4 migration 文件已上传到代码仓库
- [ ] 执行 migration: `20260516060000_communication_logs.sql`

**方法 A**: 使用 Supabase CLI (推荐)
```bash
# 连接到生产项目
npx supabase link --project-ref <your-project-ref>

# 推送 migration
npx supabase db push
```

**方法 B**: 手动执行 SQL
- 在 Supabase Dashboard → SQL Editor 中执行 `setup_phase4_task1.sql` 文件内容

- [ ] 验证 migration 已应用:
```sql
SELECT version, name
FROM supabase_migrations.schema_migrations
WHERE version = '20260516060000';
```
- [ ] **预期结果**: 返回 1 行记录，version = '20260516060000'

### 1.3 communication_logs 表验证

- [ ] 验证表已创建:
```sql
SELECT * FROM public.communication_logs LIMIT 1;
```

- [ ] 验证表结构:
```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'communication_logs'
ORDER BY ordinal_position;
```

- [ ] **预期结果**: 包含以下字段
  - id (uuid)
  - customer_id (uuid)
  - channel (text)
  - direction (text)
  - sender_name (text)
  - content (text)
  - sent_at (timestamp with time zone)
  - original_file_url (text)
  - created_by (uuid)
  - created_at (timestamp with time zone)

### 1.4 索引验证

- [ ] 验证索引已创建:
```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'communication_logs';
```

- [ ] **预期结果**: 包含 3 个索引
  - `idx_communication_logs_customer_id`
  - `idx_communication_logs_sent_at`
  - `idx_communication_logs_channel`

### 1.5 RLS 策略验证

- [ ] 验证 RLS 已启用:
```sql
SELECT relname, relrowsecurity
FROM pg_class
WHERE relname = 'communication_logs';
```
- [ ] **预期结果**: relrowsecurity = true

- [ ] 验证 RLS 策略:
```sql
SELECT tablename, policyname, permissive, roles, cmd
FROM pg_policies
WHERE tablename = 'communication_logs';
```

- [ ] **预期结果**: 包含 3 个策略
  - "Users can view their customers' communication logs" (SELECT)
  - "Users can insert communication logs for their customers" (INSERT)
  - "Users can delete their own communication logs" (DELETE)

---

## 二、Storage 准备

### 2.1 创建 Storage Bucket

- [ ] 在 Supabase Dashboard → Storage 中创建 bucket:
  - Bucket name: `communication-files`
  - Public bucket: **✅ Yes**
  - File size limit: 50MB (默认)
  - Allowed MIME types: All (默认)

**或通过 SQL 创建**:
```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('communication-files', 'communication-files', true)
ON CONFLICT (id) DO NOTHING;
```

- [ ] 验证 bucket 已创建:
```sql
SELECT * FROM storage.buckets WHERE id = 'communication-files';
```
- [ ] **预期结果**: 返回 1 行，name = 'communication-files', public = true

### 2.2 Storage RLS 策略

- [ ] 创建上传策略:
```sql
CREATE POLICY "Users can upload communication files for their customers"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'communication-files'
    AND auth.role() = 'authenticated'
  );
```

- [ ] 创建查看策略:
```sql
CREATE POLICY "Anyone can view communication files"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'communication-files');
```

- [ ] 验证策略已创建:
```sql
SELECT policyname, cmd
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
  AND policyname LIKE '%communication%';
```

---

## 三、环境变量配置

### 3.1 Vercel 环境变量

确认以下环境变量已配置（Phase 3 已配置，无需修改）:

- [ ] `NEXT_PUBLIC_SUPABASE_URL`
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [ ] `SUPABASE_SERVICE_ROLE_KEY` (如果后端需要)

- [ ] 确认所有环境变量应用到 Production 环境

---

## 四、前端部署

### 4.1 代码推送

- [ ] 推送 Phase 4 代码到 GitHub/GitLab:
```bash
git push origin master
```

- [ ] 确认以下文件已推送:
  - supabase/migrations/20260516060000_communication_logs.sql
  - setup_phase4_task1.sql
  - src/lib/whatsappParser.ts
  - src/app/api/customers/[customerId]/import-whatsapp/route.ts
  - src/app/api/customers/[customerId]/record-email/route.ts
  - src/app/(app)/customers/[id]/page.tsx (修改)
  - src/lib/types.ts (修改)
  - src/components/lifecycle-timeline.tsx (修改)
  - whatsapp_export_sample.txt
  - PHASE4_TASK1_REPORT.md
  - PHASE4_TASK2_REPORT.md
  - PHASE4_TASK3_REPORT.md
  - PHASE4_CHANGELOG.md

### 4.2 Vercel 部署

- [ ] Vercel 自动部署触发
- [ ] 部署成功，无构建错误
- [ ] 访问生产 URL: ___________________________

---

## 五、功能验证

### 5.1 基础验证

- [ ] 登录系统（Admin 或 Member 账号）
- [ ] 访问任意客户详情页
- [ ] 页面正常加载，无 JavaScript 错误

### 5.2 Task 1: WhatsApp 聊天记录导入

- [ ] 在客户详情页找到"WhatsApp 聊天记录" section
- [ ] 点击"导入记录"按钮，表单展开
- [ ] 上传测试文件 `whatsapp_export_sample.txt`:
  - 文件路径: 项目根目录 / whatsapp_export_sample.txt
  - 公司关键词输入: `ArabGold,Sarah`
- [ ] 点击"开始导入"
- [ ] **预期结果**: 提示"成功导入 20 条消息！"
- [ ] 页面刷新后，"WhatsApp 聊天记录" section 显示消息列表
- [ ] 验证消息显示:
  - 绿色圆点 + "我方发出" 标识（发送者包含 Sarah 或 ArabGold）
  - 蓝色圆点 + "客户发来" 标识（发送者为 Ahmed Ali）
  - 消息内容正确显示
  - 时间格式正确（YYYY-MM-DD HH:MM）

### 5.3 Task 2: 邮件往来手动录入

- [ ] 在客户详情页找到"邮件往来记录" section
- [ ] 点击"记录邮件"按钮，表单展开

**测试用例 1: 我方发出的邮件（无附件）**
- [ ] 填写表单:
  - 邮件方向: 我发给客户
  - 邮件主题: Product Inquiry
  - 邮件正文: Dear Customer, Thank you for your interest...
  - 发送时间: 当前时间
  - 附件: 不上传
- [ ] 点击"保存"
- [ ] **预期结果**: 提示"邮件记录已保存！"
- [ ] 验证邮件显示:
  - 绿色标签 + "我方发出"
  - 显示主题和正文
  - 时间正确

**测试用例 2: 客户发来的邮件（有附件）**
- [ ] 填写表单:
  - 邮件方向: 客户发给我
  - 邮件主题: RE: Quotation
  - 邮件正文: Thank you for the quotation...
  - 发送时间: 选择过去某个时间
  - 附件: 上传 1 个 PDF 文件
- [ ] 点击"保存"
- [ ] **预期结果**: 提示"邮件记录已保存！(包含 1 个附件)"
- [ ] 验证邮件显示:
  - 紫色标签 + "客户发来"
  - 显示主题和正文
  - 内容末尾显示附件链接

### 5.4 Task 3: 统一沟通时间线

- [ ] 点击客户详情页的"时间线" tab
- [ ] **预期结果**: 时间线显示所有事件类型，包括:
  - WhatsApp 聊天（绿色 MessageSquare 图标）
  - 邮件往来（蓝色 Mail 图标）
  - 联系记录（蓝色 MessageSquare 图标）
  - 报价单（琥珀色 FileText 图标）
  - 成交记录（绿色 Package 图标）
  - 样品寄送（紫色 PackageCheck 图标）
  - 阶段变更（灰色 ArrowRightLeft 图标）
  - 已完成提醒（粉色 Bell 图标）

- [ ] 验证时间线特性:
  - 按月份分组（YYYY-MM 标题）
  - 每月内按日期倒序排列（最新的在上面）
  - 每个事件显示图标、标题、详情、操作人、日期
  - WhatsApp 和 Email 事件正确显示
  - 长文本被截断（超过 100 字符显示"..."）

- [ ] 验证 WhatsApp 事件标题:
  - "WhatsApp · 我方发出" 或 "WhatsApp · 客户发来"

- [ ] 验证 Email 事件标题:
  - "邮件 · 我方发出" 或 "邮件 · 客户发来"

---

## 六、权限验证

### 6.1 业务员权限隔离

- [ ] 使用业务员 A 账号登录
- [ ] 导入 WhatsApp 记录到业务员 A 负责的客户
- [ ] **预期结果**: 成功导入

- [ ] 尝试访问业务员 B 负责的客户详情页
- [ ] **预期结果**: 无法访问或看不到业务员 B 客户的 communication_logs

### 6.2 RLS 策略测试

通过 SQL 验证 RLS 策略:

- [ ] 切换到 Member 角色，尝试查询其他用户的记录:
```sql
SET ROLE member;
SET request.jwt.claims.sub = '<业务员A的UUID>';

SELECT * FROM public.communication_logs
WHERE customer_id IN (
  SELECT id FROM public.customers WHERE owner_id != '<业务员A的UUID>'
);
```
- [ ] **预期结果**: 返回 0 行（无法查看其他业务员的客户记录）

---

## 七、性能与监控

### 7.1 页面加载性能

- [ ] 客户详情页（含 WhatsApp + Email sections）加载时间 < 3秒
- [ ] 时间线 tab 加载时间 < 2秒
- [ ] WhatsApp 导入（20 条消息）处理时间 < 5秒

### 7.2 Supabase 监控

- [ ] 在 Supabase Dashboard → Database → Logs 查看是否有错误
- [ ] 查看 API 请求量和响应时间
- [ ] 确认 RLS 策略正常工作（无权限泄漏）

### 7.3 Storage 监控

- [ ] 在 Supabase Dashboard → Storage → communication-files 查看已上传文件
- [ ] 验证文件可正常访问（点击文件 URL）
- [ ] 验证文件命名正确:
  - WhatsApp: `whatsapp_{customerId}_{timestamp}.txt`
  - Email: `email_{customerId}_{timestamp}_{random}.{ext}`

---

## 八、安全检查

### 8.1 API 安全

- [ ] 验证 WhatsApp 导入 API 无 API 调用（纯文件解析）
- [ ] 验证 Email 录入 API 无 IMAP/POP3/SMTP 调用
- [ ] 验证所有 API 都有用户权限验证

### 8.2 文件上传安全

- [ ] 验证 WhatsApp 导入只接受 .txt 文件
- [ ] 验证邮件附件上传有文件大小限制
- [ ] 验证上传的文件存储在隔离的 bucket 中

### 8.3 XSS 防护

- [ ] 验证 WhatsApp 消息内容不执行 HTML/JavaScript
- [ ] 验证邮件内容不执行 HTML/JavaScript
- [ ] 验证所有用户输入都被安全渲染

---

## 九、边界情况测试

### 9.1 空数据测试

- [ ] 访问无任何记录的客户
- [ ] **预期结果**:
  - "WhatsApp 聊天记录" 显示"暂无聊天记录"
  - "邮件往来记录" 显示"暂无邮件记录"
  - 时间线 tab 显示现有事件（如果有），无 WhatsApp/Email 事件

### 9.2 大文件测试

- [ ] 上传包含 500+ 条消息的 WhatsApp txt 文件
- [ ] **预期结果**: 成功导入，但页面只显示最近 50 条

### 9.3 无主题邮件测试

- [ ] 录入邮件时，邮件主题留空
- [ ] **预期结果**: 保存成功，内容不显示"[主题: ]"

### 9.4 多附件测试

- [ ] 录入邮件时，上传 3 个附件（PDF + Excel + JPG）
- [ ] **预期结果**: 保存成功，内容末尾显示 3 个附件链接

### 9.5 无效文件格式测试

- [ ] 尝试上传非 WhatsApp 导出格式的 .txt 文件
- [ ] **预期结果**: 提示"Invalid WhatsApp export format"

---

## 十、回滚计划

### 10.1 数据库回滚

如部署后发现严重问题，需回滚数据库：

- [ ] 备份当前数据库（在 Supabase Dashboard → Database → Backups）
- [ ] 记录回滚前的 migration 版本

**回滚 SQL**（如需要）:
```sql
-- 删除 communication_logs 表
DROP TABLE IF EXISTS public.communication_logs CASCADE;

-- 删除 storage bucket
DELETE FROM storage.buckets WHERE id = 'communication-files';

-- 删除 migration 记录
DELETE FROM supabase_migrations.schema_migrations
WHERE version = '20260516060000';
```

### 10.2 前端回滚

- [ ] 在 Vercel Dashboard → Deployments 中回滚到 Phase 3 版本
- [ ] 或在 Git 中 revert Phase 4 commits:
```bash
git revert 8731ccc  # 回滚文档 commit
git revert bccfd4e  # 回滚代码 commit
git revert 7affe11  # 回滚数据库 commit
git push origin master
```

---

## 十一、用户通知

### 11.1 内部团队

- [ ] 通知团队成员 Phase 4 上线
- [ ] 说明新功能：
  - WhatsApp 聊天记录导入
  - 邮件往来手动录入
  - 统一沟通时间线
- [ ] 提供使用指南（可参考 PHASE4_TASK1_REPORT.md 和 PHASE4_TASK2_REPORT.md）

### 11.2 培训材料

- [ ] 准备 WhatsApp 导入教程:
  1. 如何在 WhatsApp 中导出聊天
  2. 如何上传到系统
  3. 如何输入公司关键词

- [ ] 准备邮件录入教程:
  1. 如何填写邮件表单
  2. 如何上传附件
  3. 如何选择时间

- [ ] 准备时间线使用教程:
  1. 如何查看统一时间线
  2. 如何区分不同事件类型
  3. 如何追溯客户沟通历史

---

## 十二、部署后验证清单

### 第一天

- [ ] 所有功能正常运行
- [ ] 无严重错误日志
- [ ] 用户反馈收集
- [ ] 监控 Supabase Database 和 Storage 使用量

### 第一周

- [ ] 收集业务员使用反馈
- [ ] 统计 WhatsApp 导入使用次数
- [ ] 统计邮件录入使用次数
- [ ] 监控 communication_logs 表数据增长
- [ ] 修复发现的小问题（如有）

### 第一个月

- [ ] 评估功能使用率
- [ ] 分析沟通数据价值
- [ ] 收集功能改进建议
- [ ] 规划后续优化（如分页加载、事件筛选）

---

## 十三、常见问题处理

### 问题 1: communication_logs 表不存在

**症状**: 页面报错 "relation 'communication_logs' does not exist"

**解决**:
1. 检查 migration 是否已执行
2. 手动执行 `setup_phase4_task1.sql` 文件内容
3. 验证表是否创建成功

### 问题 2: Storage bucket 不存在

**症状**: 上传文件时报错 "Bucket not found"

**解决**:
1. 在 Supabase Dashboard → Storage 中手动创建 bucket `communication-files`
2. 设置为公开访问
3. 创建 RLS 策略

### 问题 3: WhatsApp 导入失败

**症状**: 提示"Invalid WhatsApp export format"

**解决**:
1. 检查上传的文件是否为 WhatsApp 导出的 .txt 文件
2. 验证文件格式是否符合标准（日期/时间 - 发送者: 内容）
3. 尝试使用 `whatsapp_export_sample.txt` 测试

### 问题 4: 邮件附件上传失败

**症状**: 提示"Failed to upload file"

**解决**:
1. 检查文件大小是否超过限制（默认 50MB）
2. 检查 Storage bucket 是否有空间
3. 检查 RLS 策略是否正确配置

### 问题 5: 时间线不显示 WhatsApp/Email 事件

**症状**: 时间线 tab 只显示老事件，无 WhatsApp/Email

**解决**:
1. 检查 communication_logs 表是否有数据
2. 检查前端代码是否已部署（lifecycle-timeline.tsx 和 customers/[id]/page.tsx）
3. 清除浏览器缓存后重试

### 问题 6: RLS 策略阻止数据访问

**症状**: 业务员看不到自己导入的记录

**解决**:
1. 检查客户的 owner_id 或 assigned_to 是否为当前用户
2. 验证 RLS 策略是否正确配置
3. 检查 JWT token 中的 user_id

---

## 十四、文档归档

### 14.1 部署记录

- [ ] 记录实际部署时间: ___________
- [ ] 记录部署人员: ___________
- [ ] 记录遇到的问题和解决方法:
  1. ___________
  2. ___________
  3. ___________

### 14.2 配置信息存档

- [ ] Supabase communication_logs 表结构存档
- [ ] Storage bucket 配置存档
- [ ] RLS 策略配置存档

### 14.3 更新项目文档

- [ ] 更新 README.md（如有新功能说明）
- [ ] 更新 API 文档（新增 2 个 API routes）
- [ ] 归档本检查清单到项目文档库

---

## 十五、检查清单签署

**部署前检查完成**: ☐ 是 / ☐ 否
**部署执行完成**: ☐ 是 / ☐ 否
**部署后验证完成**: ☐ 是 / ☐ 否

**签署人**: ___________
**日期**: ___________

---

## 附录：快速测试脚本

### A. 验证数据库表

```sql
-- 验证 communication_logs 表
SELECT
  table_name,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_name = 'communication_logs'
ORDER BY ordinal_position;

-- 验证索引
SELECT indexname FROM pg_indexes WHERE tablename = 'communication_logs';

-- 验证 RLS 策略
SELECT policyname FROM pg_policies WHERE tablename = 'communication_logs';
```

### B. 验证 Storage bucket

```sql
-- 验证 bucket
SELECT * FROM storage.buckets WHERE id = 'communication-files';

-- 验证 bucket 策略
SELECT policyname FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
  AND policyname LIKE '%communication%';
```

### C. 手动插入测试数据

```sql
-- 插入测试 WhatsApp 记录
INSERT INTO public.communication_logs (
  customer_id,
  channel,
  direction,
  sender_name,
  content,
  sent_at,
  created_by
) VALUES (
  '<客户UUID>',
  'whatsapp',
  'incoming',
  'Test Customer',
  'Hello, this is a test message',
  NOW(),
  auth.uid()
);

-- 插入测试邮件记录
INSERT INTO public.communication_logs (
  customer_id,
  channel,
  direction,
  sender_name,
  content,
  sent_at,
  created_by
) VALUES (
  '<客户UUID>',
  'email',
  'outgoing',
  '我方',
  '[主题: Test Email]\n\nThis is a test email content',
  NOW(),
  auth.uid()
);
```

---

**附注**: 本检查清单基于 Phase 4 (沟通归集) 的功能范围。部署前请仔细阅读以下文档：
- PHASE4_TASK1_REPORT.md (WhatsApp 导入技术文档)
- PHASE4_TASK2_REPORT.md (邮件录入技术文档)
- PHASE4_TASK3_REPORT.md (统一时间线技术文档)
- PHASE4_CHANGELOG.md (Phase 4 总览)
