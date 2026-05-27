# 新会话交接文档（T6 进行中）

## 1. 当前 git 状态

### 采样时 HEAD

- 采样时 `git log --oneline -1`：`7aa42a1 update profile page UI`

### 最近 5 条 commit

```text
7aa42a1 update profile page UI
2601c14 feat: add member management bottom sheet
bc4db5a refactor: remove legacy record page
51334e4 feat: expand settings page controls and align font preferences
d1ddd0f fix: align records and import page styling
```

### 采样时未提交改动

`git status --short` 结果：

```text
?? docs/t6-visual-status.md
```

说明：
- 以上状态是编写本交接文档前的采样结果。

---

## 2. 当前文件结构快照

### 页面 JS 文件

```text
pages/data/data.js
pages/import-records/import-records.js
pages/invite-accept/invite-accept.js
pages/invite-create/invite-create.js
pages/medication-edit/medication-edit.js
pages/profile-edit/profile-edit.js
pages/profile-home/profile-home.js
pages/profile-members/profile-members.js
pages/profile-threshold-edit/profile-threshold-edit.js
pages/records-list/records-list.js
pages/report/report.js
pages/user-profile-edit/user-profile-edit.js
pages/user-settings/user-settings.js
```

### 组件 JS 文件

```text
components/bp-input/bp-input.js
components/bp-status-tag/bp-status-tag.js
components/empty-state/empty-state.js
components/medication-item/medication-item.js
components/member-panel/member-panel.js
components/profile-switcher/profile-switcher.js
components/record-panel/record-panel.js
```

### 工具文件

```text
utils/alert-subscription.js
utils/app-login-status.js
utils/bp-status.js
utils/canvas-charts.js
utils/chart-data.js
utils/csv-helpers.js
utils/date.js
utils/error-messages.js
utils/font-scale.js
utils/health-rules.js
utils/invitation.js
utils/medication.js
utils/permission-helpers.js
utils/profile-detail.js
utils/profile-store.js
utils/record-data-transfer.js
utils/record-editor.js
utils/records-data-canvas.js
utils/records-export-helpers.js
utils/report-canvas.js
utils/report-chart-renderer.js
utils/report-data.js
utils/report-exporter.js
utils/report-helpers.js
```

### 服务文件

```text
services/invitation-service.js
services/medication-service.js
services/member-service.js
services/profile-service.js
services/record-service.js
services/request.js
services/user-service.js
```

### `custom-tab-bar/` 文件

```text
custom-tab-bar/.gitkeep
custom-tab-bar/index.js
custom-tab-bar/index.json
custom-tab-bar/index.wxml
custom-tab-bar/index.wxss
```

### `app.json` 中的 pages 数组

```json
[
  "pages/data/data",
  "pages/profile-home/profile-home",
  "pages/records-list/records-list",
  "pages/import-records/import-records",
  "pages/profile-edit/profile-edit",
  "pages/profile-threshold-edit/profile-threshold-edit",
  "pages/profile-members/profile-members",
  "pages/medication-edit/medication-edit",
  "pages/invite-create/invite-create",
  "pages/invite-accept/invite-accept",
  "pages/report/report",
  "pages/user-profile-edit/user-profile-edit",
  "pages/user-settings/user-settings"
]
```

### `app.json` 中的 tabBar 配置

```json
{
  "custom": true,
  "color": "#C7CDD9",
  "selectedColor": "#3182F7",
  "backgroundColor": "#ffffff",
  "borderStyle": "white",
  "list": [
    {
      "pagePath": "pages/data/data",
      "text": "数据",
      "iconPath": "assets/tab-data.png",
      "selectedIconPath": "assets/tab-data-active.png"
    },
    {
      "pagePath": "pages/profile-home/profile-home",
      "text": "档案",
      "iconPath": "assets/tab-profile.png",
      "selectedIconPath": "assets/tab-profile-active.png"
    }
  ]
}
```

---

## 3. T6 当前进度

### 视觉已对齐页面

基于 [docs/t6-visual-status.md](/Users/ella/Documents/Code/Demo/WeChatProjects/family-care-prod/docs/t6-visual-status.md:1) 当前结论：

- 已对齐：
  - `pages/data/data`
  - `pages/records-list/records-list`
  - `pages/import-records/import-records`
  - `pages/user-settings/user-settings`
- 部分对齐：
  - `pages/profile-home/profile-home`
  - `pages/profile-edit/profile-edit`
  - `pages/medication-edit/medication-edit`
  - `pages/invite-create/invite-create`
  - `pages/invite-accept/invite-accept`
  - `pages/report/report`
  - `pages/user-profile-edit/user-profile-edit`
- 未开始：
  - `pages/profile-threshold-edit/profile-threshold-edit`
  - `pages/profile-members/profile-members`
- 遗留空目录 / 待确认：
  - `pages/home`
  - `pages/profile-detail`
  - `pages/profile-settings`
  - `pages/spike-canvas`

### 数据页 / 档案页视觉基准关键值

说明：
- 当前更稳定的视觉基准其实是 `pages/data/data`。
- `pages/profile-home/profile-home` 结构已完成，但视觉仍在持续精调，不能把它当成完全收敛的唯一标准。

#### 数据页当前代码中的关键值

- 主背景色：`#EEF4FE`
- 卡片背景色：`#FFFFFF`
- 核心大卡片圆角：`64rpx`
- 核心大卡片阴影：`0 2rpx 16rpx rgba(0, 0, 0, 0.04)`
- 主色调：`#3182F7`
- 危险色：`#EF4444`
- 主文字色：`#0F172A`
- 次级文字色：`#64748B`
- 浅灰文字色：`#94A3B8`
- 主按钮：蓝底白字，圆形悬浮录入按钮和图表操作按钮都围绕 `#3182F7`

#### 档案页当前代码中的关键值

- 顶部设置胶囊：`background: rgba(255,255,255,0.9)`，`box-shadow: 0 1rpx 4rpx rgba(0,0,0,0.04)`
- 分区标题色：`#94A3B8`
- 当前卡片圆角：`64rpx`
- 当前卡片阴影：`0 12rpx 32rpx rgba(17, 24, 39, 0.08)`
- 主色调仍为：`#3182F7`
- 说明：档案页当前卡片圆角和阴影仍明显重于数据页，因此它在视觉状态文档里仍是“部分对齐”

---

## 4. 关键实现细节（新 Codex 必须知道）

### `custom-tab-bar` 的实现方式

文件：
- [custom-tab-bar/index.js](/Users/ella/Documents/Code/Demo/WeChatProjects/family-care-prod/custom-tab-bar/index.js:1)
- [custom-tab-bar/index.wxml](/Users/ella/Documents/Code/Demo/WeChatProjects/family-care-prod/custom-tab-bar/index.wxml:1)
- [custom-tab-bar/index.wxss](/Users/ella/Documents/Code/Demo/WeChatProjects/family-care-prod/custom-tab-bar/index.wxss:1)

要点：
- 虽然 `app.json` 里 still 配了 `assets/tab-*.png`，但实际 `custom-tab-bar/index.js` 内部已经改成 **base64 SVG data URI** 图标。
- `tabs` 实际用 `TAB_ITEMS` 常量渲染，不依赖页面去传图标。
- 中间 `+` 按钮逻辑：
  - 如果当前就在 `pages/data/data`，直接调用当前页实例的 `handleOpenRecordPanel()`
  - 如果当前不在数据页，先走 `app.requestOpenRecordPanelOnDataTab()` 打一个待消费标记，再 `wx.switchTab({ url: "/pages/data/data" })`
- 左右 tab 切换当前没有防抖锁；`handleSwitchTab()` 里是直接 `wx.switchTab(...)`
- `setVisible(visible)` 已存在，用于浮层打开时隐藏 tabBar

### 登录流程：`loginReady` / `pageReady`

文件：
- [app.js](/Users/ella/Documents/Code/Demo/WeChatProjects/family-care-prod/app.js:1)
- [utils/app-login-status.js](/Users/ella/Documents/Code/Demo/WeChatProjects/family-care-prod/utils/app-login-status.js:1)
- [pages/data/data.js](/Users/ella/Documents/Code/Demo/WeChatProjects/family-care-prod/pages/data/data.js:1)
- [pages/profile-home/profile-home.js](/Users/ella/Documents/Code/Demo/WeChatProjects/family-care-prod/pages/profile-home/profile-home.js:1)

机制：
- `app.js` 登录成功后才会把 `app.globalData.loginReady = true`
- 页面层通过 `getAppLoginStatus()` 先判断登录是否完成
- `pages/data/data` 和 `pages/profile-home/profile-home` 都先等 `loginReady`
- 再由页面自身的 `pageReady` 控制是否真正渲染内容，防止冷启动、切档或建档回流时闪旧数据 / 空态

### store 结构

文件：
- [store/index.js](/Users/ella/Documents/Code/Demo/WeChatProjects/family-care-prod/store/index.js:1)

核心字段：
- `user`
- `profiles`
- `relationships`
- `currentProfileId`
- `cache.profiles`
- `cache.latestRecords`
- `cache.records`
- `cache.medications`
- `lastRefreshAt.profiles`
- `lastRefreshAt.members`
- `session.dismissedProfileCompletionHints`

### SWR 缓存策略

关键点：
- `record-service` 当前只把 **无 `since/until` 的全量记录查询** 写入 profile 级缓存；子集查询不再污染整档案缓存
- `profile-members` 有明确的 `30s` staleness 强刷：`STALE_THRESHOLD = 30 * 1000`
- `profile-home` 的成员缓存也用 `30s` 阈值：`MEMBER_STALE_THRESHOLD = 30 * 1000`
- `pages/data/data` 页面自身的前台刷新 TTL 目前是 `5s`：`REFRESH_TTL_MS = 5 * 1000`
- `pages/profile-home/profile-home` 页面自身的前台刷新 TTL 目前也是 `5s`

注意：
- 目前 **数据页和档案页还没有用户要求中的下拉刷新与 30 秒静默 onShow 强刷完整方案**
- 现有 TTL 保护主要是“避免短时间重复 reload”，不是完整的 pull-to-refresh 设计

### 共享图表渲染器 `report-chart-renderer.js`

文件：
- [utils/report-chart-renderer.js](/Users/ella/Documents/Code/Demo/WeChatProjects/family-care-prod/utils/report-chart-renderer.js:1)
- [utils/report-helpers.js](/Users/ella/Documents/Code/Demo/WeChatProjects/family-care-prod/utils/report-helpers.js:1)

它会同时影响：
- `pages/data/data`
- `pages/report/report`
- `utils/report-exporter.js` 导出的报告图

任何改动：
- 都会联动影响数据页图表
- 就诊报告页图表
- 导出图片/报告里的图表

### `profile-switcher` 组件的使用方式

文件：
- [components/profile-switcher/profile-switcher.js](/Users/ella/Documents/Code/Demo/WeChatProjects/family-care-prod/components/profile-switcher/profile-switcher.js:1)

属性：
- `show`
- `profiles`
- `currentProfileId`
- `returnTab`

事件：
- `select`：返回 `{ profileId }`
- `close`
- `visibilitychange`：返回 `{ visible }`

当前宿主：
- `pages/data/data`
- `pages/profile-home/profile-home`

用法：
- 宿主页在打开时通常会 `setTabBarVisible(false)`
- 在 `close/visibilitychange(false)` 时恢复 tabBar
- 创建新档案入口直接从组件内部 `navigateTo('/pages/profile-edit/profile-edit?mode=create&returnTab=...')`

### `record-panel` 组件的使用方式

文件：
- [components/record-panel/record-panel.js](/Users/ella/Documents/Code/Demo/WeChatProjects/family-care-prod/components/record-panel/record-panel.js:1)

属性：
- `show`
- `profileId`
- `record`
- `editRecord`

关键行为：
- 已经重构成 **自定义数字键盘**，不再依赖原生数值 `input`
- 同时支持新建和编辑
- 编辑模式支持删除
- 成功/删除反馈 toast 与删除确认弹窗都在组件内
- 组件本身 **不直接调 `getTabBar()`**，而是通过事件交给宿主页面

主要事件：
- `close`
- `visibilitychange`
- `recordSaved`
- `recordDeleted`

当前宿主：
- `pages/data/data`：新建 + 编辑
- `pages/records-list/records-list`：编辑模式

---

## 5. 已知 bug 和待做事项

### 已知 bug（原样记录）

- Bug 1：TabBar 切换快速点击会卡死（页面和 tabBar 高亮不同步）
- Bug 2：权限/成员变更后不能自动刷新，需退出小程序
- Bug 3：删除档案后跳转到另一个档案，图表不显示数据
- Bug 4：个人头像在其他人的成员管理页不显示
- Bug 5：字体修改后没有全局生效

### 待做的 UI / 交互优化批次（简要）

说明：
- 仓库里没有完整保存 A/B/C/D 原 prompt，下面是基于当前会话上下文整理的简要范围，给新会话做续接。

- 批次 A：基础 Bug 修复
  - TabBar 切换防抖
  - 数据页 / 档案页下拉刷新与 `onShow` staleness 刷新
  - 删除档案后的 `currentProfileId` 切换与数据页重载
  - 无档案时的数据页/档案页统一空状态引导

- 批次 B：成员 / 权限链路稳定性
  - `member-panel` 交互收尾
  - 角色变更、移除、退出后的全局刷新一致性
  - 自己被移除 / 退出后跨页状态恢复

- 批次 C：视觉统一扫尾
  - `profile-home` 剩余视觉精调
  - `profile-edit`、`profile-members`、`profile-threshold-edit` 等旧页的风格对齐
  - 邀请流、报告页、用药页的卡片体系统一

- 批次 D：全局一致性与最终回归
  - 全局字号、头像、空状态统一
  - 遗留空目录 / 旧页面彻底清理
  - 最终 smoke test、文档更新、交接收尾

---

## 6. 工程硬规则（从上一份 handover 保留）

1. 云函数 `_shared` 用构建复制方案，不能直接依赖父目录，见 [docs/deployment-notes.md](/Users/ella/Documents/Code/Demo/WeChatProjects/family-care-prod/docs/deployment-notes.md:1)
2. 前端绝不引用云函数代码或 `cloudfunctions/_shared/*`
3. 三层自验 gate 不能省：本地逻辑、部署单元、DevTools 烟测
4. 写操作优先做本地即时缓存更新，避免整包失效导致明显 loading 回退
5. T2.5 请求风暴防护：任何新增刷新逻辑都必须有 throttle / debounce / staleness 保护
6. T6.0 闪烁防护：数据页和档案页必须先等 `loginReady`，再用 `pageReady` 控制渲染
7. T6.0 切档防护：先更新 store + 本地持久化，再 `switchTab`

---

## 附：视觉状态文档

- 参考：[docs/t6-visual-status.md](/Users/ella/Documents/Code/Demo/WeChatProjects/family-care-prod/docs/t6-visual-status.md:1)
