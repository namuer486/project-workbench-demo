"""Validate this skill's JSON contract using only Python's standard library."""
import argparse
import json
import math
import re
from datetime import date
from pathlib import Path

SKILL_ROOT = Path(__file__).resolve().parents[1]
DIMENSIONS = {"novelty": "新鲜感", "goals": "目标感", "growth": "成长感", "fun": "乐趣性", "social": "社交感", "time_cost": "时间成本"}


def load_json(path):
    def unique(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError(f"JSON 字段重复：{key}")
            result[key] = value
        return result
    return json.loads(Path(path).read_text(encoding="utf-8-sig"), object_pairs_hook=unique,
                      parse_constant=lambda x: (_ for _ in ()).throw(ValueError("不允许 " + x)))


def validate(report):
    schema_name = "project.schema.json" if isinstance(report, dict) and report.get("schemaVersion") == "2.0" else "report.schema.json"
    schema = load_json(SKILL_ROOT / "references" / schema_name)
    errors = []

    def check(value, rule, path):
        if "$ref" in rule:
            rule = schema["$defs"][rule["$ref"].split("/")[-1]]
        types = rule.get("type", [])
        types = [types] if isinstance(types, str) else types
        actual = "null" if value is None else "boolean" if isinstance(value, bool) else "integer" if isinstance(value, int) else "number" if isinstance(value, float) else "string" if isinstance(value, str) else "array" if isinstance(value, list) else "object" if isinstance(value, dict) else "unknown"
        if types and actual not in types and not (actual == "integer" and "number" in types):
            errors.append(f"{path}: 类型需为 {'/'.join(types)}")
            return
        if "const" in rule and value != rule["const"]:
            errors.append(f"{path}: 必须为 {rule['const']}")
        if "enum" in rule and value not in rule["enum"]:
            errors.append(f"{path}: 值不在允许范围")
        if actual == "object":
            props = rule.get("properties", {})
            for key in rule.get("required", []):
                if key not in value:
                    errors.append(f"{path}.{key}: 缺少字段")
            for key, item in value.items():
                if key in props:
                    check(item, props[key], path + "." + key)
                elif rule.get("additionalProperties") is False:
                    errors.append(f"{path}.{key}: 未知字段")
        if actual == "array":
            if len(value) < rule.get("minItems", 0) or len(value) > rule.get("maxItems", 100000):
                errors.append(f"{path}: 数组长度不符合要求")
            if rule.get("uniqueItems") and len({json.dumps(v, sort_keys=True, ensure_ascii=False) for v in value}) != len(value):
                errors.append(f"{path}: 不能重复")
            for i, item in enumerate(value):
                check(item, rule.get("items", {}), f"{path}[{i}]")
        if actual == "string":
            if len(value) < rule.get("minLength", 0) or len(value) > rule.get("maxLength", 20000):
                errors.append(f"{path}: 文本长度不符合要求")
            if "pattern" in rule and not re.search(rule["pattern"], value):
                errors.append(f"{path}: 格式不正确")
            if rule.get("format") == "date":
                try:
                    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
                        raise ValueError()
                    date.fromisoformat(value)
                except ValueError:
                    errors.append(f"{path}: 需为有效 YYYY-MM-DD 日期")
        if actual in ("integer", "number"):
            if not math.isfinite(value) or value < rule.get("minimum", -math.inf) or value > rule.get("maximum", math.inf):
                errors.append(f"{path}: 数值超出范围")

    check(report, schema, "$")
    if errors:
        return errors

    def unique_ids(values, label):
        ids = [v["id"] for v in values]
        if len(ids) != len(set(ids)):
            errors.append(label + ": ID 不能重复")
        return set(ids)

    source_ids = unique_ids(report["sources"], "sources")
    evidence_ids = unique_ids(report["evidence"], "evidence")
    dimension_ids = unique_ids(report["dimensions"], "dimensions")
    issue_ids = unique_ids(report["issues"], "issues")
    unique_ids(report["cases"], "cases")
    unique_ids(report["openQuestions"], "openQuestions")
    if dimension_ids != set(DIMENSIONS):
        errors.append("dimensions: 必须完整包含固定的六个维度")

    def refs(values, allowed, path, required=False):
        if required and not values:
            errors.append(path + ": 必须提供原文依据")
        if set(values) - allowed:
            errors.append(path + ": 存在无效引用 " + ", ".join(sorted(set(values) - allowed)))

    refs(report["study"]["evidenceRefs"], evidence_ids, "study", any(report["study"][k] is not None for k in ("sampleSize", "reportDate", "method")))
    for e in report["evidence"]:
        refs([e["sourceId"]], source_ids, "evidence." + e["id"])
    for d in report["dimensions"]:
        if DIMENSIONS.get(d["id"]) != d["name"]:
            errors.append("dimensions." + d["id"] + ": 名称与维度 ID 不一致")
        if d["summary"] is not None:
            refs(d["summary"]["evidenceRefs"], evidence_ids, d["id"] + ".summary", True)
        unique_ids(d["metrics"], d["id"] + ".metrics")
        for m in d["metrics"]:
            label = d["id"] + "." + m["id"]
            refs(m["evidenceRefs"], evidence_ids, label, m["value"] is not None)
            if m["value"] is None and not m["note"]:
                errors.append(label + ": 缺失数值必须说明原因")
            value, scale = m["value"], m["scale"]
            if scale and scale["min"] >= scale["max"]:
                errors.append(label + ": 评分范围下限必须小于上限")
            if value is not None:
                if scale and not scale["min"] <= value <= scale["max"]:
                    errors.append(label + ": 数值不在原始评分范围内")
                if m["unit"] in ("percent", "ratio") and not 0 <= value <= (100 if m["unit"] == "percent" else 1):
                    errors.append(label + ": 百分比或比例数值越界")
                if m["unit"] in ("count", "minutes") and value < 0:
                    errors.append(label + ": 数量和时长不能为负数")
                if m["unit"] == "count" and int(value) != value:
                    errors.append(label + ": 数量必须为整数")
    for c in report["cases"]:
        refs(c["dimensionIds"], dimension_ids, c["id"] + ".dimensionIds")
        refs(c["issueIds"], issue_ids, c["id"] + ".issueIds")
        refs(c["evidenceRefs"], evidence_ids, c["id"], True)
        for key in ("analysis", "suggestion"):
            if c[key] is not None:
                refs(c[key]["evidenceRefs"], evidence_ids, c["id"] + "." + key, c[key]["origin"] == "source")
    for issue in report["issues"]:
        refs(issue["dimensionIds"], dimension_ids, issue["id"] + ".dimensionIds")
        refs(issue["evidenceRefs"], evidence_ids, issue["id"], True)
        if issue["date"] and issue["resolvedAt"] and issue["date"] > issue["resolvedAt"]:
            errors.append(issue["id"] + ": 解决日期早于提出日期")
    for question in report["openQuestions"]:
        refs(question["sourceIds"], source_ids, question["id"] + ".sourceIds")
    if report["schemaVersion"] == "2.0":
        cases = {c["id"] for c in report["cases"]}
        problems = unique_ids(report["projectProblems"], "projectProblems")
        unique_ids(report["insights"], "insights")
        unique_ids(report["ipd"]["stages"], "ipd.stages")
        if sum(s["state"] == "current" for s in report["ipd"]["stages"]) > 1:
            errors.append("ipd.stages: 最多一个当前阶段")
        def content(value, label):
            if value is not None:
                refs(value["evidenceRefs"], evidence_ids, label, True)
        for stage in report["ipd"]["stages"]:
            refs(stage["evidenceRefs"], evidence_ids, stage["id"], True)
        for value in report["ipd"]["focus"] + report["ipd"]["nextInputs"]:
            content(value, "ipd")
        for item in report["projectProblems"] + report["insights"]:
            refs(item["dimensionIds"], dimension_ids, item["id"])
            refs(item["issueIds"], issue_ids, item["id"])
            refs(item["caseIds"], cases, item["id"])
            if not item["issueIds"] and not item["caseIds"] and item.get("origin") != "manual":
                errors.append(item["id"] + ": 必须关联研究案例或开发明细")
        for problem in report["projectProblems"]:
            refs(problem["evidenceRefs"], evidence_ids, problem["id"], True)
            for value in [problem["goal"], problem["solution"], problem["review"], *problem["ksf"]]:
                content(value, problem["id"])
        for insight in report["insights"]:
            refs(insight["projectProblemIds"], problems, insight["id"])
            for value in [insight["summary"], *insight["keyPoints"]]:
                content(value, insight["id"])
    return errors


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("report")
    args = parser.parse_args()
    try:
        errors = validate(load_json(args.report))
    except (ValueError, OSError) as exc:
        errors = [str(exc)]
    if errors:
        print("校验失败：\n" + "\n".join(errors[:100]))
        return 1
    print("校验通过：结构、数值范围与引用完整；仍需人工核对原文真实性。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
