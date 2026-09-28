# 项目拆解数据合同 2.0

一个 `report.json` 表达一个项目的拆解快照；IPD 研究报告和开发问题都是输入资料。后续研究波次生成新的文件或在明确更新任务中替换，不把不同时间、不同样本的分数混为一次测量。

### 工作台在线维护的兼容字段

项目问题支持可选的 `origin: "manual"`，表示经过人工在线维护；这类问题允许暂不关联案例或开发明细，不得为满足关联规则虚构任务。`category`、`severity`、`source` 为可选文本或 null，分别保存事项分类、严重程度和提交来源。原有 JSON 无须补齐这些字段。

内容对象的 `origin` 也可为 `manual`，其依据来自真实在线填写记录，而非研究原文或 AI 提炼。平台为新增/修改内容记录来源、时间和摘录；未修改的内容继续保留原来的 origin 与依据。导出再导入时应保留这些信息。AI 整理资料时不能把自己的推断标成人工填写。

在线修改仍须通过完整合同验证；保存产生新历史版本，并将 reviewStatus 置为 draft。删除项目问题时仅解除 insights.projectProblemIds 中对应引用，不删除关联案例、开发明细或历史版本。后续完整 JSON 导入仍会替换当前快照，若需保留在线修改，应先导出当前 JSON 再更新。

| 字段 | 内容 |
|---|---|
| schemaVersion | 新生成固定 `2.0`，平台拒绝未知版本 |
| reviewStatus | `draft` 或 `reviewed`；AI 初次生成用 draft |
| isDemo | 是否合成演示数据，真实材料为 false |
| project | id、name、startDate、stage；未知日期和阶段为 null |
| study | title、reportDate、sampleSize、method，未知值为 null |
| sources | 来源文档清单，每份资料一个 id |
| evidence | 来源、定位、短摘录；提供数值与案例的依据 |
| dimensions | 六个固定 ID 对应的维度对象 |
| cases | 亮点、问题或观察案例，以及原文/AI 分析与建议 |
| issues | 实际开发问题，保留源问题编号 |
| ipd | 阶段链、当前重点、下一轮验证输入 |
| projectProblems | 项目级问题：目标、KSF、方案、复盘，以及来源关联 |
| insights | 通用性提炼：共性结论、关键要点与三层关联 |
| openQuestions | 缺失、歧义、冲突、待确认关系 |

维度 ID：`novelty` 新鲜感、`goals` 目标感、`growth` 成长感、`fun` 乐趣性、`social` 社交感、`time_cost` 时间成本。字段顺序无关，但六个维度不能缺失或重复。未知维度数据用 `summary: null, metrics: []`，不填 0。

## 指标

每个维度可有多个指标，例如：

```json
{
  "id": "satisfaction",
  "name": "满意率",
  "value": 72,
  "unit": "percent",
  "scale": {"min": 0, "max": 100},
  "higherIsBetter": true,
  "sampleSize": 50,
  "evidenceRefs": ["ev-novelty-score"],
  "note": null
}
```

单位支持 `percent/score/count/minutes/ratio`。百分比取 0–100，ratio 取 0–1；分数保留原值，可为负数。`scale` 是报告明确提供的评分范围，未知用 null；百分比范围固定为 0–100。加权分数单独用如 `weighted_score` 的 ID，不继承原始评分的上下限。

同一维度内指标 ID 唯一，不同维度可以共用 `satisfaction`。每个非空数值至少有一个依据。缺失数值如果需要保留指标位置，设 `value: null` 并在 `note` 写明原因。

## 关联和溯源

`sources.id ← evidence.sourceId`；`evidence.id ← metrics/cases/issues/summary.evidenceRefs`。

`dimensions.id ← cases/issues.dimensionIds`；`issues.id ← cases.issueIds`。案例关联开发问题只维护这一个方向，避免重复维护两套关系。案例 ID 不等于任务编号，一条案例可以关联多个开发问题。

`summary` 可为 null，或 `{ "text": "原文支持的简要总结", "evidenceRefs": ["ev-1"] }`。

案例 `kind` 为 `strength/problem/observation`。`analysis` 与 `suggestion` 可为 null，或 `{ "text": "…", "origin": "source|ai", "evidenceRefs": [] }`。source 类型必须有原文依据，ai 类型在页面明确标为 AI 推断/建议。

问题状态只支持 `未解决/进行中/待验证/已解决/未标注`。未知状态填未标注并加待确认项，不能默认为未解决。问题日期支持 `YYYY-MM-DD`，没有日期为 null，不拿报告日期充当问题发生日期。`solution` 只填已在问题资料中明确的处理方案。

`openQuestions` 包含 `id/question/reason/sourceIds`，不放模型的猜测答案。

## 校验和平台输入

JSON Schema 描述字段类型和结构。`scripts/validate.py` 使用标准库执行本合同所用的 Schema 关键字，并额外校验 ID 唯一、引用有效、固定维度、范围和日期关系；不是任意 JSON Schema 的通用引擎。

静态工作台支持 `projects/<项目id>/report.json`，文件夹名与 `project.id` 一致。同目录不要同时维护 report.json 和旧的 project.json，以免出现两份数据来源。所有开发问题放进 report.json 的 issues。静态版浏览器加载 JSON 仅本地预览，提交仓库后才更新共享版本。本机服务版会先上传校验，点击“保存并生成项目”后写入服务器数据库；无需提交仓库。

## 项目拆解的三层关系

正式结构见 [project.schema.json](project.schema.json)，完整例子见 [example-project.json](example-project.json)。旧 `report.schema.json` 和 `example-report.json` 保留作 v1 兼容；旧数据不会自动生成共性结论。

- **输入层**：`cases` 是研究发现（包含亮点）；`issues` 是实际开发台账。两者不能互相伪造。一份报告不必创建开发任务，也可以形成只引用案例的项目问题。
- **项目问题层**：`projectProblems` 每条包含 `id/title/dimensionIds/date/status/owner/version/goal/ksf/solution/review/issueIds/caseIds/evidenceRefs`。至少关联一个案例或开发明细。项目级状态单独取自资料，不从任意一条明细外推；日期未知用 null，页面在“日期待补充”中展示。
- **提炼层**：`insights` 每条包含 `id/title/theme/dimensionIds/summary/keyPoints/issueIds/caseIds/projectProblemIds`。至少关联一个案例或明细；项目问题引用可为空。提炼描述共性机制、适用情境或待验证假设，不重复粘贴原问题。多个来源讲同一现象不等于多个独立案例。

`goal/solution/review` 可为 null；`ksf/keyPoints/focus/nextInputs` 为内容对象数组；`summary` 为必填内容对象。内容对象统一为：

```json
{"text":"基于资料提出的待验证建议","origin":"ai","evidenceRefs":["ev-case-goals"]}
```

这些新字段无论 source 还是 ai 都必须有非空、有效依据；source 指原文明确记录，ai 指从依据归纳或建议，不能表示已执行或已验证。KSF 原文没给验收阈值时，允许提出验证方向并标明 AI，不能编造通过率。

`ipd.stages` 是 `{id,name,state,evidenceRefs}` 数组；state 取 completed/current/upcoming/unknown。没有阶段资料就 `[]`；仅提供当前阶段就只写当前阶段。`focus` 和 `nextInputs` 是上述内容对象数组。

关联 ID 必须存在且不重复。提炼的 `issueIds/caseIds` 只挂载实际支持该结论的输入，不隐含继承项目问题的全部输入。平台据这些显式关联计算条数和未闭环数（包含未标注状态）；项目问题数量与开发明细数量分开计算。所有引用原文保留可核对定位。
