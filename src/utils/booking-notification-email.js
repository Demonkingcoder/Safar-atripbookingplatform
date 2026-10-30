const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[character]));

const inr = (amount) => Number.isFinite(Number(amount))
  ? new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(amount))
  : "To be confirmed";

const dateText = (value) => {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime())
    ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(date)
    : "To be confirmed";
};

export function buildBookingNotificationEmail({ type, fullName, tripTitle, bookingReference, numberOfSeats, totalAmount, departureDate, reason }) {
  const trip = tripTitle || "your Safar journey";
  const booking = bookingReference || "Available in My Bookings";
  const name = fullName || "traveller";
  const templates = {
    booking_confirmed: {
      subject: "Your Safar booking is confirmed",
      heading: "Your journey is confirmed",
      message: `Your booking for ${trip} is confirmed. Your tickets are ready.`,
      details: [["Booking reference", booking], ["Departure", dateText(departureDate)], ["Travellers", numberOfSeats ?? "To be confirmed"], ["Total paid", inr(totalAmount)]],
      action: "View my bookings",
    },
    booking_expired: {
      subject: "Your Safar reservation expired",
      heading: "Reservation expired",
      message: `Your reservation for ${trip} expired because payment was not completed in time. No ticket was issued.`,
      details: [["Booking reference", booking]], action: "Choose another departure",
    },
    payment_failed: {
      subject: "Your Safar payment could not be completed",
      heading: "Payment not completed",
      message: `Your payment for ${trip} could not be completed. Your booking is not confirmed and no tickets have been issued.`,
      details: [["Booking reference", booking]], action: "View my bookings",
    },
    booking_cancelled: {
      subject: "Your Safar booking was cancelled",
      heading: "Booking cancelled",
      message: `Your booking for ${trip} has been cancelled. ${reason ? `Reason: ${reason}` : "No payment refund is due for this unpaid booking."}`,
      details: [["Booking reference", booking]], action: "View my bookings",
    },
    refund_pending: {
      subject: "Your Safar refund is being processed",
      heading: "Refund in progress",
      message: `Your booking for ${trip} was cancelled and the payment provider is processing your refund. We will update you when it confirms completion.`,
      details: [["Booking reference", booking], ["Refund amount", inr(totalAmount)]], action: "View my bookings",
    },
    refund_processed: {
      subject: "Your Safar refund has been processed",
      heading: "Refund completed",
      message: `The payment provider confirmed your refund for ${trip}. Your bank may take additional time to show the funds.`,
      details: [["Booking reference", booking], ["Refund amount", inr(totalAmount)]], action: "View my bookings",
    },
    refund_failed: {
      subject: "An update about your Safar refund",
      heading: "Refund needs attention",
      message: `The payment provider has not completed the refund for ${trip}. Safar is reviewing the response and will update you.`,
      details: [["Booking reference", booking], ["Refund amount", inr(totalAmount)]], action: "Contact Safar",
    },
    admin_booking_notification: {
      subject: `New confirmed Safar booking · ${booking}`,
      heading: "A booking is confirmed",
      message: `${name} has a confirmed booking for ${trip}.`,
      details: [["Booking reference", booking], ["Departure", dateText(departureDate)], ["Travellers", numberOfSeats ?? "To be confirmed"], ["Total", inr(totalAmount)]], action: "Open Safar bookings",
    },
    upcoming_trip_reminder: {
      subject: `Your Safar journey is coming up · ${trip}`,
      heading: "Your journey is getting closer",
      message: `A quick reminder that your Safar journey to ${trip} is coming up. We look forward to welcoming you.`,
      details: [["Booking reference", booking], ["Departure", dateText(departureDate)], ["Travellers", numberOfSeats ?? "To be confirmed"]], action: "View my bookings",
    },    departure_cancelled: {
      subject: "A Safar departure has been cancelled",
      heading: "Departure update",
      message: `The scheduled departure for ${trip} has been cancelled by Safar. ${reason ? `Reason: ${reason}. ` : ""}We are checking your booking and payment status and will contact you with an update. Please do not make another payment for this departure.`,
      details: [["Booking reference", booking]], action: "View my bookings",
    },
  };
  const template = templates[type] || templates.booking_cancelled;
  const frontendUrl = (process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, "");
  const buttonUrl = type === "admin_booking_notification" ? frontendUrl : `${frontendUrl}/my-bookings`;
  const rows = template.details.map(([label, value]) => `<tr><td style="padding:8px 0;color:#5f6b68;font-size:14px">${escapeHtml(label)}</td><td align="right" style="padding:8px 0;color:#183d3a;font-size:14px;font-weight:700">${escapeHtml(value)}</td></tr>`).join("");
  const htmlContent = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>@media only screen and (max-width:600px){.email-shell{padding:16px!important}.email-card{padding:24px!important}.email-title{font-size:28px!important}.email-details td{font-size:13px!important}}</style></head><body style="margin:0;background:#f8f7f1;color:#263b39;font-family:Arial,Helvetica,sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8f7f1"><tr><td align="center" class="email-shell" style="padding:36px 16px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px"><tr><td style="padding:0 0 16px;color:#183d3a;font-family:Georgia,serif;font-size:25px;font-weight:bold">safar<span style="color:#e9896a">.</span></td></tr><tr><td class="email-card" style="padding:36px;background:#ffffff;border:1px solid #e8e8df;border-radius:18px"><p style="margin:0 0 12px;color:#e9896a;font-size:11px;font-weight:bold;letter-spacing:2px;text-transform:uppercase">A NOTE FROM SAFAR</p><h1 class="email-title" style="margin:0 0 14px;color:#183d3a;font-family:Georgia,serif;font-size:34px;line-height:1.2">${escapeHtml(template.heading)}</h1><p style="margin:0 0 22px;color:#5f6b68;font-size:16px;line-height:1.65">Hello ${escapeHtml(name)}, ${escapeHtml(template.message)}</p><table class="email-details" role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-top:1px solid #e8e8df;border-bottom:1px solid #e8e8df;margin:0 0 26px">${rows}</table><a href="${escapeHtml(buttonUrl)}" style="display:inline-block;padding:13px 21px;border-radius:999px;background:#183d3a;color:#ffffff;font-size:14px;font-weight:bold;text-decoration:none">${escapeHtml(template.action)}</a></td></tr><tr><td style="padding:18px 4px;color:#6c7773;font-size:12px;line-height:1.6">Thoughtfully chosen journeys, meaningful discoveries, and memories that travel home with you.<br>Safar · <a href="${escapeHtml(frontendUrl)}" style="color:#315e4b">Visit Safar</a></td></tr></table></td></tr></table></body></html>`;
  const textContent = `Hello ${name},\n\n${template.heading}\n${template.message}\n\n${template.details.map(([label, value]) => `${label}: ${value}`).join("\n")}\n\n${template.action}: ${buttonUrl}\n\nSafar`;
  return { subject: template.subject, htmlContent, textContent };
}
