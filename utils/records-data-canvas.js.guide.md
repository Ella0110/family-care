# `utils/records-data-canvas.js` 阅读指南

## 1. 文件作用

这个文件负责把“记录导出数据”画成一张表格图片。

它的职责很单纯：

1. 接收 `buildRecordsExportData()` 产出的 `exportData`
2. 按固定表格版式画标题、时间范围、表头、数据行
3. 提供导出图高度计算函数

你可以把它理解成：

> 记录页“导出为图片”功能的表格绘制器。

---

## 2. 阅读前置

读这个文件前，最好先知道：

1. `utils/record-data-transfer.js` 会先把记录整理成 `exportData`。
2. `pages/records/records.js` 里有 `onDownloadRecords()`，会调用这里画图。
3. 小程序 canvas 导出需要先知道宽高，再手动画内容。

如果前置没建立，你容易把这个文件误解成“又一个画 canvas 的工具”。实际上它只服务记录导出图片这一条功能。

---

## 3. 阅读重点

建议按这个顺序读：

1. 顶部布局常量
2. `recordsDataImageHeight`
3. `drawHeaderCell`
4. `drawRecordsDataImage`

主线很短：

```text
records.js
  ↓
buildRecordsExportData()
  ↓
recordsDataImageHeight() 计算高度
  ↓
drawRecordsDataImage() 画表格
  ↓
保存到相册
```

---

## 4. 核心逻辑拆解

### 4.1 顶部布局常量

```js
const TABLE_LEFT = 6
const TABLE_RIGHT = 729
const TITLE_Y = 54
const RANGE_Y = 132
const TABLE_TOP = 182
const HEADER_HEIGHT = 112
const ROW_HEIGHT = 82
```

这些值决定了整张导出图片的版式：

- 标题画在哪
- 时间范围画在哪
- 表格从哪一行开始
- 每行有多高
- 列边界在哪

这里你会看到非常典型的 canvas 风格：大量固定坐标。

原因很简单：

> canvas 不是自动排版，位置要自己算。

---

### 4.2 `setFont()` / `text()` / `line()`

这三个函数是最基础的绘图封装。

#### `setFont()`

统一设置字体字号和字重。

#### `text()`

负责画文字，并顺手设置：

- 颜色
- 对齐方式
- baseline

#### `line()`

负责画表格线。

这样 `drawRecordsDataImage()` 就不需要反复写低层 API 了。

---

### 4.3 `recordsDataImageHeight(rowCount)`

```js
return TABLE_TOP + HEADER_HEIGHT + Math.max(rowCount, 1) * ROW_HEIGHT + BOTTOM_PADDING
```

这个函数是导出前必须先调用的。

因为页面在创建 canvas 时要先知道高度：

```js
const height = recordsDataImageHeight(exportData.rows.length)
```

这里的逻辑很直接：

- 表头高度固定
- 数据区高度 = 行数 × 行高
- 即使没有数据，也至少保留一行空间

这个“至少一行”的细节很重要，否则空表导出时高度会过小。

---

### 4.4 `drawHeaderCell(ctx, label, x, y)`

这个函数专门处理表头，因为列名里可能带换行：

```js
const parts = String(label).split('\n')
```

例如：

```text
高压
(mmHg)
```

这就是为什么 `record-data-transfer.js` 里的 `COLUMNS` 要写成带 `\n` 的字符串。

你可以把它理解成：

> 数据层先约定“这里是两行标题”，绘图层再负责真正把两行文字画出来。

---

### 4.5 `drawRecordsDataImage(ctx, exportData, width, height)`

这是整个文件的主函数。

它的执行顺序很清楚：

#### 第一步：清空背景

```js
ctx.fillStyle = '#FFFFFF'
ctx.fillRect(0, 0, width, height)
```

先把整个画布刷成白底。

#### 第二步：画标题和时间范围

```js
text(ctx, exportData.title || '血压心率数据记录', ...)
text(ctx, exportData.rangeText || '数据记录时间：暂无数据', ...)
```

这里说明导出图需要的数据已经提前准备好了，绘图函数只负责消费。

#### 第三步：画表头背景和表格边框

```js
ctx.fillRect(...)
COLUMNS.forEach(x => line(ctx, x, TABLE_TOP, x, tableBottom))
```

这一步决定了表格外形。

#### 第四步：画表头文字

```js
drawHeaderCell(ctx, exportData.columns[0], 20, headerY)
...
```

这里列位置是写死的，和顶部 `COLUMNS` 边界常量配套使用。

#### 第五步：画数据行

如果没有数据：

```js
text(ctx, '暂无数据', ...)
```

如果有数据，就逐行画：

```js
rows.forEach((record, index) => {
  ...
  text(ctx, record.timeText, ...)
  text(ctx, record.systolic, ...)
  text(ctx, record.diastolic, ...)
  text(ctx, record.heartRate, ...)
})
```

这说明绘图层完全不关心原始数据库字段，它只认已经整理好的：

- `timeText`
- `systolic`
- `diastolic`
- `heartRate`

---

## 5. 小程序知识点

### 5.1 先算高度再画图

在小程序 canvas 导出里，经常要先手算：

- 宽度
- 高度
- DPR

而不是像页面布局那样自动撑开。

所以 `recordsDataImageHeight()` 不是附属函数，而是导出链路的必要步骤。

---

### 5.2 绘图层通常依赖“中间数据结构”

这里的 `exportData` 就是中间数据结构。

这样做的好处是：

- 解析和校验逻辑留在 `record-data-transfer.js`
- 绘图逻辑留在 `records-data-canvas.js`

职责更清晰。

---

### 5.3 页面中的 canvas 往往是隐藏节点

在 `pages/records/records.js` 里，这个 canvas 不是主界面表格，而是一个导出时使用的隐藏 canvas。

所以它存在的目的不是“实时展示”，而是“生成图片文件”。

---

## 6. 依赖关系

### 它依赖哪些文件

这个文件本身不再依赖其他本地工具。

它依赖的数据结构来自：

- `utils/record-data-transfer.js`

### 哪些文件使用它

- [pages/records/records.js](/Users/ella/Documents/Code/Demo/WeChatProjects/bp-monitor-mini-program-chatgpt/pages/records/records.js)
- [scripts/verify-record-data-transfer.js](/Users/ella/Documents/Code/Demo/WeChatProjects/bp-monitor-mini-program-chatgpt/scripts/verify-record-data-transfer.js)

页面里直接调用：

```js
const height = recordsDataImageHeight(exportData.rows.length)
drawRecordsDataImage(ctx, exportData, width, height)
```

这条链路是：

```text
records.js
  ↓
record-data-transfer.js 产出 exportData
  ↓
records-data-canvas.js 画图片
  ↓
wx.canvasToTempFilePath 导出
```

---

## 7. 常见阅读误区

### 误区 1：以为这个文件也在负责导出数据整理

不是。

它只负责画，不负责过滤、排序、解析。

### 误区 2：以为 `width` / `height` 参数可以随便传

不是。

这里的布局常量是按固定导出尺寸设计的，尤其是 `width = 750`。

### 误区 3：以为没有数据就不用画图

不是。

当前实现即使没有数据，也会导出一张“带标题和空表提示”的图片。

---

## 8. 潜在问题检查

### 问题 1：布局高度和列宽都是硬编码，后续扩展字段会比较脆

- 问题描述：列边界、行高、表头高度全部是固定数值。
- 为什么可疑：如果后续增加“备注”列，或把列标题改长，就要联动改很多坐标。
- 可能影响：文字重叠、越界、表格错位。
- 是否建议后续验证：建议。任何导出表格版式调整后都要重新验图。

### 问题 2：没有根据文本宽度做自适应

- 问题描述：数据单元格直接按固定 x 坐标绘制。
- 为什么可疑：虽然当前血压和心率都是短数字，但如果后续列内容变长，会很快溢出。
- 可能影响：文字压线或覆盖相邻列。
- 是否建议后续验证：当前风险较低，但后续加字段时必须考虑。

### 问题 3：空数据时只画“暂无数据”文字，没有完整占位行样式

- 问题描述：空表场景没有真正绘制一行完整占位数据。
- 为什么可疑：视觉上和有数据时的表格节奏不完全一致。
- 可能影响：主要是体验层面的轻微不统一，不是功能 bug。
- 是否建议后续验证：可选。看产品是否在意空表导出效果。

---

## 9. 建议下一步阅读哪个文件

建议下一步看：

- [pages/records/records.js](/Users/ella/Documents/Code/Demo/WeChatProjects/bp-monitor-mini-program-chatgpt/pages/records/records.js)

因为到这里你已经能把记录导入导出链路闭环起来：

```text
records.js
  ├─ parseRecordsDataText() 解析导入文本
  ├─ dedupeImportedRecords() 导入前去重
  ├─ buildRecordsExportData() 准备导出数据
  └─ drawRecordsDataImage() 生成导出图片
```
