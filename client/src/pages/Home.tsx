import { useLogs, useCloneLog } from "@/hooks/use-logs";
import { Header } from "@/components/Header";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, FileText, Calendar, Loader2, ArrowRight, Copy, FolderOpen, ChevronDown } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";

type Log = {
  id: number;
  contractNumber: string;
  projectNameLocation: string;
  primeContractor: string;
  agency: string;
  date: string;
};

type JobGroup = {
  key: string;
  contractNumber: string;
  projectName: string;
  primeContractor: string;
  agency: string;
  logs: Log[];
  latestDate: Date;
};

export default function Home() {
  const { data: logs, isLoading, error } = useLogs();
  const cloneLog = useCloneLog();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set());

  const jobGroups = useMemo(() => {
    if (!logs || logs.length === 0) return [];

    const groupMap = new Map<string, JobGroup>();

    logs.forEach((log) => {
      const key = log.contractNumber;
      const logDate = new Date(log.date);

      if (!groupMap.has(key)) {
        groupMap.set(key, {
          key,
          contractNumber: log.contractNumber,
          projectName: log.projectNameLocation,
          primeContractor: log.primeContractor,
          agency: log.agency,
          logs: [],
          latestDate: logDate,
        });
      }

      const group = groupMap.get(key)!;
      group.logs.push(log as Log);
      if (logDate > group.latestDate) {
        group.latestDate = logDate;
      }
    });

    groupMap.forEach((group) => {
      group.logs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    });

    return Array.from(groupMap.values()).sort(
      (a, b) => b.latestDate.getTime() - a.latestDate.getTime()
    );
  }, [logs]);

  const toggleFolder = (key: string) => {
    setOpenFolders((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleClone = async (e: { preventDefault: () => void; stopPropagation: () => void }, logId: number) => {
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
        ) : jobGroups.length === 0 ? (
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
          <div className="space-y-4">
            {jobGroups.map((group) => {
              const isOpen = openFolders.has(group.key);
              return (
                <Card key={group.key} className="overflow-visible" data-testid={`folder-job-${group.contractNumber}`}>
                  <div
                    className="flex items-center gap-4 p-4 cursor-pointer hover-elevate rounded-md"
                    onClick={() => toggleFolder(group.key)}
                  >
                    <div className="bg-primary/10 p-2.5 rounded-md">
                      <FolderOpen className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-lg truncate">{group.projectName}</h3>
                        <Badge variant="secondary" className="text-xs font-mono">
                          #{group.contractNumber}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {group.logs.length} {group.logs.length === 1 ? "log" : "logs"}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground truncate">
                        {group.primeContractor} - {group.agency}
                      </p>
                    </div>
                    <ChevronDown
                      className={`h-5 w-5 text-muted-foreground transition-transform duration-200 ${
                        isOpen ? "rotate-180" : ""
                      }`}
                    />
                  </div>
                  {isOpen && (
                    <div className="border-t px-4 py-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {group.logs.map((log) => (
                          <Link key={log.id} href={`/logs/${log.id}`}>
                            <Card
                              className="group cursor-pointer hover:border-primary/50 hover:shadow-md transition-all duration-200 h-full"
                              data-testid={`card-log-${log.id}`}
                            >
                              <CardContent className="p-4">
                                <div className="flex items-center justify-between mb-2">
                                  <div className="flex items-center gap-2 text-muted-foreground">
                                    <Calendar className="h-4 w-4" />
                                    <span className="font-medium text-foreground">
                                      {format(new Date(log.date), "MMMM d, yyyy")}
                                    </span>
                                  </div>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    onClick={(e) => handleClone(e, log.id)}
                                    disabled={cloneLog.isPending}
                                    data-testid={`button-clone-log-${log.id}`}
                                  >
                                    <Copy className="h-4 w-4" />
                                  </Button>
                                </div>
                                <div className="flex items-center text-primary text-sm font-semibold group-hover:translate-x-1 transition-transform">
                                  View Details <ArrowRight className="ml-1 h-3.5 w-3.5" />
                                </div>
                              </CardContent>
                            </Card>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
