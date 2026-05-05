# T4 协作邀请契约

## 邀请基本规则
- 邀请有效期：7 天
- 单链接使用次数：1 次（一次性）
- 默认角色：viewer（只读）
- 角色升级路径：owner 在成员管理页可手动调整成员角色

## 角色与权限矩阵
| 操作 | owner | collaborator | viewer |
|------|-------|--------------|--------|
| 查看档案 | ✓ | ✓ | ✓ |
| 录入血压 | ✓ | ✓ | ✗ |
| 编辑/删除自己录入的血压 | ✓ | ✓ | ✗ |
| 编辑/删除任意人录入的血压 | ✓ | ✗ | ✗ |
| 添加/编辑/删除用药 | ✓ | ✓ | ✗ |
| 编辑档案信息 | ✓ | ✗ | ✗ |
| 调整档案阈值 | ✓ | ✗ | ✗ |
| 删除档案 | ✓ | ✗ | ✗ |
| 邀请其他人 | ✓ | ✗ | ✗ |
| 移除成员 | ✓ | ✗ | 仅自己退出 |
| 调整成员角色 | ✓ | ✗ | ✗ |
| 转让 owner | ✓ | ✗ | ✗ |
| 接收异常推送（T5） | ✓ | ✓ | 默认订阅 |

## 邀请流程契约
1. 邀请人在 `invite-create` 页填写昵称，并可选选择头像；如果已经填过，下次自动复用
2. 邀请人调 `updateUserProfile` 同步 `users.nickname / users.avatarUrl`，再调 `createInvitation`
3. 邀请人调 `createInvitation`，传 `profileIds`（默认勾选当前档案，可多选）和默认角色（默认 viewer）
4. 服务端生成 invitation 记录（含 token、过期时间、profileIds、role），返回邀请信息
5. 前端通过 `wx.shareAppMessage` 分享邀请卡片，路径携带 token
6. 被邀请人点开卡片 → 小程序冷启动到 `invite-accept` 页 → token 从 query 拿
7. 调 `getInvitationInfo` 展示邀请详情（不消耗使用次数）
8. 用户点接受 → 调 `acceptInvitation` → 创建对应 relationship 记录
9. 一次性邀请：`acceptInvitation` 后 token 失效

实现约定：
- 邀请人昵称会长期复用。第一次填写后，后续邀请默认显示当前昵称和头像，并提供“修改”入口
- 头像是可选项；未选择头像时，邀请卡片前端显示默认灰色头像或昵称首字
- `微信用户` 是占位昵称，前后端都视为无效，不允许用这个值生成邀请

## 关键约束
- 邀请人不能邀请自己（被邀请的 user 必须 != 邀请人 user）
- 邀请人对 profileIds 中的每一个都必须有 canInvite 权限
- 邀请失效原因（service 层区分）：过期、已使用、被撤销
- 一个用户对同一个 profile 不能有多条 active relationship（acceptInvitation 时如果已存在 relationship，应返回 ALREADY_MEMBER）

## 缓存与刷新策略
- `home` 页和 `profile-members` 页加入 30 秒 staleness 检测
- 协作相关数据（`profiles / relationships / members`）超过 30 秒未刷新会触发强刷
- 其他业务数据（`records / medications`）继续维持 T2.5 的 SWR 模式

## 通知开关位置
- 异常通知开关放在档案详情页的“高级设置”区
- 仅 collaborator / viewer 可见和操作，owner 默认始终接收
- 调整后立即调用 `updateRelationship` 同步到云端
