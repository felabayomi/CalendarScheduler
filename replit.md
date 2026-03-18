# Booking System App

A fully functional booking system for calls and video meetings with separate client-facing and admin interfaces.

## Architecture

**Stack:** React + Express.js + TypeScript + Tailwind CSS + Shadcn UI

### Frontend Pages
- `/` — Client booking page (public): 3-step flow: pick date → pick time slot → enter details → confirmation
- `/admin/login` — Admin login page
- `/admin` — Admin dashboard (protected): manage bookings and availability

### Backend API
- `POST /api/auth/login` — Admin login, returns session token
- `POST /api/auth/logout` — Invalidate session
- `GET /api/auth/me` — Get current admin user
- `GET /api/availability` — Get admin's weekly availability (public)
- `POST /api/availability` — Add availability slot (admin)
- `PATCH /api/availability/:id` — Toggle/update availability (admin)
- `DELETE /api/availability/:id` — Remove availability slot (admin)
- `GET /api/available-slots?date=YYYY-MM-DD` — Get open booking slots for a date (public)
- `GET /api/bookings` — Get all bookings (admin)
- `POST /api/bookings` — Create a booking (public)
- `PATCH /api/bookings/:id/status` — Update booking status (admin)
- `DELETE /api/bookings/:id` — Delete a booking (admin)

## Key Files
- `shared/schema.ts` — Data models: users, availability, bookings
- `server/storage.ts` — In-memory storage with MemStorage class
- `server/routes.ts` — All API routes with token-based auth
- `client/src/contexts/auth.tsx` — Auth context with token management
- `client/src/pages/booking.tsx` — Client booking page
- `client/src/pages/admin/login.tsx` — Admin login
- `client/src/pages/admin/dashboard.tsx` — Admin dashboard

## Default Admin Credentials
- Username: `admin`
- Password: `admin123`

## Features
- Weekly availability schedule (day of week + time range + slot duration)
- Auto-generated Jitsi video meet links for video bookings
- Conflict detection — can't double-book a slot
- Admin can cancel, restore, or delete bookings
- Stats overview: upcoming, total, cancelled, unique clients
- Collapsible booking sections (past, cancelled)

## Storage
Uses in-memory storage (MemStorage) — data resets on server restart. No database configured.
