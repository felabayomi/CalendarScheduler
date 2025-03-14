import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { apiRequest } from "@/lib/queryClient";
import { insertAppointmentSchema, type InsertAppointment } from "@shared/schema";
import { useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";

export default function NewAppointment() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<InsertAppointment>({
    resolver: zodResolver(insertAppointmentSchema),
    defaultValues: {
      title: "",
      description: "",
      startTime: "",
      endTime: "",
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: InsertAppointment) => {
      const res = await apiRequest("POST", "/api/appointments", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/appointments'] });
      toast({
        title: "Success",
        description: "Appointment created successfully",
      });
      setLocation("/calendar");
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to create appointment",
      });
    },
  });

  return (
    <div className="container mx-auto py-8">
      <Button 
        variant="ghost" 
        onClick={() => setLocation("/calendar")}
        className="mb-6"
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Calendar
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>New Appointment</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form 
              onSubmit={form.handleSubmit((data) => mutation.mutate(data))}
              className="space-y-6"
            >
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Title</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="startTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Start Time</FormLabel>
                      <FormControl>
                        <Input 
                          type="datetime-local" 
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="endTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>End Time</FormLabel>
                      <FormControl>
                        <Input 
                          type="datetime-local" 
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <Button 
                type="submit" 
                className="w-full"
                disabled={mutation.isPending}
              >
                {mutation.isPending ? "Creating..." : "Create Appointment"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
