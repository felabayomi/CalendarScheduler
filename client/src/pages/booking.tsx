import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameDay, isToday, isPast, startOfDay } from "date-fns";
import { ChevronLeft, ChevronRight, Phone, Video, Clock, CheckCircle, Calendar, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Availability } from "@shared/schema";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function formatTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, "0")} ${period}`;
}

function addMinutes(time: string, mins: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + mins;
  const nh = Math.floor(total / 60) % 24;
  const nm = total % 60;
  return `${nh.toString().padStart(2, "0")}:${nm.toString().padStart(2, "0")}`;
}

export default function BookingPage() {
  const { toast } = useToast();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [meetingType, setMeetingType] = useState<"call" | "video">("video");
  const [step, setStep] = useState<"calendar" | "slots" | "form" | "done">("calendar");
  const [booking, setBooking] = useState<any>(null);
  const [form, setForm] = useState({ clientName: "", clientEmail: "", clientPhone: "", notes: "" });
  const [phoneError, setPhoneError] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [otpError, setOtpError] = useState("");
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);

  const { data: availability = [] } = useQuery<Availability[]>({
    queryKey: ["/api/availability"],
  });

  const activeDays = new Set(availability.filter(a => a.isActive).map(a => a.dayOfWeek));

  const dateStr = selectedDate ? format(selectedDate, "yyyy-MM-dd") : "";
  const { data: slots = [], isLoading: slotsLoading } = useQuery<string[]>({
    queryKey: ["/api/available-slots", dateStr],
    queryFn: () => fetch(`/api/available-slots?date=${dateStr}`).then(r => r.json()),
    enabled: !!dateStr,
  });

  const slotDuration = availability[0]?.slotDuration ?? 30;

  const createBookingMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/bookings", data),
    onSuccess: async (res) => {
      const data = await res.json();
      setBooking(data);
      setStep("done");
    },
    onError: async (err: any) => {
      const body = err.response ? await err.response.json().catch(() => ({})) : {};
      toast({ title: "Booking failed", description: body.message || "Please try again.", variant: "destructive" });
    },
  });

  const days = eachDayOfInterval({ start: startOfMonth(currentMonth), end: endOfMonth(currentMonth) });
  const firstDayOffset = getDay(startOfMonth(currentMonth));

  const handleDateClick = (day: Date) => {
    if (isPast(startOfDay(day)) && !isToday(day)) return;
    if (!activeDays.has(getDay(day))) return;
    setSelectedDate(day);
    setSelectedSlot(null);
    setStep("slots");
  };

  const handleSlotSelect = (slot: string) => {
    setSelectedSlot(slot);
    setStep("form");
  };

  const validatePhone = (phone: string): boolean => {
    const digits = phone.replace(/\D/g, "");
    return digits.length >= 10 && digits.length <= 15;
  };

  const handleSendOtp = async () => {
    if (!form.clientPhone.trim()) {
      setPhoneError("Please enter your phone number first.");
      return;
    }
    if (!validatePhone(form.clientPhone)) {
      setPhoneError("Please enter a valid phone number (e.g. +1 555 000 0000).");
      return;
    }
    setPhoneError("");
    setOtpError("");
    setOtpLoading(true);
    try {
      const res = await fetch("/api/verify/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: form.clientPhone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setOtpSent(true);
      toast({ title: "Code sent!", description: "Check your phone for the 6-digit verification code." });
    } catch (err: any) {
      setPhoneError(err.message || "Failed to send code. Please try again.");
    } finally {
      setOtpLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otpCode || otpCode.length < 6) {
      setOtpError("Please enter the 6-digit code.");
      return;
    }
    setOtpLoading(true);
    setOtpError("");
    try {
      const res = await fetch("/api/verify/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: form.clientPhone, code: otpCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setPhoneVerified(true);
      toast({ title: "Phone verified!", description: "Your number has been confirmed." });
    } catch (err: any) {
      setOtpError(err.message || "Verification failed. Please try again.");
    } finally {
      setOtpLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDate || !selectedSlot) return;

    if (meetingType === "call") {
      if (!form.clientPhone.trim()) {
        setPhoneError("Phone number is required for phone call bookings.");
        return;
      }
      if (!validatePhone(form.clientPhone)) {
        setPhoneError("Please enter a valid phone number (e.g. +1 555 000 0000).");
        return;
      }
      if (!phoneVerified) {
        setPhoneError("Please verify your phone number before confirming.");
        return;
      }
    } else if (form.clientPhone.trim() && !validatePhone(form.clientPhone)) {
      setPhoneError("Please enter a valid phone number (e.g. +1 555 000 0000).");
      return;
    }

    setPhoneError("");
    const endTime = addMinutes(selectedSlot, slotDuration);
    createBookingMutation.mutate({
      clientName: form.clientName,
      clientEmail: form.clientEmail,
      clientPhone: form.clientPhone || undefined,
      notes: form.notes,
      meetingType,
      date: format(selectedDate, "yyyy-MM-dd"),
      startTime: selectedSlot,
      endTime,
    });
  };

  if (step === "done" && booking) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full shadow-lg">
          <CardContent className="p-8 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">You're booked!</h2>
            <p className="text-gray-500 mb-6">Your appointment has been confirmed.</p>
            <div className="bg-gray-50 rounded-lg p-4 text-left space-y-3 mb-6">
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="w-4 h-4 text-blue-500" />
                <span className="font-medium">{format(new Date(booking.date + "T12:00:00"), "EEEE, MMMM d, yyyy")}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Clock className="w-4 h-4 text-blue-500" />
                <span>{formatTime(booking.startTime)} – {formatTime(booking.endTime)}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                {booking.meetingType === "video" ? <Video className="w-4 h-4 text-blue-500" /> : <Phone className="w-4 h-4 text-blue-500" />}
                <span className="capitalize">{booking.meetingType === "video" ? "Video Meeting" : "Phone Call"}</span>
              </div>
              {booking.meetingLink && (
                <div className="text-sm">
                  <p className="text-gray-500 mb-1">Meeting link:</p>
                  <a href={booking.meetingLink} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline break-all text-xs">{booking.meetingLink}</a>
                </div>
              )}
            </div>
            <p className="text-xs text-gray-400">A confirmation has been noted. We'll reach out if anything changes.</p>
            <Button className="mt-4 w-full" variant="outline" onClick={() => { setStep("calendar"); setSelectedDate(null); setSelectedSlot(null); setForm({ clientName: "", clientEmail: "", clientPhone: "", notes: "" }); }}>
              Book another
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Header */}
      <header className="bg-white border-b shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center">
              <Calendar className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-gray-900">Schedule a Meeting</h1>
              <p className="text-xs text-gray-500">Pick a time that works for you</p>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Steps indicator */}
        <div className="flex items-center gap-2 mb-8 text-sm">
          {["Pick a date", "Choose time", "Your details"].map((label, i) => {
            const stepNames = ["calendar", "slots", "form"];
            const active = stepNames.indexOf(step) >= i;
            return (
              <div key={i} className="flex items-center gap-2">
                {i > 0 && <div className={`h-px w-8 ${active ? "bg-blue-500" : "bg-gray-200"}`} />}
                <div className={`flex items-center gap-1.5 ${active ? "text-blue-600" : "text-gray-400"}`}>
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${active ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-500"}`}>{i + 1}</div>
                  <span className="hidden sm:inline">{label}</span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Calendar */}
          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">{MONTH_NAMES[currentMonth.getMonth()]} {currentMonth.getFullYear()}</CardTitle>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-7 mb-2">
                {DAY_NAMES.map(d => (
                  <div key={d} className="text-center text-xs font-medium text-gray-400 py-1">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: firstDayOffset }).map((_, i) => <div key={`empty-${i}`} />)}
                {days.map(day => {
                  const isSelected = selectedDate && isSameDay(day, selectedDate);
                  const isAvailable = activeDays.has(getDay(day)) && (!isPast(startOfDay(day)) || isToday(day));
                  const past = isPast(startOfDay(day)) && !isToday(day);
                  return (
                    <button
                      key={day.toString()}
                      onClick={() => handleDateClick(day)}
                      disabled={!isAvailable}
                      className={`
                        h-9 w-full rounded-lg text-sm font-medium transition-all
                        ${isSelected ? "bg-blue-600 text-white shadow-md" : ""}
                        ${!isSelected && isToday(day) ? "border-2 border-blue-300 text-blue-700" : ""}
                        ${!isSelected && isAvailable && !isToday(day) ? "hover:bg-blue-50 text-gray-700" : ""}
                        ${past || !isAvailable ? "text-gray-300 cursor-not-allowed" : "cursor-pointer"}
                      `}
                    >
                      {format(day, "d")}
                    </button>
                  );
                })}
              </div>
              <div className="mt-4 flex items-center gap-4 text-xs text-gray-500">
                <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-blue-600" /><span>Selected</span></div>
                <div className="flex items-center gap-1"><div className="w-3 h-3 rounded border-2 border-blue-300" /><span>Today</span></div>
                <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-gray-200" /><span>Unavailable</span></div>
              </div>
            </CardContent>
          </Card>

          {/* Right: Slots or Form */}
          <div>
            {step === "calendar" && (
              <Card className="shadow-sm h-full flex items-center justify-center">
                <CardContent className="text-center text-gray-400 py-16">
                  <Calendar className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p className="font-medium">Select a date to see available times</p>
                  <p className="text-sm mt-1">Available days are shown on the calendar</p>
                </CardContent>
              </Card>
            )}

            {step === "slots" && selectedDate && (
              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg">{format(selectedDate, "EEEE, MMMM d")}</CardTitle>
                  <CardDescription>Choose your meeting type and time</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="mb-5">
                    <p className="text-sm font-medium text-gray-700 mb-2">Meeting type</p>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => setMeetingType("video")}
                        className={`p-3 rounded-lg border-2 flex items-center gap-2 transition-all ${meetingType === "video" ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}
                      >
                        <Video className="w-4 h-4" />
                        <span className="text-sm font-medium">Video Meet</span>
                      </button>
                      <button
                        onClick={() => setMeetingType("call")}
                        className={`p-3 rounded-lg border-2 flex items-center gap-2 transition-all ${meetingType === "call" ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}
                      >
                        <Phone className="w-4 h-4" />
                        <span className="text-sm font-medium">Phone Call</span>
                      </button>
                    </div>
                  </div>

                  <p className="text-sm font-medium text-gray-700 mb-2">Available times ({slotDuration} min each)</p>
                  {slotsLoading ? (
                    <div className="grid grid-cols-3 gap-2">
                      {[...Array(9)].map((_, i) => <div key={i} className="h-10 bg-gray-100 rounded-lg animate-pulse" />)}
                    </div>
                  ) : slots.length === 0 ? (
                    <div className="text-center text-gray-400 py-8">
                      <Clock className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                      <p>No available slots on this day</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-2 max-h-64 overflow-y-auto pr-1">
                      {slots.map(slot => (
                        <button
                          key={slot}
                          onClick={() => handleSlotSelect(slot)}
                          className="py-2 px-3 rounded-lg border border-gray-200 text-sm font-medium hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700 transition-all"
                        >
                          {formatTime(slot)}
                        </button>
                      ))}
                    </div>
                  )}

                  <Button variant="ghost" className="mt-4 w-full text-gray-500" onClick={() => setStep("calendar")}>
                    ← Back to calendar
                  </Button>
                </CardContent>
              </Card>
            )}

            {step === "form" && selectedDate && selectedSlot && (
              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg">Your details</CardTitle>
                  <CardDescription>
                    {format(selectedDate, "EEEE, MMMM d")} at {formatTime(selectedSlot)} •{" "}
                    <Badge variant="secondary" className="ml-1">
                      {meetingType === "video" ? "Video Meet" : "Phone Call"}
                    </Badge>
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                      <Label>Full name *</Label>
                      <Input
                        required
                        placeholder="Your name"
                        value={form.clientName}
                        onChange={e => setForm(f => ({ ...f, clientName: e.target.value }))}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label>Email address *</Label>
                      <Input
                        required
                        type="email"
                        placeholder="you@example.com"
                        value={form.clientEmail}
                        onChange={e => setForm(f => ({ ...f, clientEmail: e.target.value }))}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label>
                        Phone number {meetingType === "call" ? <span className="text-red-500">*</span> : <span className="text-gray-400">(optional)</span>}
                      </Label>
                      <div className="flex gap-2 mt-1">
                        <Input
                          placeholder="+1 (555) 000-0000"
                          required={meetingType === "call"}
                          value={form.clientPhone}
                          disabled={phoneVerified}
                          onChange={e => {
                            setForm(f => ({ ...f, clientPhone: e.target.value }));
                            setPhoneError("");
                            setOtpSent(false);
                            setPhoneVerified(false);
                            setOtpCode("");
                          }}
                          className={`flex-1 ${phoneError ? "border-red-400 focus-visible:ring-red-400" : ""}`}
                        />
                        {meetingType === "call" && !phoneVerified && (
                          <Button
                            type="button"
                            variant="outline"
                            className="shrink-0 text-blue-600 border-blue-300 hover:bg-blue-50"
                            onClick={handleSendOtp}
                            disabled={otpLoading}
                          >
                            {otpLoading && !otpSent ? "Sending..." : otpSent ? "Resend" : "Send code"}
                          </Button>
                        )}
                        {phoneVerified && (
                          <div className="flex items-center gap-1 text-green-600 text-sm font-medium shrink-0">
                            <ShieldCheck className="w-4 h-4" /> Verified
                          </div>
                        )}
                      </div>
                      {phoneError && <p className="text-xs text-red-500 mt-1">{phoneError}</p>}
                      {meetingType === "call" && !phoneVerified && !phoneError && (
                        <p className="text-xs text-gray-400 mt-1">
                          {otpSent ? "Enter the 6-digit code sent to your phone." : "We'll send a verification code to confirm your number."}
                        </p>
                      )}

                      {meetingType === "call" && otpSent && !phoneVerified && (
                        <div className="mt-3 flex gap-2">
                          <Input
                            placeholder="Enter 6-digit code"
                            value={otpCode}
                            maxLength={6}
                            onChange={e => { setOtpCode(e.target.value.replace(/\D/g, "")); setOtpError(""); }}
                            className={`flex-1 tracking-widest text-center font-mono ${otpError ? "border-red-400" : ""}`}
                          />
                          <Button
                            type="button"
                            className="shrink-0 bg-blue-600 hover:bg-blue-700"
                            onClick={handleVerifyOtp}
                            disabled={otpLoading}
                          >
                            {otpLoading ? "Verifying..." : "Verify"}
                          </Button>
                        </div>
                      )}
                      {otpError && <p className="text-xs text-red-500 mt-1">{otpError}</p>}
                    </div>
                    <div>
                      <Label>Notes <span className="text-red-500">*</span></Label>
                      <Textarea
                        required
                        placeholder="What would you like to discuss? Please provide as much detail as possible."
                        value={form.notes}
                        onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                        className="mt-1 resize-none"
                        rows={3}
                      />
                    </div>
                    <div className="flex gap-2 pt-2">
                      <Button type="button" variant="outline" className="flex-1" onClick={() => setStep("slots")}>
                        ← Back
                      </Button>
                      <Button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700" disabled={createBookingMutation.isPending}>
                        {createBookingMutation.isPending ? "Booking..." : "Confirm booking"}
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
