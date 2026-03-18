import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, parseISO, isToday, isFuture, startOfDay } from "date-fns";
import { Calendar, Phone, Video, Clock, Users, CheckCircle, XCircle, Trash2, Settings, LogOut, Plus, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/auth";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import type { Booking, Availability } from "@shared/schema";

const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const TIME_OPTIONS: string[] = [];
for (let h = 6; h <= 22; h++) {
  TIME_OPTIONS.push(`${h.toString().padStart(2, "0")}:00`);
  TIME_OPTIONS.push(`${h.toString().padStart(2, "0")}:30`);
}

function formatTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, "0")} ${period}`;
}

function getAuthHeader(token: string | null) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function AdminDashboard() {
  const { user, token, logout } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const prevBookingCount = useRef<number | null>(null);

  const fetchWithAuth = (url: string) =>
    fetch(url, { headers: getAuthHeader(token) }).then(r => r.json());

  const { data: bookings = [], isLoading: bookingsLoading } = useQuery<Booking[]>({
    queryKey: ["/api/bookings"],
    queryFn: () => fetchWithAuth("/api/bookings"),
    refetchInterval: 20000,
  });

  useEffect(() => {
    if (prevBookingCount.current === null) {
      prevBookingCount.current = bookings.length;
      return;
    }
    if (bookings.length > prevBookingCount.current) {
      const newest = bookings[bookings.length - 1];
      toast({
        title: "New booking!",
        description: newest
          ? `${newest.clientName} — ${newest.meetingType === "call" ? "Phone Call" : "Video Meeting"} on ${newest.date} at ${newest.startTime}`
          : "A new appointment has been booked.",
        duration: 8000,
      });
    }
    prevBookingCount.current = bookings.length;
  }, [bookings.length]);

  const { data: availability = [], isLoading: availabilityLoading } = useQuery<Availability[]>({
    queryKey: ["/api/availability"],
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      fetch(`/api/bookings/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAuthHeader(token) },
        body: JSON.stringify({ status }),
      }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/bookings"] });
      toast({ title: "Booking updated" });
    },
  });

  const deleteBookingMutation = useMutation({
    mutationFn: (id: number) =>
      fetch(`/api/bookings/${id}`, { method: "DELETE", headers: getAuthHeader(token) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/bookings"] });
      toast({ title: "Booking deleted" });
    },
  });

  const addAvailabilityMutation = useMutation({
    mutationFn: (data: any) =>
      fetch("/api/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader(token) },
        body: JSON.stringify(data),
      }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/availability"] });
      toast({ title: "Availability added" });
    },
  });

  const toggleAvailabilityMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      fetch(`/api/availability/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAuthHeader(token) },
        body: JSON.stringify({ isActive }),
      }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/availability"] }),
  });

  const deleteAvailabilityMutation = useMutation({
    mutationFn: (id: number) =>
      fetch(`/api/availability/${id}`, { method: "DELETE", headers: getAuthHeader(token) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/availability"] });
      toast({ title: "Schedule removed" });
    },
  });

  const handleLogout = () => {
    logout();
    navigate("/admin/login");
  };

  const upcoming = bookings.filter(b => b.status === "confirmed" && (isToday(parseISO(b.date)) || isFuture(parseISO(b.date + "T" + b.startTime))));
  const past = bookings.filter(b => !isFuture(parseISO(b.date + "T" + b.startTime)) && !isToday(parseISO(b.date)));
  const cancelled = bookings.filter(b => b.status === "cancelled");

  // Add availability form state
  const [newSlot, setNewSlot] = useState({ dayOfWeek: "1", startTime: "09:00", endTime: "17:00", slotDuration: "30" });

  const handleAddAvailability = () => {
    addAvailabilityMutation.mutate({
      userId: 1,
      dayOfWeek: parseInt(newSlot.dayOfWeek),
      startTime: newSlot.startTime,
      endTime: newSlot.endTime,
      slotDuration: parseInt(newSlot.slotDuration),
      isActive: true,
    });
  };

  const grouped = availability.reduce<Record<number, Availability[]>>((acc, a) => {
    if (!acc[a.dayOfWeek]) acc[a.dayOfWeek] = [];
    acc[a.dayOfWeek].push(a);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b shadow-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center">
              <Calendar className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-gray-900">Booking Admin</h1>
              <p className="text-xs text-gray-500">Welcome back, {user?.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a href="/" target="_blank" rel="noreferrer">
              <Button variant="outline" size="sm">View booking page</Button>
            </a>
            <Button variant="ghost" size="sm" onClick={handleLogout} className="text-gray-500">
              <LogOut className="w-4 h-4 mr-1" /> Sign out
            </Button>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: "Upcoming", value: upcoming.length, icon: Clock, color: "text-blue-600", bg: "bg-blue-50" },
            { label: "Total Bookings", value: bookings.filter(b => b.status === "confirmed").length, icon: CheckCircle, color: "text-green-600", bg: "bg-green-50" },
            { label: "Cancelled", value: cancelled.length, icon: XCircle, color: "text-red-500", bg: "bg-red-50" },
            { label: "Clients", value: new Set(bookings.map(b => b.clientEmail)).size, icon: Users, color: "text-purple-600", bg: "bg-purple-50" },
          ].map(stat => (
            <Card key={stat.label} className="shadow-sm">
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`w-10 h-10 ${stat.bg} rounded-lg flex items-center justify-center`}>
                  <stat.icon className={`w-5 h-5 ${stat.color}`} />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                  <p className="text-xs text-gray-500">{stat.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Tabs */}
        <Tabs defaultValue="bookings">
          <TabsList className="mb-6">
            <TabsTrigger value="bookings">Bookings</TabsTrigger>
            <TabsTrigger value="availability">Availability</TabsTrigger>
          </TabsList>

          {/* ─── Bookings Tab ─── */}
          <TabsContent value="bookings">
            <div className="space-y-6">
              <BookingSection
                title="Upcoming"
                bookings={upcoming}
                isLoading={bookingsLoading}
                onCancel={id => updateStatusMutation.mutate({ id, status: "cancelled" })}
                onDelete={id => deleteBookingMutation.mutate(id)}
                onRestore={id => updateStatusMutation.mutate({ id, status: "confirmed" })}
                emptyText="No upcoming bookings"
              />
              <BookingSection
                title="Past"
                bookings={past.filter(b => b.status === "confirmed")}
                isLoading={bookingsLoading}
                onCancel={id => updateStatusMutation.mutate({ id, status: "cancelled" })}
                onDelete={id => deleteBookingMutation.mutate(id)}
                onRestore={id => updateStatusMutation.mutate({ id, status: "confirmed" })}
                emptyText="No past bookings"
                collapsible
              />
              <BookingSection
                title="Cancelled"
                bookings={cancelled}
                isLoading={bookingsLoading}
                onCancel={id => updateStatusMutation.mutate({ id, status: "cancelled" })}
                onDelete={id => deleteBookingMutation.mutate(id)}
                onRestore={id => updateStatusMutation.mutate({ id, status: "confirmed" })}
                emptyText="No cancelled bookings"
                collapsible
              />
            </div>
          </TabsContent>

          {/* ─── Availability Tab ─── */}
          <TabsContent value="availability">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Add Schedule */}
              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Plus className="w-4 h-4" /> Add Availability</CardTitle>
                  <CardDescription>Set the days and hours you're available for bookings</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label>Day of week</Label>
                    <Select value={newSlot.dayOfWeek} onValueChange={v => setNewSlot(s => ({ ...s, dayOfWeek: v }))}>
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DAY_LABELS.map((d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Start time</Label>
                      <Select value={newSlot.startTime} onValueChange={v => setNewSlot(s => ({ ...s, startTime: v }))}>
                        <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>{TIME_OPTIONS.map(t => <SelectItem key={t} value={t}>{formatTime(t)}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>End time</Label>
                      <Select value={newSlot.endTime} onValueChange={v => setNewSlot(s => ({ ...s, endTime: v }))}>
                        <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>{TIME_OPTIONS.map(t => <SelectItem key={t} value={t}>{formatTime(t)}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div>
                    <Label>Slot duration</Label>
                    <Select value={newSlot.slotDuration} onValueChange={v => setNewSlot(s => ({ ...s, slotDuration: v }))}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="15">15 minutes</SelectItem>
                        <SelectItem value="30">30 minutes</SelectItem>
                        <SelectItem value="45">45 minutes</SelectItem>
                        <SelectItem value="60">60 minutes</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={handleAddAvailability} disabled={addAvailabilityMutation.isPending} className="w-full bg-blue-600 hover:bg-blue-700">
                    {addAvailabilityMutation.isPending ? "Adding..." : "Add schedule"}
                  </Button>
                </CardContent>
              </Card>

              {/* Current Schedule */}
              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Settings className="w-4 h-4" /> Current Schedule</CardTitle>
                  <CardDescription>Toggle or remove your availability windows</CardDescription>
                </CardHeader>
                <CardContent>
                  {availabilityLoading ? (
                    <div className="space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />)}</div>
                  ) : availability.length === 0 ? (
                    <p className="text-center text-gray-400 py-8">No availability set yet</p>
                  ) : (
                    <div className="space-y-2">
                      {[0, 1, 2, 3, 4, 5, 6].map(day => {
                        const slots = grouped[day] || [];
                        if (!slots.length) return null;
                        return (
                          <div key={day}>
                            <p className="text-xs font-semibold text-gray-500 uppercase mb-1">{DAY_LABELS[day]}</p>
                            {slots.map(slot => (
                              <div key={slot.id} className="flex items-center justify-between p-3 rounded-lg border bg-white mb-1">
                                <div className="flex items-center gap-3">
                                  <Switch
                                    checked={slot.isActive}
                                    onCheckedChange={v => toggleAvailabilityMutation.mutate({ id: slot.id, isActive: v })}
                                  />
                                  <div>
                                    <p className="text-sm font-medium">{formatTime(slot.startTime)} – {formatTime(slot.endTime)}</p>
                                    <p className="text-xs text-gray-400">{slot.slotDuration} min slots</p>
                                  </div>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50"
                                  onClick={() => deleteAvailabilityMutation.mutate(slot.id)}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function BookingSection({ title, bookings, isLoading, onCancel, onDelete, onRestore, emptyText, collapsible }: {
  title: string;
  bookings: Booking[];
  isLoading: boolean;
  onCancel: (id: number) => void;
  onDelete: (id: number) => void;
  onRestore: (id: number) => void;
  emptyText: string;
  collapsible?: boolean;
}) {
  const [open, setOpen] = useState(!collapsible);

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            {title}
            <Badge variant="secondary">{bookings.length}</Badge>
          </CardTitle>
          {collapsible && (
            <Button variant="ghost" size="sm" onClick={() => setOpen(o => !o)}>
              {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
          )}
        </div>
      </CardHeader>
      {open && (
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse" />)}</div>
          ) : bookings.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">{emptyText}</p>
          ) : (
            <div className="space-y-2">
              {bookings.map(b => (
                <div key={b.id} className={`p-4 rounded-lg border flex items-start justify-between gap-4 ${b.status === "cancelled" ? "bg-gray-50 opacity-70" : "bg-white"}`}>
                  <div className="flex items-start gap-3 min-w-0">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${b.meetingType === "video" ? "bg-purple-100" : "bg-blue-100"}`}>
                      {b.meetingType === "video" ? <Video className="w-4 h-4 text-purple-600" /> : <Phone className="w-4 h-4 text-blue-600" />}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 truncate">{b.clientName}</p>
                      <p className="text-xs text-gray-500 truncate">{b.clientEmail}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant={b.status === "confirmed" ? "default" : "destructive"} className="text-xs">{b.status}</Badge>
                        <span className="text-xs text-gray-500">
                          {format(parseISO(b.date + "T12:00:00"), "MMM d, yyyy")} • {formatTime(b.startTime)}–{formatTime(b.endTime)}
                        </span>
                      </div>
                      {b.meetingLink && (
                        <a href={b.meetingLink} target="_blank" rel="noreferrer" className="text-xs text-blue-500 hover:underline mt-1 block">
                          Join video meeting →
                        </a>
                      )}
                      {b.notes && <p className="text-xs text-gray-400 mt-1 italic">"{b.notes}"</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {b.status === "confirmed" && (
                      <Button size="sm" variant="outline" className="text-xs h-7 text-orange-600 hover:bg-orange-50 border-orange-200" onClick={() => onCancel(b.id)}>
                        Cancel
                      </Button>
                    )}
                    {b.status === "cancelled" && (
                      <Button size="sm" variant="outline" className="text-xs h-7 text-green-600 hover:bg-green-50 border-green-200" onClick={() => onRestore(b.id)}>
                        Restore
                      </Button>
                    )}
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50" onClick={() => onDelete(b.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
