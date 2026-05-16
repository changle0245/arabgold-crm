# Phase 3 完整人工测试清单 (P0 + P1)

测试日期: ___________
测试人: ___________
环境: http://localhost:3000

---

**说明**: 本清单涵盖第三期所有功能（P0-1 到 P0-4 以及 P1-1 到 P1-2）的人工测试步骤。

---

# 第一部分: P0 功能测试

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
- [ ] 在老板大屏页面查找 "大客户依赖度预警" 或 "集中度风险客户" 卡片
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

---

# 第二部分: P1 功能测试

## P1-1: 经营看板深化 (老板大屏)

### 前置准备
- [ ] 以 admin 身份登录
- [ ] 访问 `/dashboard/boss`
- [ ] 页面完全加载

---

### P1-1.1: 同比/环比成交额

#### 测试步骤
- [ ] 在老板大屏页面查找 "环比增长（月环比）" 卡片
- [ ] 在老板大屏页面查找 "同比增长（年同比）" 卡片

#### 环比测试
- [ ] **预期结果**:
  - 卡片可见
  - 显示本月成交额
  - 如果有上月数据:
    - 显示环比百分比变化
    - 显示上升箭头(绿色)或下降箭头(红色)
    - 显示 "vs 上月 $XXX"
  - 如果无上月数据:
    - 显示 "暂无可比数据"

#### 同比测试
- [ ] **预期结果**:
  - 卡片可见
  - 显示本月成交额
  - 如果有去年同月数据:
    - 显示同比百分比变化
    - 显示上升箭头(绿色)或下降箭头(红色)
    - 显示 "vs 去年同月 $XXX"
  - 如果无去年同月数据:
    - 显示 "暂无可比数据"

#### 边界情况
- [ ] 确认不显示 NaN 或错误
- [ ] 确认金额格式正确 (≥10000 显示为 "X.Xw")

---

### P1-1.2: 成交转化率漏斗

#### 测试步骤
- [ ] 在老板大屏页面查找 "成交转化率漏斗" 卡片

#### 验证内容
- [ ] **预期结果**:
  - 卡片可见
  - 显示 4 个阶段: 新接触 → 报价中 → 已寄样 → 已成交
  - 每个阶段显示:
    - 阶段名称
    - 客户数量 (X 人)
    - 转化率百分比 (除第一阶段外)
    - 进度条 (渐变金色)
  - 底部注释: "注：不包含'沉默'和'待定'阶段客户"

#### 转化率验证
- [ ] 记录每个阶段的客户数和转化率
- [ ] 手动计算转化率验证:
  ```
  转化率 = (当前阶段客户数 / 上一阶段客户数) × 100%
  ```
- [ ] **预期结果**: 界面显示的转化率与手动计算一致

#### 边界情况
- [ ] 如果某阶段客户数为 0,进度条显示最小宽度
- [ ] 不显示 NaN 或错误

---

### P1-1.3: 业绩目标对比

#### 测试步骤 (未设置目标)
- [ ] 检查是否已设置月度目标:
  ```sql
  select value from public.system_settings where key = 'monthly_revenue_target';
  ```
- [ ] 如果 value 为 null:
  - [ ] **预期结果**:
    - 显示灰色卡片
    - 显示 "未设置本月目标"

#### 测试步骤 (已设置目标)
- [ ] 设置月度目标:
  ```sql
  update public.system_settings
  set value = '100000'::jsonb
  where key = 'monthly_revenue_target';
  ```
- [ ] 刷新老板大屏页面

#### 验证内容
- [ ] **预期结果**:
  - 金色边框卡片可见
  - 标题显示 "本月业绩目标"
  - 显示目标金额: "目标: $XXX"
  - 显示进度条:
    - 完成度 < 100%: 金色进度条
    - 完成度 >= 100%: 绿色进度条
  - 显示 "已完成: $XXX"
  - 显示完成百分比 (如 "65.3%")

#### 边界情况
- [ ] 本月成交额为 0 时,显示 "0%"
- [ ] 目标为 0 时,显示 "未设置本月目标"
- [ ] 不出现除零错误或 NaN

---

## P1-2: 个人工作台深化 (个人大屏)

### 前置准备
- [ ] 以任意用户身份登录
- [ ] 访问 `/dashboard/personal`
- [ ] 页面完全加载

---

### P1-2.1: 本周/本月工作汇总

#### 测试步骤
- [ ] 查找 "本周工作汇总" 卡片
- [ ] 查找 "本月工作汇总" 卡片

#### 本周工作汇总验证
- [ ] **预期结果**:
  - 卡片可见
  - 蓝色 Calendar 图标
  - 2x2 网格显示 4 项指标:
    - 新增客户 (数字)
    - 记录联系 (数字)
    - 推进阶段 (数字)
    - 成交笔数 (金色数字)
  - 所有数字 >= 0

#### 本月工作汇总验证
- [ ] **预期结果**:
  - 卡片可见
  - 绿色 Calendar 图标
  - 2x2 网格显示 4 项指标:
    - 新增客户 (数字)
    - 记录联系 (数字)
    - 推进阶段 (数字)
    - 成交笔数 (金色数字)
  - 所有数字 >= 0

#### 数据验证
- [ ] 记录界面显示的数据
- [ ] 执行 SQL 验证 (以本周为例):
  ```sql
  -- 计算本周一日期
  -- 本周新增客户
  select count(*) from customers
  where created_by = '<当前用户ID>'
  and created_at >= '<本周一T00:00:00>';

  -- 本周记录联系
  select count(*) from contact_logs
  where logged_by = '<当前用户ID>'
  and log_date >= '<本周一日期>';

  -- 本周推进阶段
  select count(*) from stage_changes
  where changed_by = '<当前用户ID>'
  and changed_at >= '<本周一T00:00:00>';

  -- 本周成交笔数
  select count(*) from deals
  where created_by = '<当前用户ID>'
  and deal_date >= '<本周一日期>';
  ```
- [ ] **预期结果**: 界面数据与 SQL 查询结果一致

---

### P1-2.2: 个人业绩占比

#### 测试步骤
- [ ] 查找 "本月个人业绩占比" 卡片

#### 有成交数据时
- [ ] **预期结果**:
  - 金色边框卡片可见
  - PieChart 图标 (金色)
  - 显示 "我的成交额": $XXX (金色)
  - 显示 "公司总成交额": $XXX (灰色)
  - 渐变金色进度条
  - 进度条内显示占比百分比
  - 金额 ≥10000 显示为 "X.Xw" 格式

#### 无成交数据时
- [ ] 清空本月成交:
  ```sql
  delete from deals where deal_date >= '<本月1日>';
  ```
- [ ] 刷新页面
- [ ] **预期结果**:
  - 卡片可见
  - 显示 "本月暂无成交"

#### 数据验证
- [ ] 记录界面显示的占比百分比
- [ ] 执行 SQL 验证:
  ```sql
  -- 我的本月成交额
  select sum(deal_amount) as my_revenue
  from deals
  where created_by = '<当前用户ID>'
  and deal_date >= '<本月1日>';

  -- 公司本月总成交额
  select sum(deal_amount) as company_revenue
  from deals
  where deal_date >= '<本月1日>';

  -- 计算占比: (my_revenue / company_revenue) * 100
  ```
- [ ] **预期结果**: 界面占比与手动计算一致 (误差 ±0.1%)

#### 边界情况
- [ ] 公司成交额为 0 时,显示 "本月暂无成交"
- [ ] 我的成交额为 0 时,显示 "0%"
- [ ] 不出现除零错误或 NaN

---

# 第三部分: 边界情况测试

## 边界1: 沉默客户重新联系后的提醒状态

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

## 边界2: 铃铛徽章数字与提醒列表页的一致性

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

## 边界3: Member 身份无法看到大客户预警

#### 测试步骤
- [ ] 以 **admin** 身份登录
- [ ] 访问 `/dashboard/boss`
- [ ] **预期结果**: 看到大客户依赖度预警卡片 (如有风险数据)

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

---

## 边界4: 同比/环比无历史数据

#### 测试步骤
- [ ] 确认测试数据库中所有 deals 的 deal_date 都是本月
- [ ] 访问老板大屏 `/dashboard/boss`

#### 验证环比
- [ ] 查看 "环比增长（月环比）" 卡片
- [ ] **预期结果**:
  - 显示本月成交额
  - 显示 "暂无可比数据"
  - 不显示百分比、箭头或 NaN

#### 验证同比
- [ ] 查看 "同比增长（年同比）" 卡片
- [ ] **预期结果**:
  - 显示本月成交额
  - 显示 "暂无可比数据"
  - 不显示百分比、箭头或 NaN

---

## 边界5: 转化率漏斗某阶段客户为 0

#### 测试步骤
- [ ] 确认某个阶段（如 "已寄样"）的客户数为 0:
  ```sql
  select stage, count(*) as count
  from customers
  group by stage
  order by stage;
  ```

- [ ] 访问老板大屏查看转化率漏斗

- [ ] **预期结果**:
  - 该阶段仍显示在漏斗中
  - 显示 "0 人"
  - 不显示转化率百分比（或显示 "0%"）
  - 进度条显示最小宽度
  - 不显示 NaN 或错误

---

# 测试总结

## 发现的问题

### 高优先级问题
1.
2.
3.

### 中优先级问题
1.
2.
3.

### 低优先级问题
1.
2.
3.

---

## 通过的功能

### P0 功能
- [ ] P0-1: 沉默客户自动提醒
- [ ] P0-2: 大客户依赖度预警
- [ ] P0-3: 返单周期提醒
- [ ] P0-4: 铃铛通知

### P1 功能
- [ ] P1-1.1: 同比/环比成交额
- [ ] P1-1.2: 成交转化率漏斗
- [ ] P1-1.3: 业绩目标对比
- [ ] P1-2.1: 本周/本月工作汇总
- [ ] P1-2.2: 个人业绩占比

### 边界情况
- [ ] 所有边界情况测试通过

---

## 需要修复的问题清单

1.
2.
3.

---

**测试完成时间**: ___________
**测试结果**: ☐ 全部通过 / ☐ 部分通过 / ☐ 需要修复
**测试人签名**: ___________
