const WEBHOOK_URL = "https://smartmeetings.felixconsult.co/api/webhook/booking";
const FALLBACK_URL = "https://smartmeetings.felixconsult.co/api/meetings";

export async function syncToSmartCalendar(params: {
  title: string;
  startTime: string;
  endTime: string;
  location: string;
  organizer: string;
  meetingUrl?: string;
  description?: string;
  clientName?: string;
  clientEmail?: string;
  clientPhone?: string;
}): Promise<void> {
  const apiKey = process.env.SMARTMEETINGS_API_KEY;

  // Try the new authenticated webhook first
  if (apiKey) {
    const res = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        title: params.title,
        startTime: params.startTime,
        endTime: params.endTime,
        location: params.location,
        organizer: params.organizer,
        meetingUrl: params.meetingUrl || "",
        notes: params.description || "",
        guestName: params.clientName || "",
        guestEmail: params.clientEmail || "",
        guestPhone: params.clientPhone || "",
      }),
    });

    if (res.ok) {
      const result = await res.json();
      console.log("Synced to SmartMeetings (webhook):", result?.id || "OK");
      return;
    }

    const err = await res.text();
    // If webhook not yet deployed, fall through to legacy endpoint
    if (!err.includes("Cannot POST")) {
      throw new Error(`SmartMeetings webhook failed: ${err}`);
    }
    console.warn("Webhook not live yet, falling back to legacy endpoint...");
  }

  // Fallback: legacy /api/meetings endpoint (no auth required)
  const res = await fetch(FALLBACK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: params.title,
      startTime: params.startTime,
      endTime: params.endTime,
      location: params.location,
      organizer: params.organizer,
      meetingUrl: params.meetingUrl || "",
      description: params.description || "",
      color: params.location === "Zoom" ? "#2D8CFF" : "#6366f1",
      reminderMinutes: 15,
      reminderMinutes2: 60,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`SmartMeetings sync failed: ${err}`);
  }

  const result = await res.json();
  console.log("Synced to SmartMeetings (legacy):", result?.id || "OK");
}
