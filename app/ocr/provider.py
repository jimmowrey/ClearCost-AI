from __future__ import annotations
from abc import ABC, abstractmethod
from pathlib import Path
from .types import OCRDocument


class OCRProvider(ABC):
    @abstractmethod
    def extract_pdf(self, pdf_path: str | Path) -> OCRDocument:
        raise NotImplementedError
