
import Mailgen from "mailgen";
import nodemailer from "nodemailer";

const frontendUrl = (
    process.env.FRONTEND_URL || "http://localhost:5173"
).replace(/\/$/, "");

// Generate HTML and plain-text email content
const mailGenerator = new Mailgen({
    theme: "default",
    product: {
        name: "tripplanner",
        link: frontendUrl,
    },
});

// Configure Brevo SMTP
const transporter = nodemailer.createTransport({
    host: process.env.BREVO_SMTP_HOST,
    port: Number(process.env.BREVO_SMTP_PORT || 587),
    secure: Number(process.env.BREVO_SMTP_PORT || 587) === 465,
    auth: {
        user: process.env.BREVO_SMTP_USER,
        pass: process.env.BREVO_SMTP_PASS,
    },
});

// Send an email
const sendEmail = async ({ email, subject, mailgenContent }) => {
    if (!process.env.BREVO_SENDER_EMAIL) {
        throw new Error("BREVO_SENDER_EMAIL is not configured");
    }

    if (!email || !subject || !mailgenContent) {
        throw new Error(
            "Email recipient, subject, and content are required"
        );
    }

    const emailHtml = mailGenerator.generate(mailgenContent);
    const emailText = mailGenerator.generatePlaintext(mailgenContent);

    return transporter.sendMail({
        from: {
            name: "tripplanner",
            address: process.env.BREVO_SENDER_EMAIL,
        },
        to: email,
        subject,
        text: emailText,
        html: emailHtml,
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
        intro: "Welcome to Bhupee! We're excited to help you plan your next trip.",
        action: {
            instructions:
                "Click the button below to verify your email address. This link expires in 30 minutes.",
            button: {
                color: "#2563eb",
                text: "Verify Email",
                link: verificationUrl,
            },
        },
        outro:
            "If you didn't create a Bhupee account, you can safely ignore this email.",
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
            "We received a request to reset your Bhupee account password.",
        action: {
            instructions:
                "Click the button below to reset your password. This link expires in 20 minutes.",
            button: {
                color: "#2563eb",
                text: "Reset Password",
                link: passwordResetUrl,
            },
        },
        outro:
            "If you didn't request a password reset, you can safely ignore this email.",
    },
});

export {
    sendEmail,
    verifyEmailTransport,
    emailVerificationMailgenContent,
    forgotPasswordMailgenContent,
};
