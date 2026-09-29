import { useMemo, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { exportBatchPdf } from "@/hooks/use-logs";

type LogSummary = {
  id: number;
  date: string; // YYYY-MM-DD
  contractorRepSignature: string | null;
};

function monthRange(month: string): { from: string; to: string } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return null;
  const year = Number(match[1]);
  const mon = Number(match[2]);
  const lastDay = new Date(year, mon, 0).getDate();
  return { from: `${month}-01`, to: `${month}-${String(lastDay).padStart(2, "0")}` };
}

// Export panel shown inside a job folder: pick a month (or custom dates) and
// download every log for this job as a single PDF.
export function BatchExport({ contractNumber, logs }: { contractNumber: string; logs: LogSummary[] }) {
  const { toast } = useToast();

  // Start on the month of the newest log in this job.
  const latestMonth = useMemo(() => {
    const newest = logs.reduce((max, l) => (l.date > max ? l.date : max), "");
    return newest ? newest.slice(0, 7) : "";
  }, [logs]);

  const initial = monthRange(latestMonth);
  const [month, setMonth] = useState(latestMonth);
  const [from, setFrom] = useState(initial?.from ?? "");
  const [to, setTo] = useState(initial?.to ?? "");
  const [includeDrafts, setIncludeDrafts] = useState(false);
  const [busy, setBusy] = useState(false);

  const inRange = logs.filter((l) => from !== "" && to !== "" && l.date >= from && l.date <= to);
  const signedCount = inRange.filter((l) => l.contractorRepSignature).length;
  const draftCount = inRange.length - signedCount;
  const exportCount = includeDrafts ? inRange.length : signedCount;

  const handleMonthChange = (value: string) => {
    setMonth(value);
    const range = monthRange(value);
    if (range) {
      setFrom(range.from);
      setTo(range.to);
    }
  };

  const handleExport = async () => {
    setBusy(true);
    try {
      await exportBatchPdf({ contractNumber, from, to, includeDrafts });
      toast({ title: "PDF ready", description: `${exportCount} ${exportCount === 1 ? "log" : "logs"} exported.` });
    } catch (err) {
      toast({
        title: "Export failed",
        description: (err as Error).message,
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-md border bg-muted/30 p-4 mb-4" data-testid={`batch-export-${contractNumber}`}>
      <p className="font-semibold mb-3">Export PDFs for this job</p>
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1">
          <Label htmlFor={`month-${contractNumber}`}>Month</Label>
          <Input
            id={`month-${contractNumber}`}
            type="month"
            value={month}
            onChange={(e) => handleMonthChange(e.target.value)}
            data-testid="input-batch-month"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`from-${contractNumber}`}>From</Label>
          <Input
            id={`from-${contractNumber}`}
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            data-testid="input-batch-from"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`to-${contractNumber}`}>To</Label>
          <Input
            id={`to-${contractNumber}`}
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            data-testid="input-batch-to"
          />
        </div>
        <div className="flex items-center gap-2 pb-2">
          <Checkbox
            id={`drafts-${contractNumber}`}
            checked={includeDrafts}
            onCheckedChange={(checked) => setIncludeDrafts(checked === true)}
            data-testid="checkbox-batch-drafts"
          />
          <Label htmlFor={`drafts-${contractNumber}`}>Include unsigned drafts</Label>
        </div>
        <Button onClick={handleExport} disabled={busy || exportCount === 0 || from > to} data-testid="button-batch-export">
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
          Export {exportCount} {exportCount === 1 ? "log" : "logs"}
        </Button>
      </div>
      <p className="text-sm text-muted-foreground mt-3">
        {signedCount} signed{draftCount > 0 ? `, ${draftCount} unsigned ${draftCount === 1 ? "draft" : "drafts"}` : ""} in this range.
        {!includeDrafts && draftCount > 0 ? " Drafts are left out unless you tick the box." : ""}
        {includeDrafts && draftCount > 0 ? " Drafts are stamped DRAFT on every page." : ""}
        {exportCount > 50 ? " Maximum 50 logs per export, so please narrow the dates." : ""}
      </p>
    </div>
  );
}
