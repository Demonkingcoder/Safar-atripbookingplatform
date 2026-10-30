
import Mailgen from "mailgen";
import nodemailer from "nodemailer";

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
    if (!process.env.BREVO_SENDER_EMAIL) {
        throw new Error("BREVO_SENDER_EMAIL is not configured");
    }

    if (!email || !subject || (!mailgenContent && (!htmlContent || !textContent))) {
        throw new Error(
            "Email recipient, subject, and content are required"
        );
    }

    const emailHtml = htmlContent || mailGenerator.generate(mailgenContent);
    const emailText = textContent || mailGenerator.generatePlaintext(mailgenContent);

    return transporter.sendMail({
        from: {
        name: "Safar",
            address: process.env.BREVO_SENDER_EMAIL,
        },
        to: email,
        subject,
        text: emailText,
        html: emailHtml,
        ...(messageId ? { messageId } : {}),
    });
};

// Verify SMTP configuration and connectivity
const verifyEmailTransport = async () => {
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
