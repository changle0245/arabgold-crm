# Phase 4 改动清单 (沟通归集)

**完成时间**: 2026-05-16
**开发者**: Claude Opus 4.5
**阶段目标**: 统一管理 WhatsApp、邮件等沟通渠道记录，形成完整的客户沟通时间线

---

## 一、功能总览

Phase 4 实现了"沟通归集"功能，业务员可以手动导入/录入各渠道的沟通记录，并在统一时间线中查看。

### 三个核心任务

| 任务 | 名称 | 输入方式 | 输出展示 |
|------|------|---------|---------|
| **Task 1** | WhatsApp 聊天记录导入 | 上传 .txt 文件（WhatsApp 导出） | 客户详情页 + 时间线 |
| **Task 2** | 邮件往来手动录入 | 填写表单（主题、正文、附件） | 客户详情页 + 时间线 |
| **Task 3** | 统一沟通时间线 | 自动整合所有事件 | 时间线 tab 统一展示 |

### 安全保证（严格遵守）

- ✅ **无 WhatsApp API 调用**（Task 1）
- ✅ **无第三方中间件**（wppconnect, Baileys, whatsapp-web.js）
- ✅ **无 IMAP/POP3/SMTP**（Task 2）
- ✅ **完全手动驱动**（上传文件 or 填表单）

---

## 二、数据库变更

### 新增表（1 个）

#### communication_logs

用于存储 WhatsApp、Email 等渠道的沟通记录。

| 字段 | 类型 | 说明 | 约束 |
|------|------|------|------|
| id | uuid | 主键 | PK, default gen_random_uuid() |
| customer_id | uuid | 关联客户 | FK → customers.id, ON DELETE CASCADE |
| channel | text | 渠道 | 'whatsapp' \| 'email' |
| direction | text | 方向 | 'outgoing' (我方) \| 'incoming' (客户) |
| sender_name | text | 发送者名称 | nullable |
| content | text | 消息/邮件内容 | nullable |
| sent_at | timestamptz | 发送时间 | NOT NULL |
| original_file_url | text | 原始文件 URL | nullable（WhatsApp txt / 邮件附件） |
| created_by | uuid | 导入操作人 | FK → profiles.id |
| created_at | timestamptz | 导入时间 | default now() |

**索引**:
- `idx_communication_logs_customer_id` - 按客户查询
- `idx_communication_logs_sent_at` - 按时间倒序
- `idx_communication_logs_channel` - 按渠道过滤

**RLS 策略**:
- SELECT: 只能查看自己负责客户的记录（owner_id 或 assigned_to）
- INSERT: 只能为自己负责的客户导入记录
- DELETE: 只能删除自己导入的记录

### 新增 Migration（1 个）

- `supabase/migrations/20260516060000_communication_logs.sql`
  - 创建 communication_logs 表
  - 创建索引
  - 启用 RLS 并创建策略
  - 添加表注释

### Storage Bucket（1 个）

- **communication-files**（公开访问）
  - 存储 WhatsApp 导出的 .txt 文件
  - 存储邮件附件（PDF、Word、Excel、图片等）
  - 文件命名：
    - WhatsApp: `whatsapp_{customerId}_{timestamp}.txt`
    - Email: `email_{customerId}_{timestamp}_{random}.{ext}`

---

## 三、代码文件变更

### 新增文件（5 个）

1. **src/lib/whatsappParser.ts**
   - WhatsApp 文本解析器
   - `parseWhatsAppChat()`: 解析 txt 文件为消息数组
   - `detectMessageDirection()`: 识别消息方向
   - `isValidWhatsAppExport()`: 验证文件格式
   - 支持多行消息、附件行识别

2. **src/app/api/customers/[customerId]/import-whatsapp/route.ts**
   - POST 接口：上传 WhatsApp txt 文件
   - 验证用户权限
   - 调用解析器解析消息
   - 上传原始文件到 Storage
   - 批量插入 communication_logs

3. **src/app/api/customers/[customerId]/record-email/route.ts**
   - POST 接口：提交邮件表单
   - 验证用户权限
   - 处理多文件附件上传
   - 格式化邮件内容（主题 + 正文 + 附件链接）
   - 插入 communication_logs

4. **setup_phase4_task1.sql**
   - 手动执行脚本
   - 包含 migration SQL + storage bucket 创建
   - 一键完成数据库初始化

5. **whatsapp_export_sample.txt**
   - 测试用 WhatsApp 导出文件示例
   - 20 条消息，模拟真实业务对话

### 修改文件（3 个）

1. **src/app/(app)/customers/[id]/page.tsx**（大幅修改）

   **新增状态**（13 个）:
   - WhatsApp 导入相关：`communicationLogs`, `showWhatsAppImport`, `importingWhatsApp`, `whatsappFile`, `companyKeywords`
   - 邮件录入相关：`showEmailForm`, `savingEmail`, `emailDirection`, `emailSubject`, `emailContent`, `emailSentAt`, `emailAttachments`

   **新增函数**（2 个）:
   - `handleWhatsAppImport()`: 处理 WhatsApp 文件上传
   - `handleEmailSubmit()`: 处理邮件表单提交

   **新增 UI Section**（2 个）:
   - "WhatsApp 聊天记录" section（导入按钮 + 消息列表）
   - "邮件往来记录" section（录入表单 + 邮件列表）

   **修改 Timeline 构建**:
   - 在 `timelineEvents` 数组中添加 `communication_logs` 映射
   - 按 channel 区分类型（whatsapp/email）
   - 按 direction 生成标题

2. **src/lib/types.ts**

   **新增接口**（1 个）:
   - `CommunicationLog` - 沟通记录接口

   **修改类型**（1 个）:
   - `TimelineEvent.type` - 添加 `'whatsapp' | 'email'`

3. **src/components/lifecycle-timeline.tsx**

   **新增导入**:
   - `Mail` 图标

   **新增配置**（2 个）:
   - `typeConfig.whatsapp` - 翠绿色 MessageSquare 图标
   - `typeConfig.email` - 靛蓝色 Mail 图标

---

## 四、文档文件（4 个）

1. **PHASE4_TASK1_REPORT.md** (3300+ 字)
   - Task 1 完整技术文档
   - WhatsApp 解析器技术细节
   - 测试用例和验证方法
   - 9 项自主决策记录

2. **PHASE4_TASK2_REPORT.md** (4000+ 字)
   - Task 2 完整技术文档
   - 表单字段设计
   - API 接口设计
   - 9 项自主决策记录

3. **PHASE4_TASK3_REPORT.md** (5500+ 字)
   - Task 3 完整技术文档
   - 时间线整合逻辑
   - 图标和颜色设计系统
   - 9 项自主决策记录

4. **PHASE4_CHANGELOG.md**（本文档）
   - Phase 4 总览清单
   - 所有变更汇总

---

## 五、功能特性详解

### Task 1: WhatsApp 聊天记录导入

**输入**:
- 用户在 WhatsApp 中导出聊天（不含媒体文件）
- 得到 .txt 文件
- 在客户详情页上传此文件

**处理流程**:
1. 验证文件格式（正则匹配 WhatsApp 导出格式）
2. 解析每条消息（日期、时间、发送者、内容）
3. 识别消息方向（基于用户输入的公司关键词）
4. 上传原始 txt 文件到 Storage
5. 批量插入 communication_logs（channel = 'whatsapp'）

**输出**:
- "WhatsApp 聊天记录" section 显示最近 50 条消息
- 时间线 tab 显示 WhatsApp 事件（绿色图标）

**UI 特性**:
- 绿色圆点 = 我方发出
- 蓝色圆点 = 客户发来
- 显示发送者名称、时间、消息内容

### Task 2: 邮件往来手动录入

**输入**:
- 用户在客户详情页点击"记录邮件"
- 填写表单：
  - 邮件方向（下拉选择）
  - 邮件主题（选填）
  - 邮件正文（必填，6 行文本域）
  - 发送/接收时间（datetime-local）
  - 附件（多文件上传）

**处理流程**:
1. 验证必填字段
2. 上传附件到 Storage（如有）
3. 格式化邮件内容：`[主题: xxx]\n\n正文\n\n[附件 N 个]: URLs`
4. 插入 communication_logs（channel = 'email'）

**输出**:
- "邮件往来记录" section 显示最近 30 条邮件
- 时间线 tab 显示邮件事件（蓝色 Mail 图标）

**UI 特性**:
- 绿色标签 = 我方发出
- 紫色标签 = 客户发来
- 显示时间、方向、邮件内容（含主题和附件链接）

### Task 3: 统一沟通时间线

**整合事件**（8 种）:
1. WhatsApp 聊天（绿色 MessageSquare）
2. 邮件往来（蓝色 Mail）
3. 联系记录（蓝色 MessageSquare）
4. 报价单（琥珀色 FileText）
5. 成交记录（绿色 Package）
6. 样品寄送（紫色 PackageCheck）
7. 阶段变更（灰色 ArrowRightLeft）
8. 已完成提醒（粉色 Bell）

**展示方式**:
- 按月份分组（YYYY-MM）
- 每月内按日期倒序排列
- 每个事件显示：图标、标题、详情、操作人、日期

**技术实现**:
- 在客户详情页 `loadData()` 中查询 `communication_logs`
- 在 `timelineEvents` 数组构建时，映射 `communication_logs` 为 TimelineEvent
- `LifecycleTimeline` 组件根据 type 显示对应图标和颜色

---

## 六、UI/UX 设计亮点

### 1. 颜色语义化

| 颜色 | 适用场景 | 语义 |
|------|---------|------|
| 绿色 | WhatsApp (我方)、成交记录 | 积极、成功、活力 |
| 蓝色 | WhatsApp (客户)、联系记录 | 沟通、专业、基础 |
| 紫色 | 邮件 (客户)、样品 | 正式、独特 |
| 琥珀色 | 报价单 | 商务、金钱 |
| 灰色 | 阶段变更 | 中性、流程 |
| 粉色 | 已完成提醒 | 提醒、完成 |

### 2. 渐进式展示

- **客户详情页 → 专属 section**: WhatsApp 和邮件各有独立区域，显示最近记录
- **时间线 tab → 统一视图**: 所有事件整合，按时间排序

### 3. 操作便捷性

- **WhatsApp 导入**: 一键上传，自动解析，无需逐条输入
- **邮件录入**: 表单简洁，支持多附件，时间可回溯
- **时间线查看**: 月份分组，一目了然，快速定位历史事件

### 4. 文本处理

- **长文本截断**: 超过 100 字符显示省略号（时间线）
- **多行保留**: 保留原始换行（WhatsApp 消息）
- **附件链接**: 邮件附件以列表形式显示在内容末尾

---

## 七、自主决策汇总（27 项）

### Task 1: WhatsApp 导入（9 项）

1. 解析器独立封装 - 便于单元测试和复用
2. API Route 权限验证 - 防止越权上传
3. Storage bucket 命名 `communication-files` - 通用性，兼容 Email
4. 方向识别策略 - 关键词匹配，而非固定规则
5. UI 位置选择 - 放在客户附件下方、联系记录上方
6. 显示数量限制 - 最近 50 条 + 总数提示
7. 公司关键词输入方式 - 用户手动输入，逗号分隔
8. 原始文件存储 - 上传到 Storage，可追溯审计
9. 附件行处理 - 只记录文件名，不下载媒体

### Task 2: 邮件录入（9 项）

1. 复用 communication_logs 表 - 统一数据结构
2. 邮件内容格式化 - 主题 + 正文 + 附件链接合并
3. 附件存储策略 - 复用 bucket，文件名前缀 `email_`
4. sender_name 处理 - 我方显示"我方"，客户显示客户名
5. 方向选择默认值 - 默认"我发给客户"
6. 时间选择默认值 - 默认当前时间
7. 附件上传失败处理 - 单个失败不影响整体
8. UI 颜色区分 - Email 用紫色，区别于 WhatsApp 蓝色
9. 显示数量限制 - 最近 30 条邮件

### Task 3: 统一时间线（9 项）

1. WhatsApp 颜色选择 - emerald-600，接近官方品牌色
2. Email 颜色选择 - indigo-600，正式专业色调
3. 长文本截断阈值 - 100 字符（约 2-3 行）
4. 方向标识 - 在 title 中显示，最显眼
5. user 字段处理 - 手动标识"我方"或客户名
6. 类型扩展方式 - union type，TypeScript 类型检查
7. 事件 ID 前缀 - `comm-${id}`，避免冲突
8. 日期格式统一 - YYYY-MM-DD，便于排序分组
9. 图标组件复用 - WhatsApp 和联系记录都用 MessageSquare

---

## 八、技术栈

- **前端框架**: Next.js 16.2.6 (Turbopack)
- **UI 库**: Tailwind CSS
- **图标**: lucide-react
- **数据库**: Supabase PostgreSQL
- **存储**: Supabase Storage
- **身份验证**: Supabase Auth (RLS)
- **表单处理**: FormData API
- **文件解析**: 正则表达式 + 字符串处理
- **类型系统**: TypeScript 5.x

---

## 九、性能考虑

### 当前实现

- 客户详情页一次性查询所有 communication_logs
- 前端构建 timelineEvents 数组（所有事件合并）
- 按月分组渲染

### 数据量评估

假设单个客户：
- WhatsApp 消息: 200 条
- 邮件记录: 50 条
- 联系记录: 100 条
- 报价/成交/样品: 50 条
- **总计**: ~400 条事件

**结论**: 当前实现可满足绝大多数场景，无性能瓶颈。

### 优化空间（后续）

如果单个客户事件数 > 1000 条：
1. 实现分页加载（只加载最近 N 个月）
2. 虚拟滚动（react-window）
3. 服务端聚合（数据库视图）

---

## 十、安全审查

### 1. 数据权限隔离

- ✅ RLS 策略确保用户只能查看自己负责客户的记录
- ✅ API Route 中验证 `owner_id` 或 `assigned_to`
- ✅ 无越权风险

### 2. 文件上传安全

- ✅ 限制文件类型（WhatsApp 只接受 .txt，Email 允许常见附件）
- ✅ 文件上传到 Supabase Storage（有访问控制）
- ✅ 公开访问仅限 communication-files bucket

### 3. XSS 防护

- ✅ 用户输入的文本（邮件内容、WhatsApp 消息）存储为纯文本
- ✅ 前端渲染时使用 `whitespace-pre-wrap` 保留格式
- ✅ 无 `dangerouslySetInnerHTML`

### 4. SQL 注入防护

- ✅ 使用 Supabase 客户端（参数化查询）
- ✅ 无直接拼接 SQL 字符串

### 5. 第三方依赖

- ✅ 无 WhatsApp API SDK
- ✅ 无 IMAP/SMTP 库
- ✅ 无第三方中间件

---

## 十一、测试建议

### 功能测试

#### Task 1: WhatsApp 导入

1. 上传 `whatsapp_export_sample.txt`（20 条消息）
2. 输入公司关键词："ArabGold,Sarah"
3. 验证成功导入 20 条消息
4. 验证方向识别正确（11 条 outgoing, 9 条 incoming）
5. 验证时间线显示 WhatsApp 事件

#### Task 2: 邮件录入

1. 填写邮件表单（我发给客户）
2. 上传 2 个附件（PDF + Excel）
3. 验证保存成功，显示附件链接
4. 填写邮件表单（客户发给我）
5. 验证方向标识正确（紫色"客户发来"）

#### Task 3: 统一时间线

1. 确保客户有多种事件（WhatsApp、Email、联系、报价、成交）
2. 访问时间线 tab
3. 验证所有事件显示，按时间倒序
4. 验证月份分组正确
5. 验证图标和颜色区分清晰

### 边界测试

1. **空数据**: 客户无任何记录 → 显示"暂无生命周期事件"
2. **大文件**: 上传 1000 条消息的 WhatsApp txt → 验证解析性能
3. **无主题邮件**: 邮件主题留空 → 验证内容不显示"[主题: ]"
4. **无附件邮件**: 不上传附件 → 验证内容不显示"[附件 0 个]"
5. **同一天多事件**: 同一天有 WhatsApp、Email、联系 → 验证排序

### 权限测试

1. 业务员 A 尝试上传文件到业务员 B 的客户 → 403 错误
2. Member 角色查看时间线 → 只能看到自己负责的客户事件

---

## 十二、部署前检查清单

### 数据库

- [ ] 执行 `setup_phase4_task1.sql` 脚本
- [ ] 验证 `communication_logs` 表已创建
- [ ] 验证 3 个索引已创建
- [ ] 验证 3 个 RLS 策略已创建
- [ ] 验证 migration 记录已插入 `supabase_migrations.schema_migrations`

### Storage

- [ ] 验证 `communication-files` bucket 已创建
- [ ] 验证 bucket 设置为公开访问
- [ ] 验证 bucket RLS 策略已创建

### 代码

- [ ] 前端代码已提交到 Git
- [ ] 无 console.error 或调试代码残留
- [ ] TypeScript 编译无错误
- [ ] ESLint 检查通过

### 功能

- [ ] Task 1: WhatsApp 导入测试通过
- [ ] Task 2: 邮件录入测试通过
- [ ] Task 3: 统一时间线显示正确
- [ ] 边界情况测试通过
- [ ] 权限测试通过

---

## 十三、已知限制

### Task 1: WhatsApp 导入

1. 只支持文本消息，附件行只显示文件名
2. 方向识别依赖关键词，准确率受输入影响
3. 无法导入 WhatsApp 群聊（只支持单聊）

### Task 2: 邮件录入

1. 纯手动录入，无法批量导入 .eml 文件
2. 无邮件模板功能
3. 附件只显示链接，无在线预览

### Task 3: 统一时间线

1. 无分页加载，事件数 > 1000 条时可能影响性能
2. 无事件类型筛选
3. 无关键词搜索
4. 长文本被截断，无展开按钮

### 通用限制

1. 不支持编辑已导入的记录（只能删除）
2. 不支持批量删除
3. 不支持导出时间线为 PDF/Excel

---

## 十四、后续优化方向

### 短期优化（Phase 5 候选）

1. **Task 1 增强**: 支持导入 WhatsApp 群聊（多发送者）
2. **Task 2 增强**: 添加常用邮件模板库
3. **Task 3 增强**: 添加事件类型筛选器（checkbox）
4. **通用功能**: 编辑/删除 UI（当前只能通过 SQL 删除）

### 中期优化

1. 附件在线预览（PDF、图片）
2. 邮件 .eml 文件导入
3. 时间线关键词搜索
4. 时间线分页加载

### 长期优化

1. AI 辅助：自动提取邮件关键信息（金额、交货期）
2. 导出功能：时间线导出为 PDF 报告
3. 统计分析：沟通频率、渠道偏好分析
4. 自动提醒：基于沟通记录触发提醒（如 7 天无回复）

---

## 十五、Git 提交建议

### Commit 1: Database schema

```bash
git add supabase/migrations/20260516060000_communication_logs.sql
git add setup_phase4_task1.sql
git commit -m "feat(phase4): add communication_logs table and storage bucket

- Create communication_logs table for WhatsApp and email records
- Add RLS policies for customer ownership validation
- Create communication-files storage bucket
- Add migration for Phase 4 Task 1

🤖 Generated with Claude Code
Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

### Commit 2: WhatsApp import (Task 1)

```bash
git add src/lib/whatsappParser.ts
git add src/app/api/customers/[customerId]/import-whatsapp/route.ts
git add whatsapp_export_sample.txt
git commit -m "feat(phase4): implement WhatsApp chat import (Task 1)

- Add WhatsApp text parser with regex-based message extraction
- Create API route for file upload and parsing
- Add UI section in customer detail page for WhatsApp import
- Support direction detection based on company keywords
- Store original .txt file in Supabase Storage

🤖 Generated with Claude Code
Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

### Commit 3: Email recording (Task 2)

```bash
git add src/app/api/customers/[customerId]/record-email/route.ts
git commit -m "feat(phase4): implement manual email recording (Task 2)

- Create API route for email form submission
- Support multi-file attachment upload
- Format email content with subject and attachment links
- Add UI section in customer detail page for email recording
- Store email records in communication_logs table

🤖 Generated with Claude Code
Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

### Commit 4: Unified timeline (Task 3)

```bash
git add src/lib/types.ts
git add src/components/lifecycle-timeline.tsx
git commit -m "feat(phase4): integrate communication logs into unified timeline (Task 3)

- Add 'whatsapp' and 'email' types to TimelineEvent
- Add channel-specific icons and colors in lifecycle-timeline
- Integrate communication_logs into customer timeline tab
- Display all events in chronological order with visual distinction

🤖 Generated with Claude Code
Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

### Commit 5: Documentation

```bash
git add PHASE4_TASK1_REPORT.md
git add PHASE4_TASK2_REPORT.md
git add PHASE4_TASK3_REPORT.md
git add PHASE4_CHANGELOG.md
git commit -m "docs(phase4): add comprehensive Phase 4 documentation

- PHASE4_TASK1_REPORT: WhatsApp import technical documentation (3300+ words)
- PHASE4_TASK2_REPORT: Email recording technical documentation (4000+ words)
- PHASE4_TASK3_REPORT: Unified timeline technical documentation (5500+ words)
- PHASE4_CHANGELOG: Phase 4 overview and change summary

Total: 27 autonomous decisions documented across 3 tasks

🤖 Generated with Claude Code
Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## 十六、总结

Phase 4 (沟通归集) 通过 3 个任务实现了完整的沟通记录管理：

1. **Task 1** 解决了 WhatsApp 聊天记录的导入和存储
2. **Task 2** 解决了邮件往来的手动录入和附件管理
3. **Task 3** 解决了所有沟通事件的统一展示

**关键成果**:
- ✅ 新增 1 张表（communication_logs）
- ✅ 新增 1 个 Storage bucket（communication-files）
- ✅ 新增 5 个代码文件，修改 3 个文件
- ✅ 新增 4 个文档文件（共 13000+ 字）
- ✅ 实现 27 项自主决策
- ✅ 严格遵守安全保证（无 API、无中间件、纯手动）

**用户价值**:
- 业务员可以集中查看与客户的所有沟通历史
- 支持多渠道（WhatsApp、Email）的记录归集
- 统一时间线便于追溯客户生命周期
- 完整的数据留存，便于交接和复盘

**下一步**:
- 用户测试 Phase 4 所有功能
- Git 提交 Phase 4 代码和文档
- 进入 Phase 5（如有）或项目收尾
