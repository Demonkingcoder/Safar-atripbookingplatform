# Pricing and language behavior

## Fare source of truth

- `Trip.basePrice` is the authoritative full payable price per traveller. `Departure.price` is retained for legacy/admin data only and is not used for customer pricing or payment.
- Trip listing, trip details, and the booking summary display `Trip.basePrice` per traveller.
- Booking creation validates the selected departure's associated published Trip, snapshots `Trip.basePrice` into `Booking.pricePerSeat`, and calculates `Booking.totalAmount` on the server. The booking's trip reference comes from `Departure.trip`.
- Razorpay receives the stored booking total converted to paise (INR). Payment verification, webhook validation, receipts, and notifications continue to use the immutable booking amount snapshot. Existing bookings are never repriced.
- A pending booking whose stored snapshot differs from the current `Trip.basePrice` is blocked from getting a new payment order and requires manual review/recreation or reconciliation. The diagnostic below identifies these records without modifying them.
- No advance-payment fields exist in the current model. No advance or balance is displayed.

## Optional Hindi trip content

English trip fields remain canonical. The existing Trip model accepts optional authored `translations.hi` values for `title`, `description`, `destination`, `itinerary`, `inclusions`, and `exclusions`. Missing Hindi values fall back to the stored English values. Do not machine-translate or invent admin-authored trip copy. Add Hindi fields only through the existing authorized trip-management workflow.

## Read-only booking diagnostic

The diagnostic requires the existing `MONGO_URI` to be injected securely by the operator and does not load `.env` files. Use a staging URI first. It reads one booking by reference, prints only trip/departure/booking identifiers and fare/status consistency, and never selects customer data or writes to MongoDB:

```powershell
npm run diagnose:booking-price -- SAF-BOOKING-REFERENCE
```

To find pending bookings whose stored snapshot no longer matches the current Trip price, run:

```powershell
node src/scripts/diagnose-booking-price.js --pending-mismatches
```

To verify a production Trip document by its ObjectId or slug without reading booking/customer records:

```powershell
node src/scripts/diagnose-booking-price.js --trip 6ae2c8864486dd0d345c80d4
```

For a production investigation, inject the production URI through the approved secret manager or an authorized secure shell environment. Review output before sharing it. The diagnostic is read-only and does not correct inconsistent historical records. Review each affected pending booking with payment/order status and either safely cancel/recreate it or reconcile an existing payment with the provider; never overwrite its amount snapshot.

## English and Hindi

The customer UI stores language choice under `safar-language` in local storage. Without a saved choice, English is used unless the browser's primary language is Hindi. Currency and dates use `Intl` with `en-IN` or `hi-IN`. Switch language from the desktop or mobile navigation; current component state remains mounted when switching.

## Validation commands

```powershell
npm test
$env:VITE_API_BASE_URL='https://safar-build.invalid/api/v1'
npm --prefix frontend run build
npm --prefix frontend run lint
git diff --check
```

The HTTPS `.invalid` API URL is only a build-time placeholder to satisfy Vite's production URL guard. Replace it with the actual API URL in deployment configuration; it is not an application default.
