const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[character]));

const formatAmount = (amount, locale) => Number.isFinite(Number(amount))
  ? new Intl.NumberFormat(locale, { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(amount))
  : (locale === "hi-IN" ? "पुष्टि होना बाकी" : "To be confirmed");

const formatDate = (value, locale) => {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime())
    ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(date)
    : (locale === "hi-IN" ? "पुष्टि होना बाकी" : "To be confirmed");
};

const copy = {
  en: {
    greeting: "Hello", note: "A NOTE FROM SAFAR", footer: "Thoughtfully chosen journeys, meaningful discoveries, and memories that travel home with you.", visit: "Visit Safar",
    booking_confirmed: { subject: "Your Safar booking is confirmed", heading: "Your journey is confirmed", message: (trip) => `Your booking for ${trip} is confirmed. Your tickets are ready.`, labels: ["Booking reference", "Departure", "Travellers", "Amount paid", "Payment reference"], action: "View my bookings" },
    booking_expired: { subject: "Your Safar reservation expired", heading: "Reservation expired", message: (trip) => `Your reservation for ${trip} expired because payment was not completed in time. No ticket was issued.`, labels: ["Booking reference"], action: "Choose another departure" },
    payment_failed: { subject: "Your Safar payment could not be completed", heading: "Payment not completed", message: (trip) => `Payment for ${trip} could not be completed. Your booking is not confirmed and no tickets have been issued. You can start a new booking if you still wish to travel.`, labels: ["Booking reference", "Departure", "Travellers", "Amount"], action: "Try booking again" },
    booking_cancelled: { subject: "Your Safar booking was cancelled", heading: "Booking cancelled", message: (trip, reason) => `Your booking for ${trip} has been cancelled. ${reason ? `Reason: ${reason}` : "No payment refund is due for this unpaid booking."}`, labels: ["Booking reference"], action: "View my bookings" },
    refund_pending: { subject: "Your Safar refund is being processed", heading: "Refund in progress", message: (trip) => `Your booking for ${trip} was cancelled and the payment provider is processing your refund. We will update you when it confirms completion.`, labels: ["Booking reference", "Refund amount"], action: "View my bookings" },
    refund_processed: { subject: "Your Safar refund has been processed", heading: "Refund completed", message: (trip) => `The payment provider confirmed your refund for ${trip}. Your bank may take additional time to show the funds.`, labels: ["Booking reference", "Refund amount"], action: "View my bookings" },
    refund_failed: { subject: "An update about your Safar refund", heading: "Refund needs attention", message: (trip) => `The payment provider has not completed the refund for ${trip}. Safar is reviewing the response and will update you.`, labels: ["Booking reference", "Refund amount"], action: "View my bookings" },
    admin_booking_notification: { subject: (booking) => `New confirmed Safar booking · ${booking}`, heading: "A booking is confirmed", message: (trip, _reason, name) => `${name} has a confirmed booking for ${trip}.`, labels: ["Booking reference", "Departure", "Travellers", "Total"], action: "Open Safar bookings" },
    upcoming_trip_reminder: { subject: (trip) => `Your Safar journey is coming up · ${trip}`, heading: "Your journey is getting closer", message: (trip) => `A quick reminder that your Safar journey to ${trip} is coming up. We look forward to welcoming you.`, labels: ["Booking reference", "Departure", "Travellers"], action: "View my bookings" },
    departure_cancelled: { subject: "A Safar departure has been cancelled", heading: "Departure update", message: (trip, reason) => `The scheduled departure for ${trip} has been cancelled by Safar. ${reason ? `Reason: ${reason}. ` : ""}We are checking your booking and payment status and will contact you with an update. Please do not make another payment for this departure.`, labels: ["Booking reference"], action: "View my bookings" },
  },
  hi: {
    greeting: "नमस्ते", note: "सफ़र की ओर से एक संदेश", footer: "सोच-समझकर चुनी गई यात्राएँ, अर्थपूर्ण खोजें और घर तक साथ आने वाली यादें।", visit: "सफ़र पर जाएँ",
    booking_confirmed: { subject: "आपकी सफ़र बुकिंग की पुष्टि हो गई", heading: "आपकी यात्रा की पुष्टि हो गई", message: (trip) => `${trip} के लिए आपकी बुकिंग की पुष्टि हो गई है। आपके टिकट तैयार हैं।`, labels: ["बुकिंग संदर्भ", "प्रस्थान", "यात्री", "भुगतान की गई राशि", "भुगतान संदर्भ"], action: "मेरी बुकिंग देखें" },
    booking_expired: { subject: "आपका सफ़र आरक्षण समाप्त हो गया", heading: "आरक्षण समाप्त", message: (trip) => `समय पर भुगतान पूरा न होने के कारण ${trip} का आरक्षण समाप्त हो गया। कोई टिकट जारी नहीं हुआ।`, labels: ["बुकिंग संदर्भ"], action: "दूसरा प्रस्थान चुनें" },
    payment_failed: { subject: "आपका सफ़र भुगतान पूरा नहीं हो सका", heading: "भुगतान पूरा नहीं हुआ", message: (trip) => `${trip} का भुगतान पूरा नहीं हो सका। आपकी बुकिंग की पुष्टि नहीं हुई है और टिकट जारी नहीं हुए हैं। यदि आप यात्रा करना चाहते हैं, तो नई बुकिंग शुरू कर सकते हैं।`, labels: ["बुकिंग संदर्भ", "प्रस्थान", "यात्री", "राशि"], action: "फिर से बुक करें" },
    booking_cancelled: { subject: "आपकी सफ़र बुकिंग रद्द कर दी गई", heading: "बुकिंग रद्द", message: (trip, reason) => `${trip} की आपकी बुकिंग रद्द कर दी गई है। ${reason ? `कारण: ${reason}` : "इस अवैतनिक बुकिंग का कोई रिफंड देय नहीं है।"}`, labels: ["बुकिंग संदर्भ"], action: "मेरी बुकिंग देखें" },
    refund_pending: { subject: "आपका सफ़र रिफंड प्रक्रिया में है", heading: "रिफंड जारी है", message: (trip) => `${trip} की बुकिंग रद्द कर दी गई है और भुगतान प्रदाता आपका रिफंड संसाधित कर रहा है। पुष्टि मिलते ही हम आपको बताएँगे।`, labels: ["बुकिंग संदर्भ", "रिफंड राशि"], action: "मेरी बुकिंग देखें" },
    refund_processed: { subject: "आपका सफ़र रिफंड पूरा हो गया", heading: "रिफंड पूरा", message: (trip) => `${trip} के लिए भुगतान प्रदाता ने रिफंड पूरा होने की पुष्टि की है। आपके बैंक में राशि दिखने में थोड़ा और समय लग सकता है।`, labels: ["बुकिंग संदर्भ", "रिफंड राशि"], action: "मेरी बुकिंग देखें" },
    refund_failed: { subject: "आपके सफ़र रिफंड के बारे में अपडेट", heading: "रिफंड की समीक्षा जारी", message: (trip) => `${trip} का रिफंड भुगतान प्रदाता ने पूरा नहीं किया है। सफ़र इसकी समीक्षा कर रहा है और आपको अपडेट देगा।`, labels: ["बुकिंग संदर्भ", "रिफंड राशि"], action: "मेरी बुकिंग देखें" },
    admin_booking_notification: { subject: (booking) => `नई पुष्ट सफ़र बुकिंग · ${booking}`, heading: "बुकिंग की पुष्टि हुई", message: (trip, _reason, name) => `${name} ने ${trip} के लिए पुष्ट बुकिंग की है।`, labels: ["बुकिंग संदर्भ", "प्रस्थान", "यात्री", "कुल"], action: "सफ़र बुकिंग खोलें" },
    upcoming_trip_reminder: { subject: (trip) => `${trip} की सफ़र यात्रा जल्द है`, heading: "आपकी यात्रा नज़दीक है", message: (trip) => `याद दिलाना है कि ${trip} की आपकी सफ़र यात्रा जल्द शुरू होने वाली है। हम आपका स्वागत करने के लिए उत्सुक हैं।`, labels: ["बुकिंग संदर्भ", "प्रस्थान", "यात्री"], action: "मेरी बुकिंग देखें" },
    departure_cancelled: { subject: "सफ़र का प्रस्थान रद्द कर दिया गया", heading: "प्रस्थान का अपडेट", message: (trip, reason) => `${trip} का निर्धारित प्रस्थान सफ़र ने रद्द कर दिया है। ${reason ? `कारण: ${reason}. ` : ""}हम आपकी बुकिंग और भुगतान की स्थिति जाँच रहे हैं और अपडेट देंगे। कृपया इस प्रस्थान के लिए दोबारा भुगतान न करें।`, labels: ["बुकिंग संदर्भ"], action: "मेरी बुकिंग देखें" },
  },
};

export function buildBookingNotificationEmail({ type, fullName, tripTitle, bookingReference, numberOfSeats, totalAmount, departureDate, reason, language = "en", paymentReference, tripSlug }) {
  const localeKey = language === "hi" ? "hi" : "en";
  const locale = localeKey === "hi" ? "hi-IN" : "en-IN";
  const words = copy[localeKey];
  const template = words[type] || words.booking_cancelled;
  const trip = tripTitle || (localeKey === "hi" ? "आपकी सफ़र यात्रा" : "your Safar journey");
  const booking = bookingReference || (localeKey === "hi" ? "मेरी बुकिंग में उपलब्ध" : "Available in My Bookings");
  const name = fullName || (localeKey === "hi" ? "यात्री" : "traveller");
  const fields = {
    booking_confirmed: ["booking", "departure", "seats", "amount", "payment"],
    booking_expired: ["booking"], payment_failed: ["booking", "departure", "seats", "amount"],
    booking_cancelled: ["booking"], refund_pending: ["booking", "amount"], refund_processed: ["booking", "amount"],
    refund_failed: ["booking", "amount"], admin_booking_notification: ["booking", "departure", "seats", "amount"],
    upcoming_trip_reminder: ["booking", "departure", "seats"], departure_cancelled: ["booking"],
  }[type] || ["booking"];
  const values = {
    booking,
    departure: formatDate(departureDate, locale),
    seats: numberOfSeats ?? (localeKey === "hi" ? "पुष्टि होना बाकी" : "To be confirmed"),
    amount: formatAmount(totalAmount, locale),
    payment: paymentReference || (localeKey === "hi" ? "उपलब्ध नहीं" : "Unavailable"),
  };
  const details = template.labels.map((label, index) => [label, values[fields[index]]]);
  const subject = typeof template.subject === "function" ? template.subject(booking) : template.subject;
  const heading = template.heading;
  const message = template.message(trip, reason, name);
  const frontendUrl = (process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, "");
  const bookingUrl = `${frontendUrl}/my-bookings`;
  const retryUrl = tripSlug ? `${frontendUrl}/trips/${encodeURIComponent(tripSlug)}/book` : bookingUrl;
  const buttonUrl = type === "admin_booking_notification" ? frontendUrl : type === "payment_failed" ? retryUrl : bookingUrl;
  const rows = details.map(([label, value]) => `<tr><td style="padding:8px 0;color:#5f6b68;font-size:14px">${escapeHtml(label)}</td><td align="right" style="padding:8px 0;color:#183d3a;font-size:14px;font-weight:700">${escapeHtml(value)}</td></tr>`).join("");
  const htmlContent = `<!doctype html><html lang="${localeKey}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>@media only screen and (max-width:600px){.email-shell{padding:16px!important}.email-card{padding:24px!important}.email-title{font-size:28px!important}.email-details td{font-size:13px!important}}</style></head><body style="margin:0;background:#f8f7f1;color:#263b39;font-family:Arial,Helvetica,sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8f7f1"><tr><td align="center" class="email-shell" style="padding:36px 16px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px"><tr><td style="padding:0 0 16px;color:#183d3a;font-family:Georgia,serif;font-size:25px;font-weight:bold">safar<span style="color:#e9896a">.</span></td></tr><tr><td class="email-card" style="padding:36px;background:#ffffff;border:1px solid #e8e8df;border-radius:18px"><p style="margin:0 0 12px;color:#e9896a;font-size:11px;font-weight:bold;letter-spacing:2px;text-transform:uppercase">${escapeHtml(words.note)}</p><h1 class="email-title" style="margin:0 0 14px;color:#183d3a;font-family:Georgia,serif;font-size:34px;line-height:1.2">${escapeHtml(heading)}</h1><p style="margin:0 0 22px;color:#5f6b68;font-size:16px;line-height:1.65">${escapeHtml(words.greeting)} ${escapeHtml(name)}, ${escapeHtml(message)}</p><table class="email-details" role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-top:1px solid #e8e8df;border-bottom:1px solid #e8e8df;margin:0 0 26px">${rows}</table><a href="${escapeHtml(buttonUrl)}" style="display:inline-block;padding:13px 21px;border-radius:999px;background:#183d3a;color:#ffffff;font-size:14px;font-weight:bold;text-decoration:none">${escapeHtml(template.action)}</a></td></tr><tr><td style="padding:18px 4px;color:#6c7773;font-size:12px;line-height:1.6">${escapeHtml(words.footer)}<br>Safar · <a href="${escapeHtml(frontendUrl)}" style="color:#315e4b">${escapeHtml(words.visit)}</a></td></tr></table></td></tr></table></body></html>`;
  const textContent = `${words.greeting} ${name},\n\n${heading}\n${message}\n\n${details.map(([label, value]) => `${label}: ${value}`).join("\n")}\n\n${template.action}: ${buttonUrl}\n\nSafar`;
  return { subject, htmlContent, textContent };
}
