import "dotenv/config";
import { safeEmailErrorDetails, verifyEmailTransport } from "./utils/mail.js";

try {
    await verifyEmailTransport();
    console.log("Brevo API configuration is valid; no provider request or email was sent.");
} catch (error) {
    console.error("Brevo API configuration validation failed", JSON.stringify(safeEmailErrorDetails(error)));
}
