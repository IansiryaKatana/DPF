import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Mail, CheckCircle, XCircle, Clock, RefreshCw, Search } from "lucide-react";

interface EmailLog {
  id: string;
  recipient_email: string;
  subject: string;
  template_name: string | null;
  status: string;
  error_message: string | null;
  sender_address: string | null;
  created_at: string;
}

const TIME_RANGES = [
  { label: "Last 24h", value: "24h" },
  { label: "Last 7 days", value: "7d" },
  { label: "Last 30 days", value: "30d" },
  { label: "All time", value: "all" },
];

const STATUS_OPTIONS = [
  { label: "All", value: "all" },
  { label: "Sent", value: "sent" },
  { label: "Failed", value: "failed" },
];

const statusBadge = (status: string) => {
  switch (status) {
    case "sent":
      return <Badge className="bg-green-100 text-green-800 border-green-200 hover:bg-green-100"><CheckCircle className="w-3 h-3 mr-1" />Sent</Badge>;
    case "failed":
      return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Failed</Badge>;
    default:
      return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" />{status}</Badge>;
  }
};

const EmailLogView = () => {
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState("7d");
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [stats, setStats] = useState({ total: 0, sent: 0, failed: 0 });

  const getDateCutoff = (range: string): string | null => {
    const now = new Date();
    switch (range) {
      case "24h": return new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      case "7d": return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      case "30d": return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
      default: return null;
    }
  };

  const fetchLogs = async () => {
    setLoading(true);
    let query = supabase
      .from("email_send_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);

    const cutoff = getDateCutoff(timeRange);
    if (cutoff) query = query.gte("created_at", cutoff);
    if (statusFilter !== "all") query = query.eq("status", statusFilter);

    const { data, error } = await query;

    if (error) {
      console.error("Failed to fetch email logs:", error);
      setLogs([]);
    } else {
      let filtered = data || [];
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        filtered = filtered.filter(
          (l) =>
            l.recipient_email.toLowerCase().includes(q) ||
            l.subject.toLowerCase().includes(q) ||
            (l.template_name && l.template_name.toLowerCase().includes(q))
        );
      }
      setLogs(filtered);
      setStats({
        total: filtered.length,
        sent: filtered.filter((l) => l.status === "sent").length,
        failed: filtered.filter((l) => l.status === "failed").length,
      });
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchLogs();
  }, [timeRange, statusFilter]);

  const handleSearch = () => fetchLogs();

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Mail className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stats.total}</p>
                <p className="text-sm text-muted-foreground">Total Emails</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100">
                <CheckCircle className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stats.sent}</p>
                <p className="text-sm text-muted-foreground">Sent</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-100">
                <XCircle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stats.failed}</p>
                <p className="text-sm text-muted-foreground">Failed</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Email Log</CardTitle>
          <CardDescription>Track all outgoing emails from the platform</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            <div className="flex gap-2 flex-1">
              <Input
                placeholder="Search by recipient, subject, or template..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="flex-1"
              />
              <Button variant="outline" size="icon" onClick={handleSearch}>
                <Search className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex gap-2">
              <Select value={timeRange} onValueChange={setTimeRange}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIME_RANGES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon" onClick={fetchLogs}>
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {loading ? (
            <p className="text-muted-foreground text-center py-8">Loading...</p>
          ) : logs.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No emails found for the selected filters</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Recipient</TableHead>
                    <TableHead className="hidden md:table-cell">Subject</TableHead>
                    <TableHead>Template</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden sm:table-cell">Sent At</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="font-medium max-w-[200px] truncate">{log.recipient_email}</TableCell>
                      <TableCell className="hidden md:table-cell max-w-[250px] truncate">{log.subject}</TableCell>
                      <TableCell>
                        {log.template_name ? (
                          <Badge variant="outline" className="text-xs">{log.template_name}</Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell>{statusBadge(log.status)}</TableCell>
                      <TableCell className="hidden sm:table-cell text-muted-foreground text-sm">
                        {new Date(log.created_at).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default EmailLogView;
