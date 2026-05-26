# Real User Rollout

## User Fields

Prepare this table before go-live:

| Email | Full name | Role | Branch | Department | Notes |
| --- | --- | --- | --- | --- | --- |
| user@example.com | Nguyen Van A | sales | HN | Sales | Example |

## Role Rules

- `super_admin`: only system owners.
- `sales`: sales staff; customer/quote/order workflows.
- `operation`: operation staff; operation forms, vouchers, suppliers/guides.
- `accounting`: finance staff; receipts, payments, invoices, reports, commission.

## Rollout Steps

1. Admin creates all users in `/security`.
2. Each user logs in and changes password.
3. Each user opens their daily routes.
4. Admin confirms role, branch, department, and status.
5. Team performs one end-to-end workflow with real data.

## Acceptance

- No shared user accounts except emergency admin.
- No active temporary smoke users.
- Branch/department are set for every scoped user.
- Inactive staff accounts are disabled.
