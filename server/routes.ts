import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertAvailabilitySchema, insertBookingSchema } from "@shared/schema";
import { z } from "zod";
import { randomUUID } from "crypto";
import { getTwilioClient } from "./twilio";

// In-memory token store for admin sessions
const activeSessions = new Map<string, number>(); // token -> userId

// In-memory OTP store: phone -> { code, expiresAt, verified }
const otpStore = new Map<string, { code: string; expiresAt: number; verified: boolean }>();

function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function generateMeetingLink(): string {
  const id = randomUUID().split("-")[0];
  return `https://meet.jit.si/booking-${id}`;
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

function getAdminId(req: any): number | null {
  const auth = req.headers["authorization"];
  if (!auth || !auth.startsWith("Bearer ")) return null;
  const token = auth.slice(7);
  return activeSessions.get(token) ?? null;
}

export async function registerRoutes(app: Express): Promise<Server> {
  // ─── Auth ────────────────────────────────────────────────────────────────
  app.post("/api/auth/login", async (req, res) => {
    const { username, password } = req.body;
    const user = await storage.getUserByUsername(username);
    if (!user || user.password !== password) {
      return res.status(401).json({ message: "Invalid credentials" });
    }
    const token = randomUUID();
    activeSessions.set(token, user.id);
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, username: user.username } });
  });

  app.post("/api/auth/logout", (req, res) => {
    const auth = req.headers["authorization"];
    if (auth?.startsWith("Bearer ")) {
      activeSessions.delete(auth.slice(7));
    }
    res.json({ ok: true });
  });

  app.get("/api/auth/me", async (req, res) => {
    const userId = getAdminId(req);
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
    const adminId = getAdminId(req);
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
    const adminId = getAdminId(req);
    if (!adminId) return res.status(401).json({ message: "Unauthorized" });
    try {
      const slot = await storage.updateAvailability(Number(req.params.id), req.body);
      res.json(slot);
    } catch (e: any) {
      res.status(404).json({ message: e.message });
    }
  });

  app.delete("/api/availability/:id", async (req, res) => {
    const adminId = getAdminId(req);
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
    const adminId = getAdminId(req);
    if (!adminId) return res.status(401).json({ message: "Unauthorized" });
    const bookings = await storage.getAllBookings();
    res.json(bookings);
  });

  app.get("/api/bookings/date/:date", async (req, res) => {
    const adminId = getAdminId(req);
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

      const meetingLink = data.meetingType === "video" ? generateMeetingLink() : null;
      const booking = await storage.createBooking({ ...data, meetingLink: meetingLink ?? undefined, status: "confirmed" });

      // Notify admin via SMS
      try {
        const client = getTwilioClient();
        const typeLabel = data.meetingType === "call" ? "Phone Call" : "Video Meeting";
        await client.messages.create({
          body: `New booking!\n${data.clientName}\n${typeLabel}\n${data.date} at ${data.startTime}\n${data.clientPhone || data.clientEmail}`,
          from: process.env.TWILIO_PHONE_NUMBER,
          to: "+12406642270",
        });
      } catch (smsErr: any) {
        console.error("Admin SMS notification failed:", smsErr.message);
      }

      res.status(201).json(booking);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: "Invalid booking data", errors: error.errors });
      throw error;
    }
  });

  app.patch("/api/bookings/:id/status", async (req, res) => {
    const adminId = getAdminId(req);
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
    const adminId = getAdminId(req);
    if (!adminId) return res.status(401).json({ message: "Unauthorized" });
    await storage.deleteBooking(Number(req.params.id));
    res.status(204).end();
  });

  const httpServer = createServer(app);
  return httpServer;
}
