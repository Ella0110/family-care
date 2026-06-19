# 来自儿女的关心（family-care）

微信小程序，帮助子女远程关注父母血压健康。已上线（V1.0），当前 V1.1 迭代中。

## 快速上下文

新会话必读顺序：
1. `docs/handover-for-new-session.md` — 阶段进度、关键实现细节、已知 bug
2. `docs/project-status.md` — 数据模型、云函数清单、前端架构、踩坑记录
3. `docs/deployment-notes.md` — 云函数部署约定

## 技术栈

| 层 | 选型 |
|----|------|
| 前端 | 微信小程序原生框架（无第三方 UI 库） |
| 状态管理 | 手写订阅式 Store（`store/index.js`）+ SWR 缓存 |
| 后端 | 微信云开发 Serverless 云函数（Node.js）× 20+ |
| 数据库 | 云开发 NoSQL 文档数据库 |
| 图表 | Canvas 2D 自绘（`utils/canvas-charts.js`, `report-chart-renderer.js`） |
| 推送 | 微信订阅消息 |

## 工程硬规则

1. **云函数 `_shared`**：源码在 `cloudfunctions/_shared/`，部署前通过构建脚本复制进各函数目录，不能直接依赖父目录
2. **前端隔离**：前端绝不引用云函数代码或 `cloudfunctions/_shared/*`
3. **三层自验 gate**：本地逻辑 → 部署单元 → DevTools 烟测，三层都必须过
4. **写操作本地优先**：写操作优先做本地缓存即时更新，避免整包失效带来明显 loading 回退
5. **请求风暴防护**：任何新增刷新逻辑必须有 throttle / debounce / staleness 保护
6. **闪烁防护**：数据页和档案页必须先等 `loginReady`，再用 `pageReady` 控制渲染
7. **切档防护**：先更新 store + 本地持久化，再 `switchTab`

## fontScale 方案（重要）

已废弃 CSS 变量方案（`--font-scale / --fs-*`），统一用 JS 预计算字号：
- 工具入口：`utils/font-scale.js`
- 页面：`onShow` 里调用 `syncFontData.call(this)`
- 组件：`pageLifetimes.show` 或弹层打开时同步 `fs`
- WXML：`style="font-size:{{fs.xxx}}"` 直接绑定
- **新加页面或组件沿用此方案，不要引入 CSS 变量**

## 关键实现要点

- **tabBar 高亮真相源**：tab 页 `onShow` 主动回写 `setData({ selectedPath })`，tabBar 本身不维护高亮
- **多档案选择页**：独立页面 `pages/profile-selector/profile-selector`，不在 tabBar 中；无有效 `lastSelectedProfileId` 时 `wx.reLaunch` 到此页
- **弹层字号同步**：弹层不能只靠 `attached()` / `pageLifetimes.show()`，每次弹层真正打开时也要同步一次字号
- **图表共用**：`utils/report-chart-renderer.js` 被报告页和数据页共用，修改会同时影响两个页面
- **头像上传**：先 `wx.cloud.uploadFile` 上传云存储，再把 `fileID` 写入用户资料（不能存本地临时路径）
- **记录排序**：以 `measuredAt desc + createdAt desc` 排序，不能依赖 `_id`
- **导入去重**：前端实现，按 `measuredAt`（抹平到分钟）+ `systolic` + `diastolic` 去重
- **推送 `miniprogramState`**：按 `develop / trial / release` 映射 `developer / trial / formal`

## 当前版本状态

- V1.0：已上线
- V1.1：进行中，重点是图表口径统一、异常通知授权闭环、协作与字号体验收尾
- V1.2 计划：血糖模块
