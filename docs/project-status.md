# 来自儿女的关心（family-care）项目状态

## 当前阶段
- 已完成：T0、T1、T2.1-T2.6、T3.1a、T3.1b、T3.2、T3.3、T4.1、T4.2a、T4.2b、T5.1、T5.3、T5.5
- 当前切入点：T6（T5 已收尾；T5.2 推迟到 T6 之后，依赖首页图表；T5.4 推迟到企业主体阶段，依赖长期订阅能力）
- 未开始：T6

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
- 页面：
  - 已接业务：`home`、`profile-edit`、`profile-threshold-edit`、`record`、`records-list`、`medication-edit`、`invite-create`、`invite-accept`、`profile-members`、`report`、`user-profile-edit`、`user-settings`
  - 骨架待接：`profile-detail`、`profile-settings`
- 服务层：`services/request.js`、`services/profile-service.js`、`services/record-service.js`、`services/medication-service.js`、`services/invitation-service.js`、`services/member-service.js`、`services/user-service.js`
- 报告模块：`pages/report/report`、`utils/report-helpers.js`、`utils/report-chart-renderer.js`、`utils/report-exporter.js`
- T5.5 数据导出导入：`utils/csv-helpers.js`、`utils/records-export-helpers.js`、`pages/import-records/import-records`
- T5.3 推送基础设施：`cloudfunctions/_shared/push-helpers.js` 统一构建订阅消息 payload；订阅消息模板为“健康上报异常提醒”（模板 ID：`lrhxG9oawoHDyh1AFVSgiv-cQE7-qTAn87-_nzBDxCY`）
- T5.3 订阅授权时机：录入页在点击“保存”后、真正调用 `saveRecord` 前同步请求 `wx.requestSubscribeMessage`，其 `complete` 回调再继续保存
- 全局 store：手写轻量订阅式 store，提供 `getState / setState / subscribe`
- 缓存策略：T2.5 引入 SWR，缓存按 `profileId` 隔离，首页与记录列表先读缓存再后台刷新
- T5.1 技术债：`report` 页为避免时间范围子集查询污染 `record-service` 的全局 records cache，暂时通过 `callSilent('getRecords')` 直调云函数；后续应给 records cache key 引入时间范围参数后再收敛回服务层
- T5.3 技术债：订阅消息当前使用 `miniprogramState: 'developer'`，上线前必须改为 `formal`
- 错误处理：T2.6 引入统一错误文案映射与开发环境请求风暴告警
- 单档案首页：T3.2 升级为“档案详情页”，含档案信息卡片、阈值调整入口和危险操作区
- 用户设置：T3.3 新增字号切换和关于页，`fontScale` 支持 `1.0 / 1.15 / 1.3`
- 协作邀请：T4.1 完成邀请、接受、成员角色、管理员转让的数据层 API；T4.2a 已接通邀请发起、邀请预览、接受和分享路径，并改为 invite-create 页主动填写昵称（+ 可选头像）
- 协作前端：T4.2b 完成成员管理页、viewer/collaborator 模式 UI、退出档案、转让管理员、成员刷新策略，以及用户修改自己的邀请昵称/头像
- T5.1 报告导出：完成报告页渲染、7/30/90 天图表、长图导出、保存到相册、权限挽回与隐私脱敏

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
