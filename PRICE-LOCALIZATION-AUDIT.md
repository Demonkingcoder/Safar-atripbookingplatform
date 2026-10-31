# Pricing and language behavior

## Fare source of truth

- `Departure.price` is the full per-traveller fare for that scheduled departure.
- The trip listing API now returns `startingPrice` from the lowest future `scheduled` departure with seats available. It also returns `startingDepartureDate` and `startingPriceSource: "departure"`.
- If no bookable future departure exists, the API returns the trip's existing `basePrice` with `startingPriceSource: "basePrice"`. The UI labels this as a listed base price and asks the customer to confirm the full fare against a scheduled departure; it does not call this an advance.
- Booking creation still snapshots the selected departure's price into `pricePerSeat` and calculates `totalAmount` on the server. Razorpay continues to receive the stored booking total in paise. Historical booking amounts are never rewritten.
- No advance-payment fields exist in the current model. No advance or balance is displayed.

## Optional Hindi trip content

English trip fields remain canonical. The existing Trip model accepts optional authored `translations.hi` values for `title`, `description`, `destination`, `itinerary`, `inclusions`, and `exclusions`. Missing Hindi values fall back to the stored English values. Do not machine-translate or invent admin-authored trip copy. Add Hindi fields only through the existing authorized trip-management workflow.

## Read-only booking diagnostic

The diagnostic requires the existing `MONGO_URI` to be injected securely by the operator and does not load `.env` files. Use a staging URI first. It reads one booking by reference, prints only trip/departure/booking identifiers and fare/status consistency, and never selects customer data or writes to MongoDB:

```powershell
npm run diagnose:booking-price -- SAF-BOOKING-REFERENCE
```

For a production investigation, inject the production URI through the approved secret manager or an authorized secure shell environment. Review output before sharing it. This implementation was not run against production data, and it does not correct inconsistent historical records.

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
