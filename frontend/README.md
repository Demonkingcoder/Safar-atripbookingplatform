# Safar frontend

React + Vite frontend for the Safar trip booking platform.

## Requirements

- Node.js 20.19+ (or a Node release supported by the installed Vite version)
- npm
- The Safar Express API running on `http://localhost:5000`

## Run locally

```powershell
npm install
npm run dev
```

Open `http://localhost:5173`.

## Production build

```powershell
npm run build
npm run preview
```

## API configuration

By default, the app calls `/api/v1` on the current origin. `vite.config.js` proxies `/api` to `http://localhost:5000` during local development. If the API is hosted elsewhere, create a local `.env` file from `.env.example` and set `VITE_API_BASE_URL` to the API base URL.

The frontend uses the currently shared backend route contract:

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `GET /api/v1/auth/me`
- `PUT /api/v1/auth/me`
- `PUT /api/v1/auth/change-password`
- `GET /api/v1/trips`
- `GET /api/v1/trips/:slug`
- `GET /api/v1/departures/trip/:tripId`
- `GET /api/v1/departures/:id`
- `POST /api/v1/bookings`
- `GET /api/v1/bookings/my`
- `PATCH /api/v1/bookings/:bookingId/cancel`

## Notes

- The app stores the returned access token in browser local storage and sends it as a Bearer token. The backend must return an access token on login for protected routes to work.
- Booking creation submits `departureId` and `numberOfSeats` and then takes the user to their bookings.
- The Express app shared during this task does not mount a payment router, so this frontend does not claim to process or verify online payments. Payment activation requires the corresponding verified backend endpoint(s) to be mounted and documented.
- Never commit `.env` files or production secrets.
