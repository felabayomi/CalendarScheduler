import { type User, type InsertUser, type Availability, type InsertAvailability, type Booking, type InsertBooking } from "@shared/schema";

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
}

export class MemStorage implements IStorage {
  private users: Map<number, User> = new Map();
  private availabilitySlots: Map<number, Availability> = new Map();
  private bookings: Map<number, Booking> = new Map();
  private currentUserId = 1;
  private currentAvailabilityId = 1;
  private currentBookingId = 1;

  constructor() {
    // Create default admin user
    const admin: User = {
      id: this.currentUserId++,
      username: "admin",
      password: "admin123",
      name: "Admin",
      email: "admin@example.com",
    };
    this.users.set(admin.id, admin);

    // Default availability: all 7 days, 24/7
    const defaultDays = [0, 1, 2, 3, 4, 5, 6]; // Sun-Sat
    for (const day of defaultDays) {
      const slot: Availability = {
        id: this.currentAvailabilityId++,
        userId: admin.id,
        dayOfWeek: day,
        startTime: "00:00",
        endTime: "24:00",
        slotDuration: 30,
        isActive: true,
      };
      this.availabilitySlots.set(slot.id, slot);
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
    const user: User = { ...data, id };
    this.users.set(id, user);
    return user;
  }

  async getAvailability(userId: number): Promise<Availability[]> {
    return Array.from(this.availabilitySlots.values()).filter(a => a.userId === userId);
  }

  async createAvailability(data: InsertAvailability): Promise<Availability> {
    const id = this.currentAvailabilityId++;
    const slot: Availability = { ...data, id };
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
}

export const storage = new MemStorage();
