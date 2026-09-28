# 数据合同 1.0

一个 `report.json` 表达一个项目的一次研究报告及对应开发问题快照。后续研究波次生成新的文件或在明确更新任务中替换，不把不同时间、不同样本的分数混为一次测量。

| 字段 | 内容 |
|---|---|
| schemaVersion | 固定 `1.0`，平台拒绝未知版本 |
| reviewStatus | `draft` 或 `reviewed`；AI 初次生成用 draft |
| isDemo | 是否合成演示数据，真实材料为 false |
| project | id、name、startDate、stage；未知日期和阶段为 null |
| study | title、reportDate、sampleSize、method，未知值为 null |
| sources | 来源文档清单，每份资料一个 id |
| evidence | 来源、定位、短摘录；提供数值与案例的依据 |
| dimensions | 六个固定 ID 对应的维度对象 |
| cases | 亮点、问题或观察案例，以及原文/AI 分析与建议 |
| issues | 实际开发问题，保留源问题编号 |
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

静态工作台支持 `projects/<项目id>/report.json`，文件夹名与 `project.id` 一致。同目录不要同时维护 report.json 和旧的 project.json，以免出现两份数据来源。所有开发问题放进 report.json 的 issues。浏览器可先加载 JSON 本地预览，保存到仓库后才成为团队共享版本。
