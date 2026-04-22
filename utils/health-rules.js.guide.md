# `utils/health-rules.js` 阅读指南

## 1. 文件作用

这个文件是项目里的“健康规则核心工具”。

它主要负责四件事：

1. 判断血压状态：`getBPStatus`
2. 判断心率状态：`getHRStatus`
3. 计算平均值：`calcAverage`
4. 统计“参考范围内 / 需关注”数量：`countReferenceStats`

如果你把整个项目想成“页面负责展示、云函数负责存取、工具函数负责规则”，那这个文件就是“规则层”的代表。

你当前选中的这段代码：

```js
getStatusClass(status) {
  if (!status) return EMPTY_VALUE_CLASS;
  if (status.level === "inRange") return "normal";
  if (
    status.level === "critical" ||
    status.level === "veryHigh" ||
    status.level === "veryFast" ||
    status.level === "verySlow"
  )
    return "danger";
  return "warning";
},
```

之所以会这样分，就是因为 `health-rules.js` 里先定义了这些 `level`：

- `inRange`
- `critical`
- `veryHigh`
- `veryFast`
- `verySlow`
- 以及 `low / high / slow / fast`

页面只是把这些业务等级再映射成 UI 样式等级。

## 2. 阅读前置

读这个文件前，最好先知道：

1. `pages/data/data.js` 会把 `status.level` 再转成样式类。
2. `pages/records/records.js` 会根据 `getBPStatus()` 生成 badge。
3. `pages/report/report.js` 和 `utils/report-canvas.js` 都依赖这里的状态规则做摘要和导出。
4. `profile` 里有自定义目标值：
   - `targetSystolic`
   - `targetDiastolic`
   - `targetHRMin`
   - `targetHRMax`

如果这些前置不稳，你可能会把这个文件误解成“只是几个 if 判断”。实际上它决定了很多页面颜色、文案、统计和报告结果。

## 3. 阅读重点

建议按这个顺序读：

1. `BP_STATUS` 和 `HR_STATUS`
2. `getBPStatus`
3. `getHRStatus`
4. `countReferenceStats`
5. `calcAverage`

你当前最值得抓住的主线是：

```text
原始测量值
  ↓
getBPStatus / getHRStatus
  ↓
得到 level / label / color / attention
  ↓
页面再把 level 转成 normal / warning / danger
```

## 4. 核心逻辑拆解

### 4.1 顶部状态常量

```js
const BP_STATUS = {
  LOW: { level: 'low', label: '偏低', color: '#FF9500', attention: true },
  IN_RANGE: { level: 'inRange', label: '参考范围内', color: '#34C759', attention: false },
  HIGH: { level: 'high', label: '偏高', color: '#FF9500', attention: true },
  VERY_HIGH: { level: 'veryHigh', label: '明显偏高', color: '#FF3B30', attention: true },
  CRITICAL: { level: 'critical', label: '很高', color: '#C81E1E', attention: true },
}
```

这里定义了血压的业务状态。

每个状态对象里有 4 个字段：

- `level`：给程序判断用
- `label`：给文案展示用
- `color`：给颜色展示用
- `attention`：是否算“需要关注”

心率也是同样结构：

```js
const HR_STATUS = {
  SLOW: { level: 'slow', ... },
  VERY_SLOW: { level: 'verySlow', ... },
  IN_RANGE: { level: 'inRange', ... },
  FAST: { level: 'fast', ... },
  VERY_FAST: { level: 'veryFast', ... },
}
```

这就是为什么页面里会出现：

- `inRange`
- `veryHigh`
- `critical`
- `veryFast`
- `verySlow`

因为这些名字本来就是在这里定义出来的。

---

### 4.2 `cloneStatus(status)`

```js
function cloneStatus(status) {
  return { ...status }
}
```

这个函数看起来很小，但有意义。

它的作用是：

> 每次返回状态时，不直接返回同一个常量对象，而是返回它的副本。

这样做的好处是防止外部代码意外修改这些状态对象。

比如如果某个页面做了：

```js
status.color = 'blue'
```

它不会污染 `BP_STATUS` 或 `HR_STATUS` 常量本身。

---

### 4.3 `getBPStatus(systolic, diastolic, target)`

这是你当前最该重点理解的函数。

先把输入统一转数字：

```js
const sys = Number(systolic)
const dia = Number(diastolic)
```

再取目标值：

```js
const tSys = Number(target && target.systolic) || 135
const tDia = Number(target && target.diastolic) || 85
```

这说明血压状态判断支持两种模式：

1. 传入自定义目标值
2. 不传时走默认目标值 `135 / 85`

然后是核心分级逻辑：

```js
if (sys < 90 || dia < 60) return LOW
if (sys >= 180 || dia >= 110) return CRITICAL
if (sys >= 160 || dia >= 100) return VERY_HIGH
if (sys >= tSys || dia >= tDia) return HIGH
return IN_RANGE
```

你可以把它理解成“从最极端到最普通”的优先判断：

1. 偏低
2. 很高
3. 明显偏高
4. 超出目标值
5. 参考范围内

注意：这里不是按医学全量分类表精细划分，而是按这个产品当前需要的 5 档状态来分。

---

### 4.4 `getHRStatus(heartRate, target)`

心率函数结构和血压类似。

先拿数值和目标范围：

```js
const hr = Number(heartRate)
const min = Number(target && target.min) || 60
const max = Number(target && target.max) || 80
```

再做分级：

```js
if (hr < 50) return VERY_SLOW
if (hr < min) return SLOW
if (hr > 100) return VERY_FAST
if (hr > max) return FAST
return IN_RANGE
```

这里和血压一样，也支持：

- 家庭档案自定义目标值
- 默认目标值

你当前选中的 `getStatusClass()` 会把这些 level 再压成 UI 等级：

- `inRange` -> `normal`
- `critical / veryHigh / veryFast / verySlow` -> `danger`
- 其他如 `high / low / slow / fast` -> `warning`

所以这里的业务含义是：

> 规则层先分细档，页面层再决定哪些细档算“红色危险”，哪些算“橙色提醒”。

---

### 4.5 `calcAverage(records)`

```js
function calcAverage(records) {
  if (!records.length) return { systolic: '--', diastolic: '--', heartRate: '--' }
  const avg = key => Math.round(records.reduce((sum, record) => sum + Number(record[key]), 0) / records.length)
  return {
    systolic: avg('systolic'),
    diastolic: avg('diastolic'),
    heartRate: avg('heartRate'),
  }
}
```

这是一个非常典型的统计函数：

- 没记录时返回 `'--'`
- 有记录时求平均并四舍五入

这里返回 `'--'` 而不是 `null`，说明这个函数的返回结果是直接为 UI 准备的。

也就是说，它不只是“纯数学平均值函数”，而是已经带了一点展示层语义。

---

### 4.6 `countReferenceStats(records, profile)`

这个函数的作用是统计：

- 有多少血压在参考范围内
- 有多少心率在参考范围内

先从 `profile` 提取目标值：

```js
const bpTarget = {
  systolic: profile && profile.targetSystolic,
  diastolic: profile && profile.targetDiastolic,
}
const hrTarget = {
  min: profile && profile.targetHRMin,
  max: profile && profile.targetHRMax,
}
```

然后遍历每条记录：

```js
if (!getBPStatus(...).attention) bpInRange += 1
if (!getHRStatus(...).attention) hrInRange += 1
```

这里非常值得你注意：

> 它不是直接判断 `level === 'inRange'`，而是用 `attention` 来判断是否“达标”。

这意味着：

- 只要 `attention: false`，就算在参考范围内
- 当前设计里实际上只有 `IN_RANGE` 是 `attention: false`

最后返回：

```js
return {
  bp: { inRange: bpInRange, attention: records.length - bpInRange },
  hr: { inRange: hrInRange, attention: records.length - hrInRange },
}
```

这就是首页统计卡片和报告统计里看到的来源。

## 5. 小程序知识点

### 规则层和页面层分工

这个文件特别适合理解一个前端架构概念：

- 规则层：判断业务状态
- 页面层：决定怎么显示

所以 `getStatusClass()` 不该写在 `health-rules.js`，因为它已经属于 UI 逻辑了。

### `level` 和 `attention` 是不同维度

很多新手会把它们混成一回事。

- `level`：具体是哪一档
- `attention`：是否需要关注

页面通常更关心：

- 颜色 / badge -> 看 `level`
- 统计“达标 / 关注” -> 看 `attention`

## 6. 依赖关系

### 它依赖哪些文件

- 无项目内依赖，它本身是相对独立的纯规则工具文件。

### 它被哪些文件使用

- [pages/data/data.js](/Users/ella/Documents/Code/Demo/WeChatProjects/bp-monitor-mini-program-chatgpt/pages/data/data.js)
- [pages/add-record/add-record.js](/Users/ella/Documents/Code/Demo/WeChatProjects/bp-monitor-mini-program-chatgpt/pages/add-record/add-record.js)
- [pages/records/records.js](/Users/ella/Documents/Code/Demo/WeChatProjects/bp-monitor-mini-program-chatgpt/pages/records/records.js)
- [pages/report/report.js](/Users/ella/Documents/Code/Demo/WeChatProjects/bp-monitor-mini-program-chatgpt/pages/report/report.js)
- [utils/chart-data.js](/Users/ella/Documents/Code/Demo/WeChatProjects/bp-monitor-mini-program-chatgpt/utils/chart-data.js)
- [utils/report-data.js](/Users/ella/Documents/Code/Demo/WeChatProjects/bp-monitor-mini-program-chatgpt/utils/report-data.js)
- [utils/report-canvas.js](/Users/ella/Documents/Code/Demo/WeChatProjects/bp-monitor-mini-program-chatgpt/utils/report-canvas.js)

## 7. 常见阅读误区

### 误区 1：以为 `inRange / high / critical` 直接就是页面颜色

不是。页面还会再做一次映射。

### 误区 2：以为“参考范围内”和“默认值”是同一个概念

不是。参考范围可以来自家庭自定义目标值，也可以退回默认值。

### 误区 3：以为 `countReferenceStats` 只是计数，不依赖业务规则

不是。它完全依赖 `getBPStatus` / `getHRStatus` 的 `attention` 判断。

## 8. 潜在问题检查

### 问题 1：`Number(target && target.xxx) || 默认值` 会把合法的 `0` 也当成无效值

当前项目里这些目标值不可能是 0，所以暂时问题不大。

但从通用写法看，这种写法的含义是：

- `0`
- `NaN`
- `undefined`

都会退回默认值。

建议后续验证：低优先级。

---

### 问题 2：`calcAverage()` 混合了业务计算和 UI 展示值 `'--'`

为什么可疑：

- 纯工具函数通常更偏向返回 `null` 或数字。
- 这里直接返回 `'--'`，说明它对页面展示有耦合。

可能影响：

- 如果以后别处想拿它做纯计算，要额外判断字符串。

建议后续验证：中优先级。

---

### 问题 3：状态规则在 `pages/report/report.js` 和 `utils/report-canvas.js` 里还有二次映射，存在分散风险

为什么可疑：

- 这个文件负责底层状态
- 报告页和导出图又各自做了“总体风险等级”映射

可能影响：

- 如果以后改状态标准，页面和导出图有机会不一致

建议后续验证：高优先级。

## 9. 建议下一步阅读哪个文件

建议下一步看：

`utils/date.js`

因为它是项目里另一个“基础规则层”工具，而且几乎每个页面都依赖它。把它看懂之后，你会更容易理解记录时间、分组、查询周期是怎么串起来的。

