## Context

当前报告页 banner 由 `utils/report-helpers.js` 中的 `buildAlertBanner()` 生成，返回 `{ type, title, text, pulse }`，随后由 `buildReportViewModel()` 注入到 `pages/report/report.js` 的页面数据，并被 `utils/report-exporter.js` 直接复用。现状中 banner 的 `text` 是固定文案，没有读取当前报告周期，因此 30 天和 90 天在异常分布不同的情况下会出现不同提示，但用户无法从文案本身知道统计口径。

这次调整属于文案层行为修正，不改变异常识别阈值、不改变 banner 类型，也不改变图表和摘要统计逻辑。

## Goals / Non-Goals

**Goals:**
- 让 banner 文案显式说明当前报告统计范围，例如“近 7 天 / 近 30 天 / 近 90 天”。
- 让报告预览页和导出图片使用同一份 period-aware banner 数据，避免口径漂移。
- 在不改动异常判断规则的前提下，降低用户对不同周期提示差异的理解成本。

**Non-Goals:**
- 不调整血压异常或高风险判定逻辑。
- 不新增 banner 类型、样式或交互。
- 不修改图表、摘要卡片或最近异常明细的统计口径。

## Decisions

### 1. 在共享 helper 中生成带时间范围的 banner 文案

将当前周期信息作为 banner 构建输入的一部分，在 `utils/report-helpers.js` 的共享 view-model 层拼出最终文案，而不是在页面层或导出层各自二次加工。

Rationale:
- `buildReportViewModel()` 已经同时服务于预览页和导出链路，是天然的单一数据源。
- 如果在 `pages/report/report.js` 或 `utils/report-exporter.js` 单独补文案，预览与导出容易再次出现不一致。

Alternative considered:
- 在 WXML 层根据 `selectedDays` 拼接前缀。放弃原因是导出链路不走 WXML，会产生双份逻辑。

### 2. 对所有异常 banner 类型统一带上周期说明

不仅高血压 warning banner，critical 和低血压 banner 也统一加上时间范围说明。

Rationale:
- 用户关注的是“这条提示覆盖了哪段时间”，不是某一种异常类型。
- 统一规则更容易测试，也能避免未来只修一部分文案导致体验不一致。

Alternative considered:
- 只给“血压偏高提示”追加时间范围。放弃原因是低血压或严重异常仍会留下同样的理解断层。

### 3. 标题保持不变，只调整说明文案

保留现有标题“血压偏高提示 / 低血压提示”，仅对 `text` 做 period-aware 扩展。

Rationale:
- 标题已经稳定，不需要为了解释统计范围扩大视觉变更面。
- 说明文案更适合承载“近 30 天 / 近 90 天”这类上下文。

Alternative considered:
- 在标题中拼接“近 30 天血压偏高提示”。放弃原因是标题会明显变长，可能增加换行和导出布局风险。

## Risks / Trade-offs

- [文案变长导致换行增加] → 复用当前 banner 自动测高逻辑，并在预览页与导出图一起验证 30/90 天场景。
- [未来新增报告周期时漏掉 period 文案] → 统一通过共享 helper 生成范围标签，避免各层自行硬编码。
- [只改预览不改导出] → 明确要求所有 surface 都消费同一份 `banner.text`。

## Migration Plan

1. 在共享 report helper 中引入“时间范围标签”生成逻辑。
2. 将 banner 文案改为基于当前 `days` 输出。
3. 复用现有 view model 输出到预览页和导出图，不引入额外字段分叉。
4. 增补回归验证，覆盖 30 天与 90 天周期切换下的 banner 文案差异和导出一致性。

Rollback:
- 如果发现文案过长或影响导出布局，可直接回退到原固定文案，不涉及数据迁移。

## Open Questions

- 暂无。默认对 7 天、30 天、90 天三种周期全部显示明确时间范围。
