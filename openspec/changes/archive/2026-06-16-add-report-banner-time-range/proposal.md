## Why

当前报告页的告警 banner 只说明“存在较高血压记录”或“部分测量值超出正常范围”，没有明确这些判断对应的是哪一个统计时间段。用户在 30 天和 90 天之间切换时，看到不同提示但无法直接理解差异来源，容易把文案变化误解为系统不稳定或判断标准变化。

## What Changes

- 为报告页告警 banner 的说明文案补充当前报告时间范围，例如“近 30 天”或“近 90 天”。
- 统一预览页和导出图片中的 banner 文案来源，确保同一时间范围下看到完全一致的提示。
- 明确高血压提示、严重高血压提示、低血压提示在不同报告周期下都需要带上时间范围说明。

## Capabilities

### New Capabilities
- `report-alert-banner`: 定义报告页告警 banner 在不同报告周期下的展示文案和导出一致性要求。

### Modified Capabilities

## Impact

- 影响报告 view model 生成逻辑，尤其是 `utils/report-helpers.js` 中 banner 文案构建。
- 影响报告预览页与导出图的共享数据契约，包括 `pages/report/report.js` 和 `utils/report-exporter.js`。
- 需要补充或更新与报告 banner 文案相关的回归验证。
