
import Mailgen from "mailgen";
import nodemailer from "nodemailer";

const emailPattern = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

function emailError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
}

function validatedEmailAddress(value, code, label) {
    if (typeof value !== "string") throw emailError(code, `${label} is invalid`);
    const address = value.trim();
    if (address.length > 320 || !emailPattern.test(address)) {
        throw emailError(code, `${label} is invalid`);
    }
    return address;
}

export function safeEmailErrorDetails(error) {
    const name = typeof error?.name === "string" ? error.name : "Error";
    const code = typeof error?.code === "string" ? error.code : "email_delivery_failed";
    return {
        errorName: /^[A-Za-z][A-Za-z0-9_.-]{0,39}$/.test(name) ? name : "Error",
        errorCode: /^[A-Za-z0-9_-]{1,40}$/.test(code) ? code : "email_delivery_failed",
    };
}

function validateSmtpConfiguration() {
    if (!process.env.BREVO_SMTP_HOST?.trim()) throw emailError("smtp_host_missing", "SMTP host is not configured");
    const port = Number(process.env.BREVO_SMTP_PORT || 587);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw emailError("smtp_port_invalid", "SMTP port is invalid");
    if (!process.env.BREVO_SMTP_USER?.trim()) throw emailError("smtp_login_missing", "SMTP login is not configured");
    if (!process.env.BREVO_SMTP_PASS?.trim()) throw emailError("smtp_key_missing", "SMTP key is not configured");
    validatedEmailAddress(process.env.BREVO_SENDER_EMAIL, "email_sender_invalid", "Email sender");
}

const frontendUrl = (
    process.env.FRONTEND_URL || "http://localhost:5173"
).replace(/\/$/, "");

// Generate HTML and plain-text email content
const mailGenerator = new Mailgen({
    theme: "default",
    product: {
        name: "Safar",
        link: frontendUrl,
    },
});

// Configure Brevo SMTP
const transporter = nodemailer.createTransport({
    host: process.env.BREVO_SMTP_HOST,
    port: Number(process.env.BREVO_SMTP_PORT || 587),
    secure: Number(process.env.BREVO_SMTP_PORT || 587) === 465,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 60_000,
    auth: {
        user: process.env.BREVO_SMTP_USER,
        pass: process.env.BREVO_SMTP_PASS,
    },
});

// Send an email
const sendEmail = async ({ email, subject, mailgenContent, htmlContent, textContent, messageId }) => {
    validateSmtpConfiguration();
    const sender = validatedEmailAddress(process.env.BREVO_SENDER_EMAIL, "email_sender_invalid", "Email sender");
    const recipient = validatedEmailAddress(email, "email_recipient_invalid", "Email recipient");

    if (!subject || (!mailgenContent && (!htmlContent || !textContent))) {
        throw emailError("email_content_missing", "Email subject and content are required");
    }

    const emailHtml = htmlContent || mailGenerator.generate(mailgenContent);
    const emailText = textContent || mailGenerator.generatePlaintext(mailgenContent);

    const result = await transporter.sendMail({
        from: {
        name: "Safar",
            address: sender,
        },
        to: recipient,
        subject,
        text: emailText,
        html: emailHtml,
        ...(messageId ? { messageId } : {}),
    });

    const accepted = (result?.accepted || []).some((entry) => {
        const address = typeof entry === "string" ? entry : entry?.address;
        return typeof address === "string" && address.trim().toLowerCase() === recipient.toLowerCase();
    });
    if (!accepted || (result?.rejected || []).some((entry) => {
        const address = typeof entry === "string" ? entry : entry?.address;
        return typeof address === "string" && address.trim().toLowerCase() === recipient.toLowerCase();
    })) {
        throw emailError("recipient_not_accepted", "SMTP did not accept the recipient");
    }
    return result;
};

// Verify SMTP configuration and connectivity
const verifyEmailTransport = async () => {
    validateSmtpConfiguration();
    return transporter.verify();
};

// Email verification content
const emailVerificationMailgenContent = (
    fullName,
    verificationUrl
) => ({
    body: {
        name: fullName,
        intro: "Welcome to Safar! We're excited to help you plan your next trip.",
        action: {
            instructions:
                "Click the button below to verify your email address. This link expires in 30 minutes.",
            button: {
                color: "#183D3A",
                text: "Verify Email",
                link: verificationUrl,
            },
        },
        outro:
            "If you didn't create a Safar account, you can safely ignore this email.",
    },
});

// Forgot-password email content
const forgotPasswordMailgenContent = (
    fullName,
    passwordResetUrl
) => ({
    body: {
        name: fullName,
        intro:
            "We received a request to reset your Safar account password.",
        action: {
            instructions:
                "Click the button below to reset your password. This secure link expires in 15 minutes.",
            button: {
                color: "#183D3A",
                text: "Reset Password",
                link: passwordResetUrl,
            },
        },
        outro:
            "If you didn't request a password reset, you can safely ignore this email. Your password will not change unless you use the link above.",
    },
});

const bookingConfirmationMailgenContent = (fullName, tripTitle, bookingReference) => ({
    body: {
        name: fullName,
        intro: `Your booking for ${tripTitle} is confirmed. Your tickets are ready. Booking reference: ${bookingReference}.`,
        outro: "Keep this reference for your trip and contact Safar if you need help.",
    },
});

const bookingCancellationMailgenContent = (fullName, tripTitle, reason, refundMessage) => ({
    body: {
        name: fullName,
        intro: `Your booking for ${tripTitle} has been cancelled.`,
        outro: `${reason ? `Reason: ${reason}. ` : ""}${refundMessage}`,
    },
});

const departureCancellationMailgenContent = (fullName, tripTitle, reason) => ({
    body: {
        name: fullName,
        intro: `The scheduled departure for ${tripTitle} has been cancelled by Safar.`,
        outro: `Reason: ${reason}. We are checking your booking and payment status. Safar will contact you with the cancellation or refund update; please do not make another payment for this departure.`,
    },
});

export {
    sendEmail,
    verifyEmailTransport,
    emailVerificationMailgenContent,
    forgotPasswordMailgenContent,
    bookingConfirmationMailgenContent,
    bookingCancellationMailgenContent,
    departureCancellationMailgenContent,
};
