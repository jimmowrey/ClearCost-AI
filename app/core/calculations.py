from __future__ import annotations
from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP


class ClearCostValidationError(ValueError):
    pass


def money(value: Decimal | int | float | str) -> Decimal:
    return Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def rate(value: Decimal | int | float | str) -> Decimal:
    return Decimal(str(value)).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)


@dataclass(frozen=True)
class StatementMetrics:
    processing_volume: Decimal
    processing_expense: Decimal
    transaction_count: int
    average_ticket: Decimal
    effective_rate_percent: Decimal
    credit_percent: Decimal
    debit_percent: Decimal
    ebt_percent: Decimal
    reconciliation_difference: Decimal


def calculate_statement_metrics(
    *,
    processing_volume: Decimal,
    processing_expense: Decimal,
    transaction_count: int,
    credit_volume: Decimal,
    debit_volume: Decimal,
    ebt_volume: Decimal,
) -> StatementMetrics:
    if processing_volume < 0 or processing_expense < 0:
        raise ClearCostValidationError("Volume and expense must be non-negative.")
    if transaction_count < 0:
        raise ClearCostValidationError("Transaction count must be non-negative.")

    mix_total = credit_volume + debit_volume + ebt_volume
    average_ticket = (
        money(processing_volume / Decimal(transaction_count))
        if transaction_count else Decimal("0.00")
    )
    effective_rate = (
        rate((processing_expense / processing_volume) * Decimal("100"))
        if processing_volume else Decimal("0.0000")
    )
    pct = lambda amount: (
        rate((amount / processing_volume) * Decimal("100"))
        if processing_volume else Decimal("0.0000")
    )

    return StatementMetrics(
        processing_volume=money(processing_volume),
        processing_expense=money(processing_expense),
        transaction_count=transaction_count,
        average_ticket=average_ticket,
        effective_rate_percent=effective_rate,
        credit_percent=pct(credit_volume),
        debit_percent=pct(debit_volume),
        ebt_percent=pct(ebt_volume),
        reconciliation_difference=money(processing_volume - mix_total),
    )


def transaction_fee_impact(transaction_count: int, fee_delta: Decimal) -> Decimal:
    if transaction_count < 0:
        raise ClearCostValidationError("Transaction count must be non-negative.")
    return money(Decimal(transaction_count) * fee_delta)
