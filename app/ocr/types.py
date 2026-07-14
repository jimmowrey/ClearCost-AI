from __future__ import annotations
from dataclasses import dataclass, field


@dataclass(frozen=True)
class OCRWord:
    text: str
    confidence: float
    x: float
    y: float
    width: float
    height: float


@dataclass(frozen=True)
class OCRPage:
    page_number: int
    full_text: str
    confidence: float
    words: tuple[OCRWord, ...] = field(default_factory=tuple)
    source: str = "unknown"


@dataclass(frozen=True)
class OCRDocument:
    pages: tuple[OCRPage, ...]
    provider: str
    document_confidence: float
