import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { type Appointment } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { Link } from "wouter";

export default function CalendarView() {
  const [date, setDate] = useState<Date>(new Date());
  const { toast } = useToast();
  
  const { data: appointments, isLoading } = useQuery<Appointment[]>({
    queryKey: ['/api/appointments'],
    onError: () => {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load appointments",
      });
    },
  });

  const appointmentDates = appointments?.reduce((acc, appointment) => {
    const date = new Date(appointment.startTime);
    const key = format(date, 'yyyy-MM-dd');
    acc[key] = true;
    return acc;
  }, {} as Record<string, boolean>);

  return (
    <div className="container mx-auto py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Calendar</h1>
        <Link href="/appointments">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Appointment
          </Button>
        </Link>
      </div>
      
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Calendar</CardTitle>
          </CardHeader>
          <CardContent>
            <Calendar
              mode="single"
              selected={date}
              onSelect={(date) => date && setDate(date)}
              className="rounded-md border"
              modifiers={{
                hasAppointment: (date) => 
                  appointmentDates?.[format(date, 'yyyy-MM-dd')] ?? false
              }}
              modifiersStyles={{
                hasAppointment: {
                  backgroundColor: "hsl(var(--primary))",
                  color: "white"
                }
              }}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              Appointments for {format(date, 'MMMM d, yyyy')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div>Loading...</div>
            ) : (
              <div className="space-y-4">
                {appointments
                  ?.filter(apt => 
                    format(new Date(apt.startTime), 'yyyy-MM-dd') === 
                    format(date, 'yyyy-MM-dd')
                  )
                  .map(appointment => (
                    <div 
                      key={appointment.id}
                      className="p-4 rounded-lg border"
                    >
                      <h3 className="font-medium">{appointment.title}</h3>
                      <p className="text-sm text-muted-foreground">
                        {format(new Date(appointment.startTime), 'h:mm a')} - 
                        {format(new Date(appointment.endTime), 'h:mm a')}
                      </p>
                      {appointment.description && (
                        <p className="mt-2 text-sm">{appointment.description}</p>
                      )}
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
