#!/usr/bin/env python3
"""Recover all 240 mechanical-theory intensive answers from the source PDF.

The embedded OCR layer misses headings such as ``第一题答案``. This script
renders the original answer PDF, recognizes heading rows with Chinese OCR, and
then crops each answer between consecutive headings without horizontal
cropping.
"""

from __future__ import annotations

import io
import re
import shutil
import subprocess
from pathlib import Path

import pypdfium2 as pdfium
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
PDF_ROOT = ROOT / "拆分" / "原始文件"
OUTPUT_ROOT = ROOT / "拆分" / "原始答案重匹配" / "机械原理-强化冲关220题"
PDF_NAME = "27机械考研-机械原理-考强化冲关220题--答案分册--飞轮哥_可搜索.pdf"
OCR_DPI = 150
RETRY_DPI = 220
OUTPUT_DPI = 200
CHAPTER_STARTS = (
    (1, 10), (2, 25), (3, 71), (4, 124), (5, 141),
    (6, 157), (7, 178), (8, 192), (9, 215), (10, 228),
)
QUESTION_COUNTS = {
    1: 19, 2: 29, 3: 57, 4: 16, 5: 23,
    6: 38, 7: 16, 8: 20, 9: 16, 10: 6,
}
INTENSIVE_220_RANGES = {
    1: {1: (1, 11), 2: (12, 19)},
    2: {1: (1, 5), 2: (6, 25), 3: (26, 29)},
    3: {1: (1, 6), 2: (7, 19), 3: (20, 33), 4: (34, 39), 5: (40, 43), 6: (44, 54), 7: (55, 57)},
    4: {1: (1, 8), 2: (9, 16)},
    5: {1: (1, 10), 2: (11, 23)},
    6: {1: (1, 10), 2: (11, 20), 3: (21, 38)},
    7: {1: (1, 9), 2: (10, 16)},
    8: {1: (1, 13), 2: (14, 20)},
    9: {1: (1, 10), 2: (11, 16)},
    10: {1: (1, 6)},
}
CN_DIGITS = {"一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9}
ANSWER_HEADING = re.compile(r"第([一二三四五六七八九十百]+)题答案")


def chinese_number(value: str) -> int:
    if value == "十":
        return 10
    if value.startswith("十"):
        return 10 + CN_DIGITS.get(value[1:], 0)
    if "十" in value:
        tens, ones = value.split("十", 1)
        return CN_DIGITS.get(tens, 0) * 10 + CN_DIGITS.get(ones, 0)
    return CN_DIGITS.get(value, 0)


def section_for(chapter: int, question: int) -> int:
    for section, (first, last) in INTENSIVE_220_RANGES[chapter].items():
        if first <= question <= last:
            return section
    raise ValueError(f"Question outside chapter ranges: {chapter}-{question}")


def ocr_lines(image: Image.Image) -> list[tuple[int, str]]:
    content = io.BytesIO()
    image.save(content, "PNG")
    result = subprocess.run(
        ["tesseract", "stdin", "stdout", "-l", "chi_sim", "--psm", "6", "tsv"],
        input=content.getvalue(),
        capture_output=True,
        check=True,
    )
    grouped: dict[tuple[str, ...], list[tuple[int, int, str]]] = {}
    for row in result.stdout.decode(errors="ignore").splitlines()[1:]:
        columns = row.split("\t")
        if len(columns) < 12 or not columns[11].strip():
            continue
        key = tuple(columns[1:5])
        grouped.setdefault(key, []).append((int(columns[6]), int(columns[7]), columns[11]))
    lines = []
    for words in grouped.values():
        text = "".join(word[2] for word in sorted(words)).replace(" ", "")
        lines.append((min(word[1] for word in words), text))
    return sorted(lines)


def headings_on_page(document: pdfium.PdfDocument, page_index: int, dpi: int) -> list[tuple[int, float]]:
    image = document[page_index].render(scale=dpi / 72).to_pil()
    headings = []
    for top, text in ocr_lines(image):
        match = ANSWER_HEADING.search(text)
        if match:
            headings.append((chinese_number(match.group(1)), top * 72 / dpi))
    return headings


def detect_boundaries(document: pdfium.PdfDocument) -> dict[tuple[int, int], tuple[int, float]]:
    boundaries: dict[tuple[int, int], tuple[int, float]] = {}
    chapter_limits = {
        chapter: CHAPTER_STARTS[index + 1][1] if index + 1 < len(CHAPTER_STARTS) else len(document)
        for index, (chapter, _start) in enumerate(CHAPTER_STARTS)
    }
    for chapter, start in CHAPTER_STARTS:
        for page_index in range(start, chapter_limits[chapter]):
            for question, top in headings_on_page(document, page_index, OCR_DPI):
                if 1 <= question <= QUESTION_COUNTS[chapter]:
                    boundaries.setdefault((chapter, question), (page_index, top))
        missing = [
            question for question in range(1, QUESTION_COUNTS[chapter] + 1)
            if (chapter, question) not in boundaries
        ]
        for question in missing:
            previous = boundaries.get((chapter, question - 1), (start, 0.0))[0]
            following = boundaries.get((chapter, question + 1), (chapter_limits[chapter] - 1, 0.0))[0]
            for page_index in range(previous, following + 1):
                matches = dict(headings_on_page(document, page_index, RETRY_DPI))
                if question in matches:
                    boundaries[(chapter, question)] = (page_index, matches[question])
                    break
        still_missing = [
            question for question in range(1, QUESTION_COUNTS[chapter] + 1)
            if (chapter, question) not in boundaries
        ]
        if still_missing:
            raise RuntimeError(f"Chapter {chapter} still misses answer headings: {still_missing}")
        print(f"第{chapter}章：识别 {QUESTION_COUNTS[chapter]} 个答案标题", flush=True)
    return boundaries


def render_answers(
    document: pdfium.PdfDocument,
    boundaries: dict[tuple[int, int], tuple[int, float]],
) -> None:
    if OUTPUT_ROOT.exists():
        shutil.rmtree(OUTPUT_ROOT)
    OUTPUT_ROOT.mkdir(parents=True)
    ordered = sorted(boundaries.items(), key=lambda item: item[1])
    scale = OUTPUT_DPI / 72
    rendered: dict[int, Image.Image] = {}

    def page_image(page_index: int) -> Image.Image:
        if page_index not in rendered:
            rendered[page_index] = document[page_index].render(scale=scale).to_pil().convert("RGB")
        return rendered[page_index]

    for index, ((chapter, question), (start_page, start_top)) in enumerate(ordered):
        if index + 1 < len(ordered):
            end_page, end_top = ordered[index + 1][1]
        else:
            end_page, end_top = len(document), 0.0
        section = section_for(chapter, question)
        folder = OUTPUT_ROOT / f"{chapter:02d} 第{chapter}章 {section:02d}-强化板块{section}"
        folder.mkdir(parents=True, exist_ok=True)
        parts = []
        last_page = min(end_page, len(document) - 1)
        for page_index in range(start_page, last_page + 1):
            image = page_image(page_index)
            top_points = start_top - 3 if page_index == start_page else 48
            bottom_points = end_top - 3 if page_index == end_page else image.height / scale - 8
            top = max(0, round(top_points * scale))
            bottom = min(image.height, round(bottom_points * scale))
            if bottom > top + 10:
                parts.append(image.crop((0, top, image.width, bottom)))
        for part_index, image in enumerate(parts, 1):
            suffix = f".{part_index}"
            image.save(folder / f"A-{chapter:02d}-{section}-{question:02d}{suffix}.png", "PNG")


def main() -> None:
    document = pdfium.PdfDocument(PDF_ROOT / PDF_NAME)
    try:
        boundaries = detect_boundaries(document)
        render_answers(document, boundaries)
    finally:
        document.close()
    print(f"已从原始答案册恢复 {len(boundaries)} 题答案：{OUTPUT_ROOT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
