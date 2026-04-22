# `utils/report-data.js` 阅读指南

## 1. 文件作用

这个文件负责把“家庭资料 + 记录列表 + 规则结果 + 图表数据”组合成一个完整报告对象。

它的核心函数是：

```js
buildReportData({ family, records, period, generatedAt })
```

你可以把它理解成：

> 报告页的数据总装配器。

它不是页面，也不画图，但它决定了报告页和导出报告最终看到的内容结构。

## 2. 阅读前置

读这个文件前，最好先知道：

1. `utils/health-rules.js` 负责状态和统计。
2. `utils/chart-data.js` 负责图表数据。
3. `utils/date.js` 负责时间展示。
4. `utils/family-settings.js` 里的 `calcAge()` 用来计算年龄。

如果这些前置没掌握，你会觉得这个文件只是把对象拼一拼。其实它是把多个工具层的结果整合成“报告视图模型”。

## 3. 阅读重点

建议按这个顺序读：

1. `periodTitle`
2. `buildRefLines`
3. `buildRefLineText`
4. `buildRecentRecords`
5. `buildReportData`

主线是：

```text
family + records
  ↓
整理参考线
  ↓
整理最近记录
  ↓
计算 avg / stats / charts
  ↓
打包成 report 对象
```

## 4. 核心逻辑拆解

### 4.1 顶部依赖

```js
const { calcAverage, countReferenceStats, getBPStatus, getHRStatus } = require('./health-rules')
const { formatDateTime } = require('./date')
const { buildBloodPressureChart, buildHeartRateChart } = require('./chart-data')
const { calcAge } = require('./family-settings')
```

这说明这个文件不是自己重复发明规则，而是专门做“整合”：

- 状态和统计来自 `health-rules`
- 时间展示来自 `date`
- 图表结构来自 `chart-data`
- 年龄来自 `family-settings`

所以它很像一层“聚合层”。

---

### 4.2 `periodTitle(period)`

```js
function periodTitle(period) {
  return `近${String(period || '30天').replace('天', '')}天`
}
```

这个函数把：

- `7天`
- `30天`
- `90天`

转成：

- `近7天`
- `近30天`
- `近90天`

这是一个非常典型的“文案转换层”，不是业务规则，只是为了报告标题更自然。

---

### 4.3 `sortDesc(records)`

```js
return [...records].sort((a, b) => toDate(b.measuredAt) - toDate(a.measuredAt))
```

这个函数和 `chart-data.js` 里的升序排序不同。

这里是降序，因为“最近记录列表”要把最新的放前面。

这再次说明：

> 同一份原始记录，在不同展示场景下，排序方向可以不同。

---

### 4.4 `buildRefLines(profile)`

```js
return {
  systolic: profile.targetSystolic || 135,
  diastolic: profile.targetDiastolic || 85,
  hrMin: profile.targetHRMin || 60,
  hrMax: profile.targetHRMax || 80,
}
```

这个函数负责把家庭档案里的目标值收敛成一套参考线配置。

这套参考线后面会同时被：

- 图表
- 状态判断
- 报告文字

一起使用。

也就是说，它在这里充当的是“报告全局参考线”。

---

### 4.5 `buildRefLineText(profile)`

```js
const isDefault = r.systolic === 135 && r.diastolic === 85 && r.hrMin === 60 && r.hrMax === 80
return `参考线：血压 ${r.systolic}/${r.diastolic} mmHg，心率 ${r.hrMin}–${r.hrMax} 次/分（${isDefault ? '默认' : '自定义'}）`
```

这个函数的作用是把参考线变成一行人类可读文字。

非常典型的“从结构化数据 -> 报告文案”的转换。

---

### 4.6 `buildRecentRecords(records, profile)`

这个函数负责构造报告里的“最近记录列表”。

流程是：

1. 先按时间倒序
2. 最多取 10 条
3. 对每条记录计算血压 / 心率状态
4. 组装成适合报告展示的对象

关键代码：

```js
return sortDesc(records).slice(0, 10).map(record => {
  const bpStatus = getBPStatus(record.systolic, record.diastolic, bpTarget)
  const hrStatus = getHRStatus(record.heartRate, hrTarget)
  return {
    id: record._id,
    time: formatDateTime(record.measuredAt),
    bpText: `${record.systolic}/${record.diastolic} mmHg`,
    heartRateText: `${record.heartRate} bpm`,
    bpStatus: bpStatus.label,
    hrStatus: hrStatus.label,
  }
})
```

注意这里不是直接保留原始字段，而是把它们转成更适合报告的“展示文本字段”：

- `time`
- `bpText`
- `heartRateText`
- `bpStatus`
- `hrStatus`

这就是典型的“报告视图模型”。

---

### 4.7 `buildReportData(...)`

这是整个文件的核心。

先拿输入：

```js
const safeRecords = records || []
const profile = family.profile || {}
const refLines = buildRefLines(profile)
```

然后做一个很重要的转换：

```js
const rawRecords = [...safeRecords].sort((a, b) => new Date(a.measuredAt) - new Date(b.measuredAt))
```

这里的 `rawRecords` 是升序的，因为后面趋势图更适合时间从旧到新。

接着计算年龄：

```js
const age = profile.birthYear ? calcAge(profile.birthYear) : null
```

最后返回一个大对象：

```js
return {
  title: REPORT_TITLE,
  familyName: family.displayName || '家庭健康记录',
  profileName: profile.name || '未设置',
  profileAge: age && age !== '--' ? `${age}岁` : '',
  ...
  totalCount: safeRecords.length,
  stats: countReferenceStats(safeRecords, profile),
  avg: calcAverage(safeRecords),
  bpChart: buildBloodPressureChart(safeRecords, refLines),
  hrChart: buildHeartRateChart(safeRecords, refLines),
  recentRecords: buildRecentRecords(safeRecords, profile),
  rawRecords,
  refLines,
  refLineText: buildRefLineText(profile),
  disclaimer: DISCLAIMER,
}
```

这个返回值可以理解成一份“前端报告 DTO”：

- 页面展示直接用
- 导出图片也直接用

也就是说：

> 报告页和报告导出共用同一份 report 数据结构。

## 5. 小程序知识点

### 视图模型 / DTO 思维

这个文件特别适合理解：

> 不要让页面直接消费数据库原始数据，而是先拼出更适合页面和导出的对象。

### 同一份数据服务多个消费者

这里的 `report` 同时服务：

- 报告页 UI
- 报告导出图片

这比两个地方各自重新算一套逻辑更好。

## 6. 依赖关系

### 它依赖哪些文件

- [utils/health-rules.js](/Users/ella/Documents/Code/Demo/WeChatProjects/bp-monitor-mini-program-chatgpt/utils/health-rules.js)
- [utils/date.js](/Users/ella/Documents/Code/Demo/WeChatProjects/bp-monitor-mini-program-chatgpt/utils/date.js)
- [utils/chart-data.js](/Users/ella/Documents/Code/Demo/WeChatProjects/bp-monitor-mini-program-chatgpt/utils/chart-data.js)
- [utils/family-settings.js](/Users/ella/Documents/Code/Demo/WeChatProjects/bp-monitor-mini-program-chatgpt/utils/family-settings.js)

### 它被哪些文件使用

- [pages/report/report.js](/Users/ella/Documents/Code/Demo/WeChatProjects/bp-monitor-mini-program-chatgpt/pages/report/report.js)
- [scripts/verify-report-data.js](/Users/ella/Documents/Code/Demo/WeChatProjects/bp-monitor-mini-program-chatgpt/scripts/verify-report-data.js)

它产出的 `report` 结构还会被：

- [utils/report-canvas.js](/Users/ella/Documents/Code/Demo/WeChatProjects/bp-monitor-mini-program-chatgpt/utils/report-canvas.js)

间接消费。

## 7. 常见阅读误区

### 误区 1：以为 `buildReportData()` 只是把字段拷贝一下

不是。它做了：

- 统计
- 平均值
- 图表数据构造
- 最近记录整理
- 文案拼接

### 误区 2：以为 `rawRecords` 和 `recentRecords` 是重复数据

不是。它们服务的用途不同：

- `rawRecords`：给图表 / 风险摘要用，升序
- `recentRecords`：给列表展示用，降序且最多 10 条

### 误区 3：以为参考线只影响图表

不是。它还影响：

- 状态判断
- 报告文案
- 最近记录的状态 label

## 8. 潜在问题检查

### 问题 1：`buildRefLines(profile)` 里的 `profile.targetXxx || 默认值` 同样存在“0 会被吞掉”的写法问题

当前业务里参考线不可能是 0，所以暂时问题不大。

建议后续验证：低优先级。

---

### 问题 2：`new Date(a.measuredAt)` 没有显式无效日期保护

为什么可疑：

- 如果记录里时间格式异常，排序、图表和最近记录都可能受影响。

可能影响：

- 报告顺序异常
- 某些字段显示不稳定

建议后续验证：中优先级。

---

### 问题 3：报告状态规则在这里、页面层和导出层之间存在分散风险

严格说，这个文件已经尽量集中聚合了，但项目里仍然有：

- `pages/report/report.js` 的 `_calcStatusInfo`
- `utils/report-canvas.js` 的 `worstLevel()/statusPalette()`

为什么可疑：

- 如果以后修改“整体风险等级”规则，多个地方都要同步改。

可能影响：

- 页面和导出图状态文案不一致

建议后续验证：高优先级。

## 9. 建议下一步阅读哪个文件

这一批读完后，最适合继续的是：

`utils/report-canvas.js`

因为它正好消费这里产出的 `report` 对象，把它变成完整报告图片。这样你就能把“报告数据 -> 报告导出”这条线彻底补完。

