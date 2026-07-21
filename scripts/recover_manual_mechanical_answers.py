#!/usr/bin/env python3
"""Add the few answer boundaries whose OCR heading is absent from the source layer."""

from pathlib import Path
import pypdfium2 as pdfium

ROOT = Path(__file__).resolve().parents[1]
PDF = ROOT / "拆分" / "原始文件" / "27机械考研-机械设计-强化班-补充讲义-答案-飞轮哥_可搜索.pdf"
OUT = ROOT / "拆分" / "原始答案重匹配" / "机械设计-强化班补充讲义"
DPI = 200

# (chapter, section, question, start page, start top pt, end page, end top pt)
TARGETS = (
    (3, 1, 3, 33, 417, 34, 391),
    (8, 3, 9, 81, 427, 82, 418),
    (8, 3, 10, 82, 418, 83, 94),
    (12, 7, 1, 127, 463, 128, 55),
    # OCR misses the heavily watermarked 第二题 heading in the original
    # answer PDF; the page contains a clean, bounded answer between the
    # second- and third-question headings.
    (2, 3, 2, 33, 234, 33, 420),
)


def main() -> None:
    document = pdfium.PdfDocument(PDF)
    scale = DPI / 72
    for chapter, section, question, start_page, start_top, end_page, end_top in TARGETS:
        parts = []
        for page_index in range(start_page, end_page + 1):
            image = document[page_index].render(scale=scale).to_pil().convert("RGB")
            top = round((start_top - 3) * scale) if page_index == start_page else round(48 * scale)
            bottom = round((end_top - 3) * scale) if page_index == end_page else image.height - round(8 * scale)
            if bottom > top + 10:
                parts.append(image.crop((0, max(0, top), image.width, min(image.height, bottom))))
        folder = OUT / f"{chapter:02d} 第{chapter}章 {section:02d}-第{section}板块"
        folder.mkdir(parents=True, exist_ok=True)
        for index, image in enumerate(parts, 1):
            suffix = f".{index}"
            image.save(folder / f"A-{chapter:02d}-{section}-{question:02d}{suffix}.png", "PNG")
    document.close()
    print(f"补回 {len(TARGETS)} 个原始答案边界")


if __name__ == "__main__":
    main()
