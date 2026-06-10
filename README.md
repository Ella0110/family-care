# 来自儿女的关心（family-care）

> 一款帮助子女远程关注父母血压健康的微信小程序 —— 多档案管理 · 家庭协作 · 异常提醒 · 就诊报告

**已上线** | 微信搜索「来自儿女的关心」或扫码体验：

<!-- TODO: 替换为你的小程序码 -->
<p align="center">
  <img src="assets/images/qrcode.png" width="180" alt="小程序码">
</p>

## 产品截图

<!-- <p align="center">
  <img width="150" alt="record_panel" src="https://github.com/user-attachments/assets/745222df-c7e7-453a-a5fd-ec0d1cc3a3fe" />
  <img width="150" alt="record_list" src="https://github.com/user-attachments/assets/99f2f9cc-f0c3-4c22-8165-faf9948ba7c0" />
  
  <img width="150" alt="setting_page" src="https://github.com/user-attachments/assets/a0fa34ab-4ce9-4296-87a4-334e19e0f635" />
</p> -->

<p align="center">
  <img width="177" alt="data_page" src="https://github.com/user-attachments/assets/b5be3a42-eeeb-4b5f-bf1f-cbee7b14e429" />
  <img width="200" alt="profile_page" src="https://github.com/user-attachments/assets/76595d20-d32a-4b50-a0b8-7fef8005d95f" />
</p>

## 这是什么

中国有大量长期高血压老人，而他们的子女往往不在身边。这个小程序解决一个具体问题：**让子女能远程看到父母的血压数据，并在出现异常时第一时间收到提醒。**

- **多档案**：一个账号管理多位家人（爸爸、妈妈、爷爷……）的血压档案
- **家庭协作**：通过邀请链接让兄弟姐妹加入，按角色（管理员 / 协作者 / 查看者）控制权限
- **异常提醒**：血压超过自定义阈值时，向所有订阅成员发送微信订阅消息
- **就诊报告**：一键生成含趋势图、统计摘要、用药信息的长图报告，就诊时直接给医生看
- **适老化**：支持三档全局字号缩放（1.0 / 1.15 / 1.3），老人自己录入也不费劲
- **数据导入导出**：CSV 格式批量导入历史数据 / 导出全部记录

## 技术栈

| 层       | 选型                                         |
| -------- | -------------------------------------------- |
| 前端     | 微信小程序原生框架（无第三方 UI 库）         |
| 状态管理 | 手写轻量订阅式 Store + SWR 缓存层            |
| 后端     | 微信云开发 Serverless 云函数（Node.js）× 20+ |
| 数据库   | 云开发 NoSQL 文档数据库                      |
| 图表     | Canvas 2D 自绘（趋势图、长图报告渲染）       |
| 推送     | 微信订阅消息                                 |

## 项目结构

```
├── pages/               # 页面（录入、记录列表、档案、成员管理、报告、导入导出等）
├── components/          # 自定义组件
├── services/            # 服务层：统一云函数调用入口、按域拆分的 service
├── store/               # 全局订阅式 store + SWR 缓存
├── utils/               # 血压判级、图表渲染、CSV 解析、字号缩放等工具
├── cloudfunctions/
│   ├── _shared/         # 云函数共享逻辑（构建时复制进各函数目录）
│   └── */               # 20+ 个独立部署的云函数
├── scripts/             # 云函数构建与部署校验脚本
└── docs/                # 数据契约、部署约定、阶段规划等工程文档
```

## 版本说明

本仓库为 v2 版本，从零重新建设（数据模型、云函数、前端架构均为全新设计）。
v1 原型见 [bp-monitor-mini-program](https://github.com/Ella0110/bp-monitor-mini-program)。

## 免责声明

本小程序仅用于日常血压记录与家人间的健康信息共享，不构成任何医疗诊断或治疗建议。如有健康问题请咨询专业医生。
