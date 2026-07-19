# Statement Period Validation Fix

Business rule implemented:

- One PDF = one monthly merchant statement.
- Multiple uploaded PDFs may represent different months.
- Merchant/MID must match across uploaded PDFs where detected.
- Each PDF must have a detectable statement period.
- A PDF containing more than one distinct statement period is blocked.
- Duplicate monthly statements across uploaded PDFs are blocked.
- Repeated occurrences of the same period inside one PDF are allowed.

This update changes only `js/pdf-validation.js` and adds one regression test.
