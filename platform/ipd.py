"""Shared report contract adapter for static builds and report snapshots."""
import importlib.util
from datetime import date
from pathlib import Path

SKILL = Path(__file__).resolve().parents[1] / "skills" / "ipd-report-json"
spec = importlib.util.spec_from_file_location("ipd_report_contract", SKILL / "scripts" / "validate.py")
contract = importlib.util.module_from_spec(spec)
spec.loader.exec_module(contract)


def report_snapshot(report, updated):
    errors = contract.validate(report)
    if errors:
        raise ValueError("报告 JSON 校验失败：\n" + "\n".join(errors[:30]))
    project = {**report["project"], "tags": list(contract.DIMENSIONS.values()), "versions": [],
               "revision": 0, "updated": updated, "sourceFile": "report.json"}
    items = []
    for issue in report["issues"]:
        item = {key: issue[key] or "" for key in ("id", "title", "owner", "status", "priority", "category", "date", "resolvedAt", "solution", "version")}
        item["owner"] = item["owner"] or "未分配"
        item["priority"] = item["priority"] or "未标注"
        item["category"] = item["category"] or "未分类"
        item["tags"] = [contract.DIMENSIONS[d] for d in issue["dimensionIds"]]
        item["effectiveVersion"] = item["version"] or "未划分"
        item["evidenceRefs"] = issue["evidenceRefs"]
        if not item["date"]:
            item["week"], item["weekIndex"] = "未标注日期", -2
        elif not project["startDate"]:
            item["week"], item["weekIndex"] = "未配置项目起点", -3
        else:
            days = (date.fromisoformat(item["date"]) - date.fromisoformat(project["startDate"])).days
            item["week"], item["weekIndex"] = (f"第 {days // 7 + 1} 周", days // 7) if days >= 0 else ("开始日期之前", -1)
        items.append(item)
    return {"project": project, "items": items, "history": [], "report": report}
