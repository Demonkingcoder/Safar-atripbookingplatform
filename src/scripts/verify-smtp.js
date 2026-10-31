import "dotenv/config";
import { safeEmailErrorDetails, verifyEmailTransport } from "../utils/mail.js";

if (!process.argv.includes("--staging")) {
  console.error("Brevo configuration validation is opt-in. Run `npm run verify:brevo-config -- --staging` in the staging service only.");
  process.exitCode = 2;
} else {
  try {
    await verifyEmailTransport();
    console.log("Brevo API configuration is present and valid. No provider request or email was sent.");
  } catch (error) {
    console.error("Brevo API configuration validation failed", JSON.stringify(safeEmailErrorDetails(error)));
    process.exitCode = 1;
  }
}
