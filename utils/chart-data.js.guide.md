# `utils/chart-data.js` 阅读指南

## 1. 文件作用

这个文件负责把“原始记录数据”转换成“图表可消费的数据结构”。

它不直接画图，而是先做图表准备工作：

1. 排序记录
2. 生成横轴标签
3. 计算纵轴范围
4. 标记哪些点是异常点
5. 生成参考线数组

你可以把它理解成：

> 页面和绘图函数之间的“数据适配层”。

当前项目里有两个主要入口：

- `buildBloodPressureChart(records, refLines)`
- `buildHeartRateChart(records, refLines)`

## 2. 阅读前置

读这个文件前，最好先知道：

1. `utils/health-rules.js` 里的 `getBPStatus()` / `getHRStatus()` 怎么判断异常。
2. `pages/data/data.js` 会调用这个文件生成图表数据。
3. `utils/canvas-charts.js` 负责真正把这里产出的数据画到 canvas 上。

如果这些前置没掌握，你会容易把这个文件误解成“只是给图表起个 label”。实际上它在决定：

- 图表顺序
- 纵轴范围
- 哪些点画成异常颜色
- 参考线画在哪

## 3. 阅读重点

建议按这个顺序读：

1. `toDate`
2. `labelDate`
3. `sortRecords`
4. `roundRange`
5. `buildBloodPressureChart`
6. `buildHeartRateChart`

主线可以记成：

```text
原始 records
  ↓
按 measuredAt 升序排序
  ↓
提取数值和参考线
  ↓
计算图表范围 range
  ↓
为每条记录补 label / abnormal
  ↓
交给 canvas-charts 画图
```

## 4. 核心逻辑拆解

### 4.1 `toDate(value)`

```js
function toDate(value) {
  return value instanceof Date ? value : new Date(value)
}
```

作用很基础：

> 无论传进来的是 `Date` 还是字符串，统一转成 `Date` 处理。

这让后面排序和取月份/日期都更稳定。

---

### 4.2 `labelDate(value)`

```js
function labelDate(value) {
  const date = toDate(value)
  return `${date.getMonth() + 1}/${date.getDate()}`
}
```

这是给图表横轴用的日期标签。

例如：

```text
4/12
```

它故意不带年份，也不带时间，因为图表横轴需要短标签。

---

### 4.3 `sortRecords(records)`

```js
function sortRecords(records) {
  return [...records].sort((a, b) => toDate(a.measuredAt) - toDate(b.measuredAt))
}
```

这个函数很关键。

它把记录按时间升序排序，也就是：

- 最早的在前
- 最新的在后

为什么图表要升序，而不是像记录列表那样降序？

因为折线图 / 柱状图一般默认从左到右表示“时间越来越晚”。

所以这里的排序方向，和记录页、首页的“最新记录在前”是不同的。

这是一个非常容易混淆的点。

---

### 4.4 `roundRange(min, max, step)`

```js
function roundRange(min, max, step) {
  return {
    min: Math.floor(min / step) * step,
    max: Math.ceil(max / step) * step,
  }
}
```

这个函数的作用是把图表纵轴范围“对齐到整步长”。

比如：

- 最小值可能是 `83`
- 最大值可能是 `147`

如果 `step = 10`，就会把范围修成：

- `80`
- `150`

这样图表纵轴更整齐，不会出现奇怪的边界值。

---

### 4.5 `buildBloodPressureChart(records, refLines)`

这是本文件的第一个核心函数。

第一步，先取参考线：

```js
const refSys = (refLines && refLines.systolic) || 135
const refDia = (refLines && refLines.diastolic) || 85
```

说明血压图支持：

- 家庭自定义目标值
- 默认目标值 `135/85`

第二步，排序：

```js
const sorted = sortRecords(records)
```

第三步，取所有可能影响纵轴范围的值：

```js
const values = sorted.flatMap(record => [Number(record.systolic), Number(record.diastolic), refSys, refDia])
```

这里很值得注意：

> 图表纵轴范围不仅考虑记录值，还把参考线值也算进去。

这很合理，因为如果参考线比所有数据点更高或更低，图表也要能把参考线完整显示出来。

第四步，算纵轴范围：

```js
const range = values.length ? roundRange(Math.min(...values) - 8, Math.max(...values) + 8, 10) : { min: 60, max: 170 }
```

这里的思路是：

- 如果有数据，就在最小/最大值外再留一点边距
- 再对齐到整十
- 如果没有数据，给一个默认范围

第五步，把每条记录转换成图表点：

```js
records: sorted.map(record => {
  const bpStatus = getBPStatus(record.systolic, record.diastolic, target)
  return {
    id: record._id,
    label: labelDate(record.measuredAt),
    systolic: Number(record.systolic),
    diastolic: Number(record.diastolic),
    abnormal: Boolean(bpStatus.attention),
  }
})
```

这里每个图表点会带上：

- `label`
- `systolic`
- `diastolic`
- `abnormal`

这个 `abnormal` 很关键，因为后面绘图时会用不同颜色表示异常点。

最后返回：

```js
{
  records,
  range,
  refs: [refSys, refDia],
}
```

这就是血压图表的完整输入结构。

---

### 4.6 `buildHeartRateChart(records, refLines)`

这个函数和血压图很像，只是：

- 只有一个主数值：`heartRate`
- 参考线是一个范围：`hrMin / hrMax`

逻辑对应关系如下：

- `refMin` / `refMax`
- `getHRStatus(...)`
- `heartRate`
- `refs: [refMin, refMax]`

所以你可以把它理解成“血压版逻辑的心率版镜像”。

## 5. 小程序知识点

### 图表数据和页面数据不是一回事

页面的 `records` 往往是给列表、卡片、文案用的。

图表需要的是另一种结构，比如：

- `range`
- `refs`
- `abnormal`
- `label`

这就是为什么需要单独的 `chart-data.js`。

### 排序方向随场景不同

这个文件很适合理解一个常见误区：

- 列表通常是新到旧
- 时间图通常是旧到新

同一份记录数据，展示场景不同，排序方向也不同。

## 6. 依赖关系

### 它依赖哪些文件

- [utils/health-rules.js](/Users/ella/Documents/Code/Demo/WeChatProjects/bp-monitor-mini-program-chatgpt/utils/health-rules.js)

### 它被哪些文件使用

- [pages/data/data.js](/Users/ella/Documents/Code/Demo/WeChatProjects/bp-monitor-mini-program-chatgpt/pages/data/data.js)
- [utils/report-data.js](/Users/ella/Documents/Code/Demo/WeChatProjects/bp-monitor-mini-program-chatgpt/utils/report-data.js)
- [scripts/verify-chart-data.js](/Users/ella/Documents/Code/Demo/WeChatProjects/bp-monitor-mini-program-chatgpt/scripts/verify-chart-data.js)

它产出的数据还会被：

- [utils/canvas-charts.js](/Users/ella/Documents/Code/Demo/WeChatProjects/bp-monitor-mini-program-chatgpt/utils/canvas-charts.js)

继续消费并绘制。

## 7. 常见阅读误区

### 误区 1：以为这个文件负责画图

不是。它只负责准备数据。

### 误区 2：以为图表排序和记录列表排序一样

不是。图表这里是升序。

### 误区 3：以为纵轴范围只看记录值

不是。这里还把参考线值算进去了。

## 8. 潜在问题检查

### 问题 1：`toDate()` 没有显式校验无效日期

为什么可疑：

- 如果 `measuredAt` 是非法值，排序和 `labelDate()` 可能得到 `NaN` 相关结果。

可能影响：

- 图表点顺序异常
- 标签显示异常

建议后续验证：中优先级。

---

### 问题 2：`(refLines && refLines.xxx) || 默认值` 会把合法的 `0` 当成无效

当前项目里参考线不可能是 0，所以暂时问题不大。

但从通用写法看，这类逻辑未来容易踩坑。

建议后续验证：低优先级。

---

### 问题 3：没有过滤无效记录值，直接 `Number(...)`

为什么可疑：

- 如果某条记录字段不是合法数字，`range` 计算可能出问题。

可能影响：

- `Math.min(...values)` / `Math.max(...values)` 异常
- 图表范围不稳定

建议后续验证：中优先级。

## 9. 建议下一步阅读哪个文件

建议下一步看：

`utils/canvas-charts.js`

因为这个文件正好消费这里生成的图表结构。两者一起读，你会更容易理解“为什么这里要生成 `range / refs / abnormal / label` 这些字段”。

