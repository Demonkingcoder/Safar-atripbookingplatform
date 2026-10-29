import "dotenv/config";
import { verifyEmailTransport } from "./utils/mail.js";

try {
    await verifyEmailTransport();
    console.log("Brevo SMTP connection successful!");
} catch (error) {
    console.error("SMTP connection failed:", error.message);
}