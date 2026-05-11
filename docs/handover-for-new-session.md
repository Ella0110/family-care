# 项目交接文档（T6 进行中）

## 项目身份
- 产品名：来自儿女的关心（family-care）
- 仓库：`family-care`
- 当前 git HEAD（本交接文档编写时）：`eed7cd56f5b49d25eb4535c3ecbf6f6f68a5fc60`
- 上次完整收尾阶段：T5
- 当前进行中阶段：T6
- 当前切入点：T6（双 tab + custom tabBar 已落地；数据页、档案页和共享图表仍在持续调整）

## 用户当前状态（给新会话的 Claude / Codex 参考）

- 用户（Ella）是开发者 + 产品经理 + 主要使用者，不是普通家人代理
- 用户的核心目标：
  1. 自己导入历史血压数据看趋势 / 报告（依赖 T5.1 + T5.5）
  2. 邀请家人共同监测血压（T4.2b 已完成）
- 测试微信号：用户没有第二个微信号，T4 双账号烟测用了家人的微信
- 用户暂未让父母装小程序使用（多次拒绝过“先内测”建议）
- 用户的产品观点：偏好“做完整再上线”而非“边做边内测”
- 用户对工程质量要求高：愿意为根因修复多花时间，不接受 hack 修复

## 核心架构快照
- 数据模型：Path B，核心是 `users / profiles / relationships` 三表，没有“家庭”中间层
- 云函数：21 个，详见 [project-status.md](/Users/ella/Documents/Code/Demo/WeChatProjects/family-care-prod/docs/project-status.md:1)
- 前端框架：原生微信小程序 + 手写订阅式 store + 自定义 `custom-tab-bar`
- 缓存策略：T2.5 SWR；T4.2b 对 `home / profile-members` 增加 30 秒 staleness 强刷

## T6 架构说明

### 路由与 tab 结构
- 当前主入口是 `pages/data/data` 和 `pages/profile-home/profile-home`
- `app.json` 已启用 `tabBar.custom: true`
- 旧 `pages/home/home` 仍保留在 pages 路由表中，但不再是 tabBar 主入口

### 自定义 tabBar
- `custom-tab-bar/index.js` 当前直接内嵌 base64 SVG 图标，不依赖 PNG 才能显示图标
- 左右两个 tab 分别切到 `pages/data/data` 和 `pages/profile-home/profile-home`
- 中间 `+` 按钮不是装饰，它直接承载“录入血压”入口
- `+` 按钮是否显示取决于：当前是否有 `currentProfileId`，以及当前用户是否对该档案 `canWrite`
- 如果当前就在数据页，点击 `+` 直接调用当前页的 `handleOpenRecordPanel()`
- 如果当前不在数据页，tabBar 会先通过 `app.requestOpenRecordPanelOnDataTab()` 设置一个待消费标记，再 `switchTab('/pages/data/data')`

### 全局档案状态
- 当前档案状态统一放在 `store.state.currentProfileId`
- `app.js` 登录成功后，会优先尝试读取本地存储的 `currentProfileId`；如果无效，则回退到第一个档案
- `app.js` 还会持续监听 store，把 `currentProfileId` 写回本地存储
- 数据页和档案页都直接订阅 store，因此切换档案后两个 tab 会同步刷新

### 数据页（`pages/data/data`）
- 页面会先等待 `loginReady`，登录未完成前只显示白底 loading
- 页面再用 `pageReady` 控制真正渲染，避免冷启动、切档或建档后的空态 / 旧数据闪烁
- 顶部通过 `profile-switcher` 切换当前档案
- 最近血压卡片、分析卡片、血压图、心率图、图表导出、空态导入入口都集中在这一页
- 图表数据当前通过 `callSilent('getRecords')` 独立查询，再本地按 `measuredAt desc + createdAt desc` 兜底排序
- 页面内不再自己放置悬浮录入按钮；录入入口已经迁移到 custom tabBar 中央按钮
- 数据页仍然挂着共享的 `record-panel` 组件，既用于新建也用于编辑 / 删除记录

### 档案页（`pages/profile-home/profile-home`）
- 页面同样先等待 `loginReady`，再用 `pageReady` 避免闪烁
- 当前结构已经不是骨架页，实际包含：
  - 顶部档案标题 + 设置入口
  - 档案 hero 卡片（头像首字、姓名、年龄、出生年份、owner 编辑入口）
  - 健康概览（当前血压、当前心率、可选的用药摘要、可选的紧急联系人）
  - 成员横向列表
  - 就诊报告、药物管理两个快捷入口
  - 异常血压通知 toggle、字体大小入口
  - owner 可见的删除档案区
- 页面底部仍保留一个“查看全部档案”入口，用来再次打开 `profile-switcher`

### 共享组件
- `components/profile-switcher/*`
  - 当前是遮罩 + 半屏列表浮层
  - 支持显示档案名称、关系、当前选中态
  - 组件内部直接跳 `profile-edit?mode=create&returnTab=...`
- `components/record-panel/*`
  - 当前是底部半屏录入 / 编辑面板
  - 面板字段实际只有：测量日期、测量时间、高压、低压、心率
  - 新建和编辑共用一套 `utils/record-editor.js` 保存逻辑
  - 编辑模式支持删除，删除确认当前使用 `wx.showModal`

### 共享工具层
- `utils/report-helpers.js` 负责图表时间轴与数据预处理
- `utils/report-chart-renderer.js` 负责血压 / 心率 canvas 绘制
- 当前 `data` 和 `report` 两页共享这一套图表 helper，因此图表行为是联动的
- `utils/app-login-status.js`、`utils/profile-store.js`、`utils/alert-subscription.js` 已经被 `home / data / profile-home` 复用，不再各页散写同类逻辑

### 当前仍保留的旧结构
- `pages/home/home` 还在，且仍承载旧的单档案 / 多档案逻辑；它不是 tabBar 入口，但外部链接和部分旧流程仍可能进入
- `profile-detail`、`profile-settings` 的真实使用状态本次未核对到页面代码，若要接手这两个页面请先再读实际文件；当前在路由表里都还存在

## 关键工程约定（不要违反的硬规则）
1. 云函数 `_shared` 用构建复制方案，不能直接依赖父目录，见 [deployment-notes.md](/Users/ella/Documents/Code/Demo/WeChatProjects/family-care-prod/docs/deployment-notes.md:1)
2. 前端绝不引用云函数代码或 `cloudfunctions/_shared/*`
3. 三层自验 gate 不能省：本地逻辑、部署单元、DevTools 烟测
4. 写操作优先做本地即时缓存更新，避免整包失效导致明显 loading 回退
5. 每个 T 阶段结束要更新 [project-status.md](/Users/ella/Documents/Code/Demo/WeChatProjects/family-care-prod/docs/project-status.md:1)
6. 微信能力不要靠记忆假设，必须先在当前基础库 / DevTools / 真机验证

## 历史踩坑清单（避免再踩）

### T1.1 云函数 `_shared` 打包坑
- 阶段：T1
- 现象：云端 `require('../_shared/xxx')` 直接报模块不存在
- 根因：微信云函数上传时只打包当前函数目录，不会带父级相对路径
- 修复：改成 `scripts/build-cloudfunctions.js`，把 `_shared` 复制进每个函数目录并统一生成 `package.json`
- 记这条是为了：后续新增云函数时，先想部署单元，不要只想源码结构

### T1.2 跨目录依赖坑
- 阶段：T1
- 现象：某些函数运行依赖另一个函数目录里的 handler，本地能跑，云端隔离后炸
- 根因：把“共享逻辑”写成了“跨函数目录复用”
- 修复：抽到 `cloudfunctions/_shared/*`
- 记这条是为了：云函数之间不能互相 require，只能共享 `_shared`

### T1.3 `wx-server-sdk` 部署坑
- 阶段：T1
- 现象：前端调用成功到云函数层，但云端报 `wx-server-sdk is unavailable`
- 根因：每个函数目录缺少最小 `package.json`，上传后没装服务端 SDK
- 修复：构建阶段为每个云函数生成 manifest，并加部署检查脚本
- 记这条是为了：以后凡是新增云函数，都要走 `build:functions` 和 manifest 验证

### T1.4 本地 fake runtime 语义不一致坑
- 阶段：T1
- 现象：本地 verify 通过，真实云端首次登录 / 缺失文档却报错
- 根因：fake cloud 把 `doc().get()` 的“不存在即抛错”模拟成了空值返回，还漏了 `doc().set()` 对 `_id` 的真实限制
- 修复：对齐真实云数据库语义，并补回归脚本
- 记这条是为了：本地桩一旦和真实平台语义不一致，会把最危险的边界 bug 藏起来

### T2.5 请求风暴坑
- 阶段：T2.5
- 现象：首页 / 列表频繁自刷新，云函数调用量异常飙升，出现网络错误和假性超时
- 根因：把 cache 写入 store 后，订阅逻辑又拿 store 变化触发新请求，形成刷新环
- 修复：收紧订阅条件，只对真正影响视图的状态变化响应；写操作本地更新缓存，不整包失效
- 记这条是为了：store 与 SWR 联动时，任何“写缓存 -> 触发订阅 -> 再请求”的闭环都要第一时间怀疑

### T3.2a 会话态提示坑
- 阶段：T3.2a
- 现象：完善档案提示卡片被用户关闭后，下次重新进入前台不恢复；而且一度没有稳定的档案编辑入口
- 根因：提示关闭状态只存在内存里但未按“会话”边界重置；入口又过度依赖提示卡片本身
- 修复：`app.onShow()` 重置 session dismissals，并在档案详情里加独立“编辑档案”入口
- 记这条是为了：会话态 UI 不能既想短期记忆又想长期持久；关键入口不能依赖临时提示卡片

### T3.2b 旧 UI 状态参与新计算坑
- 阶段：T3.2b
- 现象：从档案列表进入单档案时，不显示“完善档案信息”卡片；从子页面返回时又显示
- 根因：提示卡片计算读的是旧的 `this.data.viewState`，不是本次即将渲染的新状态
- 修复：计算函数改为显式接收 fresh `viewState`
- 记这条是为了：小程序 `setData` 时序下，任何“先算新状态，再读旧 data 做条件”的代码都很危险

### T4.2a 微信能力坑
- 阶段：T4.2a
- 现象：`wx.getUserProfile` 在当前微信环境下不稳定弹授权，且常只能拿到 `微信用户` 占位值
- 根因：旧 prompt 基于过时微信能力假设；真实基础库已不适合继续依赖这条链路
- 修复：邀请页改为 `input type="nickname"` 主动填写昵称 + `chooseAvatar` 可选头像；前后端都把 `微信用户` 视为无效昵称
- 记这条是为了：微信能力是会演化的，尤其用户资料、分享、授权类 API，必须先实测再设计

### T4.2b 协作刷新坑
- 阶段：T4.2b
- 现象：A 改 B 的角色后，B 端仍读旧 relationship，必须清缓存甚至重启小程序才生效
- 根因：T2.5 的 SWR 假设“单用户自己改自己数据”，不适配“另一个人改了我的权限”
- 修复：`home / profile-members` 增加 30 秒 staleness 检测与强刷；其余页保持原 SWR
- 记这条是为了：协作场景下，权限和成员关系不是纯本地数据，缓存策略必须单独升级

## 已识别但尚未踩的微信能力风险（T5 阶段必读）

### 订阅消息（T5.3 / T5.4）
- 微信订阅消息有“一次性订阅”和“长期订阅”两种模式
- 长期订阅需要在公众平台申请并审核，并非所有类目都能拿到
- 模板字段格式严格（`thing / number / time` 等类型 + 长度限制）
- 用户授权后的推送有时效与频次限制
- T4.2a 已经踩过 `wx.getUserProfile` 失效的坑。T5 阶段开始订阅消息开发前，必须先去微信公众平台官方文档确认 2026 年的订阅消息政策与可用模板，不要基于历史假设设计

### 定时触发器（T5.4）
- 测压提醒依赖云函数定时触发 + 订阅消息
- 定时触发器在云开发的当前形态需要确认（是否支持 cron、最小粒度、并发限制等）
- 同样需要先实测，不要假设

## 当前重要文件清单
- [docs/project-status.md](/Users/ella/Documents/Code/Demo/WeChatProjects/family-care-prod/docs/project-status.md:1)：全局状态总览，阶段进度、云函数清单、关键决策、已知坑
- [docs/deployment-notes.md](/Users/ella/Documents/Code/Demo/WeChatProjects/family-care-prod/docs/deployment-notes.md:1)：云函数打包、部署、自验 gate 约定
- [docs/t4-contracts.md](/Users/ella/Documents/Code/Demo/WeChatProjects/family-care-prod/docs/t4-contracts.md:1)：协作邀请、角色权限、刷新策略与通知开关约定
- [app.js](/Users/ella/Documents/Code/Demo/WeChatProjects/family-care-prod/app.js:1)：登录、启动态、fontScale、邀请冷启动 token、session reset
- [store/index.js](/Users/ella/Documents/Code/Demo/WeChatProjects/family-care-prod/store/index.js:1)：全局 store、SWR cache、staleness 时间戳
- [services/request.js](/Users/ella/Documents/Code/Demo/WeChatProjects/family-care-prod/services/request.js:1)：统一云函数调用入口、错误码挂载、开发环境请求风暴告警
- [services/profile-service.js](/Users/ella/Documents/Code/Demo/WeChatProjects/family-care-prod/services/profile-service.js:1)：档案 create/update/delete/settings 更新
- [services/record-service.js](/Users/ella/Documents/Code/Demo/WeChatProjects/family-care-prod/services/record-service.js:1)：血压记录 SWR、即时缓存更新
- [services/medication-service.js](/Users/ella/Documents/Code/Demo/WeChatProjects/family-care-prod/services/medication-service.js:1)：用药 SWR、active/historical 分组缓存
- [services/invitation-service.js](/Users/ella/Documents/Code/Demo/WeChatProjects/family-care-prod/services/invitation-service.js:1)：邀请创建 / 预览 / 接受
- [services/member-service.js](/Users/ella/Documents/Code/Demo/WeChatProjects/family-care-prod/services/member-service.js:1)：成员列表、角色调整、移除、转让，外加当前用户关系本地同步
- [services/user-service.js](/Users/ella/Documents/Code/Demo/WeChatProjects/family-care-prod/services/user-service.js:1)：用户设置与邀请昵称/头像更新
- [utils/permission-helpers.js](/Users/ella/Documents/Code/Demo/WeChatProjects/family-care-prod/utils/permission-helpers.js:1)：前端统一权限判断，不要在页面里散落 role 判断
- [custom-tab-bar/index.js](/Users/ella/Documents/Code/Demo/WeChatProjects/family-care-prod/custom-tab-bar/index.js:1)：当前自定义 tabBar 真正入口，中间 `+` 按钮逻辑也在这里
- [pages/data/data.js](/Users/ella/Documents/Code/Demo/WeChatProjects/family-care-prod/pages/data/data.js:1)：当前主数据页；`loginReady/pageReady`、图表、录入面板、导出、空态导入入口都在这里
- [pages/profile-home/profile-home.js](/Users/ella/Documents/Code/Demo/WeChatProjects/family-care-prod/pages/profile-home/profile-home.js:1)：当前档案 tab；档案概览、成员、快捷入口、通知 toggle、删除档案都在这里
- [components/profile-switcher/profile-switcher.js](/Users/ella/Documents/Code/Demo/WeChatProjects/family-care-prod/components/profile-switcher/profile-switcher.js:1)：数据页 / 档案页共享的档案切换器
- [components/record-panel/record-panel.js](/Users/ella/Documents/Code/Demo/WeChatProjects/family-care-prod/components/record-panel/record-panel.js:1)：数据页共享的录入 / 编辑面板
- [utils/record-editor.js](/Users/ella/Documents/Code/Demo/WeChatProjects/family-care-prod/utils/record-editor.js:1)：`record` 页面和 `record-panel` 共用的保存 / 更新 / 删除逻辑
- [utils/report-chart-renderer.js](/Users/ella/Documents/Code/Demo/WeChatProjects/family-care-prod/utils/report-chart-renderer.js:1)：数据页和报告页共享的图表绘制逻辑
- [utils/report-helpers.js](/Users/ella/Documents/Code/Demo/WeChatProjects/family-care-prod/utils/report-helpers.js:1)：数据页和报告页共享的图表数据预处理逻辑
- [pages/home/home.js](/Users/ella/Documents/Code/Demo/WeChatProjects/family-care-prod/pages/home/home.js:1)：旧主页面仍保留；历史逻辑和部分流程还在这里
- [pages/profile-members/profile-members.js](/Users/ella/Documents/Code/Demo/WeChatProjects/family-care-prod/pages/profile-members/profile-members.js:1)：成员管理页；当前允许所有已关联角色查看，owner 负责角色调整、移除与转让流程
- [pages/invite-create/invite-create.js](/Users/ella/Documents/Code/Demo/WeChatProjects/family-care-prod/pages/invite-create/invite-create.js:1)：邀请发起页，昵称/头像输入与分享入口
- [pages/invite-accept/invite-accept.js](/Users/ella/Documents/Code/Demo/WeChatProjects/family-care-prod/pages/invite-accept/invite-accept.js:1)：邀请接受状态机
- [pages/user-settings/user-settings.js](/Users/ella/Documents/Code/Demo/WeChatProjects/family-care-prod/pages/user-settings/user-settings.js:1)：字号、关于、我的资料入口
- [pages/user-profile-edit/user-profile-edit.js](/Users/ella/Documents/Code/Demo/WeChatProjects/family-care-prod/pages/user-profile-edit/user-profile-edit.js:1)：用户修改自己的昵称与头像
- [cloudfunctions/_shared/permissions.js](/Users/ella/Documents/Code/Demo/WeChatProjects/family-care-prod/cloudfunctions/_shared/permissions.js:1)：云端角色权限矩阵唯一真相源
- [cloudfunctions/_shared/auth.js](/Users/ella/Documents/Code/Demo/WeChatProjects/family-care-prod/cloudfunctions/_shared/auth.js:1)：当前用户、relationship、权限检查链路
- [cloudfunctions/_shared/invitation-utils.js](/Users/ella/Documents/Code/Demo/WeChatProjects/family-care-prod/cloudfunctions/_shared/invitation-utils.js:1)：邀请 token、状态、昵称占位值处理
- [scripts/verify-*.js](/Users/ella/Documents/Code/Demo/WeChatProjects/family-care-prod/scripts/verify-t4.2b.js:1)：阶段化本地回归脚本是现在最重要的防回归资产

## T5 历史说明
- `docs/t5-roadmap.md` 仍保留在仓库中，可作为 T5 的历史规划参考
- 但当前阶段已经不是 T5 起点，新的会话应优先以 `project-status.md`、本交接文档和实际代码为准

## 当前未完成的事
- `docs/t1-manual-test-checklist.md` 一直未提交，且无关紧要
- 代码层面仍在继续调整 T6 的数据页、档案页、共享图表和 custom tabBar；不要把 `project-status.md` 里“当前切入点：T6”理解成已收尾
