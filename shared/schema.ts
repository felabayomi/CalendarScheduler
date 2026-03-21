import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  name: text("name").notNull(),
  email: text("email").notNull(),
});

export const availability = pgTable("availability", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  dayOfWeek: integer("day_of_week").notNull(), // 0=Sun, 1=Mon ... 6=Sat
  startTime: text("start_time").notNull(), // "HH:MM" format
  endTime: text("end_time").notNull(),     // "HH:MM" format
  slotDuration: integer("slot_duration").notNull().default(30), // minutes
  isActive: boolean("is_active").notNull().default(true),
});

export const bookings = pgTable("bookings", {
  id: serial("id").primaryKey(),
  clientName: text("client_name").notNull(),
  clientEmail: text("client_email").notNull(),
  clientPhone: text("client_phone"),
  meetingType: text("meeting_type").notNull(), // 'call' | 'video'
  date: text("date").notNull(), // "YYYY-MM-DD"
  startTime: text("start_time").notNull(), // "HH:MM"
  endTime: text("end_time").notNull(),     // "HH:MM"
  notes: text("notes"),
  source: text("source"), // tracks which site/embed the booking came from (?ref=)
  status: text("status").notNull().default("confirmed"), // 'confirmed' | 'cancelled'
  meetingLink: text("meeting_link"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  name: true,
  email: true,
});

export const insertAvailabilitySchema = createInsertSchema(availability).omit({ id: true });

export const insertBookingSchema = createInsertSchema(bookings).omit({ id: true, createdAt: true, meetingLink: true, status: true });

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertAvailability = z.infer<typeof insertAvailabilitySchema>;
export type Availability = typeof availability.$inferSelect;
export type InsertBooking = z.infer<typeof insertBookingSchema>;
export type Booking = typeof bookings.$inferSelect;
