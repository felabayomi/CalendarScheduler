import { users, type User, type InsertUser, appointments, type Appointment, type InsertAppointment } from "@shared/schema";

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Appointment methods
  getAppointments(userId: number): Promise<Appointment[]>;
  getAppointment(id: number): Promise<Appointment | undefined>;
  createAppointment(userId: number, appointment: InsertAppointment): Promise<Appointment>;
  updateAppointment(id: number, appointment: Partial<InsertAppointment>): Promise<Appointment>;
  deleteAppointment(id: number): Promise<void>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private appointments: Map<number, Appointment>;
  private currentUserId: number;
  private currentAppointmentId: number;

  constructor() {
    this.users = new Map();
    this.appointments = new Map();
    this.currentUserId = 1;
    this.currentAppointmentId = 1;
  }

  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentUserId++;
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  async getAppointments(userId: number): Promise<Appointment[]> {
    return Array.from(this.appointments.values()).filter(
      (appointment) => appointment.userId === userId
    );
  }

  async getAppointment(id: number): Promise<Appointment | undefined> {
    return this.appointments.get(id);
  }

  async createAppointment(userId: number, insertAppointment: InsertAppointment): Promise<Appointment> {
    const id = this.currentAppointmentId++;
    const appointment: Appointment = { ...insertAppointment, id, userId };
    this.appointments.set(id, appointment);
    return appointment;
  }

  async updateAppointment(id: number, updateData: Partial<InsertAppointment>): Promise<Appointment> {
    const existing = this.appointments.get(id);
    if (!existing) {
      throw new Error("Appointment not found");
    }
    
    const updated: Appointment = {
      ...existing,
      ...updateData,
    };
    this.appointments.set(id, updated);
    return updated;
  }

  async deleteAppointment(id: number): Promise<void> {
    if (!this.appointments.has(id)) {
      throw new Error("Appointment not found");
    }
    this.appointments.delete(id);
  }
}

export const storage = new MemStorage();
