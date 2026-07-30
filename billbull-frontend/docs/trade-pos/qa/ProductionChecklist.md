# Trade POS Production Deployment Checklist

This document is the official release checklist for the IT Operations team.

## Pre-Deployment Verification
- [ ] Confirm Frontend Branch: `feature/trade-pos` (or `main` post-merge).
- [ ] Confirm Backend Branch is synced (no specific Trade POS backend changes required, but verify versions).
- [ ] Verify `npm run build` succeeds locally without warnings.

## Deployment Steps
1. [ ] **Database Migrations**: No schema changes were introduced in the Trade POS presentation layer. (Skip unless other features are bundled).
2. [ ] **Environment Variables**: Verify `VITE_API_URL` and print agent endpoints are correct.
3. [ ] **Frontend Deployment**: Deploy the bundled React application to the production CDN / Server.
4. [ ] **Feature Flags**: If the legacy POS is toggled via a flag, ensure the flag is enabled for the correct branch/stores.
5. [ ] **Print Agent Version**: Ensure all terminals are running Print Agent vX.X.X (latest).

## Post-Deployment Smoke Tests (Live Environment)
- [ ] Access the POS via production URL.
- [ ] Ensure products load within 2 seconds.
- [ ] Scan a barcode and verify it appears in the cart.
- [ ] Discard the invoice.

## Rollback Procedure
If catastrophic failure occurs (e.g., UI crashes on load):
1. Revert the frontend deployment to the previous commit hash (Legacy POS).
2. Since no database changes were made for Trade POS, no database rollback is necessary.
3. Clear CDN caches.
