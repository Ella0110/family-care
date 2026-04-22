# `utils/canvas-charts.js` 阅读指南

## 1. 文件作用

这个文件负责“真正把图表画到 canvas 上”。

它不是业务规则文件，也不是页面文件，而是绘图层工具。

主要提供两个公开函数：

1. `drawBloodPressureChart(ctx, chart, width, height, options)`
2. `drawHeartRateChart(ctx, chart, width, height, options)`

可以把它理解成：

> 图表渲染引擎。

`utils/chart-data.js` 负责准备图表数据，这个文件负责用那些数据画出线、柱、参考线、标签和图例。

## 2. 阅读前置

读这个文件前，最好先知道：

1. `utils/chart-data.js` 生成的 `chart` 对象长什么样。
2. 小程序 canvas 会传入 `ctx` 绘图上下文。
3. 页面里通常会先设置 canvas 尺寸和 `dpr`，再调用这里的函数。

如果这些前置没理解，你会容易觉得这个文件是一大堆“画线指令”，看不出结构。

## 3. 阅读重点

建议按这个顺序读：

1. `COLORS`
2. `setFill / setStroke / setLineWidth / setFontSize / setLineDash`
3. `valueToY` / `pointX`
4. `drawGrid`
5. `drawLine`
6. `drawBloodPressureChart`
7. `drawHeartRateChart`

这条主线最重要：

```text
chart-data.js 生成好的图表数据
  ↓
换算坐标 (valueToY / pointX)
  ↓
画背景和网格
  ↓
画参考线
  ↓
画折线或柱子
  ↓
画标签和图例
```

## 4. 核心逻辑拆解

### 4.1 `COLORS`

```js
const COLORS = {
  systolic: '#3182F7',
  diastolic: '#2FB67C',
  heartRate: '#FF9500',
  abnormal: '#E53935',
  ...
}
```

这是图表绘图用的颜色配置。

你可以把它理解成这个文件的“视觉主题变量”。

这样做的好处是：

- 改颜色时集中修改
- 绘图函数本身不需要到处写硬编码颜色

---

### 4.2 一组 `setXxx` 包装函数

比如：

```js
function setFill(ctx, color) {
  if (ctx.setFillStyle) ctx.setFillStyle(color)
  else ctx.fillStyle = color
}
```

这些函数的作用是兼容不同 canvas 上下文 API。

比如：

- 有些环境是 `ctx.setFillStyle(...)`
- 有些环境直接写 `ctx.fillStyle = ...`

所以这组函数的意义不是“多此一举”，而是：

> 把底层差异收口，让后面的绘图代码更统一。

---

### 4.3 `clear()` 和 `drawChartArea()`

`clear()`：

```js
function clear(ctx, width, height) {
  ctx.clearRect(0, 0, width, height)
  setFill(ctx, COLORS.background)
  ctx.fillRect(0, 0, width, height)
}
```

虽然本文件最终更常用的是 `drawChartArea()`，但 `clear()` 说明了基本思路：

- 先清空
- 再铺白底

`drawChartArea()` 更关键：

```js
function drawChartArea(ctx, width, height, options, draw) {
  const x = options.x || 0
  const y = options.y || 0
  ctx.clearRect(x, y, width, height)
  ...
  if (x || y) ctx.translate(x, y)
  draw()
  ...
}
```

它的意义是：

> 让图表既能独立画整张 canvas，也能嵌入更大的画布某个区域里绘制。

这就是为什么：

- 数据页图表能单独画
- 报告导出里也能把图嵌进整页图片

---

### 4.4 坐标换算：`valueToY()` 和 `pointX()`

这是绘图文件里最重要的基础逻辑。

#### `valueToY(value, range, plot)`

```js
return plot.bottom - ((value - range.min) / span) * (plot.bottom - plot.top)
```

意思是：

> 把一个真实数值映射成画布上的 y 坐标。

注意 y 轴是“值越大，坐标越靠上”，所以用了：

```js
plot.bottom - ...
```

#### `pointX(index, total, plot)`

```js
if (total <= 1) return (plot.left + plot.right) / 2
return plot.left + (index / (total - 1)) * (plot.right - plot.left)
```

意思是：

> 把第几个点映射到横轴上的哪个位置。

这两个函数一起，构成了图表的“坐标系核心”。

---

### 4.5 `drawGrid()`

这个函数负责画：

1. 背景横向网格线
2. 参考线
3. 参考线数值标签

关键逻辑：

```js
;[0, 0.25, 0.5, 0.75, 1].forEach(ratio => { ... })
```

表示把绘图区均匀分成 5 条水平线。

然后：

```js
chart.refs.forEach(ref => {
  const y = valueToY(ref, chart.range, plot)
  ...
})
```

说明参考线不是写死的，而是来自 `chart-data.js` 提供的 `refs`。

---

### 4.6 `drawLabels()`

```js
const step = records.length > 10 ? Math.ceil(records.length / 6) : 1
```

这个函数很实用。

它不是把每个点都写横轴标签，而是：

- 点太多时，跳着画
- 点少时，全画

这是一种典型的“防止横轴标签挤爆”的处理。

---

### 4.7 `drawLegend()`

负责画图例，比如：

- 高压
- 低压
- 异常点

它本身不复杂，但说明图例内容也是配置式传进去的，不是写死在某个图表函数里。

---

### 4.8 `drawLine()`

这个函数是血压折线图的核心绘制器。

它先画折线：

```js
records.forEach((record, index) => {
  const x = pointX(index, records.length, plot)
  const y = valueToY(record[key], chart.range, plot)
  ...
})
```

再画点：

```js
setFill(ctx, record.abnormal ? COLORS.abnormal : color)
ctx.arc(x, y, 4, 0, 2 * Math.PI)
```

所以这里体现出：

> 折线颜色是系列颜色，但点颜色会因为 `abnormal` 变成异常红色。

这就是 `chart-data.js` 里 `abnormal` 字段的实际用途。

---

### 4.9 `drawBloodPressureChart()`

这个函数是血压图的公开入口。

它做的事情按顺序是：

1. `drawChartArea(...)`
2. 算 `plot` 区域
3. `drawTitle()`
4. `drawGrid()`
5. `drawLine(..., 'systolic', ...)`
6. `drawLine(..., 'diastolic', ...)`
7. `drawLabels()`
8. `drawLegend()`

所以血压图是：

- 两条线：高压 / 低压
- 一个共用坐标轴
- 异常点单独高亮

---

### 4.10 `drawHeartRateChart()`

心率图和血压图不一样，它不是折线，而是柱状图。

关键逻辑：

```js
const barWidth = Math.max(6, Math.min(18, (plot.right - plot.left) / Math.max(chart.records.length * 1.8, 1)))
```

这里是在根据记录数量动态算柱宽。

然后每条记录都画一个柱子：

```js
ctx.fillRect(x, y, barWidth, plot.bottom - y)
```

异常时颜色会切成 `COLORS.abnormal`。

这说明：

- 血压图偏趋势感，适合折线
- 心率图在这个项目里选择了柱状表达

## 5. 小程序知识点

### canvas 绘图分层

当前项目的分层很清晰：

- `chart-data.js`：准备图表数据
- `canvas-charts.js`：绘图
- 页面：决定何时调用绘图

### `dpr` 不是在这个文件里处理的

这点很重要。

这个文件假设：

- 页面已经设置好了 canvas 宽高
- 页面已经对 `ctx.scale(dpr, dpr)` 做过处理

所以它只关心“逻辑像素坐标系”。

## 6. 依赖关系

### 它依赖哪些文件

- 无项目内业务依赖，只依赖传进来的 `chart` 数据结构。

### 它被哪些文件使用

- [pages/data/data.js](/Users/ella/Documents/Code/Demo/WeChatProjects/bp-monitor-mini-program-chatgpt/pages/data/data.js)
- [pages/report/report.js](/Users/ella/Documents/Code/Demo/WeChatProjects/bp-monitor-mini-program-chatgpt/pages/report/report.js)
- [utils/report-canvas.js](/Users/ella/Documents/Code/Demo/WeChatProjects/bp-monitor-mini-program-chatgpt/utils/report-canvas.js)

## 7. 常见阅读误区

### 误区 1：以为这个文件负责判断异常

不是。它只消费 `chart.records[*].abnormal`。

### 误区 2：以为 `ctx` 坐标天然就是业务值

不是。业务值需要先通过 `valueToY()` / `pointX()` 换算成画布坐标。

### 误区 3：以为血压图和心率图只是颜色不同

不是。它们连图形类型都不同：

- 血压：折线
- 心率：柱状

## 8. 潜在问题检查

### 问题 1：`drawChartArea()` 先 `clearRect(x, y, width, height)`，再 `translate(x, y)`，对局部绘制依赖较强

为什么可疑：

- 这种写法要求调用方和绘图函数对“局部区域”的理解一致。

可能影响：

- 如果以后嵌套绘制区域更复杂，容易出现清错区域的问题。

建议后续验证：中优先级。

---

### 问题 2：标签位置和图例宽度是经验值，点多或容器太小时可能拥挤

比如：

- `ctx.fillText(record.label, pointX(...) - 10, plot.bottom + 18)`
- `drawLegend(... width: 58/72 ...)`

为什么可疑：

- 这些值是手工调的，不是严格自适应布局。

可能影响：

- 极端数据量或很窄画布下，文本可能重叠。

建议后续验证：中优先级。

---

### 问题 3：空图表时直接 `return`，不会画“暂无数据”占位

为什么可疑：

- 如果上层页面忘了在无数据时单独处理，图表区域可能显得像空白。

可能影响：

- 用户不知道是加载失败还是没有数据。

建议后续验证：低优先级。

## 9. 建议下一步阅读哪个文件

建议下一步看：

`utils/report-data.js`

因为它会把 `chart-data.js` 产出的图表数据和家庭资料、统计、最近记录一起打包成完整报告对象。

