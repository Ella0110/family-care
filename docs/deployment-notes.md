# Deployment Notes

## Cloud Function Packaging

微信云函数上传时只打包当前函数目录，不会自动带上 `../_shared` 之类的父级相对路径依赖。

当前项目采用构建复制方案：

- 共享源码保留在 `cloudfunctions/_shared/`
- 部署前运行 `npm run build:functions`
- 构建脚本会把 `cloudfunctions/_shared/` 复制到每个云函数目录下的 `./_shared/`
- 云函数源码统一使用 `require('./_shared/xxx')`

生成的 `cloudfunctions/*/_shared/` 是部署产物，已加入 `.gitignore`，不提交到 git。

## Deploy Steps

每次修改以下任一内容后，都应重新执行构建再上传云函数：

- `cloudfunctions/_shared/*`
- 9 个 T1 云函数中的任意 `index.js` / `handler.js`

部署步骤：

1. 在项目根目录执行 `npm run build:functions`
2. 确认每个函数目录下都已生成 `./_shared/`
3. 在微信开发者工具中重新上传以下 9 个云函数：
   - `login`
   - `createProfile`
   - `updateProfile`
   - `deleteProfile`
   - `updateProfileSettings`
   - `saveRecord`
   - `getRecords`
   - `updateRecord`
   - `deleteRecord`
4. 上传完成后，在“云开发控制台 -> 云函数 -> 云端测试”中重新执行手动测试

## Local Verification

本地 `scripts/verify-*.js` 依赖函数目录内的 `./_shared/` 构建产物。

当前处理方式：

- `scripts/verify-login.js`
- `scripts/verify-profile-crud.js`
- `scripts/verify-record-crud.js`
- `scripts/verify-permission.js`
- `scripts/verify-cloudfunction-isolation.js`

都会在启动时自动执行一次 `scripts/build-cloudfunctions.js`，确保本地验证可直接运行。

如果只想单独生成构建产物，不跑验证，直接执行：

```bash
npm run build:functions
```
