# Production Checklist

This project is a multi-tenant platform. Use this checklist before going live.

## 1) Firebase configuration
- Deploy Firestore rules: `firestore.rules`
- Deploy Storage rules: `storage.rules`
- Deploy Firestore indexes: `firestore.indexes.json`
- Confirm Hosting targets in `firebase.json` match your deploy pipeline

## 2) Environment variables
- `VITE_GEMINI_API_KEY` set in hosting environment
- If using staff-only build, set `VITE_STAFF_ONLY=true`
- Optional: `VITE_STAFF_BASE_URL` for QR staff links (e.g. `https://staff.yourdomain.com`)

## 3) Admin & tenant setup
- Sign in to the Admin panel for each new shop
- Complete initial setup (branding, hero images, contact, hours, theme)
- Ensure the first admin account is stored in `adminUids`
- Choose a plan (Basic/Pro/Premium) and verify enabled features

## 4) Domain mapping
- Each shop is keyed by hostname (default)
- If using custom domains, point the domain to the hosting target
- Verify the shop config includes the domain in `domains`

## 5) Data migration (optional)
- Use the "Import legacy data" button in Settings
- Verify services, barbers, and appointments are migrated into `shops/{shopId}`

## 6) Security notes
- Shop writes are restricted to `adminUids`
- Public reads are allowed for public content; validate this meets your privacy policy
- Voice logs are only visible to admins

## 7) Smoke tests
- Public site loads and shows correct branding
- Booking flow creates appointments
- Admin portal can manage services and barbers
- Staff portal access works via QR login
- Voice/chat features behave as enabled/disabled per shop settings
