# IPD 报告到可视化工作流

每个项目的研究报告和开发问题先交给 GPT，使用 `ipd-report-json` Skill 生成 `report.json`。平台校验 JSON 并渲染六维指标、具体案例、关联开发问题和原文依据。网页无需调用模型，也不需要模型密钥。

```text
IPD 研究报告 + 开发问题清单
             ↓
GPT 使用 ipd-report-json Skill
             ↓
report.json（结构、数值范围、引用校验）
             ↓
平台导入预览 → 核对原文 → 提交仓库 → 构建内部静态看板
```

## 给 GPT 的调用示例

在已安装此 Skill 的 Codex 中，可以这样说：

> 用 $ipd-report-json，把这份 IPD 研究报告和开发问题清单整理成工作台 report.json。项目 ID 用 my-project。保留六维指标的原始数值、单位、评分范围和样本量；具体案例关联开发问题并注明出处。缺失数据留空，AI 推断单独标明。运行校验后把 JSON 给我。

若使用普通 GPT 对话，可将 `skills/ipd-report-json/SKILL.md`、`references/contract.md`、`references/report.schema.json` 与原始资料一起提供。示例只用于理解结构，不能把示例项目、分数和案例带入真实输出。聊天环境不能运行校验器时，下载 JSON 后在本地校验。

仓库内的 Skill 可复制到其他成员的技能目录，包含说明、数据合同、Schema、示例材料及标准库校验器，不依赖本项目后端。

## JSON 里存什么

| 内容 | 关键字段 | 页面行为 |
|---|---|---|
| 项目信息 | project、study | 项目、阶段、报告日期、研究样本 |
| 六维指标 | dimensions[].metrics | 原始数值和量表；缺失为“—” |
| 具体案例 | cases | 亮点、问题、观察，以及原文或 AI 分析建议 |
| 开发问题 | issues | 真实编号、负责人、状态、解决方案 |
| 关联关系 | dimensionIds、issueIds | 选择维度筛选案例，点击案例打开问题 |
| 原文依据 | sources、evidence、evidenceRefs | 点击指标/案例/问题查看出处与短摘录 |
| 待核对项 | openQuestions | 不确定信息集中列出 |

六维采用当前工作台模板：新鲜感、目标感、成长感、乐趣性、社交感、时间成本。研究报告没有覆盖的维度不自行补分。

每个维度可以保存多种指标。满意率 72%、原始分 1.18、加权分 1.76 是三条独立指标；不能只用一个 `score` 字段混装，也不自动归一化到同一雷达图。单项样本量与研究总样本量分别保留。

JSON 完整范例见 `skills/ipd-report-json/references/example-report.json`，对应合成原文在 `example-input.md`。正式结构见 `report.schema.json`。平台及 Skill 共用这份 Schema。

## 校验与导入

```powershell
python skills/ipd-report-json/scripts/validate.py path/to/report.json
```

校验会拦截未知结构版本、缺失维度、重复 ID、不存在的引用、没有原文依据的非空数值、越界数值和无效日期。它不会判断原文是否被 GPT 准确引用，所以 `reviewStatus` 默认是 `draft`，仍需人工抽查。

网页侧点击「导入报告 JSON」即可在当前浏览器预览。文件内容只在本机内存中解析，不会上传到平台服务器、GitHub 或第三方。离开或刷新页面会丢失本地预览；不代表已保存或共享。预览模式不会把研究报告自动写入可选服务器模式的数据库。

正式更新时把同一份 JSON 放入：

```text
projects/my-project/report.json
```

文件夹名必须等于 `report.project.id`。一个项目只选择 `report.json` 模式或旧的 `project.json + 问题表` 模式，不允许同时存在。报告模式把开发问题放在 JSON 的 `issues` 中，避免两份问题清单冲突。没有开发问题资料可用 `issues: []`。

把文件提交到仓库后，原有构建任务自动校验并生成静态看板。构建失败不发布；当前项目仍遵循“公司内部访问”，公开部署开关保持关闭。原文摘录也会进入生成的 JSON，访问控制应覆盖整个静态站点。

## 当前范围

已支持生成规则、标准 JSON、自动校验、浏览器预览、仓库构建、六维与案例展示、问题关联和依据查看。现有 Excel/CSV 工作台仍然可用。

当前仅用合成材料验证结构和交互，尚未拿真实项目报告验证提取完整性。不自动执行 GPT 调用，也不连接公司的 AI 知识库。后续接入知识库时可继续使用同一份合同作为输入输出边界。
