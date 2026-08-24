/**
 * Shared WhatsApp utility — Jeeva Fitness
 *
 * Uses wa.me Click-to-Chat.
 * Opens WhatsApp with a pre-filled message.
 * The user reviews and manually presses Send.
 *
 * IMPORTANT: We never report "sent" — only "opened".
 * Desktop: opens WhatsApp Web. Mobile: opens the WhatsApp app.
 */

const STUDIO = "Jeeva Fitness";

/* ── Phone normalisation ──────────────────────────────────*/
export function normalizePhone(raw) {
  if (!raw) return null;
  let digits = String(raw).replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 10) digits = "91" + digits;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  if (digits.length >= 10) return digits;
  return null;
}

/* ── URL builder ──────────────────────────────────────────*/
export function buildWhatsAppUrl(phone, message) {
  const number = normalizePhone(phone);
  if (!number) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

/* ── Open WhatsApp — returns false if no valid number ─────*/
export function openWhatsApp(phone, message) {
  const url = buildWhatsAppUrl(phone, message);
  if (!url) return false;
  window.open(url, "_blank", "noopener,noreferrer");
  return true;
}

/* ── Message templates ────────────────────────────────────*/

export function msgWelcome(member) {
  return `Hello ${member.first_name} 💪

Welcome to *${STUDIO}*! We are thrilled to have you join our fitness family.

Your monthly membership fee is *₹${member.fee}*.

Let's work hard and achieve your fitness goals together!

Thank you,
${STUDIO}`;
}

export function msgFeeReminder(member, month) {
  return `Hello ${member.first_name} 💪

This is a friendly reminder from *${STUDIO}*.

Your gym membership fee of *₹${member.fee}* for *${month}* is pending.

Please make the payment at your earliest convenience.

Thank you,
${STUDIO}`;
}

export function msgPaymentConfirmation(member, amount, month) {
  return `Hello ${member.first_name} 💪

Thank you for your payment of *₹${amount}* for *${month}*.

Your payment has been received successfully.

Keep up the great work! 🏋️

Thank you for being part of *${STUDIO}*.

${STUDIO}`;
}

export function msgMembershipExpiring(member) {
  const expiry = member.membership_expiry_date
    ? new Date(member.membership_expiry_date).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
    : "soon";
  return `Hello ${member.first_name} 💪

Your *${STUDIO}* membership is expiring on *${expiry}*.

Please contact us to renew your membership and continue your fitness journey without interruption.

Thank you,
${STUDIO}`;
}

export function msgMembershipExpired(member) {
  return `Hello ${member.first_name} 💪

Your *${STUDIO}* membership has expired.

We miss you at the gym! Please contact us if you would like to renew your membership.

We look forward to having you back! 🏋️

${STUDIO}`;
}

export function msgDiscontinued(member) {
  return `Hello ${member.first_name} 💪

We hope you are doing well.

Please feel free to reach out if you have any questions about your membership at *${STUDIO}*.

Thank you,
${STUDIO}`;
}

export function msgReactivated(member) {
  return `Hello ${member.first_name} 💪

Welcome back to *${STUDIO}*! 🏋️

Your membership has been reactivated. We are delighted to have you back.

Let's get back to achieving your fitness goals!

Thank you,
${STUDIO}`;
}

export function msgAbsent(member, dateStr) {
  return `Hello ${member.first_name} 💪

We noticed that you missed your *${STUDIO}* session on *${dateStr}*.

We hope everything is well. See you at the gym soon! 🏋️

${STUDIO}`;
}
