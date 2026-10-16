import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Calendar, Lock } from "lucide-react";

export default function AdminLogin() {
  const { login, user } = useAuth();
  const [, navigate] = useLocation();
  const [form, setForm] = useState({ username: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (user) {
    navigate("/admin");
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(form.username, form.password);
      navigate("/admin");
    } catch {
      setError("Invalid username or password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-8">
          <div className="flex items-center gap-3 text-white">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
              <Calendar className="w-6 h-6" />
            </div>
            <div>
              <p className="font-bold text-lg">Booking Admin</p>
              <p className="text-xs text-slate-400">Manage your schedule</p>
            </div>
          </div>
        </div>
        <Card className="shadow-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="w-5 h-5 text-blue-600" /> Sign in
            </CardTitle>
            <CardDescription>Enter your admin credentials to continue</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>Username</Label>
                <Input
                  required
                  placeholder="admin"
                  value={form.username}
                  onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Password</Label>
                <Input
                  required
                  type="password"
                  placeholder="••••••••"
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  className="mt-1"
                />
              </div>
              {error && <p className="text-sm text-red-500 bg-red-50 rounded p-2">{error}</p>}
              <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700" disabled={loading}>
                {loading ? "Signing in..." : "Sign in"}
              </Button>
            </form>
            <p className="text-xs text-center text-gray-400 mt-4">
              Use the configured administrator credentials for this deployment.
            </p>
          </CardContent>
        </Card>
        <p className="text-center mt-4">
          <a href="/" className="text-sm text-slate-400 hover:text-white transition">← Back to booking page</a>
        </p>
      </div>
    </div>
  );
}
