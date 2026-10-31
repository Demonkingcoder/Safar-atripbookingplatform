import "dotenv/config";
import { safeEmailErrorDetails, verifyEmailTransport } from "../utils/mail.js";

if (!process.argv.includes("--staging")) {
  console.error("SMTP verification is opt-in. Run `npm run verify:smtp -- --staging` in the staging service only.");
  process.exitCode = 2;
} else {
  try {
    await verifyEmailTransport();
    console.log("SMTP connection and authentication verification succeeded. No email was sent.");
  } catch (error) {
    console.error("SMTP connection or authentication verification failed", JSON.stringify(safeEmailErrorDetails(error)));
    process.exitCode = 1;
  }
}
