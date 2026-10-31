import Mailgen from "mailgen";

const emailPattern = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

function emailError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
}

function validatedEmailAddress(value, code, label) {
    if (typeof value !== "string") {
        throw emailError(code, `${label} is invalid`);
    }

    const address = value.trim();

    if (address.length > 320 || !emailPattern.test(address)) {
        throw emailError(code, `${label} is invalid`);
    }

    return address;
}

export function safeEmailErrorDetails(error) {
    const name = typeof error?.name === "string" ? error.name : "Error";
    const code =
        typeof error?.code === "string"
            ? error.code
            : "email_delivery_failed";

    return {
        errorName: /^[A-Za-z][A-Za-z0-9_.-]{0,39}$/.test(name)
            ? name
            : "Error",
        errorCode: /^[A-Za-z0-9_-]{1,40}$/.test(code)
            ? code
            : "email_delivery_failed",
    };
}

function validateBrevoConfiguration() {
    if (!process.env.BREVO_API_KEY?.trim()) {
        throw emailError(
            "brevo_api_key_missing",
            "Brevo API key is not configured"
        );
    }

    validatedEmailAddress(
        process.env.BREVO_SENDER_EMAIL,
        "email_sender_invalid",
        "Email sender"
    );
}

const frontendUrl = (
    process.env.FRONTEND_URL || "http://localhost:5173"
).replace(/\/$/, "");

const mailGenerator = new Mailgen({
    theme: "default",
    product: {
        name: "Safar",
        link: frontendUrl,
    },
});

// Brevo HTTPS API — uses port 443, not SMTP ports.
const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

// Send an email through Brevo's HTTPS API.
const sendEmail = async ({
    email,
    subject,
    mailgenContent,
    htmlContent,
    textContent,
    messageId,
}) => {
    validateBrevoConfiguration();

    const sender = validatedEmailAddress(
        process.env.BREVO_SENDER_EMAIL,
        "email_sender_invalid",
        "Email sender"
    );

    const recipient = validatedEmailAddress(
        email,
        "email_recipient_invalid",
        "Email recipient"
    );

    if (!subject || (!mailgenContent && (!htmlContent || !textContent))) {
        throw emailError(
            "email_content_missing",
            "Email subject and content are required"
        );
    }

    const emailHtml =
        htmlContent || mailGenerator.generate(mailgenContent);

    const emailText =
        textContent || mailGenerator.generatePlaintext(mailgenContent);

    const payload = {
        sender: {
            name: process.env.BREVO_SENDER_NAME?.trim() || "Safar",
            email: sender,
        },
        to: [{ email: recipient }],
        subject,
        htmlContent: emailHtml,
        textContent: emailText,
    };

    // Brevo supports a custom header for message tracking/correlation.
    if (messageId) {
        payload.headers = {
            "X-Safar-Message-Id": String(messageId),
        };
    }

    let response;

    try {
        response = await fetch(BREVO_API_URL, {
            method: "POST",
            headers: {
                "api-key": process.env.BREVO_API_KEY,
                accept: "application/json",
                "content-type": "application/json",
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(20_000),
        });
    } catch (error) {
        if (error?.name === "TimeoutError" || error?.name === "AbortError") {
            throw emailError(
                "brevo_api_timeout",
                "Brevo email API request timed out"
            );
        }

        throw emailError(
            "brevo_api_network_error",
            "Could not connect to Brevo email API"
        );
    }

    if (!response.ok) {
        // Do not expose Brevo's raw response, which may contain internal details.
        const statusCode = response.status;

        let errorCode = "brevo_api_error";

        if (statusCode === 400) {
            errorCode = "brevo_request_invalid";
        } else if (statusCode === 401 || statusCode === 403) {
            errorCode = "brevo_api_auth_failed";
        } else if (statusCode === 429) {
            errorCode = "brevo_rate_limited";
        } else if (statusCode >= 500) {
            errorCode = "brevo_api_unavailable";
        }

        const error = emailError(
            errorCode,
            `Brevo email API returned status ${statusCode}`
        );

        error.statusCode = statusCode;
        throw error;
    }

    const result = await response.json();

    // A successful API response means Brevo accepted the email for processing.
    return {
        accepted: [recipient],
        rejected: [],
        messageId: result?.messageId,
        response: "Accepted by Brevo",
    };
};

// Validate API configuration without sending a test email.
const verifyEmailTransport = async () => {
    validateBrevoConfiguration();
    return true;
};

// Email verification content
const emailVerificationMailgenContent = (fullName, verificationUrl) => ({
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
const forgotPasswordMailgenContent = (fullName, passwordResetUrl) => ({
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

const bookingConfirmationMailgenContent = (
    fullName,
    tripTitle,
    bookingReference
) => ({
    body: {
        name: fullName,
        intro: `Your booking for ${tripTitle} is confirmed. Your tickets are ready. Booking reference: ${bookingReference}.`,
        outro:
            "Keep this reference for your trip and contact Safar if you need help.",
    },
});

const bookingCancellationMailgenContent = (
    fullName,
    tripTitle,
    reason,
    refundMessage
) => ({
    body: {
        name: fullName,
        intro: `Your booking for ${tripTitle} has been cancelled.`,
        outro: `${reason ? `Reason: ${reason}. ` : ""}${refundMessage}`,
    },
});

const departureCancellationMailgenContent = (
    fullName,
    tripTitle,
    reason
) => ({
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