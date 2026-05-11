# 来自儿女的关心（family-care）项目状态

## 当前阶段
- 已完成：T0、T1、T2.1-T2.6、T3.1a、T3.1b、T3.2、T3.3、T4.1、T4.2a、T4.2b、T5
- 当前切入点：T6（代码中已落地双 tab + custom tabBar；数据页、档案页和共享图表仍在持续调整）
- 未开始：T6 后续子阶段待确认

## 核心模型（Path B）
- 三表核心：`users`、`profiles`、`relationships`
- 一个用户可通过 `relationships` 关联多个 `profile`
- 无“家庭”中间层，关系直接挂在用户与档案之间
- 选 Path B 而不是 Path C：没有历史用户包袱，可以直接按新模型重开

## 数据模型
- `users`：`_id/openId`、`nickname`、`avatarUrl`、`settings`、`createdAt`、`updatedAt`、`lastActiveAt`
- `profiles`：`_id`、`name`、`relation`、`gender`、`birthDate`、`note`、`emergencyContact`、`longTermMedication`、`settings.bp`、`createdBy`、`createdAt`、`updatedAt`、`deletedAt`
- `relationships`：`_id`、`userId`、`profileId`、`role`、`permissions`、`subscribeAlerts`、`createdAt`、`updatedAt`、`acceptedAt`、`invitedBy`
- `records`：`_id`、`profileId`、`type`、`measuredAt`、`payload`、`period`、`note`、`recordedBy`、`recordedByName`、`createdAt`、`updatedAt`、`deletedAt`
- `medications`：`_id`、`profileId`、`drug`、`dose`、`frequency`、`timing`、`startDate`、`endDate`、`note`、`addedBy`、`createdAt`、`updatedAt`、`deletedAt`
- `invitations`：`_id`、`token`、`status`、`profileIds`、`defaultRole`、`inviterUserId`、`inviterNickname`、`inviterAvatarUrl`、`inviteeUserId`、`message`、`expiresAt`、`createdAt`、`acceptedAt`、`revokedAt`

详细契约见 [t1-contracts.md](/Users/ella/Documents/Code/Demo/WeChatProjects/family-care-prod/docs/t1-contracts.md:1)。

## 云函数清单
- `login`：按 `OPENID` 查或建用户，返回用户、关系和已 join 的档案
- `createProfile`：创建档案，并在同一事务内创建 owner relationship
- `updateProfile`：更新档案基本资料
- `deleteProfile`：软删除档案
- `updateProfileSettings`：更新档案 `settings`
- `updateUserProfile`：更新用户昵称和头像，当前主要给邀请卡片复用
- `updateUserSettings`：更新用户级设置，当前用于字号 `fontScale`
- `saveRecord`：保存血压记录，返回 `alertTriggered/alertSentTo`，并通过 `subscribeMessage.send` best-effort 推送异常提醒
- `getRecords`：读取血压记录列表
- `updateRecord`：更新单条血压记录
- `deleteRecord`：软删除单条血压记录
- `listMedications`：按东八区“今天”把用药分为 active / historical
- `saveMedication`：创建或更新用药
- `deleteMedication`：软删除用药
- `createInvitation`：按多档案授权创建一次性邀请链接，记录邀请人快照
- `getInvitationInfo`：按 token 读取邀请详情与失效状态，不消耗使用次数
- `acceptInvitation`：事务性创建 relationship 并消耗邀请
- `updateRelationship`：更新成员角色或异常提醒订阅
- `removeRelationship`：移除成员或成员主动退出，保护最后一个 owner
- `transferOwnership`：事务性转让管理员角色
- `listProfileMembers`：返回档案成员及昵称/头像信息

云函数部署与打包约定见 [deployment-notes.md](/Users/ella/Documents/Code/Demo/WeChatProjects/family-care-prod/docs/deployment-notes.md:1)。

## 前端架构
- 应用壳层：
  - `app.json` 当前使用 `custom: true` 的自定义 `tabBar`
  - 主入口页面是 `pages/data/data`（数据 tab）和 `pages/profile-home/profile-home`（档案 tab）
  - 旧 `pages/home/home` 仍保留在路由表中，但不再是 tabBar 入口
- 当前页面结构：
  - tab 页面：`pages/data/data`、`pages/profile-home/profile-home`
  - 业务页面：`home`、`profile-edit`、`profile-threshold-edit`、`record`、`records-list`、`import-records`、`medication-edit`、`invite-create`、`invite-accept`、`profile-members`、`report`、`user-profile-edit`、`user-settings`
  - 待确认 / 骨架页：`profile-detail`、`profile-settings`
- 自定义 tabBar：
  - `custom-tab-bar/index.js`、`index.wxml`、`index.wxss`
  - 当前使用内嵌 base64 SVG 图标，不依赖 `app.json` 里列出的 PNG 才能显示
  - 中间 `+` 按钮在有当前档案且当前用户对该档案 `canWrite` 时显示
  - 在数据页点击 `+` 直接打开录入面板；在档案页点击 `+` 会先切回数据页，再通过 `app.globalData.openRecordPanelOnDataTab` 打开录入面板
- 共享组件：
  - `components/record-panel/*`：底部半屏录入 / 编辑面板，支持新建、编辑、删除血压记录；删除确认用 `wx.showModal`
  - `components/profile-switcher/*`：档案切换浮层，供数据页和档案页共用，支持带 `returnTab` 的新建档案跳转
- 全局状态：
  - `store/index.js`：手写订阅式 store，核心状态是 `user / profiles / relationships / currentProfileId / cache / lastRefreshAt / session`
  - `app.js`：登录后按本地持久化或第一个档案初始化 `currentProfileId`，并持续把 `currentProfileId` 写回本地存储
- 数据页（`pages/data/data`）：
  - 等待 `loginReady` 后再加载，并用 `pageReady` 避免冷启动 / 切档闪烁
  - 图表记录通过 `callSilent('getRecords')` 独立查询，不污染 `record-service` 的全局 records cache
  - 最近血压卡片、分析卡片、血压 / 心率图、图表导出、空态导入入口都在当前页面内
  - 当前不再在页面内直接渲染悬浮 `+` 按钮，录入入口由 custom tabBar 中央按钮承载
- 档案页（`pages/profile-home/profile-home`）：
  - 等待 `loginReady` + `pageReady` 后渲染
  - 展示档案信息、健康概览、成员横滑列表、就诊报告入口、药物管理入口、异常通知 toggle、字体大小入口、删除档案
  - 与数据页共用 `currentProfileId` 和 `profile-switcher`
- 服务层：`services/request.js`、`services/profile-service.js`、`services/record-service.js`、`services/medication-service.js`、`services/invitation-service.js`、`services/member-service.js`、`services/user-service.js`
- 当前运行中的工具文件（`utils/*.js`）：
  - 状态 / 登录：`app-login-status.js`、`profile-store.js`
  - 权限 / 协作：`permission-helpers.js`、`alert-subscription.js`、`invitation.js`
  - 血压 / 图表：`bp-status.js`、`health-rules.js`、`chart-data.js`、`canvas-charts.js`、`report-chart-renderer.js`、`report-helpers.js`、`report-data.js`、`report-canvas.js`、`report-exporter.js`
  - 记录 / 导入导出：`record-editor.js`、`record-data-transfer.js`、`csv-helpers.js`、`records-export-helpers.js`、`records-data-canvas.js`
  - 通用：`date.js`、`font-scale.js`、`error-messages.js`、`medication.js`、`profile-detail.js`
  - 目录中还存在一批 `*.guide.md` 说明文件；这些是仓库内参考文档，不是运行时代码
- T5.1 / T6 共享图表基础设施：
  - `report` 和 `data` 当前共用 `utils/report-helpers.js` 与 `utils/report-chart-renderer.js`
  - 因此时间轴、点位、阈值着色、辅助线等调整会同时影响报告页和数据页
- T5.5 数据导出导入：
  - `pages/import-records/import-records`
  - `utils/csv-helpers.js`
  - `utils/records-export-helpers.js`
  - 导入当前支持并发批量保存；导入链路会透传 `skipPush: true`
- T5.3 推送基础设施：
  - `cloudfunctions/_shared/push-helpers.js` 统一构建订阅消息 payload
  - 模板为“健康上报异常提醒”（模板 ID：`lrhxG9oawoHDyh1AFVSgiv-cQE7-qTAn87-_nzBDxCY`）
  - 当前前端只在“异常血压通知” toggle 从关闭切到开启时请求订阅授权；录入页和 `record-panel` 当前都不会主动请求订阅授权
  - 订阅消息当前仍使用 `miniprogramState: 'developer'`，上线前必须改为 `formal`
- 缓存与错误处理：
  - 仍沿用 T2.5 SWR；缓存按 `profileId` 隔离
  - T2.6 的统一错误文案映射仍在用

## 关键工程约定
- 云函数 `_shared` 源码保留在 `cloudfunctions/_shared/`，部署前通过构建脚本复制到每个函数目录
- 前端绝不引用云函数代码或 `cloudfunctions/_shared/*`
- 三层自验 gate：
  - 本地逻辑层
  - 部署单元层
  - DevTools 真实环境烟测层
- 写操作优先做本地缓存即时更新，避免整包失效带来的明显 loading 回退
- 仅在开发环境开启请求频率告警，生产环境不做额外监控输出

## 踩过的坑与教训
- T1 打包坑：微信云函数上传只打包当前函数目录，`../_shared` 在云端会失效
- T1 依赖坑：曾出现跨目录依赖（`deleteRecord` 依赖 `updateRecord`），必须改成 shared helper
- T1 运行时坑：函数目录未带 `wx-server-sdk` manifest 时，前端会看到“服务端 SDK 不可用”类报错
- T1 真实语义坑：本地 fake runtime 早期与真实云数据库行为不一致，掩盖了 `doc().get()` 和 `doc().set()` 边界问题
- T2.5 请求风暴：把 cache 写进 store 后若订阅逻辑不收敛，会触发首页循环刷新和调用量异常放大
- T4.2a 微信能力坑：`wx.getUserProfile` 在 2026 年新版微信基础库里不再稳定返回真实昵称，实际常出现 `微信用户` 占位值。邀请流程已改为 invite-create 页主动填写昵称（`input type="nickname"`）+ 可选头像（`open-type="chooseAvatar"`）。
- T4.2b 协作刷新坑：T2.5 的 SWR 缓存在协作场景下会导致 A 改 B 角色后，B 端继续读旧 relationship。修复方式是 `home / profile-members` 引入 30 秒 staleness 检测与强刷，其他页面仍保留原 SWR。
- T5.1 排序坑：微信云开发文档 `_id` 不保证单调递增，同一分钟内的血压记录排序不能依赖 `_id`；`records` 实际应以 `measuredAt desc + createdAt desc` 排序。
- T5.1 导出坑：Canvas 2D 长图导出若先按预估高度一次性绘制，真机上可能保留大块底部留白；修复方式是先测 `lastY`，再按最终导出高度二次绘制并裁切。
- T5.1 字段坑：`_createTime` 在当前手动写入 `records` 文档的链路里并不存在，真正可用的创建时间字段是 `createdAt`。
- T5.3 授权时机坑：`requestSubscribeMessage` 必须在按钮 tap 的同步链里调用，不能放到 `await saveRecord(...)` 之后；当前修复为先请求订阅，再在 `complete` 回调里继续保存。
- T5.3 touser 坑：当前数据模型里 `users._id` 就是 `OPENID`，`relationships.userId` 也直接存这个值，因此可直接作为 `subscribeMessage.send({ touser })`，无需额外查 `users` 表。
- T5.3 序列化坑：`subscribeMessage.send` 的原始返回值可能包含 `BigInt`，不能塞进 `saveRecord` 返回体或直接整包序列化；当前只记录裁剪后的日志摘要，返回体保持原契约。
- T5.3 模板字段坑：订阅消息 `thing` 类型字段上限为 20 字符，超过会直接发送失败；当前 `push-helpers` 已对档案名 + 血压提示文案做多级回退裁剪。
- T5.5 表格导出坑：Canvas 表格长图若不精确控制行高、列宽和文本对齐，真机预览里会出现表头与数据列错位；当前导出 helper 已固定表头/行高/列宽比例并统一左右对齐规则。
- T5.5 导出体验坑：图片生成后直接落相册对目标用户不够直观；当前改为先展示全屏预览，再由用户明确点击“保存到相册”。
- T5.5 导入性能坑：批量 CSV 导入若串行逐条 `saveRecord`，百条级数据会慢到接近 2 分钟；当前导入页已改为固定并发 5 的批量保存。
- T5.5 历史导入推送坑：历史数据导入如果直接复用正常 `saveRecord`，会把异常记录也当成实时告警推送；当前导入链路通过 `skipPush: true` 显式跳过推送，但仍保留 `alertTriggered` 的记录语义。
- T6.0 tabBar 分层坑：原生 tabBar 无法让中间录入按钮真正“压在 tabBar 上沿”，最终只能切到 `custom-tab-bar` 才能实现中间悬浮按钮和可控图标布局。
- T6.0 冷启动闪烁坑：数据页 / 档案页在 `login()` 完成前若直接读 store，会先渲染空态；当前两个 tab 页都必须先等待 `loginReady`，再用 `pageReady` 控制首屏渲染。
- T6.0 切档 / 建档闪烁坑：建档成功若先 `switchTab` 再更新 `currentProfileId`，数据页会先闪旧档案再切新档案；当前顺序是先更新 store 和本地持久化，再切 tab。
- T6.1 共享渲染坑：数据页和报告页共用 `report-chart-renderer.js`，任何轴刻度、点位、辅助线、阈值着色调整都会同时影响两个页面，不能只按单页思路修改。
- T6.1 90 天着色坑：先画整条蓝线再叠红线会出现异常区间里仍露蓝色的视觉误导；当前 90 天模式必须直接按段决定颜色。

## 产品决策记录
- Path B vs Path C：选 B，因为没有历史用户，可以按新模型干净重开
- 用药采用“长期用药清单”模式，不做服药打卡；避免把“计划”与“日志”两种模型混在 V1
- V1 不做 PDF 导出、不做血糖记录、不做漏服药提醒，先把血压与档案主链路跑通

## 已决定但未实施的优化
- 候选性能优化见 [future-optimizations.md](/Users/ella/Documents/Code/Demo/WeChatProjects/family-care-prod/docs/future-optimizations.md:1)
- 当前已记录：多档案首页批量查询 `getHomeSummary`，启动条件是日均调用接近免费额度 50%

## 视觉设计决策
- 视觉整体打磨推迟到 T6
- T2.6 只做产品细节与话术统一，不做颜色、字号、间距、动画层面的统一重构
