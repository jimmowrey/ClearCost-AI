from __future__ import annotations
from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP
import re
from app.ocr.types import OCRDocument
from app.core.calculations import calculate_statement_metrics


class ExtractionError(RuntimeError):
    pass


def _money(value: str) -> Decimal:
    return Decimal(value.replace("$","").replace(",","").strip()).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )


def _find_money(text: str, labels: list[str]) -> Decimal:
    for label in labels:
        m = re.search(rf"{label}\s*[:\-]?\s*\$?([\d,]+\.\d{{2}})", text, re.I)
        if m:
            return _money(m.group(1))
    raise ExtractionError(f"Required amount not found: {labels}")


def _find_int(text: str, labels: list[str]) -> int:
    for label in labels:
        m = re.search(rf"{label}\s*[:\-]?\s*([\d,]+)", text, re.I)
        if m:
            return int(m.group(1).replace(",",""))
    raise ExtractionError(f"Required count not found: {labels}")


def _find_text(text: str, labels: list[str]) -> str:
    for label in labels:
        m = re.search(rf"{label}\s*[:\-]\s*(.+)", text, re.I)
        if m:
            return m.group(1).strip()
    raise ExtractionError(f"Required text not found: {labels}")


@dataclass(frozen=True)
class BOAResult:
    merchant_name: str
    statement_period: str
    processing_volume: Decimal
    processing_expense: Decimal
    transaction_count: int
    credit_volume: Decimal
    debit_volume: Decimal
    ebt_volume: Decimal
    average_ticket: Decimal
    effective_rate_percent: Decimal
    reconciliation_difference: Decimal
    page_6_status: str


def extract_bank_of_america(document: OCRDocument) -> BOAResult:
    text = "\n".join(p.full_text for p in document.pages)
    lower = text.lower()
    signals = [
        "bank of america" in lower,
        "merchant services" in lower,
        "fees charged" in lower or "grand total fees" in lower,
    ]
    if sum(signals) < 2:
        raise ExtractionError("Document does not match Bank of America statement structure.")

    merchant_name = _find_text(text, ["Merchant Name","Business Name"])
    statement_period = _find_text(text, ["Statement Period","Period"])
    processing_volume = _find_money(text, ["Card Volume","Processing Volume","Monthly Card Sales"])
    processing_expense = _find_money(text, ["Grand Total Fees","Total Fees","Processing Expense"])
    transaction_count = _find_int(text, ["Total Transactions","Card Transactions"])
    debit = _find_money(text, [r"Debit \(PIN & Signature\)","Debit"])
    ebt = _find_money(text, [r"\bEBT\b"])
    visa = _find_money(text, [r"\bVisa\b"])
    mc = _find_money(text, [r"\bMastercard\b"])
    discover = _find_money(text, [r"\bDiscover\b"])
    amex = _find_money(text, ["American Express","Amex"])
    credit = visa + mc + discover + amex

    metrics = calculate_statement_metrics(
        processing_volume=processing_volume,
        processing_expense=processing_expense,
        transaction_count=transaction_count,
        credit_volume=credit,
        debit_volume=debit,
        ebt_volume=ebt,
    )

    return BOAResult(
        merchant_name=merchant_name,
        statement_period=statement_period,
        processing_volume=processing_volume,
        processing_expense=processing_expense,
        transaction_count=transaction_count,
        credit_volume=credit,
        debit_volume=debit,
        ebt_volume=ebt,
        average_ticket=metrics.average_ticket,
        effective_rate_percent=metrics.effective_rate_percent,
        reconciliation_difference=metrics.reconciliation_difference,
        page_6_status="informational_disclosure_only",
    )
