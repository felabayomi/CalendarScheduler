import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import NotFound from "@/pages/not-found";
import CalendarView from "@/pages/calendar";
import NewAppointment from "@/pages/appointments";

function Router() {
  return (
    <Switch>
      <Route path="/" component={CalendarView} />
      <Route path="/calendar" component={CalendarView} />
      <Route path="/appointments" component={NewAppointment} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router />
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;
