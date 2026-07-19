from decimal import Decimal
from app.profit_intelligence import (
    ProfitIntelligenceEngine, ProfitScenarioInput, ProfitabilityStatus,
    ProgramType, VerifiedValue, MoneyComponent
)

def V(value, source="test"):
    return VerifiedValue.verified_value(value, source)

def test_unverified_cost_blocks_ready_to_present():
    result = ProfitIntelligenceEngine().calculate(
        ProfitScenarioInput(
            scenario_id="unverified",
            program=ProgramType.SURCHARGE,
            monthly_volume=Decimal("100000"),
            monthly_transactions=4000,
            current_monthly_processing_expense=Decimal("2200"),
            customer_surcharge_percent=Decimal("3.00"),
            merchant_credit_card_rate=Decimal("0.00"),
            merchant_transaction_fee=Decimal("0.10"),
            merchant_monthly_fee=Decimal("25"),
            revenue_components=(MoneyComponent("Revenue", V("900"), "revenue"),),
            cost_components=(MoneyComponent("Buy cost", VerifiedValue.unknown(), "cost"),),
            agent_split_percent=V("80", "split"),
            minimum_monthly_residual=Decimal("500"),
        )
    )
    assert result.profitability_status == ProfitabilityStatus.NOT_VERIFIED
    assert result.ready_to_present is False

def test_negative_profit_is_blocked():
    result = ProfitIntelligenceEngine().calculate(
        ProfitScenarioInput(
            scenario_id="loss",
            program=ProgramType.TRADITIONAL,
            monthly_volume=Decimal("50000"),
            monthly_transactions=1000,
            current_monthly_processing_expense=Decimal("1500"),
            revenue_components=(MoneyComponent("Revenue", V("300"), "revenue"),),
            cost_components=(MoneyComponent("Cost", V("350"), "cost"),),
            agent_split_percent=V("80", "split"),
        )
    )
    assert result.gross_profit_pool == Decimal("-50.00")
    assert result.profitability_status == ProfitabilityStatus.VERIFIED_LOSS
    assert result.ready_to_present is False

def test_below_minimum_residual_is_blocked():
    result = ProfitIntelligenceEngine().calculate(
        ProfitScenarioInput(
            scenario_id="below",
            program=ProgramType.TRADITIONAL,
            monthly_volume=Decimal("50000"),
            monthly_transactions=1000,
            current_monthly_processing_expense=Decimal("1500"),
            revenue_components=(MoneyComponent("Revenue", V("700"), "revenue"),),
            cost_components=(MoneyComponent("Cost", V("200"), "cost"),),
            agent_split_percent=V("80", "split"),
            minimum_monthly_residual=Decimal("450"),
        )
    )
    assert result.projected_monthly_residual == Decimal("400.00")
    assert result.profitability_status == ProfitabilityStatus.VERIFIED_BELOW_TARGET
    assert result.ready_to_present is False

def test_verified_profitable_surcharge_is_ready():
    result = ProfitIntelligenceEngine().calculate(
        ProfitScenarioInput(
            scenario_id="good",
            program=ProgramType.SURCHARGE,
            monthly_volume=Decimal("100000"),
            monthly_transactions=4000,
            current_monthly_processing_expense=Decimal("2200"),
            customer_surcharge_percent=Decimal("3.00"),
            merchant_credit_card_rate=Decimal("0.00"),
            merchant_transaction_fee=Decimal("0.10"),
            merchant_monthly_fee=Decimal("25"),
            merchant_expense_components=(
                MoneyComponent("Debit and EBT cost", V("500"), "merchant_cost"),
            ),
            revenue_components=(MoneyComponent("Revenue", V("1000"), "revenue"),),
            cost_components=(MoneyComponent("Processor cost", V("300"), "cost"),),
            agent_split_percent=V("80", "split"),
            minimum_monthly_residual=Decimal("500"),
        )
    )
    assert result.projected_merchant_expense == Decimal("925.00")
    assert result.projected_monthly_savings == Decimal("1275.00")
    assert result.projected_monthly_residual == Decimal("560.00")
    assert result.ready_to_present is True

def test_transaction_fee_is_adjustable():
    engine = ProfitIntelligenceEngine()
    common = dict(
        scenario_id="txn",
        program=ProgramType.TRADITIONAL,
        monthly_volume=Decimal("100000"),
        monthly_transactions=10000,
        current_monthly_processing_expense=Decimal("2500"),
        revenue_components=(MoneyComponent("Revenue", V("1000"), "revenue"),),
        cost_components=(MoneyComponent("Cost", V("200"), "cost"),),
        agent_split_percent=V("80", "split"),
    )
    low = engine.calculate(ProfitScenarioInput(**common, merchant_transaction_fee=Decimal("0.05")))
    high = engine.calculate(ProfitScenarioInput(**common, merchant_transaction_fee=Decimal("0.10")))
    assert high.projected_merchant_expense - low.projected_merchant_expense == Decimal("500.00")
