# Phase 3 P0 功能人工测试清单

测试日期: ___________
测试人: ___________
环境: http://localhost:3000

---

## P0-1: 沉默客户自动提醒到人

### 前置准备
- [ ] 确认数据库中有测试客户 Ali Al-Doha (last_contact_date 为 36 天前)
- [ ] 执行 SQL 查看当前沉默客户提醒数量:
  ```sql
  select * from public.reminders
  where type = 'silent_customer'
  order by created_at desc;
  ```

### 测试步骤

#### 1.1 手动触发扫描
- [ ] 在 Supabase SQL Editor 或 psql 执行:
  ```sql
  select * from public.scan_silent_customers();
  ```
- [ ] **预期结果**: 返回扫描统计
  - `customers_scanned`: 扫描的客户数 (应该 > 0)
  - `reminders_created`: 创建的提醒数 (首次应该 > 0)
  - `customer_names`: 客户名称数组 (应包含 "Ali Al-Doha")

#### 1.2 验证提醒已创建
- [ ] 执行查询:
  ```sql
  select
    r.id, r.type, r.note, r.due_date, r.status,
    c.contact_name as customer_name,
    p.full_name as assigned_to_name
  from public.reminders r
  join public.customers c on c.id = r.customer_id
  join public.profiles p on p.id = r.assigned_to
  where r.type = 'silent_customer'
  order by r.created_at desc
  limit 5;
  ```
- [ ] **预期结果**:
  - 类型为 'silent_customer'
  - 分配给客户的负责人 (owner_id)
  - 到期日为明天
  - 状态为 'pending'
  - 提醒内容包含 "已 XX 天未联系"

#### 1.3 验证防重复机制
- [ ] 再次执行扫描:
  ```sql
  select * from public.scan_silent_customers();
  ```
- [ ] **预期结果**: `reminders_created` 应该为 0 (不重复创建)

#### 1.4 在界面查看提醒
- [ ] 以客户负责人身份登录系统
- [ ] 进入 "我的提醒" 页面 (`/reminders`)
- [ ] **预期结果**: 看到新创建的沉默客户提醒
  - 显示客户名称
  - 显示提醒内容
  - 显示到期时间
  - 状态为 "待处理"

---

## P0-2: 大客户依赖度预警 (仅老板可见)

### 前置准备
- [ ] 确认数据库中有测试客户 Ahmed Al-Mansoori (营收占比 > 30%)
- [ ] 执行 SQL 查看风险客户:
  ```sql
  select * from public.get_concentration_risk_customers();
  ```
- [ ] **预期结果**: 至少返回一个客户,revenue_share > 0.30

### 测试步骤

#### 2.1 Admin 身份验证
- [ ] 以 **admin** 身份登录系统
- [ ] 访问 `/dashboard/boss` (老板大屏)
- [ ] **预期结果**: 页面成功加载,无权限错误

#### 2.2 查看预警卡片
- [ ] 在老板大屏页面查找 "大客户依赖度预警" 卡片
- [ ] **预期结果**:
  - 卡片可见
  - 卡片有橙色边框 (`border-orange-200`)
  - 显示客户列表
  - 每个客户显示:
    - 客户名称 + 公司名称
    - 营收占比百分比
    - 成交金额
    - 成交笔数

#### 2.3 验证数据准确性
- [ ] 记录卡片中显示的客户名称和营收占比
- [ ] 与 SQL 查询结果对比:
  ```sql
  select
    customer_name,
    customer_company,
    round(revenue_share * 100, 2) as revenue_percent,
    total_amount,
    deal_count
  from public.get_concentration_risk_customers()
  order by revenue_share desc;
  ```
- [ ] **预期结果**: 界面数据与 SQL 查询结果一致

#### 2.4 Member 身份验证
- [ ] 退出登录
- [ ] 以 **member** (普通成员) 身份登录
- [ ] 尝试访问 `/dashboard/boss`
- [ ] **预期结果**:
  - 页面拒绝访问 (403 或重定向)
  - 或者页面加载但不显示预警卡片

---

## P0-3: 返单周期提醒

### 前置准备
- [ ] 确认数据库中有测试客户 Ahmed Al-Mansoori (至少 2 笔成交记录)
- [ ] 执行 SQL 查看返单周期提醒:
  ```sql
  select * from public.reminders
  where type = 'reorder_cycle'
  order by created_at desc;
  ```

### 测试步骤

#### 3.1 手动触发扫描
- [ ] 在 Supabase SQL Editor 或 psql 执行:
  ```sql
  select * from public.scan_reorder_cycle_reminders();
  ```
- [ ] **预期结果**: 返回扫描统计
  - `customers_scanned`: 扫描的客户数 (有 >= 2 笔成交的客户数)
  - `reminders_created`: 创建的提醒数 (根据实际数据可能为 0 或 > 0)
  - `customer_names`: 触发提醒的客户名称数组

#### 3.2 验证提醒已创建
- [ ] 执行查询:
  ```sql
  select
    r.id, r.type, r.note, r.due_date, r.status,
    c.contact_name as customer_name,
    p.full_name as assigned_to_name
  from public.reminders r
  join public.customers c on c.id = r.customer_id
  join public.profiles p on p.id = r.assigned_to
  where r.type = 'reorder_cycle'
  order by r.created_at desc
  limit 5;
  ```
- [ ] **预期结果**:
  - 类型为 'reorder_cycle'
  - 分配给客户的负责人
  - 到期日为明天
  - 状态为 'pending'
  - 提醒内容格式: "该客户通常每 X 天返单，距上次成交已 Y 天"

#### 3.3 测试组合扫描函数
- [ ] 执行组合扫描 (同时运行 P0-1 和 P0-3):
  ```sql
  select * from public.scan_all_auto_reminders();
  ```
- [ ] **预期结果**: 返回 6 个字段
  - `silent_scanned`, `silent_created`, `silent_names`
  - `reorder_scanned`, `reorder_created`, `reorder_names`

#### 3.4 在界面查看提醒
- [ ] 以客户负责人身份登录
- [ ] 进入 "我的提醒" 页面 (`/reminders`)
- [ ] **预期结果**: 看到返单周期提醒
  - 显示客户名称
  - 显示平均周期天数和距上次成交天数
  - 状态为 "待处理"

---

## P0-4: 系统内强提醒 (铃铛图标)

### 前置准备
- [ ] 确保当前登录用户有至少 1 条待处理提醒 (pending status)
- [ ] 执行 SQL 查看当前用户的待处理提醒数:
  ```sql
  select count(*) as pending_count
  from public.reminders
  where assigned_to = '<当前用户ID>'
    and status = 'pending';
  ```

### 测试步骤

#### 4.1 铃铛图标显示 (桌面端)
- [ ] 以有待处理提醒的用户身份登录
- [ ] 在桌面端 (宽屏) 查看左侧边栏顶部
- [ ] **预期结果**:
  - 看到铃铛图标位于 "ArabGold CRM" Logo 右侧
  - 铃铛图标上有红色徽章
  - 徽章显示数字 (待处理提醒数量)

#### 4.2 铃铛图标显示 (移动端)
- [ ] 缩小浏览器窗口至移动端尺寸 (< 1024px)
- [ ] 查看顶部导航栏
- [ ] **预期结果**:
  - 铃铛图标显示在右上角
  - 位于菜单按钮左侧
  - 同样显示红色徽章和数字

#### 4.3 点击铃铛展开下拉菜单
- [ ] 点击铃铛图标
- [ ] **预期结果**: 下拉菜单展开,显示:
  - 标题: "待办提醒 (X 条)"
  - 最多 5 条最新提醒
  - 每条提醒包含:
    - 类型图标 (手动/沉默客户/返单周期)
    - 类型标签文字
    - 客户名称
    - 提醒内容 (最多 30 字符,超出显示 "...")
    - 到期时间 (相对时间格式)
  - 底部 "查看全部" 按钮

#### 4.4 验证到期时间显示
- [ ] 检查下拉菜单中的到期时间格式
- [ ] **预期结果**:
  - 今天到期: 显示 "今天"
  - 明天到期: 显示 "明天"
  - 未来到期: 显示 "X 天后"
  - 已逾期: 显示 "逾期 X 天"

#### 4.5 点击提醒跳转客户详情
- [ ] 点击下拉菜单中的任一提醒
- [ ] **预期结果**:
  - 下拉菜单自动关闭
  - 页面跳转到该客户的详情页 (`/customers/<customer_id>`)
  - 客户详情页正确显示

#### 4.6 点击 "查看全部" 跳转
- [ ] 重新打开下拉菜单
- [ ] 点击底部 "查看全部" 按钮
- [ ] **预期结果**:
  - 下拉菜单关闭
  - 页面跳转到提醒列表页 (`/reminders`)
  - 显示所有待处理提醒

#### 4.7 点击外部关闭菜单
- [ ] 重新打开下拉菜单
- [ ] 点击菜单外的任意区域
- [ ] **预期结果**: 下拉菜单自动关闭

#### 4.8 无提醒状态
- [ ] 将所有提醒标记为已完成或删除:
  ```sql
  update public.reminders
  set status = 'completed'
  where assigned_to = '<当前用户ID>'
    and status = 'pending';
  ```
- [ ] 刷新页面,查看铃铛图标
- [ ] **预期结果**:
  - 铃铛图标可见
  - 没有红色徽章
  - 点击铃铛,下拉菜单显示 "暂无待办提醒"

#### 4.9 自动刷新验证
- [ ] 保持页面打开,不刷新
- [ ] 在数据库中手动创建一条新提醒:
  ```sql
  insert into public.reminders (
    customer_id,
    assigned_to,
    type,
    due_date,
    status,
    note
  ) values (
    '<任意客户ID>',
    '<当前用户ID>',
    'manual',
    current_date + 1,
    'pending',
    '测试自动刷新'
  );
  ```
- [ ] 等待 60 秒
- [ ] **预期结果**: 铃铛徽章数字自动更新 (无需手动刷新页面)

---

## 边界情况测试

### 边界1: 沉默客户重新联系后的提醒状态

#### 准备
- [ ] 确认有一个沉默客户 (如 Ali Al-Doha) 已有待处理的 silent_customer 提醒

#### 测试步骤
- [ ] 为该客户添加新的联系记录 (更新 last_contact_date):
  ```sql
  -- 查找客户ID
  select id, contact_name, last_contact_date
  from public.customers
  where contact_name = 'Ali Al-Doha';

  -- 更新最后联系日期为今天
  update public.customers
  set last_contact_date = current_date
  where contact_name = 'Ali Al-Doha';
  ```

- [ ] 再次触发沉默客户扫描:
  ```sql
  select * from public.scan_silent_customers();
  ```

- [ ] 查看该客户的提醒:
  ```sql
  select r.*, c.contact_name, c.last_contact_date
  from public.reminders r
  join public.customers c on c.id = r.customer_id
  where c.contact_name = 'Ali Al-Doha'
    and r.type = 'silent_customer'
  order by r.created_at desc;
  ```

- [ ] **预期结果**:
  - 旧的沉默提醒 **仍然保留** (status 仍为 pending)
  - 不会创建新的沉默提醒 (因为 last_contact_date 已更新为今天)
  - **说明**: 系统只负责创建提醒,不会自动清理。需要用户手动完成或业务逻辑处理。

- [ ] **观察行为**: 记录实际结果 _______________

---

### 边界2: 铃铛徽章数字与提醒列表页的一致性

#### 测试步骤
- [ ] 查看铃铛图标上的徽章数字,记录: _______
- [ ] 点击铃铛,查看下拉菜单标题中的数字,记录: _______
- [ ] 进入 `/reminders` 提醒列表页
- [ ] 筛选 "待处理" 状态,统计显示的提醒数量,记录: _______

- [ ] 执行 SQL 验证:
  ```sql
  select count(*) as pending_count
  from public.reminders
  where assigned_to = '<当前用户ID>'
    and status = 'pending';
  ```
- [ ] SQL 返回数量,记录: _______

- [ ] **预期结果**:
  - 铃铛徽章数字 = 下拉菜单标题数字 = 提醒列表页数量 = SQL 查询结果
  - 所有来源的数字完全一致

- [ ] **一致性验证**: ☐ 一致 / ☐ 不一致 (如不一致,记录差异: _______________)

---

### 边界3: Member 身份无法看到大客户预警

#### 测试步骤
- [ ] 以 **admin** 身份登录
- [ ] 访问 `/dashboard/boss`
- [ ] **预期结果**: 看到大客户依赖度预警卡片

- [ ] 退出登录
- [ ] 以 **member** (普通成员) 身份登录
- [ ] 尝试访问 `/dashboard/boss`

- [ ] **预期结果 (选择一项)**:
  - ☐ 页面完全无法访问 (403 Forbidden / 重定向到其他页面)
  - ☐ 页面可以访问,但预警卡片不显示
  - ☐ 其他情况 (描述: _______________)

- [ ] 如果页面可访问,检查页面源码或开发者工具
- [ ] **预期结果**:
  - RPC 调用 `get_concentration_risk_customers()` 应该返回空或报错 (RLS 拦截)
  - 或前端未调用该 RPC (根据用户角色判断)

- [ ] 执行 SQL 验证 RLS:
  ```sql
  -- 以 member 身份调用 (需切换到 member 的 auth token)
  select * from public.get_concentration_risk_customers();
  ```
- [ ] **预期结果**: 查询返回空或权限错误

---

## 测试总结

### 发现的问题
1.
2.
3.

### 通过的功能
- [ ] P0-1: 沉默客户自动提醒
- [ ] P0-2: 大客户依赖度预警
- [ ] P0-3: 返单周期提醒
- [ ] P0-4: 铃铛通知
- [ ] 所有边界情况

### 需要修复的问题
1.
2.
3.

---

**测试完成时间**: ___________
**测试结果**: ☐ 全部通过 / ☐ 部分通过 / ☐ 需要修复
