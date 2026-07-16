#!/usr/bin/env python3
"""Re-split the three numbered mechanical books with sequence-aware OCR repair.

The searchable PDFs contain OCR coordinates. Printed labels occasionally read
``11.`` as ``1.``; assigning labels in reading order repairs those collisions.
Only vertical boundaries are cropped. Every output image keeps the complete
rendered PDF width.
"""

from __future__ import annotations

import re
import shutil
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

import pdfplumber
import pypdfium2 as pdfium
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
PDF_ROOT = ROOT / "拆分" / "原始文件"
OUTPUT_ROOT = ROOT / "拆分" / "修复后"
DPI = 200
CN_DIGITS = {"一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9}
QUESTION = re.compile(r"^(\d{1,3})([.．、,，])")
CHAPTER_CN = re.compile(r"第([一二三四五六七八九十]+)章")
CHAPTER_ARABIC = re.compile(r"第(\d+)章")
SECTION = re.compile(r"^([一二三四五六七八九十])[、,，]")


@dataclass(frozen=True)
class Config:
    output_name: str
    question_pdf: str
    answer_pdf: str
    reset_per_section: bool


CONFIGS = (
    Config(
        "机械原理-基础过关450题",
        "27机械考研-机械原理-基础过关450题--题目册--飞轮哥_可搜索.pdf",
        "27机械考研-机械原理-基础过关450题--答案册--飞轮哥_可搜索.pdf",
        True,
    ),
    Config(
        "机械设计-基础过关600题",
        "27机械考研-机械设计-基础过关600题--题目册--飞轮哥_可搜索.pdf",
        "27机械考研-机械设计-基础过关600题--答案册--飞轮哥_可搜索.pdf",
        True,
    ),
    Config(
        "机械设计-考研通关680题",
        "27机械考研-机械设计-考研通关680题--题目册--飞轮哥_可搜索.pdf",
        "27机械考研-机械设计-考研通关680题--答案分册--飞轮哥_可搜索.pdf",
        False,
    ),
)


def chinese_number(value: str) -> int:
    if value == "十":
        return 10
    if value.startswith("十"):
        return 10 + CN_DIGITS.get(value[1:], 0)
    if "十" in value:
        tens, ones = value.split("十", 1)
        return CN_DIGITS.get(tens, 0) * 10 + CN_DIGITS.get(ones, 0)
    return CN_DIGITS.get(value, 0)


def next_number(current: int, detected: int) -> int:
    if current == 0:
        return detected if 1 <= detected <= 3 else 1
    if current < detected <= current + 3:
        return detected
    return current + 1


def extract(pdf_path: Path, reset_per_section: bool) -> tuple[list[dict], list[tuple[int, float]]]:
    candidates: list[dict] = []
    boundaries: list[tuple[int, float]] = []
    current_chapter = 0
    current_section = 0
    counters: dict[tuple[int, int], int] = defaultdict(int)
    chapter_counters: dict[int, int] = defaultdict(int)

    with pdfplumber.open(pdf_path) as document:
        for page_index, page in enumerate(document.pages):
            lines = page.extract_text_lines(layout=False, strip=True, return_chars=False)
            raw_questions = [
                line for line in lines
                if line["x0"] < 90 and QUESTION.match(line["text"])
            ]
            chapter_on_page = None
            for line in lines:
                if line["top"] >= 150:
                    continue
                match = CHAPTER_CN.search(line["text"])
                if match:
                    chapter_on_page = chinese_number(match.group(1))
                    break
                match = CHAPTER_ARABIC.search(line["text"])
                if match:
                    chapter_on_page = int(match.group(1))
                    break
            # TOC pages contain chapter names but no actual numbered question rows.
            if chapter_on_page and raw_questions:
                current_chapter = chapter_on_page
                current_section = 0

            for line in lines:
                text = line["text"]
                top = float(line["top"])
                if chapter_on_page and current_chapter == chapter_on_page:
                    chapter_match = CHAPTER_CN.search(text) or CHAPTER_ARABIC.search(text)
                    if chapter_match and top < 150:
                        boundaries.append((page_index, top))
                        continue
                section_match = SECTION.match(text)
                if section_match and line["x0"] < 100 and current_chapter:
                    section = chinese_number(section_match.group(1))
                    if 1 <= section <= 10:
                        current_section = section
                        boundaries.append((page_index, top))
                        continue
                question_match = QUESTION.match(text)
                if not question_match or line["x0"] >= 90 or not current_chapter or not current_section:
                    continue
                detected = int(question_match.group(1))
                punctuation = question_match.group(2)
                current = (
                    counters[(current_chapter, current_section)]
                    if reset_per_section else chapter_counters[current_chapter]
                )
                # OCR frequently turns a printed full stop into a comma. Accept
                # the comma only when its number is locally plausible; this
                # rejects formula continuations such as "18, 许用安全系数".
                if punctuation in ",，" and (
                    (current == 0 and detected > 3) or
                    (current > 0 and detected > current + 3)
                ):
                    continue
                if reset_per_section:
                    key = (current_chapter, current_section)
                    number = next_number(counters[key], detected)
                    counters[key] = number
                else:
                    number = next_number(chapter_counters[current_chapter], detected)
                    chapter_counters[current_chapter] = number
                candidate = {
                    "page": page_index,
                    "top": top,
                    "chapter": current_chapter,
                    "section": current_section,
                    "number": number,
                }
                candidates.append(candidate)
                boundaries.append((page_index, top))

    boundaries.sort()
    candidates.sort(key=lambda item: (item["page"], item["top"]))
    return candidates, boundaries


def render_split(pdf_path: Path, output: Path, prefix: str, reset_per_section: bool) -> int:
    candidates, boundaries = extract(pdf_path, reset_per_section)
    document = pdfium.PdfDocument(pdf_path)
    scale = DPI / 72
    rendered: dict[int, Image.Image] = {}

    def page_image(index: int) -> Image.Image:
        if index not in rendered:
            rendered[index] = document[index].render(scale=scale).to_pil().convert("RGB")
        return rendered[index]

    for candidate in candidates:
        start = (candidate["page"], candidate["top"])
        following = next((point for point in boundaries if point > start), (len(document), 0.0))
        end_page, end_top = following
        chapter = candidate["chapter"]
        section = candidate["section"]
        number = candidate["number"]
        chapter_dir = output / f"{chapter:02d} 第{chapter}章 {section}-第{section}类题"
        chapter_dir.mkdir(parents=True, exist_ok=True)
        last_page = min(end_page, len(document) - 1)
        parts: list[Image.Image] = []
        for page_index in range(candidate["page"], last_page + 1):
            image = page_image(page_index)
            top = int((candidate["top"] if page_index == candidate["page"] else 48) * scale)
            bottom_point = end_top - 2 if page_index == end_page else (image.height / scale - 8)
            bottom = min(image.height, int(bottom_point * scale))
            if bottom > top + 10:
                parts.append(image.crop((0, max(0, top - 2), image.width, bottom + 2)))
        for index, image in enumerate(parts, 1):
            suffix = f".{index}" if len(parts) > 1 else ""
            image.save(chapter_dir / f"{prefix}-{chapter:02d}-{section}-{number:02d}{suffix}.png", "PNG")
    document.close()
    return len(candidates)


def main() -> None:
    if OUTPUT_ROOT.exists():
        shutil.rmtree(OUTPUT_ROOT)
    OUTPUT_ROOT.mkdir(parents=True)
    for config in CONFIGS:
        output = OUTPUT_ROOT / config.output_name
        question_count = render_split(
            PDF_ROOT / config.question_pdf, output, "Q", config.reset_per_section
        )
        answer_count = render_split(
            PDF_ROOT / config.answer_pdf, output, "A", config.reset_per_section
        )
        print(f"{config.output_name}: Q={question_count}, A={answer_count}")


if __name__ == "__main__":
    main()
