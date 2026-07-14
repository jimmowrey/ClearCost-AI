from decimal import Decimal
from app.core.calculations import calculate_statement_metrics, transaction_fee_impact
from app.core.profit_protection import evaluate_profit_protection


def test_lee_market_metrics():
    result = calculate_statement_metrics(
        processing_volume=Decimal("88903.96"),
        processing_expense=Decimal("1678.49"),
        transaction_count=3106,
        credit_volume=Decimal("23685.24"),
        debit_volume=Decimal("50385.77"),
        ebt_volume=Decimal("14832.95"),
    )
    assert result.average_ticket == Decimal("28.62")
    assert result.effective_rate_percent == Decimal("1.8880")
    assert result.reconciliation_difference == Decimal("0.00")


def test_transaction_fee_impact():
    assert transaction_fee_impact(3106, Decimal("0.01")) == Decimal("31.06")


def test_profit_protection():
    result = evaluate_profit_protection(
        projected_monthly_residual=Decimal("475"),
        minimum_monthly_residual=Decimal("500"),
        projected_gross_profit=Decimal("600"),
    )
    assert result.blocked is True
