# `utils/record-data-transfer.js` 阅读指南

## 1. 文件作用

这个文件负责“记录数据的导入导出转换”。

它主要做三件事：

1. 把记录列表转换成适合导出图片的数据结构
2. 把用户粘贴的文本解析成记录对象
3. 在导入时做去重

你可以把它理解成：

> 记录页和导入导出功能之间的数据交换层。

它不直接画图片，也不直接保存到数据库，但它决定了：

- 导出图片表格里显示什么
- 导入文本怎样识别成记录
- 哪些记录会被判定为重复

---

## 2. 阅读前置

读这个文件前，最好先知道：

1. `pages/records/records.js` 里有导出图片和导入文本两条功能。
2. `utils/records-data-canvas.js` 负责把这里产出的导出数据画成图片。
3. `cloudfunctions/saveRecord/index.js` 最终负责把导入结果写入数据库。

如果前置没建立，你容易把这个文件看成“只是格式化时间”。实际上它同时承担了解析、校验、去重三个职责。

---

## 3. 阅读重点

建议按这个顺序读：

1. `toDate` / `isValidDate`
2. `isValidRecord`
3. `buildRecordsExportData`
4. `parseRecordLine`
5. `parseRecordsDataText`
6. `recordKey`
7. `dedupeImportedRecords`

主线可以记成：

```text
导出：
records
  ↓
过滤合法记录
  ↓
标准化 / 排序
  ↓
导出数据结构

导入：
文本
  ↓
逐行解析
  ↓
筛出合法记录
  ↓
按规则去重
  ↓
交给 saveRecord 云函数保存
```

---

## 4. 核心逻辑拆解

### 4.1 顶部常量：`TITLE` 和 `COLUMNS`

```js
const TITLE = '血压心率数据记录'
const COLUMNS = ['测量时间', '高压\n(mmHg)', '低压\n(mmHg)', '心率\n(bpm)']
```

这两个常量决定导出图片表格的标题和表头。

注意这里的列名里带了 `\n`，说明后面的绘图器会把它拆成两行来画。

---

### 4.2 `toDate(value)` / `isValidDate(date)`

这两个函数是整个文件最基础的时间处理层。

`toDate` 负责兼容多种日期来源：

- `Date`
- 云数据库返回的 `$date`
- `_date`
- 普通字符串

`isValidDate` 则负责判断：

> 这个 Date 对象是不是有效日期。

因为 `new Date('xxx')` 虽然也会返回 `Date`，但可能是无效值。

---

### 4.3 `isValidRecord(record)`

```js
return isValidDate(measuredAt) &&
  Number(record.systolic) >= 60 && Number(record.systolic) <= 300 &&
  Number(record.diastolic) >= 40 && Number(record.diastolic) <= 200 &&
  Number(record.heartRate) >= 30 && Number(record.heartRate) <= 250
```

这是这个文件里最关键的校验函数之一。

它定义了“什么样的记录才算有效”：

- 时间合法
- 高压、低压、心率都在合理范围

为什么要在工具层做这一步？

因为导入和导出都需要可靠的数据边界，不能把明显错误的数据继续往下传。

---

### 4.4 `buildRecordsExportData(records)`

这是导出链路的核心函数。

流程是：

1. 先过滤合法记录
2. 再标准化字段
3. 按时间倒序排序
4. 生成图片绘制器需要的 `rows`

关键代码：

```js
const normalized = (records || [])
  .filter(isValidRecord)
  .map(normalizeRecord)
  .sort((a, b) => toDate(b.measuredAt) - toDate(a.measuredAt))
```

这里要注意两点：

#### 第一，导出时是倒序

因为导出的表格更像记录列表，通常希望最新记录在最前面。

这和图表里的升序排序不同。

#### 第二，返回的不是原始记录

它最终返回：

```js
{
  title,
  rangeText,
  columns,
  rows: [...]
}
```

也就是说，它专门给导出图片准备了一层“中间数据结构”。

这让 `records-data-canvas.js` 可以专注于画表格，而不用再管原始数据库字段。

---

### 4.5 `buildRangeText(records)`

这个函数会从所有合法记录中取最早和最晚日期，生成：

```text
数据记录时间：2026年4月15日-4月17日
```

这里它还会判断是否跨年：

- 不跨年：后半段可以省略年份
- 跨年：后半段要带年份

这属于“结构化数据 -> 展示文案”的转换层。

---

### 4.6 `parseRecordLine(line, defaultYear)`

这是导入链路里最关键的函数。

它做的事情是：

1. 先把一行文本规范化
2. 用正则提取年月日、时间、高压、低压、心率
3. 构造记录对象
4. 再用 `isValidRecord` 做最终校验

正则大意支持这类输入：

```text
2026年4月17日 08:47 155 94 84
4月17日 08:47 155 94 84
2026/4/17 08:47 155 94 84
```

如果一行文本能被识别，就返回：

```js
{
  measuredAt,
  systolic,
  diastolic,
  heartRate,
  period: null,
}
```

这里 `period: null` 很值得注意。

说明当前导入功能只导入测量值和时间，不试图从文本里恢复“晨间 / 晚间”等业务字段。

---

### 4.7 `parseRecordsDataText(text, options)`

这个函数会把整段多行文本拆成：

- `records`
- `invalidLines`

它的处理方式是：

```js
String(text || '').split(/\r?\n/).forEach(...)
```

也就是逐行尝试解析。

为什么还要返回 `invalidLines`？

因为导入时页面要告诉用户：

- 有多少条识别成功
- 有多少行没识别

这就是 `pages/records/records.js` 里导入确认弹窗的数据来源之一。

---

### 4.8 `recordKey(record)` / `dedupeImportedRecords(...)`

这两个函数共同完成“去重”。

`recordKey` 会把一条记录收敛成：

```text
分钟级时间 + 高压 + 低压 + 心率
```

然后 `dedupeImportedRecords` 会：

1. 先和已有记录对比
2. 再和本次导入批次内部对比
3. 统计重复条数

这样页面导入时就能知道：

- 哪些是新记录
- 哪些是重复记录

注意这里的去重不是按 `_id`，而是按“业务上看起来是同一条记录”的组合键。

---

## 5. 小程序知识点

### 5.1 工具层不一定只做“纯格式化”

很多新手会把 `utils` 目录理解成“都是一些小函数”。这个文件不是。

它其实承担了一部分业务规则：

- 什么叫有效记录
- 什么叫重复记录
- 文本导入支持什么格式

所以读 `utils` 时不要默认它们都很轻。

---

### 5.2 前端导入不等于直接入库

这里的解析和去重都发生在前端页面侧。

真正保存还是在：

- `pages/records/records.js`
- `cloudfunctions/saveRecord/index.js`

所以这条链路是：

```text
用户粘贴文本
  ↓
record-data-transfer.js 解析
  ↓
records.js 确认导入
  ↓
saveRecord 云函数逐条保存
```

---

### 5.3 导出数据结构和数据库结构可以不同

这里返回的 `exportData.rows` 不是数据库原始字段，而是专门为图片表格准备的结构。

这是前端很常见的一层：

> View Model / 展示模型

---

## 6. 依赖关系

### 它依赖哪些文件

这个文件基本是自包含的，没有再 `require` 其他本地工具文件。

### 哪些文件使用它

- [pages/records/records.js](/Users/ella/Documents/Code/Demo/WeChatProjects/bp-monitor-mini-program-chatgpt/pages/records/records.js)
- [scripts/verify-record-data-transfer.js](/Users/ella/Documents/Code/Demo/WeChatProjects/bp-monitor-mini-program-chatgpt/scripts/verify-record-data-transfer.js)

页面里的两条直接调用是：

```js
const exportData = buildRecordsExportData(this.data.allRecords || [])
const parsed = parseRecordsDataText(this.data.importText)
```

再加上：

```js
const deduped = dedupeImportedRecords(parsed.records, this.data.allRecords || [])
```

说明它同时服务：

- 导出图片
- 导入解析
- 去重确认

---

## 7. 常见阅读误区

### 误区 1：以为导入只是字符串切一切

不是。

这里还有日期推断、范围校验、去重规则。

### 误区 2：以为去重是按 `_id`

不是。

导入的记录本来就没有数据库 `_id`，这里只能按业务字段组合去重。

### 误区 3：以为这个文件直接操作数据库

不是。

它只负责把数据准备好，真正写库的是 `saveRecord` 云函数。

### 误区 4：以为无效行会直接报错

不是。

当前策略更温和：识别失败的行会进入 `invalidLines`，由页面提示用户。

---

## 8. 潜在问题检查

### 问题 1：`parseRecordLine()` 依赖 `new Date(...)`，某些日期边界可能被 JS 自动进位

- 问题描述：JS `new Date(year, month - 1, day, ...)` 对非法日期会自动滚动到下一月。
- 为什么可疑：例如 `2 月 31 日` 这种输入，理论上不是有效日期。
- 可能影响：极少数错误输入可能被转成另一真实日期，而不是直接失败。
- 是否建议后续验证：建议。可以专门测几组非法日期文本。

### 问题 2：去重键只精确到“分钟”

- 问题描述：`recordKey()` 会把秒和毫秒抹掉。
- 为什么可疑：如果同一分钟里真的测了两次完全相同的值，会被当成重复。
- 可能影响：导入时可能少导一条真实记录。
- 是否建议后续验证：建议。先确认业务上是否允许“同一分钟多次测量”。

### 问题 3：年份推断有业务假设

- 问题描述：如果文本里没有年份，`inferYear()` 会从标题推断，否则回退到当前年。
- 为什么可疑：跨年导入时，如果用户只贴“1月2日”这种行，可能推断到错误年份。
- 可能影响：记录日期落到错误年份。
- 是否建议后续验证：建议。尤其要验证跨年场景。

### 问题 4：导入支持格式依赖正则，输入格式稍变就识别不到

- 问题描述：当前正则支持的是有限几种年月日和空格格式。
- 为什么可疑：用户复制来源不同，分隔符、单位、列顺序可能变化。
- 可能影响：部分文本行进入 `invalidLines`，导入体验不稳定。
- 是否建议后续验证：建议。后续如果导入需求扩大，应补更多样本。

---

## 9. 建议下一步阅读哪个文件

建议下一步看：

- [utils/records-data-canvas.js](/Users/ella/Documents/Code/Demo/WeChatProjects/bp-monitor-mini-program-chatgpt/utils/records-data-canvas.js)

因为它正好消费这里产出的 `exportData`：

```text
record-data-transfer.js
  ↓
buildRecordsExportData()
  ↓
records-data-canvas.js 画成导出表格图片
```
