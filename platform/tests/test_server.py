import base64
import io
import json
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from server import App, Error, Store, ThreadingHTTPServer, handler_for, parse_table
from openpyxl import Workbook

CONFIG = {"name": "测试项目", "startDate": "2026-01-01", "tags": ["乐趣性", "成长感"],
          "versions": [{"name": "v1", "startDate": "2026-01-01"}, {"name": "v2", "startDate": "2026-09-01"}]}
MAPPING = {"id": "编号", "title": "问题", "status": "状态", "date": "日期", "tags": "标签"}


def records(*rows):
    return [(n + 2, dict(zip(["编号", "问题", "状态", "日期", "标签"], row))) for n, row in enumerate(rows)]


class StoreTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.store = Store(self.temp.name)
        self.project = self.store.create(CONFIG)

    def tearDown(self):
        self.temp.cleanup()

    def preview(self, rows):
        return self.store.preview(self.project["id"], "issues.csv", rows, MAPPING)

    def test_idempotent_update_and_missing_retained(self):
        initial = records(("A", "战斗反馈", "未解决", "2026-01-01", "乐趣性"), ("B", "养成引导", "进行中", "2026-09-27", "成长感"))
        self.store.commit(self.preview(initial))
        repeat = self.preview(initial)
        self.assertEqual(repeat["counts"], {"added": 0, "updated": 0, "unchanged": 2, "missing": 0})
        self.store.commit(repeat)
        update = self.preview(records(("A", "战斗反馈改善", "已解决", "2026-01-01", "乐趣性")))
        self.assertEqual(update["counts"]["updated"], 1)
        self.assertEqual(update["counts"]["missing"], 1)
        self.store.commit(update)
        snapshot = self.store.snapshot(self.project["id"])
        self.assertEqual(len(snapshot["items"]), 2)
        self.assertEqual(snapshot["items"][0]["status"], "已解决")
        self.assertEqual(snapshot["items"][1]["effectiveVersion"], "v2")
        self.assertEqual(snapshot["items"][1]["week"], "第 39 周")
        self.assertEqual(len(snapshot["history"]), 3)
        self.assertEqual(len(Store(self.temp.name).snapshot(self.project["id"])["items"]), 2)

    def test_invalid_rows_do_not_partially_commit(self):
        preview = self.preview(records(("A", "正常", "已解决", "2026-01-01", ""), ("A", "重复", "奇怪状态", "2026-02-30", "未知标签")))
        self.assertEqual(len(preview["errors"]), 1)
        self.assertGreaterEqual(len(preview["errors"][0]["messages"]), 4)
        with self.assertRaises(Error):
            self.store.commit(preview)
        self.assertEqual(self.store.snapshot(self.project["id"])["items"], [])

    def test_stale_preview_and_settings_conflict(self):
        first = self.preview(records(("A", "旧表", "未解决", "2026-01-01", "")))
        second = self.preview(records(("B", "新表", "进行中", "2026-01-02", "")))
        self.store.commit(second)
        with self.assertRaises(Error) as context:
            self.store.commit(first)
        self.assertEqual(context.exception.status, 409)
        with self.assertRaises(Error):
            self.store.update(self.project["id"], CONFIG | {"revision": 0})
        new_preview = self.preview(records(("A", "再次预览", "未解决", "2026-01-01", "")))
        self.store.update(self.project["id"], CONFIG | {"revision": 1, "startDate": "2026-01-02"})
        with self.assertRaises(Error):
            self.store.commit(new_preview)

    def test_project_isolation_and_used_tag_guard(self):
        self.store.commit(self.preview(records(("A", "私有问题", "未解决", "2026-01-01", "乐趣性"))))
        other = self.store.create(CONFIG | {"name": "另一个项目"})
        self.assertEqual(self.store.snapshot(other["id"])["items"], [])
        with self.assertRaises(Error):
            self.store.update(self.project["id"], CONFIG | {"revision": 1, "tags": ["成长感"]})

    def test_snapshot_keeps_before_and_after(self):
        batch = self.store.commit(self.preview(records(("A", "首次", "未解决", "2026-01-01", ""))))
        with self.store.connect() as db:
            row = db.execute("SELECT before_data,after_data FROM imports WHERE id=?", (batch["batchId"],)).fetchone()
        self.assertEqual(json.loads(row[0]), [])
        self.assertEqual(json.loads(row[1])[0]["title"], "首次")

    def test_week_and_version_boundaries(self):
        self.store.commit(self.preview(records(("A", "前一天", "未解决", "2025-12-31", ""), ("B", "新版本", "未解决", "2026-09-01", ""), ("C", "无日期", "未解决", "", ""))))
        items = self.store.snapshot(self.project["id"])["items"]
        self.assertEqual(items[0]["week"], "开始日期之前")
        self.assertEqual(items[0]["effectiveVersion"], "未划分")
        self.assertEqual(items[1]["effectiveVersion"], "v2")
        self.assertEqual(items[2]["week"], "未标注日期")

    def test_required_mapping_and_duplicate_mapping(self):
        rows = records(("A", "正常", "未解决", "", ""))
        for mapping in ({"title": "问题"}, {"id": "编号", "title": "编号"}, {"id": "不存在", "title": "问题"}):
            with self.assertRaises(Error):
                self.store.preview(self.project["id"], "x.csv", rows, mapping)


class ParserTests(unittest.TestCase):
    def test_csv_encodings_quoted_cells_and_blank_rows(self):
        value = '编号,问题\r\n001,"中文,逗号\n换行"\r\n\r\n'
        for encoding in ("utf-8-sig", "gb18030"):
            headers, rows, _, _ = parse_table("test.csv", value.encode(encoding))
            self.assertEqual(headers, ["编号", "问题"])
            self.assertEqual(rows, [(2, {"编号": "001", "问题": "中文,逗号\n换行"})])

    def test_xlsx_sheet_dates_and_formula_rejection(self):
        book = Workbook()
        book.active.title = "说明"
        book.active.append(["提示"]); book.active.append(["选问题表"])
        ws = book.create_sheet("问题表")
        ws.append(["编号", "问题", "日期"])
        ws.append(["001", "体验问题", datetime(2026, 9, 28)])
        raw = io.BytesIO(); book.save(raw)
        _, rows, sheets, selected = parse_table("book.xlsx", raw.getvalue(), "问题表")
        self.assertEqual(sheets, ["说明", "问题表"])
        self.assertEqual(selected, "问题表")
        self.assertEqual(rows[0][1]["日期"], "2026-09-28")
        ws.append(["002", "=1+1", ""])
        raw = io.BytesIO(); book.save(raw)
        with self.assertRaises(Error):
            parse_table("book.xlsx", raw.getvalue(), "问题表")

    def test_invalid_tables(self):
        for filename, raw in [("x.xls", b"x"), ("x.csv", b"a,a\n1,2"), ("x.csv", b"a\n"), ("x.csv", b"a,b\n1,2,3"), ("x.xlsx", b"broken")]:
            with self.subTest(filename=filename, raw=raw), self.assertRaises(Error):
                parse_table(filename, raw)


class HttpTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.app = App(self.temp.name, "test-admin-key-123456789")
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), handler_for(self.app))
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.base = f"http://127.0.0.1:{self.server.server_port}"
        self.cookie = ""

    def tearDown(self):
        self.server.shutdown(); self.server.server_close(); self.thread.join()
        self.temp.cleanup()

    def request(self, path, body=None, authenticated=True, origin=None):
        headers = {"Content-Type": "application/json"}
        if authenticated and self.cookie:
            headers["Cookie"] = self.cookie
        if origin:
            headers["Origin"] = origin
        req = urllib.request.Request(self.base + path, data=json.dumps(body).encode() if body is not None else None, headers=headers)
        try:
            response = urllib.request.urlopen(req)
        except urllib.error.HTTPError as exc:
            response = exc
        with response:
            raw = response.read()
            if response.headers.get("Set-Cookie"):
                self.cookie = response.headers["Set-Cookie"].split(";")[0]
            return response.status, json.loads(raw)

    def login(self):
        self.assertEqual(self.request("/api/login", {"key": "test-admin-key-123456789"})[0], 200)

    def test_full_import_share_revoke_and_permissions(self):
        self.assertEqual(self.request("/api/projects")[0], 401)
        self.login()
        _, project = self.request("/api/projects", CONFIG)
        path = "/api/projects/" + project["id"]
        raw = '编号,问题,状态,日期,标签\n001,真实问题,进行中,2026-09-28,乐趣性'.encode()
        status, upload = self.request(path + "/upload", {"filename": "issues.csv", "content": base64.b64encode(raw).decode()})
        self.assertEqual(status, 200)
        _, preview = self.request(path + "/preview", {"token": upload["token"], "mapping": MAPPING})
        self.assertEqual(self.request(path + "/commit", {"token": preview["token"]})[0], 200)
        self.assertEqual(self.request(path + "/commit", {"token": preview["token"]})[0], 410)
        _, share = self.request(path + "/share", {"enabled": True})
        status, shared = self.request(share["feed"], authenticated=False)
        self.assertEqual(status, 200)
        self.assertEqual(shared["items"][0]["id"], "001")
        self.assertNotIn("mapping", shared["project"])
        self.assertEqual(shared["history"], [])
        self.assertEqual(self.request(path + "/commit", {"token": preview["token"]}, authenticated=False)[0], 401)
        self.assertEqual(self.request("/api/projects", authenticated=False)[0], 401)
        self.request(path + "/share", {"enabled": False})
        self.assertEqual(self.request(share["feed"], authenticated=False)[0], 404)
        self.request("/api/logout", {})
        self.assertEqual(self.request("/api/projects")[0], 401)

    def test_cross_project_upload_token_rejected(self):
        self.login()
        _, a = self.request("/api/projects", CONFIG)
        _, b = self.request("/api/projects", CONFIG | {"name": "B"})
        _, upload = self.request(f'/api/projects/{a["id"]}/upload', {"filename": "x.csv", "content": base64.b64encode('编号,问题\nA,问题'.encode()).decode()})
        self.assertEqual(self.request(f'/api/projects/{b["id"]}/preview', {"token": upload["token"], "mapping": MAPPING})[0], 403)

    def test_csrf_invalid_json_and_expired_preview(self):
        self.login()
        self.assertEqual(self.request("/api/projects", CONFIG, origin="https://unrelated.example")[0], 403)
        _, p = self.request("/api/projects", CONFIG)
        self.assertEqual(self.request(f'/api/projects/{p["id"]}/commit', {"token": "invalid"})[0], 410)
        self.assertEqual(self.request("/api/projects", ["not", "object"])[0], 400)


if __name__ == "__main__":
    unittest.main()
