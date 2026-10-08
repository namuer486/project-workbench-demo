"""Package the same JSON Skill contract used by the workbench."""
import io
import os
import shutil
import subprocess
import sys
import zipfile

from ipd import SKILL

INSTALL_GUIDE = """项目 JSON 生成 Skill 使用说明

1. 解压本压缩包，保留完整的 ipd-report-json 文件夹。
2. Codex 用户：把该文件夹复制到用户目录的 .codex/skills/ 下。
   Windows 示例：%USERPROFILE%\\.codex\\skills\\ipd-report-json
   如需更新已有 Skill，请先保留自己的修改，再替换对应文件。
3. 其他 Agent：让 Agent 阅读 ipd-report-json/SKILL.md，并提供完整文件夹，
   包括 references 格式规范及 scripts 校验脚本。
4. 将项目报告、PM 台账、WBS、周报或测试反馈交给 Agent，使用以下指令：

使用 ipd-report-json Skill，根据附件生成项目工作台可导入的 report.json。
按资料实际类型处理；没有 IPD 研究时不编造六维评分、样本量或研究结论。
保留原始编号、状态、优先级及来源依据，整理项目级问题及其关联明细。
如果提供了当前 report.json，保留其中人工维护的内容，核对冲突后再更新。
运行 scripts/validate.py 校验，修复错误后交付完整 report.json。

5. 在 Skill 文件夹中执行：python scripts/validate.py <report.json路径>
   校验脚本仅使用 Python 标准库。结构校验通过后仍需核对原始资料。
6. 回到工作台点击“导入项目 JSON”，检查预览后保存生成项目。

此包是 JSON 生成 Skill。安装工作台网站需要另外取得工作台项目代码。
"""


def skill_archive():
    for name in ("SKILL.md", "references/project.schema.json", "scripts/validate.py"):
        if not (SKILL / name).is_file():
            raise ValueError("Skill 配套文件缺失：" + name)
    paths = [SKILL / "SKILL.md"]
    for folder in ("references", "scripts"):
        paths.extend(p for p in (SKILL / folder).rglob("*")
                     if p.is_file() and p.suffix in (".md", ".json", ".py")
                     and "__pycache__" not in p.parts and p.resolve().is_relative_to(SKILL.resolve()))
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(paths):
            archive.writestr("ipd-report-json/" + path.relative_to(SKILL).as_posix(), path.read_bytes())
        archive.writestr("ipd-report-json/使用说明.txt", INSTALL_GUIDE.encode("utf-8"))
    return output.getvalue()


def can_open_skill_folder():
    return os.name == "nt" or sys.platform == "darwin" or bool(shutil.which("xdg-open"))


def open_skill_folder():
    # The target is fixed by the application; never accept a client-provided path.
    if os.name == "nt":
        os.startfile(str(SKILL.resolve()))
    else:
        executable = "open" if sys.platform == "darwin" else shutil.which("xdg-open")
        if not executable:
            raise OSError("当前系统没有文件管理器，请下载 Skill 压缩包")
        subprocess.Popen([executable, str(SKILL.resolve())], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
