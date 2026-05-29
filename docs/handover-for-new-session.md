# 新会话交接文档（T6 最终收尾阶段）

## 1. 当前 git 状态

### 采样时 HEAD

- `git log --oneline -1`

```text
5f2aa4e feat: add dedicated multi-profile selector page
```

### 最近 10 条 commit

```text
5f2aa4e feat: add dedicated multi-profile selector page
6f39f1b refactor: migrate font scaling to JS precomputed sizes
7bb1212 fix: harden record import dedupe and sharing flows
5361002 feat: streamline CSV import and chart exports
1306b31 fix: refine records export table header layout
2cc1be6 fix: finalize export layout and alert defaults
fc691ee fix: polish empty states and records export
851c149 feat: refine onboarding, medications, and member refresh
2820ad9 fix: polish report layout and export rendering
59963ac style: align settings and user profile pages
```

### 采样时未提交改动

- `git status --short`

```text
 M docs/handover-for-new-session.md
 M docs/t6-visual-status.md
?? scripts/verify-h2-invite-ui.js
```

说明：
- 以上是更新本 handover 前的采样结果。
- `scripts/verify-h2-invite-ui.js` 目前还未纳入提交。

---

## 2. 当前阶段总览

项目当前处于 **T6 视觉对齐 + 最终交互收尾**。

已完成的大方向：
- 核心双 tab 页已稳定：`pages/data/data`、`pages/profile-home/profile-home`
- `custom-tab-bar` 已改为由 tab 页 `onShow` 回写高亮
- 空状态、档案编辑、报告页、药物管理、导入页、导出链路都已完成多轮收敛
- `fontScale` 已从 CSS 变量方案重构为 **JS 预计算字号** 方案
- 多档案首次进入逻辑已从数据页条件渲染，改成独立页 `pages/profile-selector/profile-selector`

仍未完全收尾的方向：
- H2 邀请流程 UI 重构尚未真正开始
- 还有少量字体漏网点和多账号实机链路待确认
- Claude Code 代码审查提到的两个 P0 问题还没进实现

---

## 3. A → H 批次完成情况（简要）

### 批次 A：基础 Bug 修复

已完成：
- tabBar 切换高亮逻辑重做：高亮真相源改为 tab 页 `onShow`
- 数据页 / 档案页下拉刷新与 staleness 刷新接入
- 删除档案后的 `currentProfileId` 切换与回流处理
- 无档案时数据页 / 档案页统一空状态引导

### 批次 B：核心页面 UI 对齐

已完成：
- 档案编辑改半屏弹窗，并多轮收敛字段和布局
- 报告页改为单卡片连续布局
- 设置页隐藏参考线步进器
- 个人资料页改为统一视觉风格

### 批次 C：空数据引导 + 新建档案 + 药物管理 + 头像同步 + 导出预览

已完成：
- 数据页“有档案但无记录”空状态重做
- 新建档案页 UI 对齐
- 药物管理重构为“列表页 + 详情页”
- 头像同步修复到前端刷新层，并补了 later 的云存储上传修正
- 全部记录导出预览壳层对齐

### 批次 D：最终 UI 修补

已完成：
- 无档案引导卡改玻璃卡片风格
- 药物左滑删除圆角对齐
- 全部记录导出图片对齐、清晰度、字号第一轮修补

### 批次 E：导出 + 默认值 + 权限/弹窗/隐藏区块

已完成：
- 全部记录导出标题/表头/布局多轮修复
- relationship 默认通知值关闭
- 非管理员隐藏“其他”空区块
- 安卓删除确认弹窗第一轮适配

说明：
- E3 协作者删除记录权限，后端最终判定为主逻辑已基本符合要求，重点修在前端左滑权限和录入人标识。

### 批次 F：导入页交互重构 + fontScale 排查 + 单图导出摘要

已完成：
- 导入页改为自动解析、状态提示、底部唯一导入按钮
- 单图导出底部加摘要行
- 做过一轮 fontScale 接入盘点

### 批次 G：严重 bug 修复 + 遗留收尾

已完成：
- 头像上传改为 **先上传云存储再存 fileID**
- 协作者视角下记录左滑权限、录入人标识
- 导入去重
- 单图导出 DPR 修复
- 安卓删除确认弹窗改为安卓 `wx.showModal` / iOS 自定义弹窗

说明：
- G3 “协作者导出 90 天图片失败”根因已定位为 canvas 尺寸 / DPR 上限问题，并做了动态降 DPR。

### 批次 H：fontScale / 多档案 / 邀请 / 空目录

已完成：
- H1：fontScale 已全面切到 **JS 预计算字号** 方案
- H3：多档案首次进入改成独立 `profile-selector` 页面
- H4：空目录已清理

未完成：
- H2：邀请流程全链路 UI 重构，**尚未开始真正实现**

---

## 4. 已知未修 bug 和待做事项

### 字号 / fontScale 余项

- `fontScale` 两处补漏仍需最终确认：
  - 协作者权限页 / 权限弹层
  - 数据页空状态“已有数据？导入历史记录”链接

说明：
- 代码层已经做过补丁，但仍建议新会话先用 `1.3` 档在 DevTools/真机复核。

### H2 邀请流程重构

- `pages/invite-create/invite-create`
- `pages/invite-accept/invite-accept`

当前状态：
- 代码和样式有部分对齐基础
- 但用户要求的 H2 最终版重构 **尚未开始**
- 工作区有未提交脚本：`scripts/verify-h2-invite-ui.js`

### Claude Code 审查发现的 P0 问题

还未修：
- 推送消息仍可能走 developer 模式
- 登录链路存在 N+1 查询问题

说明：
- 这两个点目前只是被审查标记，还没有进入本轮代码修改。

### E3 / E4 多账号测试待确认

仍需多账号 / 真机确认：
- E3：协作者删除记录权限链路
- E4：安卓 / iOS 删除确认弹窗差异

说明：
- 代码和本地脚本都已过，但多账号实际行为仍建议再测一轮。

---

## 5. 关键实现细节（新 Codex 必须知道）

### 5.1 fontScale 已改为 JS 预计算方案

关键文件：
- [utils/font-scale.js](/Users/ella/Documents/Code/Demo/WeChatProjects/family-care-prod/utils/font-scale.js:1)

结论：
- **已经废弃 CSS 变量方案**
- 不再依赖 `calc(Nrpx * var(--font-scale))`
- 页面统一在 `onShow` 里 `syncFontData.call(this)`
- 组件统一在 `pageLifetimes.show` 或打开时机同步 `fs`
- WXML 通过 `style="font-size:{{fs.xxx}}"` 直接绑定字号

注意：
- 如果新加页面或组件，要沿用这个方案，不要再引入 `--font-scale / --fs-*`

### 5.2 多档案选择页是独立页面

关键文件：
- [pages/profile-selector/profile-selector.js](/Users/ella/Documents/Code/Demo/WeChatProjects/family-care-prod/pages/profile-selector/profile-selector.js:1)
- [app.js](/Users/ella/Documents/Code/Demo/WeChatProjects/family-care-prod/app.js:1)

行为：
- 多档案首次进入时，如果没有有效 `lastSelectedProfileId`，启动阶段会：
  - `wx.reLaunch({ url: '/pages/profile-selector/profile-selector' })`
- 选择页不在 tabBar 中
- 选中后：
  - `store.setCurrentProfileId(profileId)`
  - `wx.setStorageSync('lastSelectedProfileId', profileId)` 或 app helper
  - `wx.switchTab({ url: '/pages/data/data' })`

联动：
- 顶部档案切换器切换时，也会更新 `lastSelectedProfileId`
- 新建档案成功后，会写入 `lastSelectedProfileId`
- 删除当前缓存档案时，会清理 `lastSelectedProfileId`

### 5.3 导入页已改为自动解析 + 去重

关键文件：
- [pages/import-records/import-records.js](/Users/ella/Documents/Code/Demo/WeChatProjects/family-care-prod/pages/import-records/import-records.js:1)

行为：
- 粘贴 CSV 后 `500ms` 防抖自动解析
- 导入前会按时间范围拉已有记录做去重
- 去重规则：
  - `measuredAt` 抹平到分钟级
  - `systolic`
  - `diastolic`
- 全部重复时会直接提示，无需重复导入

注意：
- 这个去重逻辑是前端实现，不在云函数层

### 5.4 头像上传已改为先上传云存储再存 fileID

关键文件：
- [pages/user-profile-edit/user-profile-edit.js](/Users/ella/Documents/Code/Demo/WeChatProjects/family-care-prod/pages/user-profile-edit/user-profile-edit.js:1)

结论：
- 之前跨设备头像不同步的重要根因，是把临时本地路径直接写进了用户资料
- 现在流程是：
  - `chooseAvatar`
  - `wx.cloud.uploadFile`
  - 再把云端 `fileID` 写入用户资料

历史说明：
- 旧用户历史头像如果本来存的是本地临时路径，仍可能需要用户自己重新上传一次头像

### 5.5 custom tabBar 高亮不由 tabBar 自己维护

关键文件：
- [custom-tab-bar/index.js](/Users/ella/Documents/Code/Demo/WeChatProjects/family-care-prod/custom-tab-bar/index.js:1)
- [pages/data/data.js](/Users/ella/Documents/Code/Demo/WeChatProjects/family-care-prod/pages/data/data.js:1)
- [pages/profile-home/profile-home.js](/Users/ella/Documents/Code/Demo/WeChatProjects/family-care-prod/pages/profile-home/profile-home.js:1)

结论：
- tabBar 本身不再维护“当前选中页真相”
- 真相源是 tab 页 `onShow`
- tab 页进入时会主动：
  - `this.getTabBar().setData({ selectedPath: '...' })`

不要回退成：
- tabBar 点击时自己乐观更新高亮

### 5.6 录入 / 编辑 / 成员等弹层的字号同步

相关组件：
- `components/member-panel`
- `components/profile-edit-panel`
- `components/record-panel`
- `components/profile-switcher`

结论：
- 这类组件不能只靠 `attached()` 和 `pageLifetimes.show()`
- 当前已经补成：**每次弹层真正打开时也会同步一次字号**
- 否则会出现“当前页改了字号，但立刻打开弹层，弹层字体不变”的问题

---

## 6. 其他当前实现状态

### `custom-tab-bar`

要点：
- 中间 `+` 按钮：
  - 在数据页直接打开 `record-panel`
  - 在非数据页先打 `openRecordPanelOnDataTab` 标记再 `switchTab`
- tabBar 可通过 `setVisible(false)` 被浮层宿主隐藏

### store 结构

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

### 成员刷新 / staleness

关键点：
- `profile-members` 有 `30s` staleness
- `profile-home` 成员缓存也走 `30s` staleness
- 本机 dirty flag 只解决本机刷新
- 跨设备最终还是依赖 staleness + 头像 fileID 正确性

---

## 7. 工程硬规则（从上一份 handover 保留）

1. 云函数 `_shared` 用构建复制方案，不能直接依赖父目录，见 [docs/deployment-notes.md](/Users/ella/Documents/Code/Demo/WeChatProjects/family-care-prod/docs/deployment-notes.md:1)
2. 前端绝不引用云函数代码或 `cloudfunctions/_shared/*`
3. 三层自验 gate 不能省：本地逻辑、部署单元、DevTools 烟测
4. 写操作优先做本地即时缓存更新，避免整包失效导致明显 loading 回退
5. T2.5 请求风暴防护：任何新增刷新逻辑都必须有 throttle / debounce / staleness 保护
6. T6.0 闪烁防护：数据页和档案页必须先等 `loginReady`，再用 `pageReady` 控制渲染
7. T6.0 切档防护：先更新 store + 本地持久化，再 `switchTab`

---

## 8. 新会话建议切入顺序

如果新 Codex 接手，建议顺序：

1. 先读本文件
2. 再读：
   - [docs/project-status.md](/Users/ella/Documents/Code/Demo/WeChatProjects/family-care-prod/docs/project-status.md:1)
   - [docs/deployment-notes.md](/Users/ella/Documents/Code/Demo/WeChatProjects/family-care-prod/docs/deployment-notes.md:1)
   - [docs/t6-visual-status.md](/Users/ella/Documents/Code/Demo/WeChatProjects/family-care-prod/docs/t6-visual-status.md:1)
3. 优先确认工作区未提交项：
   - `docs/t6-visual-status.md`
   - `scripts/verify-h2-invite-ui.js`
4. 然后先做：
   - fontScale 两处补漏复核
   - H2 邀请流程重构
   - Claude Code 审查的两个 P0

