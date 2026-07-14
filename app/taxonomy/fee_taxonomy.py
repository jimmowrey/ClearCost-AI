from __future__ import annotations
import re


RULES = [
    ("interchange", [r"interchange", r"ic qualification"]),
    ("assessment", [r"assessment", r"dues and assessments"]),
    ("network", [r"network", r"visa access", r"mastercard location", r"mc monthly location", r"pulse", r"nyce", r"star"]),
    ("transaction", [r"transaction fee", r"authorization", r"auth fee", r"per item", r"debit txn"]),
    ("monthly", [r"monthly", r"statement fee", r"pci compliance", r"account fee"]),
    ("annual", [r"annual", r"yearly"]),
    ("equipment", [r"equipment", r"terminal", r"rental", r"lease"]),
    ("chargeback", [r"chargeback", r"retrieval"]),
    ("ebt", [r"\bebt\b", r"food stamp"]),
    ("processor_markup", [r"discount rate", r"service charge", r"processor markup"]),
    ("adjustment", [r"adjustment", r"correction", r"reversal"]),
]


def classify_fee(raw_name: str) -> dict:
    name = (raw_name or "").strip()
    for category, patterns in RULES:
        if any(re.search(pattern, name, re.I) for pattern in patterns):
            return {
                "category": category,
                "classification_status": "confirmed",
                "standard_name": name,
            }
    return {
        "category": "unknown",
        "classification_status": "unknown",
        "standard_name": None,
    }
