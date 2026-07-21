#!/usr/bin/env python3
"""Recover missing answers for section-numbered mechanical books."""

from __future__ import annotations

import io
import json
import re
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path

import pdfplumber
import pypdfium2 as pdfium
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
PDF_ROOT = ROOT / "拆分" / "原始文件"
OUTPUT_BASE = ROOT / "拆分" / "原始答案重匹配"
MANIFEST = ROOT / "默认题库" / "题库数据.json"
OCR_DPI = 160
OUTPUT_DPI = 200
ARABIC_HEADING = re.compile(r"^(\d{1,3})[.．、,，]")
CHINESE_HEADING = re.compile(r"^第([一二三四五六七八九十百]+)题")
SECTION = re.compile(r"^([一二三四五六七八九十])[、,，]")
TOPIC_SECTION = re.compile(r"强化考点\s*(\d+)")
CN_DIGITS = {"一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9}
CN_SECTIONS = {**CN_DIGITS, "十": 10}


@dataclass(frozen=True)
class Config:
    bank_id: str
    source_name: str
    pdf_name: str
    chapter_starts: tuple[int, ...]
    mode: str


CONFIGS = (
    Config(
        "default-mechanical-theory-basic-450",
        "机械原理-基础过关450题",
        "27机械考研-机械原理-基础过关450题--答案册--飞轮哥_可搜索.pdf",
        (6, 17, 32, 39, 46, 53, 60, 69, 77, 86, 92),
        "arabic",
    ),
    Config(
        "default-mechanical-design-basic-600",
        "机械设计-基础过关600题",
        "27机械考研-机械设计-基础过关600题--答案册--飞轮哥_可搜索.pdf",
        (5, 9, 15, 18, 24, 27, 34, 39, 50, 56, 60, 65, 67),
        "arabic",
    ),
    Config(
        "default-mechanical-design-intensive-notes",
        "机械设计-强化班补充讲义",
        "27机械考研-机械设计-强化班-补充讲义-答案-飞轮哥_可搜索.pdf",
        (4, 14, 33, 35, 43, 46, 61, 75, 85, 101, 113, 124),
        "chinese",
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


def ocr_lines(image: Image.Image) -> list[tuple[int, int, str]]:
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
        grouped.setdefault(tuple(columns[1:5]), []).append(
            (int(columns[6]), int(columns[7]), columns[11])
        )
    lines = []
    for words in grouped.values():
        text = "".join(word[2] for word in sorted(words)).replace(" ", "")
        lines.append((min(word[0] for word in words), min(word[1] for word in words), text))
    return sorted(lines, key=lambda line: line[1])


def expected_questions(config: Config) -> set[tuple[int, int, int]]:
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    bank = next(bank for bank in manifest["banks"] if bank["id"] == config.bank_id)
    expected = set()
    for chapter_index, chapter in enumerate(bank["chapters"], 1):
        for section in chapter["sections"]:
            section_number = int(section["id"].rsplit("-", 1)[-1])
            for question in section["questions"]:
                expected.add((chapter_index, section_number, question["number"]))
    return expected


def section_boundaries(config: Config) -> dict[int, list[tuple[tuple[int, float], int]]]:
    result = {}
    with pdfplumber.open(PDF_ROOT / config.pdf_name) as document:
        for chapter, start in enumerate(config.chapter_starts, 1):
            end = config.chapter_starts[chapter] if chapter < len(config.chapter_starts) else len(document.pages)
            entries = []
            for page_index in range(start, end):
                for line in document.pages[page_index].extract_text_lines(
                    layout=False, strip=True, return_chars=False
                ):
                    text = line["text"].replace(" ", "")
                    match = SECTION.match(text) if config.mode == "arabic" else TOPIC_SECTION.search(text)
                    if match and line["x0"] < 130:
                        value = CN_SECTIONS[match.group(1)] if config.mode == "arabic" else int(match.group(1))
                        entries.append(((page_index, float(line["top"])), value))
            result[chapter] = sorted(entries)
    return result


def detect(config: Config, document: pdfium.PdfDocument) -> dict[tuple[int, int, int], tuple[int, float]]:
    expected = expected_questions(config)
    sections = section_boundaries(config)
    detected = {}
    for chapter, start in enumerate(config.chapter_starts, 1):
        end = config.chapter_starts[chapter] if chapter < len(config.chapter_starts) else len(document)
        for page_index in range(start, end):
            image = document[page_index].render(scale=OCR_DPI / 72).to_pil()
            for left, top, text in ocr_lines(image):
                if left >= 200:
                    continue
                match = ARABIC_HEADING.match(text) if config.mode == "arabic" else CHINESE_HEADING.match(text)
                if not match:
                    continue
                number = int(match.group(1)) if config.mode == "arabic" else chinese_number(match.group(1))
                point = (page_index, top * 72 / OCR_DPI)
                preceding = [section for boundary, section in sections[chapter] if boundary <= point]
                if not preceding:
                    continue
                key = (chapter, preceding[-1], number)
                if key in expected:
                    detected.setdefault(key, point)
        print(f"{config.source_name} 第{chapter}章：识别 {sum(key[0] == chapter for key in detected)} 个答案", flush=True)
    return detected


def render(
    config: Config,
    document: pdfium.PdfDocument,
    boundaries: dict[tuple[int, int, int], tuple[int, float]],
) -> None:
    output = OUTPUT_BASE / config.source_name
    if output.exists():
        shutil.rmtree(output)
    output.mkdir(parents=True)
    ordered = sorted(boundaries.items(), key=lambda item: item[1])
    scale = OUTPUT_DPI / 72
    rendered: dict[int, Image.Image] = {}

    def page_image(page_index: int) -> Image.Image:
        if page_index not in rendered:
            rendered[page_index] = document[page_index].render(scale=scale).to_pil().convert("RGB")
        return rendered[page_index]

    for index, ((chapter, section, number), (start_page, start_top)) in enumerate(ordered):
        end_page, end_top = ordered[index + 1][1] if index + 1 < len(ordered) else (len(document), 0.0)
        folder = output / f"{chapter:02d} 第{chapter}章 {section:02d}-第{section}板块"
        folder.mkdir(parents=True, exist_ok=True)
        parts = []
        for page_index in range(start_page, min(end_page, len(document) - 1) + 1):
            image = page_image(page_index)
            top_points = start_top - 3 if page_index == start_page else 48
            bottom_points = end_top - 3 if page_index == end_page else image.height / scale - 8
            top = max(0, round(top_points * scale))
            bottom = min(image.height, round(bottom_points * scale))
            if bottom > top + 10:
                parts.append(image.crop((0, top, image.width, bottom)))
        for part_index, image in enumerate(parts, 1):
            suffix = f".{part_index}"
            image.save(folder / f"A-{chapter:02d}-{section}-{number:02d}{suffix}.png", "PNG")


def main() -> None:
    for config in CONFIGS:
        document = pdfium.PdfDocument(PDF_ROOT / config.pdf_name)
        try:
            boundaries = detect(config, document)
            render(config, document, boundaries)
        finally:
            document.close()
        expected = expected_questions(config)
        print(f"{config.source_name}: 恢复 {len(boundaries)}/{len(expected)} 个答案候选", flush=True)


if __name__ == "__main__":
    main()
