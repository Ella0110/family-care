# T1 Contracts

本文档记录 T1 阶段已经确认的后端契约。后续阶段继续实现相关云函数时，默认遵循这里的规则，除非产品决策另行更新。

## Blood Pressure Settings Contract

`profiles.settings.bp.threshold` 与 `profiles.settings.bp.referenceLines` 是两个独立字段：

- `threshold` 用于异常告警判断
- `referenceLines` 用于图表绘制

T1 默认值如下：

```json
{
  "threshold": {
    "systolic": 140,
    "diastolic": 90
  },
  "referenceLines": {
    "systolic": {
      "normal": 120,
      "elevated": 140,
      "high": 160
    },
    "diastolic": {
      "normal": 80,
      "elevated": 90,
      "high": 100
    }
  }
}
```

约束：

- 初始默认值中，`threshold.systolic/diastolic` 分别等于 `referenceLines.systolic.elevated` 与 `referenceLines.diastolic.elevated`
- 用户后续可以分别调整 `threshold` 与 `referenceLines`
- 业务代码不得把二者视为同一个字段，也不得互相覆盖

## measuredAt Contract

`saveRecord`、`updateRecord`、`getRecords` 的时间参数统一遵循以下规则：

- 接受毫秒时间戳 `number`
- 接受可被 `new Date(value)` 正确解析的 ISO 字符串 `string`
- 其他类型返回 `INVALID_ARGUMENT`

校验规则：

- `number` 必须在 `946684800000`（2000-01-01T00:00:00.000Z）到 `Date.now() + 5 分钟` 之间
- `string` 必须能被正确解析，且解析后时间不得超过当前时间 5 分钟

落库规则：

- 内部统一转换为 `Date` 对象后再写入数据库
- `saveRecord.measuredAt`
- `updateRecord.patch.measuredAt`
- `getRecords.since`
- `getRecords.until`

都必须复用同一套共享 helper 逻辑，避免出现不同入口校验不一致。

## Record Type Contract

T1 阶段只实现 `type = 'bp'`。

处理规则：

- 不传 `type`：默认 `'bp'`
- `type = 'bp'`：正常处理
- `type = 'glucose'`：返回 `NOT_IMPLEMENTED`
- 其他值：返回 `INVALID_ARGUMENT`

错误码约定：

```json
{
  "code": "NOT_IMPLEMENTED",
  "message": "glucose recording is planned but not yet implemented"
}
```

```json
{
  "code": "INVALID_ARGUMENT",
  "message": "type must be one of: bp, glucose"
}
```

`saveRecord` 与 `getRecords` 都要遵循这个规则，方便前端区分“未来会支持”和“参数就是错的”。

## Legacy Utility Note

`utils/health-rules.js` 当前仍保持原样，不做修改。

已确认的差异：

- 旧 util 的默认目标值是 `135/85`
- 后端契约默认阈值是 `140/90`
- 后端契约还单独定义了 `referenceLines.normal = 120/80` 与 `referenceLines.high = 160/100`

结论：

- 后端契约以 `140/90 + referenceLines` 为准
- 旧 util 仍保留，调用方需适配
- 后续前端页面或报表逻辑如果复用 `utils/health-rules.js`，必须显式映射到新契约，不能直接把 util 的默认值当成后端阈值

## 数据库初始化方式

本地初始化与 CI/CD 自动化部署均使用 `scripts/init-db.js`。所需凭据：

- `TCB_ENV_ID`：云开发环境 ID
- `TENCENTCLOUD_SECRET_ID / TENCENTCLOUD_SECRET_KEY`：建议使用 CAM 子账号密钥，授权策略 `QcloudTCBFullAccess`，不要使用主账号密钥

本地开发通过 `.env` 注入密钥类环境变量；`TCB_ENV_ID` 可直接从环境变量读取，未提供时回退到 `local.config.js`（该文件在 `.gitignore` 中）。CI/CD 环境统一从环境变量读取。

密钥安全约定：

- 绝不提交 `local.config.js` 到 git
- 绝不提交 `.env` 到 git
- CI/CD 环境使用 Secret 变量存储
- 定期轮换（3-6 个月）
- 泄露后立即在 CAM 控制台禁用
