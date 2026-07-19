from __future__ import annotations
from dataclasses import dataclass, field
from decimal import Decimal, ROUND_HALF_UP
from enum import Enum

MONEY = Decimal("0.01")
RATE = Decimal("0.0001")

class ProfitIntelligenceError(ValueError):
    pass

class ProgramType(str, Enum):
    TRADITIONAL = "traditional"
    CASH_DISCOUNT = "cash_discount"
    SURCHARGE = "surcharge"

class ProfitabilityStatus(str, Enum):
    VERIFIED_PROFITABLE = "verified_profitable"
    VERIFIED_BELOW_TARGET = "verified_below_target"
    VERIFIED_LOSS = "verified_loss"
    NOT_VERIFIED = "not_verified"

def D(v):
    return Decimal(str(v))

def money(v):
    return D(v).quantize(MONEY, rounding=ROUND_HALF_UP)

def rate(v):
    return D(v).quantize(RATE, rounding=ROUND_HALF_UP)

@dataclass(frozen=True)
class VerifiedValue:
    value: Decimal | None
    verified: bool
    source: str | None = None

    @classmethod
    def verified_value(cls, value, source):
        return cls(D(value), True, source)

    @classmethod
    def unknown(cls, source=None):
        return cls(None, False, source)

@dataclass(frozen=True)
class MoneyComponent:
    name: str
    amount: VerifiedValue
    category: str
    note: str | None = None

@dataclass(frozen=True)
class ProfitScenarioInput:
    scenario_id: str
    program: ProgramType
    monthly_volume: Decimal
    monthly_transactions: int
    current_monthly_processing_expense: Decimal

    merchant_percentage_rate: Decimal = Decimal("0")
    merchant_transaction_fee: Decimal = Decimal("0")
    merchant_monthly_fee: Decimal = Decimal("0")
    merchant_equipment_fee: Decimal = Decimal("0")

    cash_discount_percent: Decimal | None = None
    customer_surcharge_percent: Decimal | None = None
    merchant_credit_card_rate: Decimal | None = None

    revenue_components: tuple[MoneyComponent, ...] = field(default_factory=tuple)
    cost_components: tuple[MoneyComponent, ...] = field(default_factory=tuple)
    merchant_expense_components: tuple[MoneyComponent, ...] = field(default_factory=tuple)

    agent_split_percent: VerifiedValue = field(
        default_factory=lambda: VerifiedValue.unknown("agent split not loaded")
    )
    minimum_monthly_residual: Decimal = Decimal("0")

@dataclass(frozen=True)
class ProfitScenarioResult:
    scenario_id: str
    program: ProgramType
    projected_merchant_expense: Decimal | None
    projected_monthly_savings: Decimal | None
    projected_annual_savings: Decimal | None
    gross_profit_pool: Decimal | None
    projected_monthly_residual: Decimal | None
    profitability_status: ProfitabilityStatus
    ready_to_present: bool
    missing_verified_inputs: tuple[str, ...]
    warnings: tuple[str, ...]
    audit: tuple[str, ...]

class ProfitIntelligenceEngine:
    def calculate(self, s: ProfitScenarioInput) -> ProfitScenarioResult:
        self._validate(s)
        audit, warnings, missing = [], [], []

        merchant_expense = self._merchant_expense(s, audit, missing)
        if merchant_expense is None:
            monthly_savings = annual_savings = None
        else:
            monthly_savings = money(s.current_monthly_processing_expense - merchant_expense)
            annual_savings = money(monthly_savings * 12)
            audit.append("Merchant savings = current monthly expense - projected merchant expense.")

        revenue = self._sum_verified(s.revenue_components, "revenue", missing, audit)
        costs = self._sum_verified(s.cost_components, "cost", missing, audit)

        if not s.agent_split_percent.verified or s.agent_split_percent.value is None:
            split = None
            missing.append("agent_split_percent")
        else:
            split = rate(s.agent_split_percent.value)
            if split < 0 or split > 100:
                raise ProfitIntelligenceError("agent_split_percent must be between 0 and 100.")
            audit.append(f"Agent split verified: {split}% from {s.agent_split_percent.source}.")

        if revenue is None or costs is None or split is None:
            gross_profit = residual = None
            status = ProfitabilityStatus.NOT_VERIFIED
            ready = False
            warnings.append("Profitability is not verified. Required internal economics are missing.")
        else:
            gross_profit = money(revenue - costs)
            residual = money(gross_profit * split / Decimal("100"))
            audit.append(f"Gross profit pool = {revenue} - {costs} = {gross_profit}.")
            audit.append(f"Monthly residual = {gross_profit} x {split}% = {residual}.")
            if gross_profit < 0:
                status = ProfitabilityStatus.VERIFIED_LOSS
                ready = False
                warnings.append("Profit Protection blocked a verified loss.")
            elif residual < money(s.minimum_monthly_residual):
                status = ProfitabilityStatus.VERIFIED_BELOW_TARGET
                ready = False
                warnings.append("Profit Protection blocked a residual below the configured minimum.")
            else:
                status = ProfitabilityStatus.VERIFIED_PROFITABLE
                ready = True

        return ProfitScenarioResult(
            scenario_id=s.scenario_id,
            program=s.program,
            projected_merchant_expense=merchant_expense,
            projected_monthly_savings=monthly_savings,
            projected_annual_savings=annual_savings,
            gross_profit_pool=gross_profit,
            projected_monthly_residual=residual,
            profitability_status=status,
            ready_to_present=ready,
            missing_verified_inputs=tuple(dict.fromkeys(missing)),
            warnings=tuple(warnings),
            audit=tuple(audit),
        )

    def _merchant_expense(self, s, audit, missing):
        v = money(s.monthly_volume)
        tx = s.monthly_transactions

        if s.program == ProgramType.TRADITIONAL:
            base = money(
                v * rate(s.merchant_percentage_rate) / Decimal("100")
                + Decimal(tx) * money(s.merchant_transaction_fee)
                + money(s.merchant_monthly_fee)
                + money(s.merchant_equipment_fee)
            )
            audit.append("Traditional merchant expense uses percentage, transaction, monthly, and equipment fees.")

        elif s.program == ProgramType.CASH_DISCOUNT:
            if s.cash_discount_percent is None:
                missing.append("cash_discount_percent")
                return None
            base = money(
                Decimal(tx) * money(s.merchant_transaction_fee)
                + money(s.merchant_monthly_fee)
                + money(s.merchant_equipment_fee)
            )
            audit.append(
                f"Cash Discount selected at {rate(s.cash_discount_percent)}%. "
                "Remaining merchant cost comes from explicit fees and verified merchant expense components."
            )

        elif s.program == ProgramType.SURCHARGE:
            if s.customer_surcharge_percent is None:
                missing.append("customer_surcharge_percent")
                return None
            if s.merchant_credit_card_rate is None:
                missing.append("merchant_credit_card_rate")
                return None
            base = money(
                v * rate(s.merchant_credit_card_rate) / Decimal("100")
                + Decimal(tx) * money(s.merchant_transaction_fee)
                + money(s.merchant_monthly_fee)
                + money(s.merchant_equipment_fee)
            )
            audit.append(
                f"Surcharge: customer {rate(s.customer_surcharge_percent)}%; "
                f"merchant credit-card rate {rate(s.merchant_credit_card_rate)}%."
            )
        else:
            raise ProfitIntelligenceError("Unsupported program.")

        extra = self._sum_verified(
            s.merchant_expense_components, "merchant_expense", missing, audit
        )
        if extra is None:
            return None

        result = money(base + extra)
        audit.append(f"Projected merchant expense = {base} + {extra} = {result}.")
        return result

    def _sum_verified(self, components, kind, missing, audit):
        total = Decimal("0")
        valid = True
        for c in components:
            if not c.amount.verified or c.amount.value is None:
                missing.append(f"{kind}:{c.name}")
                valid = False
            else:
                amt = money(c.amount.value)
                total += amt
                audit.append(f"Verified {kind} '{c.name}' = {amt} from {c.amount.source}.")
        return money(total) if valid else None

    def _validate(self, s):
        if money(s.monthly_volume) < 0:
            raise ProfitIntelligenceError("monthly_volume cannot be negative.")
        if s.monthly_transactions < 0:
            raise ProfitIntelligenceError("monthly_transactions cannot be negative.")
        if money(s.current_monthly_processing_expense) < 0:
            raise ProfitIntelligenceError("current_monthly_processing_expense cannot be negative.")
