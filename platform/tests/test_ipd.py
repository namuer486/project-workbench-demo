import copy
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from ipd import SKILL, contract, report_snapshot
from build_static import build
from server import Error


class ReportContractTests(unittest.TestCase):
    def setUp(self):
        self.report = contract.load_json(SKILL / "references" / "example-report.json")

    def test_example_preserves_raw_scales_zero_and_missing_values(self):
        self.assertEqual(contract.validate(self.report), [])
        snapshot = report_snapshot(self.report, "2026-09-28")
        self.assertEqual(snapshot["report"]["dimensions"][0]["metrics"][1]["value"], 1.18)
        self.assertEqual(snapshot["report"]["dimensions"][1]["metrics"][0]["value"], 0)
        self.assertEqual(snapshot["report"]["dimensions"][2]["metrics"], [])
        self.assertEqual(snapshot["items"][1]["status"], "未标注")
        self.assertEqual(snapshot["items"][1]["date"], "")
        self.assertEqual(snapshot["items"][0]["evidenceRefs"], ["ev-dev-1"])

    def test_numeric_evidence_required_and_references_resolve(self):
        self.report["dimensions"][0]["metrics"][0]["evidenceRefs"] = []
        self.assertTrue(contract.validate(self.report))
        self.setUp()
        self.report["cases"][0]["issueIds"] = ["not-an-issue"]
        self.assertTrue(contract.validate(self.report))
        self.setUp()
        self.report["evidence"][0]["sourceId"] = "missing-source"
        self.assertTrue(contract.validate(self.report))

    def test_six_dimensions_unique_and_known(self):
        self.report["dimensions"][0] = copy.deepcopy(self.report["dimensions"][1])
        self.assertTrue(contract.validate(self.report))
        self.setUp()
        self.report["dimensions"].pop()
        self.assertTrue(contract.validate(self.report))

    def test_range_null_unknown_version_and_extra_fields(self):
        for change in (lambda r: r["dimensions"][0]["metrics"][0].update(value=110),
                       lambda r: r["dimensions"][0]["metrics"][1].update(value=4),
                       lambda r: r["dimensions"][0]["metrics"][0].update(value=None, note=None),
                       lambda r: r.update(schemaVersion="2.0"),
                       lambda r: r.update(guessedScore=90),
                       lambda r: r["project"].update(startDate="2026-02-30")):
            with self.subTest(change=change):
                report = copy.deepcopy(self.report)
                change(report)
                self.assertTrue(contract.validate(report))

    def test_report_only_and_unknown_start_date_not_invented(self):
        self.report["project"]["startDate"] = None
        snapshot = report_snapshot(self.report, "2026-09-28")
        self.assertIsNone(snapshot["project"]["startDate"])
        self.assertEqual(snapshot["items"][0]["week"], "未配置项目起点")
        self.report["issues"] = []
        for c in self.report["cases"]:
            c["issueIds"] = []
        self.assertEqual(contract.validate(self.report), [])
        self.assertEqual(report_snapshot(self.report, "2026-09-28")["items"], [])

    def test_source_vs_ai_analysis(self):
        analysis = self.report["cases"][2]["analysis"]
        analysis["evidenceRefs"] = []
        self.assertEqual(contract.validate(self.report), [])
        analysis["origin"] = "source"
        self.assertTrue(contract.validate(self.report))

    def test_duplicate_json_keys_and_nonfinite_numbers_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "invalid.json"
            for raw in ('{"schemaVersion":"1.0","schemaVersion":"2.0"}', '{"value":NaN}'):
                path.write_text(raw, encoding="utf-8")
                with self.assertRaises(ValueError):
                    contract.load_json(path)

    def test_static_build_from_single_report_and_source_conflict(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            project = root / "projects" / "ipd-demo"
            project.mkdir(parents=True)
            (project / "report.json").write_text(json.dumps(self.report), encoding="utf-8")
            result = build(root / "projects", root / "site")
            self.assertTrue(result["projects"][0]["hasReport"])
            snapshot = json.loads((root / "site" / "data" / "ipd-demo.json").read_text(encoding="utf-8"))
            self.assertEqual(snapshot["report"]["study"], self.report["study"])
            (project / "project.json").write_text("{}", encoding="utf-8")
            with self.assertRaises(Error):
                build(root / "projects", root / "site2")


if __name__ == "__main__":
    unittest.main()
