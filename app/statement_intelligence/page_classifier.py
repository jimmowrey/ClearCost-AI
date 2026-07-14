from __future__ import annotations
from dataclasses import dataclass
import re


FINANCIAL_TERMS = (
    "total fees","fees charged","grand total fees","processing volume","card sales",
    "transactions","interchange","assessment","service charges","discount rate",
    "net funding","debit","visa","mastercard","discover","american express","ebt",
)
INFORMATIONAL_TERMS = (
    "important information","notice","disclosure","terms and conditions",
    "privacy","contact us","definitions",
)


@dataclass(frozen=True)
class PageClassification:
    page_type: str
    confidence: float
    used_in_calculations: bool
    notes: tuple[str, ...] = ()


def classify_page(
    *,
    text: str,
    white_pixel_ratio: float,
    image_count: int,
    override: str | None = None,
) -> PageClassification:
    if override:
        return PageClassification(
            page_type=override,
            confidence=1.0,
            used_in_calculations=override in {"financial_data","supporting_financial_detail"},
            notes=("Verified override applied.",),
        )

    normalized = re.sub(r"\s+", " ", (text or "").lower()).strip()
    financial_hits = sum(term in normalized for term in FINANCIAL_TERMS)
    informational_hits = sum(term in normalized for term in INFORMATIONAL_TERMS)
    has_amount = bool(re.search(r"\$?\d{1,3}(?:,\d{3})*(?:\.\d{2})", text or ""))

    if not normalized and white_pixel_ratio >= 0.992:
        return PageClassification("blank", 0.98, False, ("Page is visually blank.",))
    if financial_hits >= 2 and has_amount:
        return PageClassification("financial_data", min(0.99, 0.72 + financial_hits*0.04), True)
    if financial_hits >= 1 and has_amount:
        return PageClassification("supporting_financial_detail", 0.78, True)
    if informational_hits >= 1:
        return PageClassification("informational_disclosure", 0.88, False)
    if not normalized and image_count > 0:
        return PageClassification(
            "supporting_financial_detail", 0.35, True,
            ("Image-only page requires OCR or human verification.",)
        )
    if normalized and not has_amount:
        return PageClassification("informational_disclosure", 0.65, False)
    return PageClassification(
        "supporting_financial_detail", 0.45, True,
        ("Low-confidence classification requires review.",)
    )
