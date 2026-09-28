import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from build_static import build
from server import Error


class StaticBuildTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.source = self.root / "projects"
        self.project = self.source / "alpha"
        self.project.mkdir(parents=True)
        self.config = {"name": "A", "startDate": "2026-01-01", "tags": ["乐趣性"], "file": "issues.csv"}
        self.write_config()
        (self.project / "issues.csv").write_text('编号,问题,日期,标签\n001,测试问题,2026-09-28,乐趣性', encoding="utf-8")
        self.output = self.root / "site"

    def tearDown(self):
        self.temp.cleanup()

    def write_config(self):
        (self.project / "project.json").write_text(json.dumps(self.config), encoding="utf-8")

    def test_build_uses_relative_assets_and_no_secrets(self):
        result = build(self.source, self.output)
        self.assertEqual(result["projects"][0]["id"], "alpha")
        html = (self.output / "index.html").read_text(encoding="utf-8")
        self.assertIn('src="./app.js"', html)
        self.assertIn('name="workbench-mode" content="static"', html)
        files = {p.name for p in self.output.rglob("*") if p.is_file()}
        self.assertEqual(files, {"index.html", "app.js", "style.css", ".nojekyll", "manifest.json", "alpha.json", "report.js", "report.schema.json", "project.schema.json"})
        data = json.loads((self.output / "data" / "alpha.json").read_text(encoding="utf-8"))
        self.assertEqual(data["items"][0]["id"], "001")
        self.assertNotIn("mapping", data["project"])
        self.assertEqual(data["history"], [])
        self.assertEqual(data["project"]["id"], "alpha")

    def test_invalid_rows_fail_before_output(self):
        (self.project / "issues.csv").write_text('编号,问题\n1,甲\n1,乙', encoding="utf-8")
        with self.assertRaises(Error):
            build(self.source, self.output)
        self.assertFalse(self.output.exists())

    def test_no_overwrite_or_path_traversal(self):
        self.output.mkdir()
        (self.output / "sentinel").write_text("keep")
        with self.assertRaises(Error):
            build(self.source, self.output)
        self.assertEqual((self.output / "sentinel").read_text(), "keep")
        self.config["file"] = "../../secret.csv"
        self.write_config()
        with self.assertRaises(Error):
            build(self.source, self.root / "other")

    def test_multi_project_no_cross_data(self):
        other = self.source / "beta"
        other.mkdir()
        (other / "project.json").write_text(json.dumps(self.config | {"name": "B"}), encoding="utf-8")
        (other / "issues.csv").write_text('编号,问题\n001,B的数据', encoding="utf-8")
        result = build(self.source, self.output)
        self.assertEqual(len(result["projects"]), 2)
        data = json.loads((self.output / "data" / "beta.json").read_text(encoding="utf-8"))
        self.assertEqual(data["items"][0]["title"], "B的数据")


if __name__ == "__main__":
    unittest.main()
