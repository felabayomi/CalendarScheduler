const CALENDAR_API = "https://smartmeetings.felixconsult.co/api/meetings";

export async function syncToSmartCalendar(params: {
  title: string;
  startTime: string; // ISO 8601 UTC
  endTime: string;   // ISO 8601 UTC
  location: string;
  organizer: string;
  meetingUrl?: string;
  description?: string;
}): Promise<void> {
  const res = await fetch(CALENDAR_API, {
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
    throw new Error(`Smart calendar sync failed: ${err}`);
  }

  const result = await res.json();
  console.log("Synced to SmartCalendar:", result?.id || "OK");
}
