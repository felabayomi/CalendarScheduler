import { storage } from "./storage";
import { getUncachableResendClient } from "./resend";

const sentReminders = new Set<string>();
let reminderInterval: NodeJS.Timeout | undefined;

function formatTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, "0")} ${period}`;
}

async function sendReminderEmail(params: {
  to: string;
  clientName: string;
  meetingType: string;
  date: string;
  startTime: string;
  endTime: string;
  meetingLink?: string | null;
  minutesBefore: number;
}) {
  const { client: resend, fromEmail } = await getUncachableResendClient();
  const typeLabel = params.meetingType === "video" ? "Video Meeting" : "Phone Call";
  const timeLabel = params.minutesBefore >= 60
    ? `${params.minutesBefore / 60} hour${params.minutesBefore > 60 ? "s" : ""}`
    : `${params.minutesBefore} minutes`;

  const SMART_CALENDAR_URL = "https://smartmeetings.felixconsult.co/admin/ark/felixdgreat";

  await resend.emails.send({
    from: fromEmail,
    to: params.to,
    subject: `Reminder: ${typeLabel} with ${params.clientName} in ${timeLabel}`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;">
        <h2 style="color:#1d4ed8;">Upcoming Meeting Reminder</h2>
        <p>You have a <strong>${typeLabel}</strong> with <strong>${params.clientName}</strong> in <strong>${timeLabel}</strong>.</p>
        <table style="border-collapse:collapse;font-size:15px;width:100%;background:#f8fafc;border-radius:8px;padding:16px;">
          <tr><td style="padding:6px 16px 6px 0;color:#666">Date</td><td>${params.date}</td></tr>
          <tr><td style="padding:6px 16px 6px 0;color:#666">Time</td><td>${formatTime(params.startTime)} – ${formatTime(params.endTime)}</td></tr>
          ${params.meetingLink ? `<tr><td style="padding:6px 16px 6px 0;color:#666">Meeting Link</td><td><a href="${params.meetingLink}" style="color:#1d4ed8;">${params.meetingLink}</a></td></tr>` : ""}
        </table>
        <div style="margin-top:20px;display:flex;gap:12px;flex-wrap:wrap;">
          ${params.meetingLink ? `<a href="${params.meetingLink}" style="display:inline-block;background:#1d4ed8;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">Join Video Meeting</a>` : ""}
          <a href="${SMART_CALENDAR_URL}" style="display:inline-block;background:#10b981;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">View in SmartMeetings</a>
        </div>
      </div>
    `,
  });
}

export function stopReminderScheduler() {
  if (reminderInterval) {
    clearInterval(reminderInterval);
    reminderInterval = undefined;
  }
}

export function startReminderScheduler() {
  if (reminderInterval) {
    return;
  }

  const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "";
  const REMINDER_INTERVALS = [60, 15]; // minutes before appointment

  reminderInterval = setInterval(async () => {
    try {
      const now = new Date();
      const bookings = await storage.getAllBookings();

      for (const booking of bookings) {
        if (booking.status === "cancelled") continue;

        const bookingTime = new Date(`${booking.date}T${booking.startTime}:00`);
        const diffMs = bookingTime.getTime() - now.getTime();
        const diffMins = Math.floor(diffMs / 60000);

        for (const mins of REMINDER_INTERVALS) {
          const key = `${booking.id}-${mins}`;
          if (sentReminders.has(key)) continue;

          // Send if within the 1-minute window for this reminder
          if (diffMins <= mins && diffMins > mins - 1) {
            sentReminders.add(key);
            console.log(`Sending ${mins}-min reminder for booking ${booking.id}`);

            if (ADMIN_EMAIL) {
              await sendReminderEmail({
                to: ADMIN_EMAIL,
                clientName: booking.clientName,
                meetingType: booking.meetingType,
                date: booking.date,
                startTime: booking.startTime,
                endTime: booking.endTime,
                meetingLink: booking.meetingLink,
                minutesBefore: mins,
              }).catch(e => console.error("Admin reminder failed:", e.message));
            }

            if (booking.clientEmail) {
              await sendReminderEmail({
                to: booking.clientEmail,
                clientName: booking.clientName,
                meetingType: booking.meetingType,
                date: booking.date,
                startTime: booking.startTime,
                endTime: booking.endTime,
                meetingLink: booking.meetingLink,
                minutesBefore: mins,
              }).catch(e => console.error("Client reminder failed:", e.message));
            }
          }
        }
      }
    } catch (err: any) {
      console.error("Reminder scheduler error:", err.message);
    }
  }, 60 * 1000); // runs every minute

  console.log("Reminder scheduler started (reminders at 60 and 15 minutes before)");
}
