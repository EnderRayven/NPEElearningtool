#!/usr/bin/env python3
"""Repair answer-image page boundaries in the 880 math banks.

The reference-answer PDF is rendered beforehand by the PDF inspection workflow
into /private/tmp/npee_pdfcheck/reference-100 and reference-200.
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
WORKSPACE = ROOT / "数据/默认题库"
MANIFEST = WORKSPACE / "题库数据.json"
REF100 = Path("/private/tmp/npee_pdfcheck/reference-100")
REF200 = Path("/private/tmp/npee_pdfcheck/reference-200")
BACKUP_ROOT = Path("/private/tmp/880-answer-image-repair-before")
LINEAR_ROOT = WORKSPACE / "数学/线代/880线代"
HIGH_ROOT = WORKSPACE / "数学/高数/880高数"


LINEAR_MANUAL = {
    "数据/默认题库/数学/线代/880线代/01 行列式 01-基础/A-01-1-20.1.png": (225, .5751, .7549),
    "数据/默认题库/数学/线代/880线代/03 向量 01-基础/A-03-1-17.1.png": (255, .0909, .3241),
    "数据/默认题库/数学/线代/880线代/03 向量 02-综合/A-03-2-08.1.png": (257, .4289, .5642),
    "数据/默认题库/数学/线代/880线代/04 线性方程组 02-综合/A-04-2-26.2.png": (282, .0900, .2717),
    "数据/默认题库/数学/线代/880线代/05 相似矩阵 01-基础/A-05-1-27.2.png": (296, .0900, .5563),
    "数据/默认题库/数学/线代/880线代/05 相似矩阵 02-综合/A-05-2-33.2.png": (315, .0900, .2589),
    "数据/默认题库/数学/线代/880线代/06 二次型 01-基础/A-06-1-21.2.png": (326, .0900, .6047),
    "数据/默认题库/数学/线代/880线代/06 二次型 02-综合/A-06-2-35.2.png": (347, .0900, .2964),
}


HIGH_MANUAL = {
}

# This answer sits between a section heading and the next answer on source
# page 7.  Its marker-based interval includes both neighbouring regions, so
# use a fixed source-PDF vertical box while retaining the asset's existing
# width.  The y values are source-render pixel coordinates.
HIGH_FIXED_CROPS = {
    "数据/默认题库/数学/高数/880高数/01 函数、极限、连续 01-基础/A-01-1-20.1.png": (7, 376, 661),
    "数据/默认题库/数学/高数/880高数/02 一元函数微分学及其应用 01-基础/A-02-1-78.1.png": (49, 552, 686),
}

# Linear-algebra answer blocks that cross a nearby marker/section boundary.
# Coordinates are in the 200-dpi source render; all keep the existing 1140px
# asset width.
LINEAR_FIXED_CROPS = {
    "数据/默认题库/数学/线代/880线代/01 行列式 01-基础/A-01-1-20.1.png": (225, 1150, 1520),
    "数据/默认题库/数学/线代/880线代/03 向量 01-基础/A-03-1-17.1.png": (255, 175, 647),
    "数据/默认题库/数学/线代/880线代/04 线性方程组 01-基础/A-04-1-22.1.png": (270, 1017, 1335),
    "数据/默认题库/数学/线代/880线代/04 线性方程组 02-综合/A-04-2-05.1.png": (272, 1562, 1838),
    "数据/默认题库/数学/线代/880线代/04 线性方程组 02-综合/A-04-2-13.1.png": (275, 1450, 1729),
    "数据/默认题库/数学/线代/880线代/05 相似矩阵 02-综合/A-05-2-33.2.png": (315, 160, 517),
    "数据/默认题库/数学/线代/880线代/06 二次型 01-基础/A-06-1-01.1.png": (317, 500, 740),
    "数据/默认题库/数学/线代/880线代/06 二次型 02-综合/A-06-2-35.2.png": (347, 160, 592),
    # Keep the complete note after question 9, but stop before the next
    # section heading on source page 320.
    "数据/默认题库/数学/线代/880线代/06 二次型 01-基础/A-06-1-12.1.png": (320, 445, 850),
}


HIGH_ORPHANS = {
    "数据/默认题库/数学/高数/880高数/01 函数、极限、连续 03-拓展/A-01-3-04.2.png":
        "default-880-calculus-01-3-04",
    "数据/默认题库/数学/高数/880高数/03 一元函数积分学及其应用 03-拓展/A-03-3-06.3.png":
        "default-880-calculus-03-3-06",
    "数据/默认题库/数学/高数/880高数/04 多元函数微分学及其应用 03-拓展/A-04-3-02.2.png":
        "default-880-calculus-04-3-02",
    "数据/默认题库/数学/高数/880高数/05 二重积分 03-拓展/A-05-3-05.3.png":
        "default-880-calculus-05-3-05",
}


LINEAR_SPANS = {
    (1, 1): ((221, .2283), (225, .7549)), (1, 2): ((225, .7549), (231, .0978)),
    (1, 3): ((231, .0978), (233, .1868)), (2, 1): ((233, .1868), (242, .4644)),
    (2, 2): ((242, .4644), (249, .1364)), (2, 3): ((249, .1364), (250, .1887)),
    (3, 1): ((250, .1887), (255, .3251)), (3, 2): ((255, .3251), (262, .7994)),
    (3, 3): ((262, .7994), (264, .1848)), (4, 1): ((264, .1848), (271, .7480)),
    (4, 2): ((271, .7480), (282, .2727)), (4, 3): ((282, .2727), (284, .1868)),
    (5, 1): ((284, .1868), (296, .5563)), (5, 2): ((296, .5563), (315, .2589)),
    (5, 3): ((315, .2589), (317, .1937)), (6, 1): ((317, .1937), (326, .6047)),
    (6, 2): ((326, .6047), (347, .2964)), (6, 3): ((347, .2964), (354, 0.0)),
}


def trim_ink(image: Image.Image, threshold: int = 205, *, preserve_width: bool = False) -> Image.Image:
    array = np.asarray(image.convert("RGB"))
    dark = array.mean(axis=2) < threshold
    rows = np.where(dark.sum(axis=1) >= 4)[0]
    cols = np.where(dark.sum(axis=0) >= 4)[0]
    if not len(rows) or not len(cols):
        raise RuntimeError("裁剪区域没有有效内容")
    top = max(0, int(rows[0]) - 10)
    bottom = min(image.height, int(rows[-1]) + 11)
    left = 0 if preserve_width else max(0, int(cols[0]) - 10)
    right = image.width if preserve_width else min(image.width, int(cols[-1]) + 11)
    return image.crop((left, top, right, bottom))


def crop_reference(folder: Path, page: int, start: float, end: float, *, x0: float, x1: float,
                   threshold: int = 205, preserve_width: bool = False) -> Image.Image:
    source = Image.open(folder / f"page-{page:03d}.png").convert("RGB")
    width, height = source.size
    left = int(width * x0)
    right = int(width * x1)
    top = max(0, int(height * start) - 4)
    # Include the boundary itself plus a small source-PDF margin.  Cutting ten
    # pixels before the next marker can leave the final equation clipped.
    bottom = min(height, int(height * end) + 12)
    if bottom <= top:
        raise RuntimeError(f"裁剪边界异常：第{page}页 {start}..{end}")
    return trim_ink(source.crop((left, top, right, bottom)), threshold, preserve_width=preserve_width)


def crop_pdf_vertical_preserve_width(folder: Path, page: int, start: tuple[int, float], end: tuple[int, float],
                                     width: int, threshold: int = 205) -> Image.Image:
    """Re-crop from the source page while retaining the existing PDF crop width."""
    source = Image.open(folder / f"page-{page:03d}.png").convert("RGB")
    last_page = page == (end[0] - 1 if end[1] <= 0 else end[0])
    top_ratio = start[1] - .008 if page == start[0] else .078
    bottom_ratio = end[1] + .012 if last_page else .965
    raw = source.crop((0, int(source.height * max(0, top_ratio)), source.width,
                       int(source.height * min(1, bottom_ratio))))
    array = np.asarray(raw)
    dark = array.mean(axis=2) < threshold
    rows = np.where(dark.sum(axis=1) >= 4)[0]
    cols = np.where(dark.sum(axis=0) >= 4)[0]
    if not len(rows) or not len(cols):
        raise RuntimeError(f"源 PDF 裁剪区域没有有效内容：第{page}页 {start}..{end}")
    if width > raw.width:
        raise RuntimeError(f"源 PDF 宽度不足，无法保持原图宽度：{width}>{raw.width}")
    center = (int(cols[0]) + int(cols[-1]) + 1) / 2
    left = round(center - width / 2)
    left = max(0, min(left, raw.width - width))
    top = max(0, int(rows[0]) - 12)
    bottom = min(raw.height, int(rows[-1]) + 13)
    result = raw.crop((left, top, left + width, bottom))
    if result.width != width:
        raise RuntimeError(f"意外改变图片宽度：{result.width}!={width}")
    return result


def crop_fixed_source_vertical(folder: Path, page: int, y0: int, y1: int, width: int,
                               *, left: int | None = None, trim_vertical: bool = False) -> Image.Image:
    """Crop a known source-PDF vertical interval without changing its width."""
    source = Image.open(folder / f"page-{page:03d}.png").convert("RGB")
    if not 0 <= y0 < y1 <= source.height:
        raise RuntimeError(f"源 PDF 固定裁剪边界异常：第{page}页 y={y0}..{y1}")
    if width > source.width:
        raise RuntimeError(f"源 PDF 宽度不足，无法保持原图宽度：{width}>{source.width}")
    crop_left = (source.width - width) // 2 if left is None else left
    if not 0 <= crop_left <= source.width - width:
        raise RuntimeError(f"源 PDF 横向裁剪边界异常：第{page}页 x={crop_left} width={width}")
    result = source.crop((crop_left, y0, crop_left + width, y1))
    if trim_vertical:
        result = trim_ink(result, preserve_width=True)
    if result.width != width:
        raise RuntimeError(f"意外改变图片宽度：{result.width}!={width}")
    return result


def save_image(relative: str, image: Image.Image, *, dry_run: bool) -> None:
    path = ROOT / relative
    if not path.exists():
        raise FileNotFoundError(path)
    print(f"修复 {relative}: {Image.open(path).size} -> {image.size}")
    if not dry_run:
        backup = BACKUP_ROOT / relative
        backup.parent.mkdir(parents=True, exist_ok=True)
        if not backup.exists():
            shutil.copy2(path, backup)
        image.save(path, optimize=True)


def repair_manual(dry_run: bool) -> list[str]:
    changed: list[str] = []
    for relative, (page, start, end) in LINEAR_MANUAL.items():
        image = crop_reference(REF200, page, start, end, x0=92 / 1433, x1=1232 / 1433, preserve_width=True)
        save_image(relative, image, dry_run=dry_run)
        changed.append(relative)
    for relative, (page, start, end) in HIGH_MANUAL.items():
        current_width = Image.open(ROOT / relative).width
        image = crop_pdf_vertical_preserve_width(REF100, page, (page, start), (page, end), current_width)
        save_image(relative, image, dry_run=dry_run)
        changed.append(relative)
    for relative, (page, y0, y1) in LINEAR_FIXED_CROPS.items():
        current_width = Image.open(ROOT / relative).width
        image = crop_fixed_source_vertical(
            REF200, page, y0, y1, current_width, left=92, trim_vertical=True,
        )
        save_image(relative, image, dry_run=dry_run)
        changed.append(relative)
    for relative, (page, y0, y1) in HIGH_FIXED_CROPS.items():
        current_width = Image.open(ROOT / relative).width
        image = crop_fixed_source_vertical(REF100, page, y0, y1, current_width)
        save_image(relative, image, dry_run=dry_run)
        changed.append(relative)
    return changed


def key_for_path(path: Path) -> tuple[int, int] | None:
    folder = path.parent.name
    match = re.match(r"(\d+).+ (\d+)-", folder)
    return (int(match.group(1)), int(match.group(2))) if match else None


def normalize(text: str) -> str:
    return "".join(char for char in text if char.isalnum() or "\u3400" <= char <= "\u9fff")


def page_texts() -> dict[int, str]:
    result: dict[int, str] = {}
    for page in range(221, 355):
        tsv = Path(f"/private/tmp/npee_pdfcheck/reference-100-tsv/page-{page:03d}.tsv")
        words = []
        for line in tsv.read_text(encoding="utf-8", errors="ignore").splitlines()[1:]:
            columns = line.split("\t")
            if len(columns) >= 12 and columns[0] == "5" and columns[11].strip():
                words.append(columns[11].strip())
        result[page] = "".join(words)
    return result


def page_score(text: str, page: str) -> float:
    query = normalize(text[-500:])
    source = normalize(page)
    if len(query) < 4:
        return 0.0
    grams = {query[index:index + 2] for index in range(len(query) - 1)}
    source_grams = {source[index:index + 2] for index in range(len(source) - 1)}
    return len(grams & source_grams) / len(grams)


def ocr_marker(path: Path) -> int | None:
    result = subprocess.run(
        ["/opt/homebrew/bin/tesseract", str(path), "stdout", "-l", "chi_sim+eng", "--psm", "6"],
        capture_output=True, text=True, check=False,
    )
    first_lines = "\n".join(result.stdout.splitlines()[:2])
    match = re.search(r"\(([0-9]{1,2})\)", first_lines)
    return int(match.group(1)) if match else None


def green_groups(path: Path) -> list[tuple[int, int]]:
    array = np.asarray(Image.open(path).convert("RGB")).astype(np.int16)
    height, width = array.shape[:2]
    band = array[:, int(width * .095):int(width * .22)]
    red, green, blue = band[:, :, 0], band[:, :, 1], band[:, :, 2]
    mask = (green > red + 8) & (green > blue + 3) & (green > 60)
    active = np.where(mask.sum(axis=1) >= 4)[0]
    result: list[tuple[int, int]] = []
    if not len(active):
        return result
    start = previous = int(active[0])
    for row in active[1:]:
        row = int(row)
        if row - previous > 3:
            pixels = int(mask[start:previous + 1].sum())
            if previous - start >= 8 and pixels >= 35:
                result.append((start, pixels))
            start = row
        previous = row
    pixels = int(mask[start:previous + 1].sum())
    if previous - start >= 8 and pixels >= 35:
        result.append((start, pixels))
    return result


def source_marker_y(page: int, number: int | None) -> float | None:
    if number is None:
        return None
    tsv = Path(f"/private/tmp/npee_pdfcheck/reference-100-tsv/page-{page:03d}.tsv")
    candidates: list[float] = []
    for line in tsv.read_text(encoding="utf-8", errors="ignore").splitlines()[1:]:
        columns = line.split("\t")
        if len(columns) < 12 or columns[0] != "5":
            continue
        x, top, width, height = map(float, columns[6:10])
        text = columns[11].strip()
        if x > 150 or top < 70:
            continue
        if re.fullmatch(rf"\(?{number}\)?[A-Za-z.]?", text):
            candidates.append((top - 4) / 1012)
    if candidates:
        return candidates[0]
    return None


def auto_linear(dry_run: bool) -> list[str]:
    """Repair other bottom-edge candidates when source-page matching is clear."""
    ocr_path = Path("/private/tmp/npee_pdfcheck/answer_bottom_ocr_linear.json")
    if not ocr_path.exists():
        return []
    ocr = dict(json.loads(ocr_path.read_text(encoding="utf-8")))
    texts = page_texts()
    changed: list[str] = []
    manual_paths = set(LINEAR_MANUAL)
    for relative, bottom_text in ocr.items():
        if relative in manual_paths:
            continue
        path = ROOT / relative
        if not path.exists() or not str(path).startswith(str(LINEAR_ROOT)):
            continue
        baseline_path = BACKUP_ROOT / relative if (BACKUP_ROOT / relative).exists() else path
        with Image.open(baseline_path) as baseline:
            array = np.asarray(baseline.convert("RGB"))
            baseline_size = baseline.size
        if int((array.mean(axis=2) < 170)[-1].sum()) < 5:
            continue
        key = key_for_path(path)
        if key not in LINEAR_SPANS:
            continue
        start, end = LINEAR_SPANS[key]
        candidates = [
            (page_score(bottom_text, texts[page]), page)
        for page in range(start[0], end[0] + 1)
            if page in texts
        ]
        candidates.sort(reverse=True)
        if not candidates or candidates[0][0] < .42:
            print(f"跳过自动修复（页码置信度不足） {relative}: {candidates[:2]}")
            continue
        confidence, page = candidates[0]
        source = REF200 / f"page-{page:03d}.png"
        if not source.exists():
            continue
        height = Image.open(source).height
        if path.name.endswith(".1.png"):
            marker = ocr_marker(baseline_path)
            source_start = source_marker_y(page, marker)
            if source_start is None:
                groups = green_groups(source)
                source_start = next((top / height for top, pixels in groups if .08 < top / height < .92), .09)
        else:
            source_start = .09
        approximate_end = source_start * height + array.shape[0] - 24
        groups = green_groups(source)
        next_groups = [top for top, pixels in groups if top > approximate_end and pixels >= 100]
        # Stop immediately before the next green marker/heading.  Ten pixels
        # was too conservative for a line whose descenders reach the boundary.
        source_end = (next_groups[0] - 2) / height if next_groups else .955
        if source_end <= source_start + .02:
            print(f"跳过自动修复（边界异常） {relative}: page={page} start={source_start:.4f} end={source_end:.4f}")
            continue
        repaired = crop_reference(
            REF200, page, source_start, source_end, x0=92 / 1433, x1=1232 / 1433,
            preserve_width=True,
        )
        # The automatic path is deliberately conservative.  A large change in
        # height usually means that a neighboring answer was selected as the
        # boundary rather than a missing final line being restored.
        if repaired.height < array.shape[0] * .95 or repaired.height > array.shape[0] * 1.35:
            print(
                f"跳过自动修复（尺寸变化过大） {relative}: "
                f"{baseline_size} -> {repaired.size}"
            )
            continue
        print(f"自动修复 page={page} score={confidence:.3f} {relative}: {baseline_size} -> {repaired.size}")
        if not dry_run:
            backup = BACKUP_ROOT / relative
            backup.parent.mkdir(parents=True, exist_ok=True)
            if not backup.exists():
                shutil.copy2(path, backup)
            repaired.save(path, optimize=True)
        changed.append(relative)
    return changed


def update_manifest_and_remove_orphans(dry_run: bool) -> list[str]:
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    removed: list[str] = []
    for relative, question_id in HIGH_ORPHANS.items():
        path = ROOT / relative
        if path.exists():
            print(f"移除孤立解析图 {relative}")
            if not dry_run:
                path.unlink()
            removed.append(relative)
        if question_id:
            for bank in manifest.get("banks", []):
                for chapter in bank.get("chapters", []):
                    for section in chapter.get("sections", []):
                        for question in section.get("questions", []):
                            if question.get("id") == question_id:
                                question["answerImageKeys"] = [
                                    key for key in question.get("answerImageKeys", [])
                                    if not key.endswith(Path(relative).name)
                                ]
    if not dry_run:
        backup = Path("/private/tmp/default-question-bank-manifest-before-880-answer-image-repair.json")
        backup.write_text(MANIFEST.read_text(encoding="utf-8"), encoding="utf-8")
        MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return removed


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--manual-only", action="store_true")
    args = parser.parse_args()
    if not REF100.exists() or not REF200.exists():
        raise SystemExit("缺少参考 PDF 渲染页")
    changed = repair_manual(args.dry_run)
    if not args.manual_only:
        changed.extend(auto_linear(args.dry_run))
    removed = update_manifest_and_remove_orphans(args.dry_run)
    print(json.dumps({"changed": len(changed), "removed": len(removed), "dryRun": args.dry_run}, ensure_ascii=False))


if __name__ == "__main__":
    main()
