# 来自儿女的关心 — 设计规范（Design Tokens）

> 本文档是 V1.1 前端视觉一致性的唯一真相源。所有 Codex 实施 prompt 以本文档为准。
> 设计语言参考 Apple HIG（Human Interface Guidelines）。

---

## 一、颜色系统

### 1.1 文字色

| Token | 色值 | 用途 | 替代掉的旧值 |
|---|---|---|---|
| `textPrimary` | `#1C1C1E` | 主文字 | `#0f172a`, `#111827`, `#1d1d1f`, `#1e293b` |
| `textSecondary` | `#8E8E93` | 次要文字 | `#64748b`, `#6b7280`, `#475569`, `#94a3b8` |
| `textTertiary` | `#C7C7CC` | 占位/禁用文字 | `#9ca3af`, `#a0a7b4`, `#cbd5e1` |
| `textOnPrimary` | `#FFFFFF` | 蓝底/深色底上的白字 | — |
| `textLink` | `#007AFF` | 可点击文字 | `#2563eb`, `#1d4ed8`, `#1e40af`, `#1e3a8a` |

### 1.2 背景色

| Token | 色值 | 用途 | 替代掉的旧值 |
|---|---|---|---|
| `bgPage` | `#F2F2F7` | 页面底色 | `#f8fafc`, `#f7f7f7`, `#f0f4f8` |
| `bgCard` | `#FFFFFF` | 卡片/容器 | — |
| `bgInput` | `#F2F2F7` | 输入框/选中态底色 | `#f1f5f9`, `#f3f4f6`, `#f4f5f7`, `#eef2f7` |
| `bgOverlay` | `rgba(0,0,0,0.4)` | 蒙层 | — |

### 1.3 品牌/功能色

| Token | 色值 | 用途 | 替代掉的旧值 |
|---|---|---|---|
| `colorPrimary` | `#007AFF` | 主品牌蓝（Apple system blue） | `#3182f7`, `#3478f6`, `#2563eb` |
| `colorSuccess` | `#34C759` | 正常血压/成功 | `#047857`, `#10b981` |
| `colorWarning` | `#FF9500` | 临界偏高 | `#F5A623` |
| `colorDanger` | `#FF3B30` | 偏高/危险操作 | `#b42318` |
| `colorWeChat` | `#07C160` | 微信专用绿（仅授权按钮） | — |

### 1.4 血压专用色

| Token | 色值 | 用途 |
|---|---|---|
| `bpLow` | `#007AFF` | 偏低（<90/<60） |
| `bpNormal` | `#34C759`（记录页标签）/ `textPrimary`（数据页数值） | 正常（90-119/60-79） |
| `bpElevated` | `#F5A623` | 临界偏高（120-139/80-89） |
| `bpHigh1` | `#FF9500` | 偏高 1 级（140-159/90-99） |
| `bpHigh2` | `#FF3B30` | 偏高 2-3 级（≥160/≥100） |

**显示规则**：
- 数据页：正常 = 无标签（数值用 `textPrimary`）；异常 = 对应颜色
- 记录页：正常 = 绿色标签（`#34C759`）；异常 = 对应颜色标签

### 1.5 边框/分隔线

| Token | 色值 | 用途 | 替代掉的旧值 |
|---|---|---|---|
| `borderLight` | `#E5E5EA` | 分隔线 | `#e2e8f0`, `#e5e7eb`, `#d1d9e0` |
| `borderFocus` | `rgba(0,122,255,0.12)` | 焦点态外发光 | `rgba(29,78,216,.12)` |

### 1.6 浅色背景（功能色 10% 透明度）

| Token | 色值 | 用途 | 替代掉的旧值 |
|---|---|---|---|
| `bgPrimaryLight` | `#EFF6FF` | 蓝色浅底 | `#dbeafe`, `#ebf5ff`, `#eef4ff`, `#f6f7fc` |
| `bgDangerLight` | `#FEF2F2` | 红色浅底 | `#fff0f0` |
| `bgWarningLight` | `#FFF8F0` | 橙色浅底 | `#fff7ed`, `#fff4eb`, `#fff9eb` |
| `bgSuccessLight` | `#F0FFF4` | 绿色浅底 | — |

---

## 二、字号系统

### 2.1 字号阶梯（font-scale.js FONT_SIZES_RPX）

| Token | 1.0 | 1.15 | 1.3 | 用途 |
|---|---|---|---|---|
| `bpSystolic` | 135rpx | 140rpx | 145rpx | Canvas 收缩压大数字 |
| `bpDiastolic` | 105rpx | 110rpx | 115rpx | Canvas 舒张压大数字 |
| `hero` | 80rpx | 92rpx | 104rpx | 主视觉大数字 |
| `title` | 36rpx | 41rpx | 47rpx | 页面/卡片标题 |
| `button` | 32rpx | 37rpx | 42rpx | 按钮文本 |
| `body` | 30rpx | 35rpx | 39rpx | 正文 |
| `secondary` | 26rpx | 30rpx | 34rpx | 次级信息 |
| `label` | 24rpx | 28rpx | 31rpx | 标签说明 |
| `caption` | 22rpx | 25rpx | 29rpx | 图注辅助 |

### 2.2 不缩放的文字

| 元素 | 理由 |
|---|---|
| 图表坐标轴文字 | Canvas 渲染，缩放会重叠 |
| tabBar 文字 | 已用 caption token，空间极有限 |
| invite-accept 页全部文字 | 产品决策豁免 |
| launch 页 | 中转页，无业务文本 |

---

## 三、间距系统（font-scale.js 新增）

间距缩放比 ≈ 字号缩放比的 40-50%。文字涨 30%，间距涨 12-15%。

| Token | 1.0 | 1.15 | 1.3 | 用途 |
|---|---|---|---|---|
| `spaceXS` | 8rpx | 8rpx | 10rpx | 图标与文字间距、极小分隔 |
| `spaceSM` | 12rpx | 14rpx | 16rpx | 微调间距 |
| `spaceMD` | 16rpx | 18rpx | 20rpx | 组件内间距 |
| `spaceLG` | 24rpx | 26rpx | 28rpx | 通用间距、按钮 padding |
| `spaceXL` | 32rpx | 34rpx | 38rpx | 大容器 padding |
| `space2XL` | 48rpx | 50rpx | 54rpx | 卡片内 padding |

---

## 四、圆角系统

| Token | 值 | 用途 |
|---|---|---|
| `radiusSM` | 16rpx | 输入框、pill、小组件 |
| `radiusMD` | 24rpx | 按钮 |
| `radiusLG` | 32rpx | 卡片、弹层 |
| `radiusFull` | 50% | 头像、圆形图标 |

淘汰 `20rpx`、`28rpx`、`999rpx` 等零散值，统一到最近档位。

---

## 五、阴影系统

| Token | 值 | 用途 |
|---|---|---|
| `shadowCard` | `0 4rpx 20rpx rgba(0,0,0,0.02)` | 卡片 |
| `shadowFloat` | `0 12rpx 32rpx rgba(0,0,0,0.08)` | 浮层/弹窗 |
| `shadowSheet` | `0 -12rpx 32rpx rgba(0,0,0,0.08)` | 底部 sheet |
| `shadowButton` | `0 8rpx 24rpx rgba(0,122,255,0.2)` | 主按钮 |

**所有阴影一律使用 rpx，禁止 px/rpx 混用。**

---

## 六、容器高度规则

| 场景 | 规则 |
|---|---|
| 含文字的容器 | 用 `min-height`，禁止 `height` |
| 按钮 | `min-height` = button token + spaceLG × 2 |
| 输入框 | `min-height` = body token + spaceMD × 2 |
| 固定高度（图表、头像、图标） | `height` 写死，不跟随字号 |
| 弹层 / sheet | `max-height: 85vh`，内部可滚动 |

---

## 七、横向布局规则

| 场景 | 规则 |
|---|---|
| 标题 + 右侧操作 | 标题 `flex: 1` + `overflow: hidden` + `text-overflow: ellipsis`；操作 `flex-shrink: 0` |
| 多列等分（统计卡片） | `flex-wrap: wrap`，`min-width` 保证至少 2 列 |
| 标签横排（7天/30天/90天） | `white-space: nowrap` + `scroll-x` 兜底 |
| 状态标签（临界偏高等） | `white-space: nowrap` + `flex-shrink: 0` |
| 成员横滚 | `scroll-x` + iOS 风格可见滚动条 |

---

## 八、app.wxss 全局 CSS 变量定义

```css
page {
  /* 文字色 */
  --text-primary: #1C1C1E;
  --text-secondary: #8E8E93;
  --text-tertiary: #C7C7CC;
  --text-on-primary: #FFFFFF;
  --text-link: #007AFF;

  /* 背景色 */
  --bg-page: #F2F2F7;
  --bg-card: #FFFFFF;
  --bg-input: #F2F2F7;
  --bg-overlay: rgba(0,0,0,0.4);

  /* 品牌/功能色 */
  --color-primary: #007AFF;
  --color-success: #34C759;
  --color-warning: #FF9500;
  --color-danger: #FF3B30;
  --color-wechat: #07C160;

  /* 血压专用色 */
  --bp-low: #007AFF;
  --bp-normal: #34C759;
  --bp-elevated: #F5A623;
  --bp-high1: #FF9500;
  --bp-high2: #FF3B30;

  /* 边框 */
  --border-light: #E5E5EA;
  --border-focus: rgba(0,122,255,0.12);

  /* 浅色背景 */
  --bg-primary-light: #EFF6FF;
  --bg-danger-light: #FEF2F2;
  --bg-warning-light: #FFF8F0;
  --bg-success-light: #F0FFF4;

  /* 圆角 */
  --radius-sm: 16rpx;
  --radius-md: 24rpx;
  --radius-lg: 32rpx;
  --radius-full: 50%;

  /* 阴影 */
  --shadow-card: 0 4rpx 20rpx rgba(0,0,0,0.02);
  --shadow-float: 0 12rpx 32rpx rgba(0,0,0,0.08);
  --shadow-sheet: 0 -12rpx 32rpx rgba(0,0,0,0.08);
  --shadow-button: 0 8rpx 24rpx rgba(0,122,255,0.2);
}
```

---

## 九、实施分波计划

| 波次 | 内容 | 涉及范围 |
|---|---|---|
| Wave 0 | `font-scale.js` 增加间距 token + `app.wxss` 定义全局 CSS 变量 + 本文档入库 | 基础设施 |
| Wave 1 | data + profile-home 全量 token 化（颜色、间距、圆角、阴影、高度） | 2 个核心 tab 页 |
| Wave 2 | records-list + record-panel + profile-switcher | 列表与录入 |
| Wave 3 | user-settings + user-profile-edit + profile-edit + profile-threshold-edit | 设置类页面 |
| Wave 4 | invite-create + profile-members + profile-selector + subscribe-guide + medication-edit | 协作与辅助 |
| Wave 5 | import-records + report + custom-tab-bar + 全局扫尾 | 剩余页面 |
| Wave 6 | Codex 自查 + Claude Code cross-review + 本文档定稿 | 质量保障 |

每波完成后在 1.0 和 1.3 下各截关键页面验收。

---

## 十、变更日志

| 日期 | 内容 |
|---|---|
| 2026-06-19 | 初版，覆盖颜色/字号/间距/圆角/阴影/布局规则 |
