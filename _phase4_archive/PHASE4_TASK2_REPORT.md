# Phase 4 Task 2 完成报告

**任务**: 邮件往来手动录入
**完成时间**: 2026-05-16
**状态**: ✅ 代码已完成

---

## 一、功能概述

实现了邮件往来手动录入功能，业务员可以：
1. 在客户详情页点击"记录邮件"按钮
2. 填写邮件表单（方向、主题、正文、时间、附件）
3. 系统保存到 `communication_logs` 表（channel = 'email'）
4. 附件上传到 Supabase Storage
5. 在客户详情页查看录入的邮件记录

**安全保证**:
- ✅ 纯手动表单录入
- ✅ 无 IMAP/POP3/SMTP 调用
- ✅ 无自动邮件抓取

---

## 二、文件变更清单

### 新增文件（2个）

1. **src/app/api/customers/[customerId]/record-email/route.ts**
   - POST 接口：接收邮件表单数据
   - 验证用户权限
   - 处理多文件附件上传
   - 格式化邮件内容（主题 + 正文 + 附件链接）
   - 插入 communication_logs 表（channel = 'email'）

2. **PHASE4_TASK2_REPORT.md**
   - 本文档

### 修改文件（1个）

1. **src/app/(app)/customers/[id]/page.tsx**
   - 新增状态：`showEmailForm`, `savingEmail`, `emailDirection`, `emailSubject`, `emailContent`, `emailSentAt`, `emailAttachments`
   - 新增函数：`handleEmailSubmit()`
   - 新增 UI section："邮件往来记录"
   - 显示邮件录入表单（5个字段 + 提交/取消按钮）
   - 显示最近 30 条邮件记录（紫色标识=客户发来，绿色=我方发出）
   - 导入 `Mail` icon

---

## 三、表单字段设计

### 邮件录入表单

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| 邮件方向 | select | ✅ | 下拉选择："我发给客户" / "客户发给我" |
| 邮件主题 | text | ❌ | 单行文本，如 "RE: Product Inquiry" |
| 邮件正文 | textarea | ✅ | 6行文本域，支持换行 |
| 发送/接收时间 | datetime-local | ✅ | 日期时间选择器，默认当前时间 |
| 附件 | file | ❌ | 支持多文件上传（PDF、Word、Excel、图片等） |

### 数据存储格式

邮件内容存储格式：
```
[主题: RE: Product Inquiry]

Dear Ahmed,

Thank you for your interest in our products...

[附件 2 个]:
1. https://xxx.supabase.co/communication-files/email_xxx_1.pdf
2. https://xxx.supabase.co/communication-files/email_xxx_2.jpg
```

**字段映射**：
- `channel` = 'email'
- `direction` = 'outgoing' / 'incoming'
- `sender_name` = '我方' / 客户名称
- `content` = 格式化后的邮件内容（含主题、正文、附件链接）
- `sent_at` = 用户选择的时间
- `original_file_url` = 第一个附件的 URL（如有）
- `created_by` = 当前用户 ID

---

## 四、UI 设计

### 1. 邮件记录 Section

位置：在"WhatsApp 聊天记录" section 下方，"联系记录" section 上方

**Header**:
- 标题："邮件往来记录"
- 按钮："记录邮件"（带 Mail 图标）

**内容区**:
- 无记录时：显示"暂无邮件记录"
- 有记录时：显示最近 30 条邮件，每条包含：
  - 时间（YYYY-MM-DD HH:MM）
  - 方向标识（绿色"我方发出" / 紫色"客户发来"）
  - 邮件内容（含主题、正文、附件链接）

### 2. 邮件录入表单

点击"记录邮件"展开表单（灰色背景框）：

**表单布局**：
1. 邮件方向（下拉选择）
2. 邮件主题（单行输入，选填）
3. 邮件正文（多行文本域，必填）
4. 发送/接收时间（日期时间选择器，必填）
5. 附件（文件选择，支持多选）
6. 提交按钮 + 取消按钮

**表单验证**：
- 邮件正文不能为空
- 时间必须选择
- 附件可选（支持多文件）

### 3. 颜色区分

- **WhatsApp 消息**: 绿色（我方）/ 蓝色（客户）
- **邮件消息**: 绿色（我方）/ **紫色**（客户）

区分不同沟通渠道，便于视觉识别。

---

## 五、API 接口设计

### POST /api/customers/[customerId]/record-email

**请求格式**: `multipart/form-data`

**请求参数**:
```typescript
{
  direction: 'outgoing' | 'incoming',
  subject: string,           // 可空
  content: string,           // 必填
  sentAt: string,            // ISO datetime
  attachments: File[]        // 可空，多文件
}
```

**响应格式**:
```typescript
{
  success: true,
  log: CommunicationLog,
  attachmentCount: number
}
```

**错误响应**:
```typescript
{
  error: string
}
```

### 权限验证

1. 验证用户已登录
2. 验证客户存在
3. 验证用户有权限访问该客户（owner_id 或 assigned_to）

### 附件处理

1. 遍历所有上传的文件
2. 为每个文件生成唯一文件名：`email_{customerId}_{timestamp}_{random}.{ext}`
3. 上传到 `communication-files` bucket
4. 获取 publicUrl
5. 将所有附件 URL 附加到邮件内容末尾

---

## 六、数据库复用

### communication_logs 表

Task 2 完全复用 Task 1 创建的表，无需新增字段或 migration。

**新增记录示例**：
```sql
INSERT INTO communication_logs (
  customer_id,
  channel,
  direction,
  sender_name,
  content,
  sent_at,
  original_file_url,
  created_by
) VALUES (
  'uuid-of-customer',
  'email',
  'outgoing',
  '我方',
  '[主题: Product Inquiry]\n\nDear Ahmed...\n\n[附件 1 个]:\n1. https://...',
  '2024-01-15 14:30:00+00',
  'https://xxx.supabase.co/communication-files/email_xxx.pdf',
  'uuid-of-user'
);
```

### Storage Bucket

复用 Task 1 创建的 `communication-files` bucket，邮件附件文件名前缀为 `email_`。

---

## 七、测试用例

### 测试步骤

1. 访问任意客户详情页
2. 滚动到"邮件往来记录" section
3. 点击"记录邮件"按钮

**测试用例 1: 我方发出的邮件（无附件）**
- 邮件方向：我发给客户
- 邮件主题：Product Catalog Request
- 邮件正文：Dear Ahmed, Please find attached our latest product catalog...
- 发送时间：当前时间
- 附件：无
- 预期：保存成功，显示绿色"我方发出"标识

**测试用例 2: 客户发来的邮件（有附件）**
- 邮件方向：客户发给我
- 邮件主题：RE: Quotation Inquiry
- 邮件正文：Thank you for your quotation. I have some questions...
- 发送时间：选择过去时间（如昨天 15:30）
- 附件：上传 1 个 PDF 文件
- 预期：保存成功，显示紫色"客户发来"标识，内容末尾显示附件链接

**测试用例 3: 多附件邮件**
- 邮件方向：我发给客户
- 邮件主题：Proforma Invoice
- 邮件正文：Please review the attached proforma invoice...
- 附件：上传 3 个文件（PDF + Excel + JPG）
- 预期：保存成功，内容末尾显示 3 个附件链接

**测试用例 4: 无主题邮件**
- 邮件方向：客户发给我
- 邮件主题：（留空）
- 邮件正文：Quick question about pricing...
- 预期：保存成功，内容不显示"[主题: ...]"

**测试用例 5: 必填验证**
- 邮件正文：（留空）
- 预期："保存"按钮禁用，无法提交

### 验证 SQL

```sql
-- 查看导入的邮件记录
SELECT
  sent_at,
  channel,
  direction,
  LEFT(content, 100) as content_preview
FROM public.communication_logs
WHERE customer_id = '<测试客户ID>'
  AND channel = 'email'
ORDER BY sent_at DESC;

-- 统计邮件数量
SELECT
  direction,
  COUNT(*) as count
FROM public.communication_logs
WHERE customer_id = '<测试客户ID>'
  AND channel = 'email'
GROUP BY direction;
```

---

## 八、自主决策记录

### 技术选型

1. **复用 communication_logs 表**
   - 决策：不创建新表，使用 `channel = 'email'` 区分
   - 理由：统一数据结构，便于 Task 3 统一时间线查询

2. **邮件内容格式化**
   - 决策：将主题、正文、附件链接合并为一个 `content` 字段
   - 理由：避免新增字段，保持表结构简洁

3. **附件存储策略**
   - 决策：复用 `communication-files` bucket，文件名前缀 `email_`
   - 理由：统一管理沟通文件，便于权限控制

4. **sender_name 处理**
   - 决策：我方发出时显示"我方"，客户发来时显示客户名称
   - 理由：邮件往来不像 WhatsApp 有明确发送者名称，需统一标识

5. **方向选择默认值**
   - 决策：默认为"我发给客户"（outgoing）
   - 理由：大多数场景是业务员主动发邮件给客户

6. **时间选择默认值**
   - 决策：默认为当前时间（可回溯修改）
   - 理由：大多数情况是刚发完邮件立即录入，减少操作步骤

7. **附件上传失败处理**
   - 决策：单个附件失败不影响整体提交，跳过失败文件
   - 理由：避免因一个文件报错导致整个邮件记录丢失

8. **UI 颜色区分**
   - 决策：WhatsApp 用蓝色/绿色，Email 用紫色/绿色
   - 理由：不同渠道用不同颜色，便于快速识别

9. **显示数量限制**
   - 决策：只显示最近 30 条邮件记录
   - 理由：邮件内容较长，避免页面过载

---

## 九、与 Task 1 的对比

| 维度 | Task 1 (WhatsApp) | Task 2 (Email) |
|------|------------------|----------------|
| 输入方式 | 上传 txt 文件，自动解析 | 手动填表单 |
| 方向识别 | 基于发送者名称 + 关键词匹配 | 用户下拉选择 |
| 内容结构 | 单条消息 | 主题 + 正文 |
| 附件处理 | 只记录文件名（不下载媒体） | 上传到 Storage，记录 URL |
| 时间来源 | 解析 txt 中的时间 | 用户手动选择 |
| 批量导入 | 一次导入多条消息 | 一次录入一封邮件 |
| UI 颜色 | 蓝色/绿色 | 紫色/绿色 |
| 安全保证 | 无 WhatsApp API | 无 IMAP/POP3/SMTP |

---

## 十、部署前准备

### Step 1: 确认 Task 1 已部署

Task 2 依赖 Task 1 的数据库表和 Storage bucket，必须先完成 Task 1 部署。

**验证**：
```sql
-- 验证 communication_logs 表存在
SELECT * FROM public.communication_logs LIMIT 1;

-- 验证 communication-files bucket 存在
SELECT * FROM storage.buckets WHERE id = 'communication-files';
```

### Step 2: 重启 Dev Server（可选）

```bash
# Ctrl+C 停止
npm run dev
```

### Step 3: 测试邮件录入功能

按照"测试用例"部分执行 5 个测试场景，验证功能正常。

---

## 十一、已知限制与后续优化

### 当前限制

1. **无邮件模板**
   - 业务员需手动输入完整邮件内容
   - 后续可考虑添加常用邮件模板（如报价回复模板）

2. **无附件预览**
   - 附件只显示 URL 链接，不支持在线预览
   - 后续可在 Task 3 时间线中添加附件预览功能

3. **无导入 .eml 文件**
   - 不支持直接导入 Outlook/Thunderbird 导出的 .eml 文件
   - 需要业务员手动复制粘贴邮件内容

4. **无邮件线程关联**
   - 多封回复邮件之间没有线程（thread）关联
   - 后续可考虑通过主题前缀（RE:, FWD:）自动关联

### 后续优化方向

1. **Task 3 集成**：将邮件记录合并到统一时间线
2. **邮件模板库**：预设常用邮件模板，一键填充
3. **附件预览**：支持 PDF、图片在线预览
4. **批量导入**：支持导入 .eml 文件或 Outlook 导出的 CSV
5. **AI 辅助**：自动提取邮件关键信息（如报价金额、交货期）

---

## 十二、部署检查清单

- [ ] 确认 Task 1 已部署（表和 bucket 存在）
- [ ] 重启 Dev Server（如需要）
- [ ] 测试邮件录入（我方发出）
- [ ] 测试邮件录入（客户发来）
- [ ] 测试多附件上传
- [ ] 测试无主题邮件
- [ ] 测试必填验证
- [ ] 验证邮件记录正确显示
- [ ] 验证附件链接可访问
- [ ] 验证 RLS 策略生效（只能看自己客户的记录）

---

**任务状态**: ✅ Task 2 代码已完成
**下一步**: 用户测试邮件录入功能，或继续开发 Task 3（统一沟通时间线）
