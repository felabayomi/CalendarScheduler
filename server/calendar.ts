export function toICSDate(date: string, time: string): string {
  const dt = new Date(`${date}T${time === "24:00" ? "23:59" : time}:00`);
  return dt.toISOString().replace(/[-:]/g, "").replace(".000", "");
}

export function generateICS(params: {
  uid: string;
  title: string;
  description: string;
  date: string;
  startTime: string;
  endTime: string;
  location?: string;
}): string {
  const start = toICSDate(params.date, params.startTime);
  const end = toICSDate(params.date, params.endTime);
  const now = new Date().toISOString().replace(/[-:]/g, "").replace(".000", "");

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SmartMeetings//Felix Consult//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${params.uid}@smartmeetings.felixconsult.co`,
    `DTSTAMP:${now}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${params.title}`,
    `DESCRIPTION:${params.description.replace(/\n/g, "\\n")}`,
    `LOCATION:${params.location || ""}`,
    "STATUS:CONFIRMED",
    "SEQUENCE:0",
    "BEGIN:VALARM",
    "TRIGGER:-PT60M",
    "ACTION:DISPLAY",
    "DESCRIPTION:Reminder: Meeting in 1 hour",
    "END:VALARM",
    "BEGIN:VALARM",
    "TRIGGER:-PT15M",
    "ACTION:DISPLAY",
    "DESCRIPTION:Reminder: Meeting in 15 minutes",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

export function googleCalendarUrl(params: {
  title: string;
  description: string;
  date: string;
  startTime: string;
  endTime: string;
  location?: string;
}): string {
  const start = toICSDate(params.date, params.startTime);
  const end = toICSDate(params.date, params.endTime);
  const base = "https://calendar.google.com/calendar/render?action=TEMPLATE";
  return (
    base +
    `&text=${encodeURIComponent(params.title)}` +
    `&dates=${start}/${end}` +
    `&details=${encodeURIComponent(params.description)}` +
    `&location=${encodeURIComponent(params.location || "")}` +
    `&sf=true&output=xml`
  );
}
