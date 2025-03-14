import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertAppointmentSchema } from "@shared/schema";
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {
  app.get("/api/appointments", async (req, res) => {
    // For demo purposes, use a fixed user ID
    const userId = 1;
    const appointments = await storage.getAppointments(userId);
    res.json(appointments);
  });

  app.get("/api/appointments/:id", async (req, res) => {
    const appointment = await storage.getAppointment(Number(req.params.id));
    if (!appointment) {
      return res.status(404).json({ message: "Appointment not found" });
    }
    res.json(appointment);
  });

  app.post("/api/appointments", async (req, res) => {
    try {
      const userId = 1; // Fixed user ID for demo
      const data = insertAppointmentSchema.parse(req.body);
      const appointment = await storage.createAppointment(userId, data);
      res.status(201).json(appointment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid appointment data", errors: error.errors });
      }
      throw error;
    }
  });

  app.patch("/api/appointments/:id", async (req, res) => {
    try {
      const data = insertAppointmentSchema.partial().parse(req.body);
      const appointment = await storage.updateAppointment(Number(req.params.id), data);
      res.json(appointment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid appointment data", errors: error.errors });
      }
      throw error;
    }
  });

  app.delete("/api/appointments/:id", async (req, res) => {
    await storage.deleteAppointment(Number(req.params.id));
    res.status(204).end();
  });

  const httpServer = createServer(app);
  return httpServer;
}
