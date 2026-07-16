#!/usr/bin/env python3
"""Re-split the mechanical-design pass book directly from its source PDFs.

Question numbers run continuously within each chapter and sections are topical,
not question types. OCR heading recovery prevents page fragments from being
promoted to new questions.
"""

from __future__ import annotations

import io
import re
import shutil
import subprocess
from pathlib import Path

import pdfplumber
import pypdfium2 as pdfium
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
PDF_ROOT = ROOT / "拆分" / "原始文件"
OUTPUT_ROOT = ROOT / "拆分" / "修复后" / "机械设计-考研通关680题"
QUESTION_PDF = PDF_ROOT / "27机械考研-机械设计-考研通关680题--题目册--飞轮哥_可搜索.pdf"
ANSWER_PDF = PDF_ROOT / "27机械考研-机械设计-考研通关680题--答案分册--飞轮哥_可搜索.pdf"
QUESTION_STARTS = (7, 11, 27, 32, 53, 59, 72, 79, 100, 112, 126, 135, 139)
ANSWER_STARTS = (4, 8, 19, 22, 37, 40, 49, 54, 67, 76, 83, 91, 93)
QUESTION_MAX = (42, 50, 46, 79, 43, 77, 46, 121, 64, 39, 64, 43, 63)
SOURCE_NUMBER_GAPS = {8: {76}}
ANSWER_NUMBER_GAPS = {8: {76}}
OCR_DPI = 150
RETRY_DPI = 220
OUTPUT_DPI = 200
HEADING = re.compile(r"^(\d{1,3})[.．、,，]")
SECTION = re.compile(r"^([一二三四五六七八九十])[、,，]")
CN_SECTIONS = {"一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9, "十": 10}


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


def headings_on_page(
    document: pdfium.PdfDocument,
    page_index: int,
    dpi: int,
    maximum: int,
) -> list[tuple[int, float]]:
    image = document[page_index].render(scale=dpi / 72).to_pil()
    headings = []
    for left, top, text in ocr_lines(image):
        # The scan sometimes turns the leading ``1`` in 111 into ``|``/``l``.
        # Normalize only the OCR heading prefix so a real answer boundary is
        # not swallowed into the preceding question.
        normalized = text.lstrip("|丨").replace("l", "1").replace("I", "1")
        match = HEADING.match(normalized)
        if match and left < 190:
            number = int(match.group(1))
            if 1 <= number <= maximum:
                headings.append((number, top * 72 / dpi))
    return headings


def detect_boundaries(
    document: pdfium.PdfDocument,
    starts: tuple[int, ...],
    source_path: Path,
    number_gaps: dict[int, set[int]],
) -> dict[tuple[int, int], tuple[int, float]]:
    boundaries: dict[tuple[int, int], tuple[int, float]] = {}
    with pdfplumber.open(source_path) as searchable:
        for chapter, start in enumerate(starts, 1):
            end = starts[chapter] if chapter < len(starts) else len(document)
            expected = set(range(1, QUESTION_MAX[chapter - 1] + 1)) - number_gaps.get(chapter, set())
            current = 0
            for page_index in range(start, end):
                for number, top in headings_on_page(document, page_index, OCR_DPI, QUESTION_MAX[chapter - 1]):
                    if number in expected and number > current:
                        boundaries[(chapter, number)] = (page_index, top)
                        current = number
            missing = [number for number in sorted(expected) if (chapter, number) not in boundaries]
            for number in missing:
                previous = boundaries.get((chapter, number - 1), (start, 0.0))[0]
                following = boundaries.get((chapter, number + 1), (end - 1, 0.0))[0]
                for page_index in range(previous, following + 1):
                    matches = dict(headings_on_page(document, page_index, RETRY_DPI, QUESTION_MAX[chapter - 1]))
                    if number in matches:
                        boundaries[(chapter, number)] = (page_index, matches[number])
                        break
                if (chapter, number) in boundaries:
                    continue
                for page_index in range(previous, following + 1):
                    for line in searchable.pages[page_index].extract_text_lines(
                        layout=False, strip=True, return_chars=False
                    ):
                        match = HEADING.match(line["text"].replace(" ", ""))
                        if match and int(match.group(1)) == number and line["x0"] < 100:
                            boundaries[(chapter, number)] = (page_index, float(line["top"]))
                            break
                    if (chapter, number) in boundaries:
                        break
            still_missing = [number for number in sorted(expected) if (chapter, number) not in boundaries]
            if still_missing:
                raise RuntimeError(f"Chapter {chapter} misses headings: {still_missing}")
            print(f"第{chapter}章：识别 {len(expected)} 个标题", flush=True)
    return boundaries


def extract_section_boundaries() -> dict[int, list[tuple[tuple[int, float], int]]]:
    result: dict[int, list[tuple[tuple[int, float], int]]] = {}
    with pdfplumber.open(QUESTION_PDF) as document:
        for chapter, start in enumerate(QUESTION_STARTS, 1):
            end = QUESTION_STARTS[chapter] if chapter < len(QUESTION_STARTS) else len(document.pages)
            entries = []
            for page_index in range(start, end):
                for line in document.pages[page_index].extract_text_lines(
                    layout=False, strip=True, return_chars=False
                ):
                    match = SECTION.match(line["text"].replace(" ", ""))
                    if match and line["x0"] < 100:
                        entries.append(((page_index, float(line["top"])), CN_SECTIONS[match.group(1)]))
            result[chapter] = sorted(entries)
    return result


def assign_sections(
    questions: dict[tuple[int, int], tuple[int, float]],
) -> dict[tuple[int, int], int]:
    section_boundaries = extract_section_boundaries()
    assigned = {}
    for key, point in questions.items():
        chapter, _number = key
        preceding = [section for boundary, section in section_boundaries[chapter] if boundary <= point]
        if not preceding:
            raise RuntimeError(f"No section found before question {key}")
        assigned[key] = preceding[-1]
    return assigned


def render_groups(
    document: pdfium.PdfDocument,
    boundaries: dict[tuple[int, int], tuple[int, float]],
    sections: dict[tuple[int, int], int],
    prefix: str,
    header_pages: set[int],
) -> int:
    ordered = sorted(boundaries.items(), key=lambda item: item[1])
    scale = OUTPUT_DPI / 72
    rendered: dict[int, Image.Image] = {}
    count = 0

    def page_image(page_index: int) -> Image.Image:
        if page_index not in rendered:
            rendered[page_index] = document[page_index].render(scale=scale).to_pil().convert("RGB")
        return rendered[page_index]

    for index, (key, (start_page, start_top)) in enumerate(ordered):
        chapter, number = key
        end_page, end_top = ordered[index + 1][1] if index + 1 < len(ordered) else (len(document), 0.0)
        section = sections[key]
        folder = OUTPUT_ROOT / f"{chapter:02d} 第{chapter}章 {section}-第{section}板块"
        folder.mkdir(parents=True, exist_ok=True)
        parts = []
        for page_index in range(start_page, min(end_page, len(document) - 1) + 1):
            if page_index in header_pages and page_index != start_page:
                continue
            image = page_image(page_index)
            top_points = start_top - 3 if page_index == start_page else 48
            bottom_points = end_top - 3 if page_index == end_page else image.height / scale - 8
            top = max(0, round(top_points * scale))
            bottom = min(image.height, round(bottom_points * scale))
            if bottom > top + 10:
                parts.append(image.crop((0, top, image.width, bottom)))
        for part_index, image in enumerate(parts, 1):
            suffix = f".{part_index}" if len(parts) > 1 else ""
            image.save(folder / f"{prefix}-{chapter:02d}-{section}-{number:02d}{suffix}.png", "PNG")
        count += 1
    return count


def chapter_header_pages(pdf_path: Path) -> set[int]:
    pages = set()
    with pdfplumber.open(pdf_path) as document:
        for page_index, page in enumerate(document.pages):
            for line in page.extract_text_lines(layout=False, strip=True, return_chars=False):
                if line["top"] < 150 and re.search(r"第(?:[一二三四五六七八九十百]+|\d+)章", line["text"]):
                    pages.add(page_index)
                    break
    return pages


def main() -> None:
    if OUTPUT_ROOT.exists():
        shutil.rmtree(OUTPUT_ROOT)
    OUTPUT_ROOT.mkdir(parents=True)
    question_document = pdfium.PdfDocument(QUESTION_PDF)
    answer_document = pdfium.PdfDocument(ANSWER_PDF)
    try:
        print("识别题目册", flush=True)
        questions = detect_boundaries(question_document, QUESTION_STARTS, QUESTION_PDF, SOURCE_NUMBER_GAPS)
        sections = assign_sections(questions)
        print("识别答案册", flush=True)
        answers = detect_boundaries(answer_document, ANSWER_STARTS, ANSWER_PDF, ANSWER_NUMBER_GAPS)
        question_count = render_groups(question_document, questions, sections, "Q", chapter_header_pages(QUESTION_PDF))
        answer_count = render_groups(answer_document, answers, sections, "A", chapter_header_pages(ANSWER_PDF))
    finally:
        question_document.close()
        answer_document.close()
    print(f"已按原始 PDF 重建：Q={question_count}，A={answer_count}")


if __name__ == "__main__":
    main()
