from __future__ import annotations
from dataclasses import dataclass
from decimal import Decimal


@dataclass(frozen=True)
class ProfitProtectionResult:
    passed: bool
    blocked: bool
    reasons: tuple[str, ...]


def evaluate_profit_protection(
    *,
    projected_monthly_residual: Decimal,
    minimum_monthly_residual: Decimal,
    projected_gross_profit: Decimal,
) -> ProfitProtectionResult:
    reasons = []
    if projected_gross_profit < 0:
        reasons.append("Projected gross profit is negative.")
    if projected_monthly_residual < minimum_monthly_residual:
        reasons.append(
            f"Projected monthly residual {projected_monthly_residual} is below "
            f"the configured minimum {minimum_monthly_residual}."
        )
    return ProfitProtectionResult(
        passed=not reasons,
        blocked=bool(reasons),
        reasons=tuple(reasons),
    )
