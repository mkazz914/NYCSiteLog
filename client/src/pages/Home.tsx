import { useLogs, useCloneLog } from "@/hooks/use-logs";
import { Header } from "@/components/Header";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Plus, FileText, Calendar, MapPin, Building2, Loader2, ArrowRight, Copy } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";

export default function Home() {
  const { data: logs, isLoading, error } = useLogs();
  const cloneLog = useCloneLog();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const handleClone = async (e: React.MouseEvent, logId: number) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const newLog = await cloneLog.mutateAsync(logId);
      toast({
        title: "Log cloned",
        description: "A new log has been created with today's date.",
      });
      setLocation(`/logs/${newLog.id}`);
    } catch {
      toast({
        title: "Clone failed",
        description: "Could not clone the log. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <Header />

      <main className="container px-4 sm:px-8 py-12 max-w-7xl mx-auto">
        {/* Hero Section */}
        <div className="mb-12 flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <h2 className="text-4xl font-bold tracking-tight text-foreground mb-2">Daily Logs</h2>
            <p className="text-lg text-muted-foreground max-w-2xl">
              Manage your construction site sign-in sheets. Create, track, and export daily reports.
            </p>
          </div>
          <Link href="/create">
            <Button size="lg" className="shadow-lg shadow-primary/25 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300">
              <Plus className="mr-2 h-5 w-5" /> Create New Log
            </Button>
          </Link>
        </div>

        {/* Content State Handling */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="h-12 w-12 text-primary animate-spin mb-4" />
            <p className="text-muted-foreground animate-pulse">Loading logs...</p>
          </div>
        ) : error ? (
          <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-8 text-center">
            <p className="text-destructive font-semibold">Error loading logs</p>
            <p className="text-sm text-destructive/80 mt-1">{(error as Error).message}</p>
          </div>
        ) : logs?.length === 0 ? (
          <div className="text-center py-20 border-2 border-dashed rounded-2xl bg-muted/30">
            <div className="bg-background w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 border shadow-sm">
              <FileText className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-bold mb-2">No Logs Found</h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              You haven't created any daily sign-in sheets yet. Get started by creating your first log.
            </p>
            <Link href="/create">
              <Button variant="outline">Create First Log</Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {logs?.map((log) => (
              <Link key={log.id} href={`/logs/${log.id}`}>
                <Card className="group cursor-pointer hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300 h-full flex flex-col">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between mb-2">
                      <div className="bg-secondary/50 p-2 rounded-md group-hover:bg-primary/10 transition-colors">
                        <FileText className="h-5 w-5 text-primary" />
                      </div>
                      <span className="text-xs font-mono font-medium text-muted-foreground bg-muted px-2 py-1 rounded">
                        #{log.contractNumber}
                      </span>
                    </div>
                    <CardTitle className="text-xl leading-tight line-clamp-2">
                      {log.projectNameLocation}
                    </CardTitle>
                    <CardDescription className="flex items-center gap-1.5 mt-2 text-foreground/70">
                      <Calendar className="h-3.5 w-3.5" />
                      {format(new Date(log.date), "MMMM d, yyyy")}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="mt-auto pt-0">
                    <div className="space-y-2 text-sm text-muted-foreground border-t pt-4 mt-2">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-3.5 w-3.5" />
                        <span className="truncate">{log.primeContractor}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <MapPin className="h-3.5 w-3.5" />
                        <span className="truncate">{log.agency}</span>
                      </div>
                    </div>
                    <div className="mt-4 flex items-center justify-between">
                      <div className="flex items-center text-primary text-sm font-semibold group-hover:translate-x-1 transition-transform">
                        View Details <ArrowRight className="ml-1 h-3.5 w-3.5" />
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => handleClone(e, log.id)}
                        disabled={cloneLog.isPending}
                        data-testid={`button-clone-log-${log.id}`}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
