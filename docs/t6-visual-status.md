# T6 Visual Status

说明：
- 当前 `docs/` 目录下没有 HTML 原型文件；本表中的“对应原型”实际对照的是 `design-references/` 下的 HTML/HTM 原型清单。
- 视觉判断基准是当前实现较完整的 [pages/data/data](/Users/ella/Documents/Code/Demo/WeChatProjects/family-care-prod/pages/data/data.wxml:1) 和 [pages/profile-home/profile-home](/Users/ella/Documents/Code/Demo/WeChatProjects/family-care-prod/pages/profile-home/profile-home.wxml:1)。
- “待确认”表示仓库中无直接原型对应，或页面目录已存在但不是当前主入口，无法仅凭代码确定其目标视觉稿。

## 活跃页面

| 页面路径 | 对应原型 | 视觉对齐状态 | 简要说明 |
| --- | --- | --- | --- |
| `pages/data/data` | `design-references/data-page/血压记录本 - 数据页终版v1.htm`、`design-references/data-page/血压记录本 - 数据页 (空状态).html` | 已对齐 | 当前视觉基准页，背景、卡片、间距、浮层和按钮体系最完整。 |
| `pages/profile-home/profile-home` | `design-references/family-page/血压记录本 - 家庭管理最终版.htm`、`design-references/family-page/血压记录本 - 家庭管理 (空状态).html`、`design-references/family-page/已加入家庭-无数据.html` | 部分对齐 | 主体结构已跟进，但卡片圆角/阴影仍偏重，区块节奏还在持续微调。 |
| `pages/records-list/records-list` | `design-references/records-page/血压记录本 - 全部记录.html`、`design-references/records-page/全部记录-家属只读态.html` | 已对齐 | 已切原生导航栏、月份筛选、分组卡片、左滑删除和导出面板，配色与数据页体系一致。 |
| `pages/import-records/import-records` | 待确认（原型清单中无独立导入页） | 已对齐 | 已统一为浅蓝背景、白卡片、32rpx 圆角和主次按钮体系。 |
| `pages/profile-edit/profile-edit` | `design-references/settings-page/初始档案设置.html` | 部分对齐 | 功能结构已收敛，但仍保留旧式表单边框、字号和大标题节奏，未完全跟进数据页卡片体系。 |
| `pages/profile-threshold-edit/profile-threshold-edit` | `design-references/settings-page/测压提醒设置.html` | 未开始 | 仍是旧的独立阈值编辑页，视觉与当前设置页/档案页体系明显脱节。 |
| `pages/profile-members/profile-members` | `design-references/family-page/血压记录本 - 家庭管理最终版.htm`（旧独立成员管理链路） | 未开始 | 仍是旧的自定义 header + 列表页视觉，且主交互已迁到 `member-panel` 半屏组件。 |
| `pages/medication-edit/medication-edit` | 待确认（原型清单中无独立用药编辑页） | 部分对齐 | 已有白卡片和浅蓝输入区，但仍保留旧式 sticky header、表单边框和较重的页面结构。 |
| `pages/invite-create/invite-create` | `design-references/invite-flow/邀请家人海报.html`、`design-references/invite-flow/邀请家人查看 - 最终版 v1.htm` | 部分对齐 | 已用卡片化布局，但字号、卡片圆角和控件细节仍偏旧体系。 |
| `pages/invite-accept/invite-accept` | `design-references/invite-flow/接受邀请 - 最终版 v1.htm`、`design-references/invite-flow/邀请失效.html` | 部分对齐 | 结构完整，但仍是旧卡片密度和旧色值，没有完全跟进数据页/档案页的留白与灰阶。 |
| `pages/report/report` | `design-references/report-page/report-page.html`、`design-references/report-page/权限挽回弹窗.html` | 部分对齐 | 图表与内容卡片已可用，但 tabs、摘要、弹层和色彩密度仍是上一代风格。 |
| `pages/user-profile-edit/user-profile-edit` | 待确认（原型清单中无独立个人资料编辑页） | 部分对齐 | 仍是旧式自定义 header 和基础表单卡片，未完全对齐新设置页的分区标题与卡片节奏。 |
| `pages/user-settings/user-settings` | `design-references/settings-page/settings-page.html`、`design-references/settings-page/测压提醒设置.html` | 已对齐 | 已重构为与数据页/档案页一致的分区标题、卡片、stepper、pill 和半屏面板体系。 |

## 已清理的历史目录

| 页面路径 | 对应原型 | 视觉对齐状态 | 简要说明 |
| --- | --- | --- | --- |
| `pages/home/home` | 待确认 | 不适用 | 历史空目录，已清理，不在 `app.json` 中。 |
| `pages/profile-detail/profile-detail` | 待确认 | 不适用 | 历史空目录，已清理，不在 `app.json` 中。 |
| `pages/profile-settings/profile-settings` | `design-references/settings-page/settings-page.html`（历史对应，待确认） | 不适用 | 历史空目录，已清理，不在 `app.json` 中。 |
| `pages/spike-canvas/spike-canvas` | 待确认 | 不适用 | 实验空目录，已清理，不在 `app.json` 中。 |
