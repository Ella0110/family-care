# `utils/report-canvas.js` 阅读指南

## 1. 文件作用

这个文件负责把“已经整理好的报告数据”画成一整张报告图片。

它不负责查数据，也不负责算业务规则；它的职责是：

1. 接收 `report-data.js` 产出的 `report` 对象
2. 按固定版式分区绘制标题、档案、摘要、趋势、最近记录、免责声明
3. 计算导出图片需要的高度

你可以把它理解成：

> 报告页导出图片的“最终渲染器”。

---

## 2. 阅读前置

读这个文件前，最好先知道：

1. `utils/report-data.js` 会先把原始数据整理成 `report` 对象。
2. `utils/canvas-charts.js` 负责画血压图和心率图。
3. `utils/health-rules.js` 负责血压 / 心率状态判断。
4. `pages/report/report.js` 里会调用这里的 `reportImageHeight()` 和 `drawReportImage()`。

如果前置没建立，你会容易误解成“这是一个很长的 canvas 文件”。实际上它是报告导出链路的最后一层。

---

## 3. 阅读重点

建议按这个顺序读：

1. 顶部常量：`PAD`、`INNER`、`C`
2. 基础绘图函数：`txt`、`block`、`wrapTxt`
3. 状态相关：`worstLevel`、`statusPalette`
4. 区块渲染函数：`drawHeader`、`drawProfile`、`drawSummary`
5. 趋势区：`drawBPSection`、`drawHRSection`
6. 两个公开函数：`reportImageHeight`、`drawReportImage`

主线可以记成：

```text
report-data 产出 report
  ↓
reportImageHeight 先估算整张图高度
  ↓
drawReportImage 从上到下依次画各个区块
  ↓
pages/report/report.js 导出图片
```

---

## 4. 核心逻辑拆解

### 4.1 顶部依赖

```js
const { drawBloodPressureChart, drawHeartRateChart } = require('./canvas-charts')
const { getBPStatus, getHRStatus } = require('./health-rules')
```

说明这个文件不自己重复实现折线图和状态规则，而是复用已有工具：

- `canvas-charts`：画图
- `health-rules`：判断整体状态

这符合当前项目的分层方式。

---

### 4.2 布局常量和颜色常量

```js
const PAD = 32
const INNER = 686
```

这两个值决定了整张导出图的横向布局：

- `PAD`：左右留白
- `INNER`：真正可用内容宽度

颜色常量 `C` 则统一了：

- 普通文字色
- 分割线色
- 正常 / 注意 / 警告 / 危险状态色

为什么集中写常量？

因为导出图是一整张静态版式，如果颜色和间距散落在各个函数里，后面很难统一修改。

---

### 4.3 基础绘图函数：`txt` / `block` / `wrapTxt`

这几个函数是整个文件的“画笔基础层”。

例如：

```js
function txt(ctx, v, x, y, sz, c, w) {
  sz = sz || 24; c = c || C.text; w = w || '400'
  sf(ctx, c); sfont(ctx, sz, w)
  ctx.fillText(String(v), x, y)
}
```

它把“设置字体、颜色、再画文字”封装起来，后面各区块只需要关心：

- 画什么
- 画到哪里
- 用什么字号

`wrapTxt()` 也很关键：

```js
function wrapTxt(ctx, v, x, y, maxW, lh, sz, c) {
  ...
}
```

它负责自动换行，主要用于：

- 用药说明
- 免责声明

如果没有它，长文本会直接超出图片边界。

---

### 4.4 `worstLevel(records, refLines)`

这个函数是报告顶部“整体状态卡片”的依据。

它会遍历所有记录，对每条记录分别判断：

- 血压状态
- 心率状态

然后把整段周期里最严重的级别找出来。

核心思路：

```js
const bp = getBPStatus(...)
const hr = getHRStatus(...)
const bn = ...
const hn = ...
w = Math.max(w, bn, hn)
```

这不是在判断“平均值”，而是在判断：

> 当前周期里有没有出现过最差的一次情况。

这很适合报告摘要，因为报告首页往往先给整体风险印象。

---

### 4.5 `statusPalette(level)`

这个函数把“严重级别数字”映射成 UI 文案和颜色：

```js
{ title, desc, bg, tc, dot }
```

所以它做的不是业务判断，而是：

> 把规则结果翻译成导出图上的视觉表现。

这和页面里的 `getStatusClass(...)` 是同一类工作：都属于“状态 -> UI 映射层”。

---

### 4.6 `drawHeader()` / `drawProfile()` / `drawSummary()`

这几个函数对应报告顶部的几个固定区块。

#### `drawHeader()`

画：

- 报告标题
- 家庭名
- 时间范围 + 生成时间
- 分割线

它的返回值是新的 `y`，也就是“下一个区块从哪一行开始画”。

#### `drawProfile()`

画：

- 姓名
- 年龄
- 用药
- 紧急联系人

这里有一个重要参数：

```js
hidePrivacy
```

如果为 `true`，姓名和联系人会被替换成 `***`。这对应报告页的“隐私开关”。

#### `drawSummary()`

这里画的是报告摘要四宫格：

- 血压均值
- 心率均值
- 血压超参考次数
- 心率超参考次数

这部分依赖 `report.avg` 和 `report.stats`，说明真正的统计计算已经在 `report-data.js` 里完成了。

---

### 4.7 `drawBPSection()` / `drawHRSection()`

这两个函数很值得仔细看，因为它们有“分支渲染”逻辑。

#### 情况 1：没有记录

画一个空状态块：

```js
当前周期暂无记录
```

#### 情况 2：记录少于 3 条

不画折线图，而是逐条画“范围条”：

```js
drawBarRow(...)
```

为什么这样写？

因为只有 1~2 条记录时，折线图信息量很低，甚至会显得空。此时用单条范围条更直观。

#### 情况 3：记录至少 3 条

调用：

```js
drawBloodPressureChart(...)
drawHeartRateChart(...)
```

这时才切换到趋势图模式。

这是一个很典型的“按数据量选择展示形式”的实现。

---

### 4.8 `drawRecentRecords()`

它负责画“最近记录”列表，不是原始数据库结构，而是报告展示文本：

```js
record.time
record.bpText
record.heartRateText
record.bpStatus
record.hrStatus
```

这些字段都是 `report-data.js` 预处理后的结果。

所以这里你要建立一个概念：

> `report-canvas.js` 更像视图层，它希望拿到的是“适合画出来的数据”，而不是重新自己拼业务字段。

---

### 4.9 `reportImageHeight(report)`

这个函数非常重要。

导出图片前，页面必须先知道图片需要多高：

```js
const height = reportImageHeight(this.data.report)
```

这里的实现不是测量真实 DOM，而是手工估算：

- 头部占多少
- 档案区占多少
- 趋势区按数据量占多少
- 最近记录按条数占多少

这类函数在 canvas 导出里很常见，因为 canvas 不是自动流式布局。

如果高度估算不准，后果会是：

- 图片底部被截断
- 或者底部留白太多

---

### 4.10 `drawReportImage(ctx, report, width, height, options)`

这是整个文件的入口函数。

它的主线很清晰：

```js
let y = 48
y = drawHeader(...)
y = drawProfile(...)
y = drawStatusCard(...)
y = drawSummary(...)
y = drawBPSection(...)
y = drawHRSection(...)
y = drawRefLineNote(...)
y = drawRecentRecords(...)
drawDisclaimer(...)
```

也就是说：

> 整张报告图片就是按固定顺序，从上往下逐块绘制。

这和 HTML 页面布局不同。这里没有自动流布局，一切都靠 `y` 手动往下推进。

---

## 5. 小程序知识点

### 5.1 Canvas 导出不是页面截图

这里画的是一张全新的 canvas 图片，不是把页面直接截图。

所以导出图可以和页面长得像，但实现方式完全不同。

---

### 5.2 `ctx` 是画布上下文

这里的 `ctx` 相当于“画笔对象”，常见操作有：

- `fillRect`
- `fillText`
- `moveTo`
- `lineTo`

小程序 canvas 和浏览器 canvas 很像，但兼容写法里经常会同时兼顾：

- 旧接口
- 2D node canvas

所以顶部有 `setFillStyle` / `fillStyle` 两套兼容。

---

### 5.3 手动布局是 canvas 代码的常态

HTML 会自动换行、自动流式排版；canvas 不会。

所以这里你会看到大量：

- 常量高度
- `y += 36`
- `return y + 24`

这不是“写法土”，而是 canvas 导出里很常见的做法。

---

## 6. 依赖关系

### 它依赖哪些文件

- `./canvas-charts`
- `./health-rules`
- 上游数据来源：`./report-data`

### 哪些文件使用它

- [pages/report/report.js](/Users/ella/Documents/Code/Demo/WeChatProjects/bp-monitor-mini-program-chatgpt/pages/report/report.js)

页面里直接调用：

```js
const height = reportImageHeight(this.data.report)
drawReportImage(ctx, this.data.report, width, height, { hidePrivacy: this.data.hidePrivacy })
```

所以这条链路是：

```text
getRecords/getFamily
  ↓
report-data.js 组装 report
  ↓
report-canvas.js 画导出图
  ↓
pages/report/report.js 保存到相册
```

---

## 7. 常见阅读误区

### 误区 1：以为这里也在算业务规则

不是。

这里最多做“整体状态级别汇总”和“状态到颜色的映射”，真正的血压 / 心率规则还是来自 `health-rules.js`。

### 误区 2：以为 `reportImageHeight()` 可有可无

不是。

它直接决定导出图会不会被截断。

### 误区 3：以为趋势区永远都是折线图

不是。

少量数据时，它故意改成范围条，这是为了可读性。

### 误区 4：以为这里的字段都来自数据库原始记录

不是。

很多字段已经是 `report-data.js` 做过转换后的展示字段。

---

## 8. 潜在问题检查

### 问题 1：`reportImageHeight()` 是手工估算，高度和真实绘制可能漂移

- 问题描述：高度计算大量依赖固定数字和“预计几行文本”。
- 为什么可疑：`drawProfile()`、`drawDisclaimer()` 都可能因为文本换行而比估算更高。
- 可能影响：导出图底部被截断，或者出现明显多余留白。
- 是否建议后续验证：建议。尤其要用“长用药说明、长免责声明、长联系人信息”做边界验证。

### 问题 2：状态映射逻辑在多个文件里分散

- 问题描述：`report-canvas.js` 有 `worstLevel()/statusPalette()`，`pages/report/report.js` 里也有 `_calcStatusInfo()`。
- 为什么可疑：同一套报告状态规则在多个地方维护，后续改规则容易漏改。
- 可能影响：页面看到的总体状态和导出图上的总体状态不一致。
- 是否建议后续验证：建议。后续如果改状态规则，应该联动检查页面摘要和导出图。

### 问题 3：`wrapTxt()` 是按字符宽度换行，长英文或特殊符号场景不够稳

- 问题描述：当前换行逻辑是逐字符累计宽度。
- 为什么可疑：中文场景基本够用，但英文长单词、特殊符号串、手机号混排时，换行效果可能不理想。
- 可能影响：文本排版不够自然，个别场景可能出现视觉挤压。
- 是否建议后续验证：可选。当前业务主要是中文文本，风险中等偏低。

### 问题 4：布局大量依赖固定像素常量

- 问题描述：区块高度、图表高度、边距几乎都写死。
- 为什么可疑：一旦后续增加字段、调整文案、增大字体，很容易牵一发动全身。
- 可能影响：局部重叠、截断、视觉不对齐。
- 是否建议后续验证：建议。任何报告版式调整后都应重新导出几组真实样本检查。

---

## 9. 建议下一步阅读哪个文件

建议下一步看：

- [utils/record-data-transfer.js](/Users/ella/Documents/Code/Demo/WeChatProjects/bp-monitor-mini-program-chatgpt/utils/record-data-transfer.js)

原因是这会把另一条“记录导入 / 导出”链路补上：

```text
records.js
  ↓
record-data-transfer.js 负责文本导入导出结构
  ↓
records-data-canvas.js 负责把导出数据画成图片
```
