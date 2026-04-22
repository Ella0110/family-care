# `utils/date.js` 阅读指南

## 1. 文件作用

这个文件是项目里的“日期时间基础工具”。

它主要负责：

1. 时间格式化：`formatDateTime`、`formatTime`
2. 表单时间转换：`formatInputDateTime`、`parseInputDateTime`
3. 时间范围计算：`daysAgo`
4. 记录按日期分组：`groupByDate`

它虽然代码不长，但几乎贯穿整个项目：

- 数据页
- 记录页
- 添加记录页
- 报告页
- 家庭页

所以它是一个很适合新手尽早读懂的“项目通用工具层”文件。

## 2. 阅读前置

读这个文件前，最好先知道：

1. 记录里的 `measuredAt` 在不同位置可能是：
   - `Date`
   - ISO 字符串
2. 页面展示时间和提交给后端的时间格式不一样。
3. `getRecords` 云函数的 `since` 参数就是靠 `daysAgo(days).toISOString()` 生成的。

如果这些前置没理清，你会容易觉得这个文件只是“简单格式化字符串”。实际上它承担了项目里很多时间格式兼容和查询边界逻辑。

## 3. 阅读重点

建议按这个顺序读：

1. `toDate`
2. `formatDateTime` / `formatTime`
3. `formatInputDateTime` / `parseInputDateTime`
4. `daysAgo`
5. `groupByDate`

这条主线最重要：

```text
后端时间 / 记录时间
  ↓
toDate
  ↓
页面展示格式 或 表单格式
  ↓
查询周期 / 日期分组
```

## 4. 核心逻辑拆解

### 4.1 `pad(n)`

```js
function pad(n) {
  return String(n).padStart(2, '0')
}
```

这个函数很基础，就是把 `8` 变成 `08`。

它在这里的作用是统一时间格式，让：

- 小时
- 分钟
- 月 / 日（某些格式里）

保持两位数显示。

---

### 4.2 `toDate(value)`

```js
function toDate(value) {
  if (value instanceof Date) return value
  return new Date(value)
}
```

这是这个文件最基础、也最重要的入口函数。

它的意义是：

> 不管传进来的是 Date 还是字符串，先统一转成 Date 对象再处理。

这样后面其他函数就不用每个都重复写：

```js
new Date(...)
```

---

### 4.3 `formatDateTime(value)`

```js
function formatDateTime(value) {
  const date = toDate(value)
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
```

这是给页面展示“完整时间”的函数。

格式大致是：

```text
2026/4/21 08:30
```

它常用于：

- 首页最新记录时间
- 家庭页最新记录时间
- 报告里显示时间

这里要注意：

> 它是“展示格式”，不是“提交给后端的格式”。

---

### 4.4 `formatTime(value)`

```js
function formatTime(value) {
  const date = toDate(value)
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}
```

这个是更短的时间格式，只显示：

```text
08:30
```

它常用于记录页这种已经按日期分组的场景，因为日期已经在分组标题里了，不需要每条记录重复显示完整年月日。

---

### 4.5 `formatInputDateTime(value)`

```js
function formatInputDateTime(value) {
  const date = value ? toDate(value) : new Date()
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
```

这个函数是给表单输入框用的。

格式类似：

```text
2026-04-21 08:30
```

为什么又要多一种格式？

因为输入框通常更适合这种：

- 年月日固定两位
- 结构规整
- 方便用户编辑

所以这个函数属于“表单展示格式”。

---

### 4.6 `parseInputDateTime(value)`

```js
function parseInputDateTime(value) {
  const normalized = String(value || '').replace(' ', 'T')
  return new Date(normalized)
}
```

它和 `formatInputDateTime` 是一对：

- `formatInputDateTime`：把 Date 转成输入框文本
- `parseInputDateTime`：把输入框文本转回 Date

这里用了一个小技巧：

```js
replace(' ', 'T')
```

把：

```text
2026-04-21 08:30
```

变成：

```text
2026-04-21T08:30
```

这样 `new Date(...)` 更容易识别。

---

### 4.7 `daysAgo(days)`

```js
function daysAgo(days) {
  const date = new Date()
  date.setDate(date.getDate() - days + 1)
  date.setHours(0, 0, 0, 0)
  return date
}
```

这个函数是项目里“查询最近 N 天”的核心工具。

它不是简单地“减去 N 天”，而是：

1. 把日期减到目标天数
2. 再把时间设到当天 00:00:00

这里 `- days + 1` 很值得注意。

比如今天是 4 月 21 日：

- `daysAgo(7)` 得到的是 4 月 15 日 00:00

这说明当前项目对“最近 7 天”的理解更接近：

> 包含今天在内的 7 个自然日

这不是唯一合理的定义，但它是当前项目明确采用的定义。

---

### 4.8 `groupByDate(records)`

这是记录页分组的核心函数。

先遍历所有记录：

```js
records.forEach(record => {
  const date = toDate(record.measuredAt)
  const key = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  if (!groups[key]) groups[key] = []
  groups[key].push(record)
})
```

意思是：

> 以“年-月-日”为 key，把同一天的记录放进同一个桶里。

然后再把 key 排序：

```js
Object.keys(groups)
  .sort((a, b) => b.localeCompare(a))
```

因为 key 采用 `YYYY-MM-DD`，所以字符串排序也能得到正确时间顺序。

最后每个组内再按 `measuredAt` 倒序排序：

```js
items: groups[date].sort((a, b) => new Date(b.measuredAt) - new Date(a.measuredAt))
```

所以最终结果是：

- 日期组从新到旧
- 每组内记录也从新到旧

这正好符合记录页的展示需求。

## 5. 小程序知识点

### 展示格式和传输格式分离

这个文件很适合理解一个前端基础概念：

- 页面展示时间不一定等于后端传输时间
- 表单输入时间也不一定等于展示时间

### “最近 N 天”不是绝对自然语言，而是产品定义

`daysAgo(days)` 体现了这一点。产品需要先定义“最近 7 天”到底怎么算。

### 日期分组是展示层逻辑

`groupByDate()` 明显是为记录页 UI 服务的，不是数据库查询逻辑。

## 6. 依赖关系

### 它依赖哪些文件

- 无项目内依赖，是比较独立的基础工具文件。

### 它被哪些文件使用

- [pages/data/data.js](/Users/ella/Documents/Code/Demo/WeChatProjects/bp-monitor-mini-program-chatgpt/pages/data/data.js)
- [pages/add-record/add-record.js](/Users/ella/Documents/Code/Demo/WeChatProjects/bp-monitor-mini-program-chatgpt/pages/add-record/add-record.js)
- [pages/records/records.js](/Users/ella/Documents/Code/Demo/WeChatProjects/bp-monitor-mini-program-chatgpt/pages/records/records.js)
- [pages/report/report.js](/Users/ella/Documents/Code/Demo/WeChatProjects/bp-monitor-mini-program-chatgpt/pages/report/report.js)
- [pages/family/family.js](/Users/ella/Documents/Code/Demo/WeChatProjects/bp-monitor-mini-program-chatgpt/pages/family/family.js)
- [utils/report-data.js](/Users/ella/Documents/Code/Demo/WeChatProjects/bp-monitor-mini-program-chatgpt/utils/report-data.js)

## 7. 常见阅读误区

### 误区 1：以为所有格式化函数都只是“换个字符串样子”

不是。它们服务的场景不同：

- 页面展示
- 表单输入
- 查询时间范围
- 分组展示

### 误区 2：以为 `daysAgo(7)` 就是“当前时刻往前 7*24 小时”

不是。这里是按自然日边界算的。

### 误区 3：以为 `groupByDate()` 只负责分组，不负责排序

不是。它还负责：

- 日期组排序
- 组内记录排序

## 8. 潜在问题检查

### 问题 1：`toDate()` 和 `parseInputDateTime()` 都没有显式校验无效日期

为什么可疑：

- `new Date(...)` 可能生成 `Invalid Date`
- 当前很多格式化函数直接继续调用 `getFullYear()` / `getHours()`

可能影响：

- 页面显示出 `NaN/NaN/NaN`
- 提交时 `toISOString()` 抛错

建议后续验证：高优先级。

---

### 问题 2：`daysAgo(days)` 的 `- days + 1` 逻辑容易让维护者误解

为什么可疑：

- 它是有业务意图的，但代码里没有注释解释。

可能影响：

- 后续有人改“最近 7 天”逻辑时容易改错。

建议后续验证：中优先级。

---

### 问题 3：`groupByDate()` 使用本地时区分组，和后端 UTC / ISO 时间可能有时区边界差异

为什么可疑：

- `new Date(iso)` 后用本地时区取年月日
- 如果以后时区策略更复杂，分组边界可能和预期不同

可能影响：

- 某些跨时区记录被分到前一天或后一天

建议后续验证：中优先级。

## 9. 建议下一步阅读哪个文件

建议下一步看：

`utils/family-settings.js`

因为它和 `date.js` 一样都是“基础工具层”，但它更直接连接家庭页、设置页和 `updateFamilySettings` 云函数。

