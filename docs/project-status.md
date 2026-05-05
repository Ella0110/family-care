# 来自儿女的关心（family-care）项目状态

## 当前阶段
- 已完成：T0、T1、T2.1-T2.6、T3.1a、T3.1b、T3.2、T3.3、T4.1、T4.2a、T4.2b
- 当前切入点：T5（异常提醒与订阅消息）
- 未开始：T5、T6

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
- `saveRecord`：保存血压记录并返回 `alertTriggered/alertSentTo`
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
  - 已接业务：`home`、`profile-edit`、`profile-threshold-edit`、`record`、`records-list`、`medication-edit`、`invite-create`、`invite-accept`、`profile-members`、`user-profile-edit`、`user-settings`
  - 骨架待接：`profile-detail`、`profile-settings`、`report`
- 服务层：`services/request.js`、`services/profile-service.js`、`services/record-service.js`、`services/medication-service.js`、`services/invitation-service.js`、`services/user-service.js`
- 全局 store：手写轻量订阅式 store，提供 `getState / setState / subscribe`
- 缓存策略：T2.5 引入 SWR，缓存按 `profileId` 隔离，首页与记录列表先读缓存再后台刷新
- 错误处理：T2.6 引入统一错误文案映射与开发环境请求风暴告警
- 单档案首页：T3.2 升级为“档案详情页”，含档案信息卡片、阈值调整入口和危险操作区
- 用户设置：T3.3 新增字号切换和关于页，`fontScale` 支持 `1.0 / 1.15 / 1.3`
- 协作邀请：T4.1 完成邀请、接受、成员角色、管理员转让的数据层 API；T4.2a 已接通邀请发起、邀请预览、接受和分享路径，并改为 invite-create 页主动填写昵称（+ 可选头像）
- 协作前端：T4.2b 完成成员管理页、viewer/collaborator 模式 UI、退出档案、转让管理员、成员刷新策略，以及用户修改自己的邀请昵称/头像

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
