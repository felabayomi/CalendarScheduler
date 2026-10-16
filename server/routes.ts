import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertAvailabilitySchema, insertBookingSchema } from "@shared/schema";
import { z } from "zod";
import { getTwilioClient } from "./twilio";
import { getUncachableResendClient } from "./resend";
import { createZoomMeeting } from "./zoom";
import { syncToSmartCalendar } from "./smartcalendar";
import { generateICS, googleCalendarUrl } from "./calendar";

const ADMIN_NOTIFICATION_EMAIL = process.env.ADMIN_EMAIL || "";
const SESSION_TTL_MS = 1000 * 60 * 60 * 12;

// In-memory OTP store: phone -> { code, expiresAt, verified }
const otpStore = new Map<string, { code: string; expiresAt: number; verified: boolean }>();

function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}


function generateTimeSlots(startTime: string, endTime: string, duration: number): string[] {
  const slots: string[] = [];
  const [startH, startM] = startTime.split(":").map(Number);
  const [endH, endM] = endTime.split(":").map(Number);
  let current = startH * 60 + startM;
  const end = endH * 60 + endM;
  while (current + duration <= end) {
    const h = Math.floor(current / 60).toString().padStart(2, "0");
    const m = (current % 60).toString().padStart(2, "0");
    slots.push(`${h}:${m}`);
    current += duration;
  }
  return slots;
}

async function getAdminId(req: any): Promise<number | null> {
  const auth = req.headers["authorization"];
  if (!auth || !auth.startsWith("Bearer ")) return null;
  const token = auth.slice(7);
  return storage.validateAdminSession(token);
}

export async function registerRoutes(app: Express): Promise<Server> {
  // ─── Auth ────────────────────────────────────────────────────────────────
  app.post("/api/auth/login", async (req, res) => {
    const { username, password } = req.body;
    const user = await storage.getUserByUsername(username);
    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = randomUUID();
    await storage.createAdminSession(user.id, token, new Date(Date.now() + SESSION_TTL_MS));
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, username: user.username } });
  });

  app.post("/api/auth/logout", async (req, res) => {
    const auth = req.headers["authorization"];
    if (auth?.startsWith("Bearer ")) {
      await storage.deleteAdminSession(auth.slice(7));
    }
    res.json({ ok: true });
  });

  app.get("/api/auth/me", async (req, res) => {
    const userId = await getAdminId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const user = await storage.getUser(userId);
    if (!user) return res.status(401).json({ message: "Unauthorized" });
    res.json({ id: user.id, name: user.name, email: user.email, username: user.username });
  });

  // ─── Phone OTP Verification (Twilio Verify) ─────────────────────────────
  app.post("/api/verify/send", async (req, res) => {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ message: "Phone number required" });

    const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID;
    if (!serviceSid) return res.status(500).json({ message: "Verification service not configured" });

    try {
      const client = getTwilioClient();
      const verification = await client.verify.v2.services(serviceSid).verifications.create({
        to: phone,
        channel: "sms",
      });
      console.log(`Twilio Verify sent: status=${verification.status} to=${verification.to}`);
      res.json({ success: true, message: "Verification code sent" });
    } catch (err: any) {
      console.error("Twilio Verify send error:", err.message, err.code);
      res.status(500).json({ message: "Failed to send verification code. Please check your phone number." });
    }
  });

  app.post("/api/verify/check", async (req, res) => {
    const { phone, code } = req.body;
    if (!phone || !code) return res.status(400).json({ message: "Phone and code required" });

    const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID;
    if (!serviceSid) return res.status(500).json({ message: "Verification service not configured" });

    try {
      const client = getTwilioClient();
      const check = await client.verify.v2.services(serviceSid).verificationChecks.create({
        to: phone,
        code,
      });
      console.log(`Twilio Verify check: status=${check.status} to=${check.to}`);
      if (check.status === "approved") {
        otpStore.set(phone, { code, expiresAt: Date.now() + 10 * 60 * 1000, verified: true });
        res.json({ success: true, message: "Phone verified!" });
      } else {
        res.status(400).json({ message: "Incorrect code. Please try again." });
      }
    } catch (err: any) {
      console.error("Twilio Verify check error:", err.message, err.code);
      res.status(400).json({ message: "Incorrect or expired code. Please try again." });
    }
  });

  // ─── Availability (admin only) ───────────────────────────────────────────
  app.get("/api/availability", async (req, res) => {
    // Public: returns availability for date (day of week) for slot calculations
    // Also used by admin
    const userId = 1; // main admin
    const slots = await storage.getAvailability(userId);
    res.json(slots);
  });

  app.post("/api/availability", async (req, res) => {
    const adminId = await getAdminId(req);
    if (!adminId) return res.status(401).json({ message: "Unauthorized" });
    try {
      const data = insertAvailabilitySchema.parse({ ...req.body, userId: adminId });
      const slot = await storage.createAvailability(data);
      res.status(201).json(slot);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: "Invalid data", errors: error.errors });
      throw error;
    }
  });

  app.patch("/api/availability/:id", async (req, res) => {
    const adminId = await getAdminId(req);
    if (!adminId) return res.status(401).json({ message: "Unauthorized" });
    try {
      const slot = await storage.updateAvailability(Number(req.params.id), req.body);
      res.json(slot);
    } catch (e: any) {
      res.status(404).json({ message: e.message });
    }
  });

  app.delete("/api/availability/:id", async (req, res) => {
    const adminId = await getAdminId(req);
    if (!adminId) return res.status(401).json({ message: "Unauthorized" });
    await storage.deleteAvailability(Number(req.params.id));
    res.status(204).end();
  });

  // ─── Available time slots for a specific date (public) ──────────────────
  app.get("/api/available-slots", async (req, res) => {
    const date = req.query.date as string;
    if (!date) return res.status(400).json({ message: "date required" });

    const dayOfWeek = new Date(date + "T12:00:00").getDay();
    const allAvailability = await storage.getAvailability(1);
    const dayAvailability = allAvailability.filter(a => a.dayOfWeek === dayOfWeek && a.isActive);

    if (dayAvailability.length === 0) return res.json([]);

    const existingBookings = await storage.getBookingsByDate(date);
    const bookedTimes = new Set(existingBookings.filter(b => b.status !== "cancelled").map(b => b.startTime));

    const slots: string[] = [];
    for (const avail of dayAvailability) {
      const generated = generateTimeSlots(avail.startTime, avail.endTime, avail.slotDuration);
      for (const slot of generated) {
        if (!bookedTimes.has(slot) && !slots.includes(slot)) {
          slots.push(slot);
        }
      }
    }

    slots.sort();
    res.json(slots);
  });

  // ─── Bookings ────────────────────────────────────────────────────────────
  app.get("/api/bookings", async (req, res) => {
    const adminId = await getAdminId(req);
    if (!adminId) return res.status(401).json({ message: "Unauthorized" });
    const bookings = await storage.getAllBookings();
    res.json(bookings);
  });

  app.get("/api/bookings/date/:date", async (req, res) => {
    const adminId = await getAdminId(req);
    if (!adminId) return res.status(401).json({ message: "Unauthorized" });
    const bookings = await storage.getBookingsByDate(req.params.date);
    res.json(bookings);
  });

  app.post("/api/bookings", async (req, res) => {
    try {
      const data = insertBookingSchema.parse(req.body);

      // For phone call bookings, require phone verification
      if (data.meetingType === "call") {
        if (!data.clientPhone) {
          return res.status(400).json({ message: "Phone number is required for phone call bookings" });
        }
        const otpEntry = otpStore.get(data.clientPhone);
        if (!otpEntry || !otpEntry.verified) {
          return res.status(400).json({ message: "Phone number must be verified before booking a call" });
        }
        // Clean up used OTP
        otpStore.delete(data.clientPhone);
      }

      // Check slot is still available
      const existing = await storage.getBookingsByDate(data.date);
      const conflict = existing.find(b => b.startTime === data.startTime && b.status !== "cancelled");
      if (conflict) return res.status(409).json({ message: "This time slot is no longer available" });

      // Generate Zoom meeting link for video bookings
      let meetingLink: string | null = null;
      if (data.meetingType === "video") {
        try {
          const startISO = new Date(`${data.date}T${data.startTime}:00`).toISOString();
          const [sh, sm] = data.startTime.split(":").map(Number);
          const [eh, em] = data.endTime.split(":").map(Number);
          const durationMinutes = (eh * 60 + em) - (sh * 60 + sm);
          meetingLink = await createZoomMeeting({
            topic: `Meeting with ${data.clientName}`,
            startTime: startISO,
            durationMinutes,
          });
          console.log("Zoom meeting created:", meetingLink);
        } catch (zoomErr: any) {
          console.error("Zoom meeting creation failed:", zoomErr.message);
        }
      }

      const booking = await storage.createBooking({ ...data, meetingLink: meetingLink ?? undefined, status: "confirmed" });

      // Sync to SmartCalendar
      try {
        // Send date/time without UTC conversion so SmartMeetings shows the correct local date
        const startISO = `${data.date}T${data.startTime}:00`;
        const endISO = `${data.date}T${data.endTime}:00`;
        await syncToSmartCalendar({
          title: `Meeting with ${data.clientName}`,
          startTime: startISO,
          endTime: endISO,
          location: data.meetingType === "video" ? "Zoom" : "Phone Call",
          organizer: "Felix",
          meetingUrl: meetingLink || "",
          description: data.notes || "",
          clientName: data.clientName,
          clientEmail: data.clientEmail,
          clientPhone: data.clientPhone || "",
        });
      } catch (calErr: any) {
        console.error("SmartCalendar sync failed:", calErr.message);
      }

      // Send emails (admin notification + client confirmation)
      try {
        const { client: resend, fromEmail } = await getUncachableResendClient();
        const typeLabel = data.meetingType === "call" ? "Phone Call" : "Video Meeting";
        const location = data.meetingType === "video" ? (booking.meetingLink || "Zoom") : "Phone Call";
        const description = [
          `${typeLabel} with ${data.clientName}`,
          data.notes ? `Notes: ${data.notes}` : "",
          booking.meetingLink ? `Join: ${booking.meetingLink}` : "",
        ].filter(Boolean).join("\n");

        const SMART_CALENDAR_URL = "https://smartmeetings.felixconsult.co/admin/ark/felixdgreat";

        const icsContent = generateICS({
          uid: `booking-${booking.id}`,
          title: `${typeLabel} with ${data.clientName}`,
          description,
          date: data.date,
          startTime: data.startTime,
          endTime: data.endTime,
          location,
        });
        const icsAttachment = {
          filename: "meeting.ics",
          content: Buffer.from(icsContent).toString("base64"),
        };

        // Admin notification
        if (ADMIN_NOTIFICATION_EMAIL) {
          const adminResult = await resend.emails.send({
            from: fromEmail,
            to: ADMIN_NOTIFICATION_EMAIL,
            subject: `New Booking: ${data.clientName} — ${typeLabel}`,
            html: `
              <div style="font-family:sans-serif;max-width:520px;">
                <h2 style="color:#1d4ed8;">New Booking Confirmed</h2>
                <table style="border-collapse:collapse;font-size:15px;">
                  <tr><td style="padding:6px 16px 6px 0;color:#666">Name</td><td><strong>${data.clientName}</strong></td></tr>
                  <tr><td style="padding:6px 16px 6px 0;color:#666">Email</td><td>${data.clientEmail}</td></tr>
                  <tr><td style="padding:6px 16px 6px 0;color:#666">Phone</td><td>${data.clientPhone || "—"}</td></tr>
                  <tr><td style="padding:6px 16px 6px 0;color:#666">Type</td><td>${typeLabel}</td></tr>
                  <tr><td style="padding:6px 16px 6px 0;color:#666">Date</td><td>${data.date}</td></tr>
                  <tr><td style="padding:6px 16px 6px 0;color:#666">Time</td><td>${data.startTime} – ${data.endTime}</td></tr>
                  <tr><td style="padding:6px 16px 6px 0;color:#666">Notes</td><td>${data.notes || "—"}</td></tr>
                  <tr><td style="padding:6px 16px 6px 0;color:#666">Source</td><td>${data.source ? `<span style="background:#dbeafe;color:#1d4ed8;padding:2px 8px;border-radius:4px;font-size:13px;">${data.source}</span>` : "—"}</td></tr>
                  ${booking.meetingLink ? `<tr><td style="padding:6px 16px 6px 0;color:#666">Meeting Link</td><td><a href="${booking.meetingLink}">${booking.meetingLink}</a></td></tr>` : ""}
                </table>
                <div style="margin-top:24px;">
                  <a href="${SMART_CALENDAR_URL}" style="display:inline-block;background:#10b981;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">View in SmartMeetings Calendar</a>
                </div>
                <p style="margin-top:12px;color:#888;font-size:12px;">This booking has been automatically added to your SmartMeetings calendar and is visible on all your devices.</p>
              </div>
            `,
            attachments: [icsAttachment],
          });
          console.log("Admin email sent:", adminResult.data ? "OK" : adminResult.error?.message);
        }

        // Client confirmation
        const clientResult = await resend.emails.send({
          from: fromEmail,
          to: data.clientEmail,
          subject: `Booking Confirmed — ${typeLabel} on ${data.date}`,
          html: `
            <div style="font-family:sans-serif;max-width:480px;margin:0 auto;">
              <h2 style="color:#1d4ed8;">You're booked!</h2>
              <p>Hi ${data.clientName}, your appointment has been confirmed.</p>
              <table style="border-collapse:collapse;font-size:15px;width:100%;background:#f8fafc;border-radius:8px;padding:16px;">
                <tr><td style="padding:6px 16px 6px 0;color:#666">Type</td><td><strong>${typeLabel}</strong></td></tr>
                <tr><td style="padding:6px 16px 6px 0;color:#666">Date</td><td>${data.date}</td></tr>
                <tr><td style="padding:6px 16px 6px 0;color:#666">Time</td><td>${data.startTime} – ${data.endTime}</td></tr>
                ${booking.meetingLink ? `<tr><td style="padding:6px 16px 6px 0;color:#666">Meeting Link</td><td><a href="${booking.meetingLink}" style="color:#1d4ed8;">${booking.meetingLink}</a></td></tr>` : ""}
              </table>
              <div style="margin-top:20px;display:flex;gap:12px;flex-wrap:wrap;">
                ${booking.meetingLink ? `<a href="${booking.meetingLink}" style="display:inline-block;background:#1d4ed8;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">Join Video Meeting</a>` : ""}
                <a href="${SMART_CALENDAR_URL}" style="display:inline-block;background:#10b981;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">View in SmartMeetings</a>
              </div>
              <p style="color:#888;font-size:13px;margin-top:24px;">We'll reach out if anything changes.</p>
            </div>
          `,
          attachments: [icsAttachment],
        });
        console.log("Client confirmation email sent:", clientResult.data ? "OK" : clientResult.error?.message);
      } catch (emailErr: any) {
        console.error("Email notification failed:", emailErr.message);
      }

      res.status(201).json(booking);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: "Invalid booking data", errors: error.errors });
      throw error;
    }
  });

  app.patch("/api/bookings/:id/status", async (req, res) => {
    const adminId = await getAdminId(req);
    if (!adminId) return res.status(401).json({ message: "Unauthorized" });
    const { status } = req.body;
    try {
      const booking = await storage.updateBookingStatus(Number(req.params.id), status);
      res.json(booking);
    } catch (e: any) {
      res.status(404).json({ message: e.message });
    }
  });

  app.delete("/api/bookings/:id", async (req, res) => {
    const adminId = await getAdminId(req);
    if (!adminId) return res.status(401).json({ message: "Unauthorized" });
    await storage.deleteBooking(Number(req.params.id));
    res.status(204).end();
  });

  const httpServer = createServer(app);
  return httpServer;
}
