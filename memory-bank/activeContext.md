# Active Context

## Current Focus

Booking workflow is now the active implementation area after Supplier and Tour Program foundations.

## Immediate Next Tasks

1. Add edit/delete/status update flows to Booking screen.
2. Implement Operation Form auto-creation from Booking.
3. Implement Operation Services linked to itinerary days and suppliers.
4. Implement Operation Tasks for booking execution checklist.
5. Implement Operation Costs and Supplier Payment Requests.
6. Add authentication and RBAC enforcement.

## Notes

The repository lives on the VPS under `/opt/smarttour` and tracks `git@github.com:hai2k2000/smarttour.git`.
Supplier and Tour Program CRUD have been smoke-tested against Postgres. Booking CRUD should be smoke-tested before the next push.
