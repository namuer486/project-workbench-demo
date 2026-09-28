"""Build a repository-backed static site; no server or credentials in the output."""
import argparse
import json
import os
import re
import shutil
import tempfile
from pathlib import Path

from ipd import SKILL, contract, report_snapshot
from server import ALIASES, Error, ROOT, Store, dumps, normalize, now, parse_table, validate_config


def build(source, output, repository="", ref="main"):
    source, output = Path(source).resolve(), Path(output).resolve()
    if not source.is_dir():
        raise Error("项目资料目录不存在")
    # Never clear an existing destination: failed validation must preserve the last good build.
    if output.exists() and any(output.iterdir()):
        raise Error("输出目录必须为空，请使用新的构建目录")
    configs = sorted([*source.glob("*/project.json"), *source.glob("*/report.json")])
    if not configs:
        raise Error("没有项目配置，请在 projects/<项目代号>/project.json 中配置项目")
    built = []
    timestamp = now()
    for config_path in configs:
        slug = config_path.parent.name
        if not re.fullmatch(r"[a-z0-9][a-z0-9_-]{0,63}", slug):
            raise Error("项目目录名只能使用小写英文、数字、下划线和短横线，最多 64 字符")
        if (config_path.parent / "report.json").exists() and (config_path.parent / "project.json").exists():
            raise Error(f"{slug}: report.json 和 project.json 只能选择一种数据来源")
        if config_path.name == "report.json":
            if config_path.stat().st_size > 10 * 1024 * 1024:
                raise Error(f"{slug}: 报告 JSON 不能超过 10 MB")
            report = contract.load_json(config_path)
            snapshot = report_snapshot(report, timestamp)
            if report["project"]["id"] != slug:
                raise Error(f"{slug}: 文件夹名必须与 report.project.id 一致")
            snapshot["build"] = {"generatedAt": timestamp, "commit": os.environ.get("GITHUB_SHA", ""), "mode": "static"}
            built.append((slug, snapshot))
            continue
        payload = json.loads(config_path.read_text(encoding="utf-8-sig"))
        config = validate_config(payload)
        filename = payload.get("file", "issues.csv")
        if not isinstance(filename, str) or Path(filename).name != filename or "/" in filename or "\\" in filename:
            raise Error(f"{slug}: 数据文件必须位于项目目录中")
        table_path = (config_path.parent / filename).resolve()
        if not table_path.is_relative_to(source) or not table_path.is_file():
            raise Error(f"{slug}: 找不到数据文件")
        headers, records, _, _ = parse_table(filename, table_path.read_bytes(), payload.get("sheet"))
        mapping = payload.get("mapping")
        if mapping is None:
            mapping = {key: next((h for h in headers if h.lower() in [a.lower() for a in aliases]), "") for key, aliases in ALIASES.items()}
        _, errors = normalize(records, mapping, config)
        if errors:
            # Only row numbers and error descriptions, never print all project data to build logs.
            description = "; ".join(f"第 {e['row']} 行：{'；'.join(e['messages'])}" for e in errors[:20])
            raise Error(f"{slug}: {len(errors)} 行校验失败。{description}")
        with tempfile.TemporaryDirectory() as temporary:
            store = Store(temporary)
            project = store.create(config)
            store.commit(store.preview(project["id"], filename, records, mapping))
            snapshot = store.snapshot(project["id"])
        snapshot["project"]["id"] = slug
        snapshot["project"].pop("mapping", None)
        snapshot["project"].pop("sharing", None)
        snapshot["project"]["updated"] = timestamp
        snapshot["project"]["sourceFile"] = filename
        snapshot["history"] = []
        snapshot["build"] = {"generatedAt": timestamp, "commit": os.environ.get("GITHUB_SHA", ""), "mode": "static"}
        built.append((slug, snapshot))
    output.mkdir(parents=True, exist_ok=True)
    (output / "data").mkdir(exist_ok=True)
    for asset in ("app.js", "style.css", "report.js"):
        shutil.copyfile(ROOT / "static" / asset, output / asset)
    shutil.copyfile(SKILL / "references" / "report.schema.json", output / "report.schema.json")
    html = (ROOT / "static" / "index.html").read_text(encoding="utf-8")
    html = html.replace('<meta charset="utf-8">', '<meta charset="utf-8">\n  <meta name="workbench-mode" content="static">\n  <meta name="referrer" content="no-referrer">')
    html = html.replace('href="/style.css"', 'href="./style.css"').replace('src="/app.js"', 'src="./app.js"').replace('src="/report.js"', 'src="./report.js"')
    (output / "index.html").write_text(html, encoding="utf-8")
    (output / ".nojekyll").write_text("", encoding="utf-8")
    manifest = {"projects": [], "generatedAt": timestamp, "repository": repository, "ref": ref}
    for slug, snapshot in built:
        (output / "data" / f"{slug}.json").write_text(dumps(snapshot), encoding="utf-8")
        manifest["projects"].append({"id": slug, "name": snapshot["project"]["name"], "count": len(snapshot["items"]), "hasReport": bool(snapshot.get("report"))})
    (output / "data" / "manifest.json").write_text(dumps(manifest), encoding="utf-8")
    return manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", default=str(ROOT.parent / "projects"))
    parser.add_argument("--output", default=str(ROOT.parent / "_site"))
    parser.add_argument("--repository", default=os.environ.get("GITHUB_REPOSITORY", ""))
    parser.add_argument("--ref", default="main")
    args = parser.parse_args()
    try:
        result = build(args.source, args.output, args.repository, args.ref)
        print(f"Built {len(result['projects'])} project(s) to {args.output}")
    except (Error, ValueError, OSError) as exc:
        raise SystemExit(str(exc)) from exc
