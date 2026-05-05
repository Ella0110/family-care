# Deployment Notes

## Cloud Function Packaging

微信云函数上传时只打包当前函数目录，不会自动带上 `../_shared` 之类的父级相对路径依赖。

当前项目采用构建复制方案：

- 共享源码保留在 `cloudfunctions/_shared/`
- 部署前运行 `npm run build:functions`
- 构建脚本会把 `cloudfunctions/_shared/` 复制到每个云函数目录下的 `./_shared/`
- 构建脚本会为每个云函数目录生成或更新 `package.json`
- 每个云函数目录都必须声明统一版本的 `wx-server-sdk@3.0.1`
- 云函数源码统一使用 `require('./_shared/xxx')`

生成的 `cloudfunctions/*/_shared/` 是部署产物，已加入 `.gitignore`，不提交到 git。

## T4 Invitations Schema Note

T4 阶段对 `invitations` 的业务 schema 做了扩展：

- `status`
- `profileIds`
- `defaultRole`
- `inviterNickname`
- `inviterAvatarUrl`
- `inviteeUserId`
- `message`
- `acceptedAt`
- `revokedAt`

集合本身不需要重建，但如果你有手工维护的测试数据，请按新字段补齐。

## Deploy Steps

每次修改以下任一内容后，都应重新执行构建再上传云函数：

- `cloudfunctions/_shared/*`
- 9 个 T1 云函数中的任意 `index.js` / `handler.js`
- 任意云函数目录内的 `package.json`

部署步骤：

1. 在项目根目录执行 `npm run build:functions`
2. 确认每个函数目录下都已生成 `./_shared/`
3. 确认每个函数目录下都存在 `package.json`，且声明了 `wx-server-sdk@3.0.1`
4. 在微信开发者工具中按本次改动范围重新上传相关云函数。

   云函数清单见 [project-status.md](docs/project-status.md) 的“云函数清单”小节。

   判断哪些函数需要重新上传的规则：
   - 改了 `cloudfunctions/_shared/*` → 所有云函数都受影响，必须全部重新构建并上传（共享代码会被打包进每个函数目录）
   - 改了某个函数自己的 `handler.js` / `index.js` / `package.json` → 只重新上传该函数
   - 改了某个共享层文件但只有部分函数引用 → 保险起见，仍然全部重新上传，避免部分函数残留旧 `_shared` 副本
5. 上传完成后，在“云开发控制台 -> 云函数 -> 云端测试”中重新执行手动测试

## Local Verification

本地 `scripts/verify-*.js` 依赖函数目录内的 `./_shared/` 构建产物。

当前处理方式：

- `scripts/verify-login.js`
- `scripts/verify-profile-crud.js`
- `scripts/verify-record-crud.js`
- `scripts/verify-permission.js`
- `scripts/verify-cloudfunction-manifests.js`
- `scripts/verify-cloudfunction-isolation.js`

都会在启动时自动执行一次 `scripts/build-cloudfunctions.js`，确保本地验证可直接运行。

如果只想单独生成构建产物，不跑验证，直接执行：

```bash
npm run build:functions
```

如果只想单独检查部署单元是否完整，执行：

```bash
npm run verify:functions:manifests
npm run verify:functions:isolation
```

## Three Verification Gates

### 1. 本地逻辑层

目标：验证业务逻辑和纯函数行为。

执行方式：

- `node scripts/verify-login.js`
- `node scripts/verify-profile-crud.js`
- `node scripts/verify-record-crud.js`
- `node scripts/verify-permission.js`

### 2. 部署单元层

目标：验证“上传单个云函数目录”这一真实部署单元是否完整。

执行方式：

- `npm run build:functions`
- `npm run verify:functions:manifests`
- `npm run verify:functions:isolation`

通过标准：

- 每个云函数目录都存在 `package.json`
- 每个 `package.json` 都声明统一版本的 `wx-server-sdk`
- 每个函数目录在隔离场景下都能成功 `require('./index.js')`

### 3. 真实环境烟测层

目标：验证前端、云函数、数据库在微信开发者工具里的真实联通性。

说明：

- 这一层无法由 Codex 在当前环境独立完成，必须采用人机协作 gate
- 只要改动触及 `cloudfunctions/**`、`services/request.js`、`app.js`、首次接云函数的前端页面，就必须执行
- Codex 交付时必须同时给出一份 DevTools 烟测步骤清单
- 用户在 DevTools 跑通烟测步骤后，才算该阶段真实验收通过

## 交付流程

T2 及以后，以下改动不能只靠本地脚本通过就宣布完成：

- `cloudfunctions/**`
- `services/request.js`
- `app.js`
- 首次接入云函数的前端页面

协作契约：

1. Codex 先完成本地逻辑层和部署单元层自验
2. Codex 在交付时必须附上 DevTools 烟测步骤清单
3. 用户在 DevTools 完成烟测并反馈结果
4. 只有在烟测通过后，才算该轮交付完成
