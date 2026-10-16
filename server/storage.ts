import bcrypt from "bcryptjs";
import { and, eq, gt, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import {
  adminSessions,
  appMetadata,
  availability,
  bookings,
  type Availability,
  type Booking,
  type InsertAvailability,
  type InsertBooking,
  type InsertUser,
  type User,
  users,
} from "@shared/schema";

const { Pool } = pg;

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  getAvailability(userId: number): Promise<Availability[]>;
  createAvailability(data: InsertAvailability): Promise<Availability>;
  updateAvailability(id: number, data: Partial<InsertAvailability>): Promise<Availability>;
  deleteAvailability(id: number): Promise<void>;

  getAllBookings(): Promise<Booking[]>;
  getBookingsByDate(date: string): Promise<Booking[]>;
  getBooking(id: number): Promise<Booking | undefined>;
  createBooking(data: InsertBooking & { meetingLink?: string; status?: string }): Promise<Booking>;
  updateBookingStatus(id: number, status: string): Promise<Booking>;
  deleteBooking(id: number): Promise<void>;

  validateAdminSession(token: string): Promise<number | null>;
  createAdminSession(userId: number, token: string, expiresAt: Date): Promise<void>;
  deleteAdminSession(token: string): Promise<void>;
}

function normalizeAdminValue(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : undefined;
}

function normalizePassword(password: string): string {
  return password.trim();
}

export class MemStorage implements IStorage {
  private users: Map<number, User> = new Map();
  private availabilitySlots: Map<number, Availability> = new Map();
  private bookings: Map<number, Booking> = new Map();
  private sessions: Map<string, { userId: number; expiresAt: Date }> = new Map();
  private currentUserId = 1;
  private currentAvailabilityId = 1;
  private currentBookingId = 1;

  constructor() {
    const username = normalizeAdminValue(process.env.ADMIN_USERNAME);
    const password = normalizeAdminValue(process.env.ADMIN_PASSWORD);

    if (username && password) {
      const admin: User = {
        id: this.currentUserId++,
        username,
        password: bcrypt.hashSync(password, 12),
        name: "Admin",
        email: "admin@example.com",
      };
      this.users.set(admin.id, admin);
    } else {
      console.warn("Admin credentials not configured. Set ADMIN_USERNAME and ADMIN_PASSWORD to enable the admin login.");
    }

    const defaultDays = [0, 1, 2, 3, 4, 5, 6];
    const adminUser = Array.from(this.users.values())[0];
    if (adminUser) {
      for (const day of defaultDays) {
        const slot: Availability = {
          id: this.currentAvailabilityId++,
          userId: adminUser.id,
          dayOfWeek: day,
          startTime: "00:00",
          endTime: "24:00",
          slotDuration: 30,
          isActive: true,
        };
        this.availabilitySlots.set(slot.id, slot);
      }
    }
  }

  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(u => u.username === username);
  }

  async createUser(data: InsertUser): Promise<User> {
    const id = this.currentUserId++;
    const user: User = { ...data, id, password: bcrypt.hashSync(normalizePassword(data.password), 12) };
    this.users.set(id, user);
    return user;
  }

  async getAvailability(userId: number): Promise<Availability[]> {
    return Array.from(this.availabilitySlots.values()).filter(a => a.userId === userId);
  }

  async createAvailability(data: InsertAvailability): Promise<Availability> {
    const id = this.currentAvailabilityId++;
    const slot: Availability = { ...data, id, slotDuration: data.slotDuration ?? 30, isActive: data.isActive ?? true };
    this.availabilitySlots.set(id, slot);
    return slot;
  }

  async updateAvailability(id: number, data: Partial<InsertAvailability>): Promise<Availability> {
    const existing = this.availabilitySlots.get(id);
    if (!existing) throw new Error("Availability not found");
    const updated = { ...existing, ...data };
    this.availabilitySlots.set(id, updated);
    return updated;
  }

  async deleteAvailability(id: number): Promise<void> {
    this.availabilitySlots.delete(id);
  }

  async getAllBookings(): Promise<Booking[]> {
    return Array.from(this.bookings.values()).sort(
      (a, b) => new Date(a.date + "T" + a.startTime).getTime() - new Date(b.date + "T" + b.startTime).getTime()
    );
  }

  async getBookingsByDate(date: string): Promise<Booking[]> {
    return Array.from(this.bookings.values()).filter(b => b.date === date);
  }

  async getBooking(id: number): Promise<Booking | undefined> {
    return this.bookings.get(id);
  }

  async createBooking(data: InsertBooking & { meetingLink?: string; status?: string }): Promise<Booking> {
    const id = this.currentBookingId++;
    const booking: Booking = {
      ...data,
      id,
      clientPhone: data.clientPhone ?? null,
      notes: data.notes ?? null,
      source: data.source ?? null,
      meetingLink: data.meetingLink ?? null,
      status: data.status ?? "confirmed",
      createdAt: new Date(),
    };
    this.bookings.set(id, booking);
    return booking;
  }

  async updateBookingStatus(id: number, status: string): Promise<Booking> {
    const existing = this.bookings.get(id);
    if (!existing) throw new Error("Booking not found");
    const updated = { ...existing, status };
    this.bookings.set(id, updated);
    return updated;
  }

  async deleteBooking(id: number): Promise<void> {
    this.bookings.delete(id);
  }

  async validateAdminSession(token: string): Promise<number | null> {
    const session = this.sessions.get(token);
    if (!session) return null;
    if (session.expiresAt.getTime() <= Date.now()) {
      this.sessions.delete(token);
      return null;
    }
    return session.userId;
  }

  async createAdminSession(userId: number, token: string, expiresAt: Date): Promise<void> {
    this.sessions.set(token, { userId, expiresAt });
  }

  async deleteAdminSession(token: string): Promise<void> {
    this.sessions.delete(token);
  }
}

export class PostgresStorage implements IStorage {
  private db: ReturnType<typeof drizzle>;
  private defaultAdminChecked = false;
  private initialized = false;
  private initializationPromise: Promise<void> | null = null;

  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is required to use PostgresStorage");
    }

    const pool = new Pool({
      connectionString,
      ssl: {
        rejectUnauthorized: true,
      },
    });

    this.db = drizzle(pool, {
      schema: { users, availability, bookings, adminSessions, appMetadata },
    });
  }

  private async initialize(): Promise<void> {
    if (this.initialized) return;
    if (!this.initializationPromise) {
      this.initializationPromise = this.runInitialization();
    }
    await this.initializationPromise;
  }

  private async runInitialization(): Promise<void> {
    try {
      await this.db.execute(sql`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          username TEXT NOT NULL UNIQUE,
          password TEXT NOT NULL,
          name TEXT NOT NULL,
          email TEXT NOT NULL
        );
      `);

      await this.db.execute(sql`
        CREATE TABLE IF NOT EXISTS availability (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id),
          day_of_week INTEGER NOT NULL,
          start_time TEXT NOT NULL,
          end_time TEXT NOT NULL,
          slot_duration INTEGER NOT NULL DEFAULT 30,
          is_active BOOLEAN NOT NULL DEFAULT true
        );
      `);

      await this.db.execute(sql`
        CREATE UNIQUE INDEX IF NOT EXISTS availability_user_day_unique
        ON availability (user_id, day_of_week);
      `);

      await this.db.execute(sql`
        CREATE TABLE IF NOT EXISTS bookings (
          id SERIAL PRIMARY KEY,
          client_name TEXT NOT NULL,
          client_email TEXT NOT NULL,
          client_phone TEXT,
          meeting_type TEXT NOT NULL,
          date TEXT NOT NULL,
          start_time TEXT NOT NULL,
          end_time TEXT NOT NULL,
          notes TEXT,
          source TEXT,
          status TEXT NOT NULL DEFAULT 'confirmed',
          meeting_link TEXT,
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        );
      `);

      await this.db.execute(sql`
        CREATE TABLE IF NOT EXISTS admin_sessions (
          id SERIAL PRIMARY KEY,
          token TEXT NOT NULL UNIQUE,
          user_id INTEGER NOT NULL REFERENCES users(id),
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          expires_at TIMESTAMP NOT NULL
        );
      `);

      await this.db.execute(sql`
        CREATE TABLE IF NOT EXISTS app_metadata (
          id SERIAL PRIMARY KEY,
          key TEXT NOT NULL UNIQUE,
          value TEXT NOT NULL,
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        );
      `);

      await this.ensureDefaultAdmin();
      this.initialized = true;
    } catch (error) {
      this.initialized = false;
      throw error;
    } finally {
      this.initializationPromise = null;
    }
  }

  private async readAppMetadata(key: string): Promise<string | null> {
    const rows = await this.db.select().from(appMetadata).where(eq(appMetadata.key, key)).limit(1);
    return rows[0]?.value ?? null;
  }

  private async writeAppMetadata(key: string, value: string): Promise<void> {
    await this.db.insert(appMetadata).values({ key, value }).onConflictDoUpdate({
      target: appMetadata.key,
      set: {
        value,
        updatedAt: new Date(),
      },
    });
  }

  private async ensureDefaultAdmin(): Promise<void> {
    const username = normalizeAdminValue(process.env.ADMIN_USERNAME);
    const password = normalizeAdminValue(process.env.ADMIN_PASSWORD);
    if (!username || !password) {
      console.warn("ADMIN_USERNAME and ADMIN_PASSWORD are not configured; admin login will remain unavailable until they are set.");
      return;
    }

    let adminUser = (await this.db.select().from(users).where(eq(users.username, username)).limit(1))[0];

    if (!adminUser) {
      try {
        const created = await this.db.insert(users).values({
          username,
          password: bcrypt.hashSync(normalizePassword(password), 12),
          name: "Admin",
          email: "admin@example.com",
        }).returning();
        adminUser = created[0];
      } catch (error: any) {
        const message = String(error?.message ?? error);
        if (!/duplicate|unique|already exists/i.test(message)) throw error;
        const recovered = await this.db.select().from(users).where(eq(users.username, username)).limit(1);
        adminUser = recovered[0];
        if (!adminUser) throw error;
      }
    }

    if (!adminUser) {
      throw new Error(`Default admin user could not be resolved for username: ${username}`);
    }

    this.defaultAdminChecked = true;
    await this.ensureWeeklyAvailability(adminUser.id);
    await this.writeAppMetadata("default_admin_seeded", username);
  }

  private async ensureWeeklyAvailability(userId: number): Promise<void> {
    if (!userId) return;
    const seededValue = await this.readAppMetadata("default_availability_seeded");
    if (seededValue === `user:${userId}`) {
      return;
    }

    const currentAvailability = await this.db.select().from(availability).where(eq(availability.userId, userId));
    if (currentAvailability.length > 0) {
      await this.writeAppMetadata("default_availability_seeded", `user:${userId}`);
      return;
    }

    const defaultDays = [0, 1, 2, 3, 4, 5, 6];
    await this.db.insert(availability).values(
      defaultDays.map(dayOfWeek => ({
        userId,
        dayOfWeek,
        startTime: "00:00",
        endTime: "24:00",
        slotDuration: 30,
        isActive: true,
      }))
    ).onConflictDoNothing({
      target: [availability.userId, availability.dayOfWeek],
    });

    await this.writeAppMetadata("default_availability_seeded", `user:${userId}`);
  }

  async getUser(id: number): Promise<User | undefined> {
    await this.initialize();
    const rows = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    return rows[0] ?? undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    await this.initialize();
    const rows = await this.db.select().from(users).where(eq(users.username, username)).limit(1);
    return rows[0] ?? undefined;
  }

  async createUser(data: InsertUser): Promise<User> {
    await this.initialize();
    const hashedPassword = bcrypt.hashSync(normalizePassword(data.password), 12);
    const rows = await this.db.insert(users).values({
      ...data,
      password: hashedPassword,
    }).returning();
    return rows[0];
  }

  async getAvailability(userId: number): Promise<Availability[]> {
    await this.initialize();
    return this.db.select().from(availability).where(eq(availability.userId, userId)).orderBy(sql`${availability.dayOfWeek} ASC`);
  }

  async createAvailability(data: InsertAvailability): Promise<Availability> {
    await this.initialize();
    const rows = await this.db.insert(availability).values(data).returning();
    return rows[0];
  }

  async updateAvailability(id: number, data: Partial<InsertAvailability>): Promise<Availability> {
    await this.initialize();
    const rows = await this.db.update(availability).set(data).where(eq(availability.id, id)).returning();
    if (!rows[0]) throw new Error("Availability not found");
    return rows[0];
  }

  async deleteAvailability(id: number): Promise<void> {
    await this.initialize();
    await this.db.delete(availability).where(eq(availability.id, id));
  }

  async getAllBookings(): Promise<Booking[]> {
    await this.initialize();
    return this.db.select().from(bookings).orderBy(sql`${bookings.date} ASC`, sql`${bookings.startTime} ASC`);
  }

  async getBookingsByDate(date: string): Promise<Booking[]> {
    await this.initialize();
    return this.db.select().from(bookings).where(eq(bookings.date, date));
  }

  async getBooking(id: number): Promise<Booking | undefined> {
    await this.initialize();
    const rows = await this.db.select().from(bookings).where(eq(bookings.id, id)).limit(1);
    return rows[0] ?? undefined;
  }

  async createBooking(data: InsertBooking & { meetingLink?: string; status?: string }): Promise<Booking> {
    await this.initialize();
    const rows = await this.db.insert(bookings).values({
      ...data,
      status: data.status ?? "confirmed",
      meetingLink: data.meetingLink ?? null,
      clientPhone: data.clientPhone ?? null,
      notes: data.notes ?? null,
      source: data.source ?? null,
    }).returning();
    return rows[0];
  }

  async updateBookingStatus(id: number, status: string): Promise<Booking> {
    await this.initialize();
    const rows = await this.db.update(bookings).set({ status }).where(eq(bookings.id, id)).returning();
    if (!rows[0]) throw new Error("Booking not found");
    return rows[0];
  }

  async deleteBooking(id: number): Promise<void> {
    await this.initialize();
    await this.db.delete(bookings).where(eq(bookings.id, id));
  }

  async validateAdminSession(token: string): Promise<number | null> {
    await this.initialize();
    const rows = await this.db.select().from(adminSessions).where(and(
      eq(adminSessions.token, token),
      gt(adminSessions.expiresAt, new Date()),
    )).limit(1);
    return rows[0]?.userId ?? null;
  }

  async createAdminSession(userId: number, token: string, expiresAt: Date): Promise<void> {
    await this.initialize();
    await this.db.insert(adminSessions).values({
      userId,
      token,
      expiresAt,
    });
  }

  async deleteAdminSession(token: string): Promise<void> {
    await this.initialize();
    await this.db.delete(adminSessions).where(eq(adminSessions.token, token));
  }
}

export const storage = process.env.DATABASE_URL ? new PostgresStorage() : new MemStorage();
