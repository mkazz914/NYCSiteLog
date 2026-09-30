import { useEffect, useRef, useState, type ReactNode } from "react";
import SignatureCanvas from "react-signature-canvas";
import { Check, Loader2, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Small building blocks for the worker rows on the log page.
// Every field is tap-to-edit and saves by itself, so nobody has to find an "Edit" button.

type SaveStatus = "idle" | "saving" | "saved";

function FieldShell({ label, status, children }: { label: string; status?: SaveStatus; children: ReactNode }) {
  return (
    <div className="space-y-1 min-w-0">
      {/* The column headings are hidden on small screens, so each field names itself there. */}
      <div className="flex items-center justify-between h-4 lg:hidden">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
        <SaveBadge status={status} />
      </div>
      <div className="relative">
        {children}
        <span className="hidden lg:block absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
          <SaveBadge status={status} />
        </span>
      </div>
    </div>
  );
}

function SaveBadge({ status }: { status?: SaveStatus }) {
  if (status === "saving") return <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-label="Saving" />;
  if (status === "saved")
    return (
      <span className="flex items-center gap-0.5 text-[11px] font-medium text-green-600" role="status">
        <Check className="h-3.5 w-3.5" /> Saved
      </span>
    );
  return null;
}

// Runs a save and reports progress. Keeps the "Saved" tick up for a moment.
function useSaveStatus() {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const timer = useRef<number>();
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const run = async (fn: () => Promise<void>): Promise<boolean> => {
    setStatus("saving");
    try {
      await fn();
      setStatus("saved");
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setStatus("idle"), 1800);
      return true;
    } catch {
      setStatus("idle"); // the page shows an error message
      return false;
    }
  };
  return { status, run };
}

function nowAsTime(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// ---------- Text (name, classification) ----------

export function TextCell({
  label,
  value,
  onSave,
  disabled,
  placeholder,
  bold,
  testId,
}: {
  label: string;
  value: string;
  onSave: (next: string) => Promise<void>;
  disabled?: boolean;
  placeholder?: string;
  bold?: boolean;
  testId?: string;
}) {
  const [text, setText] = useState(value);
  const focused = useRef(false);
  const { status, run } = useSaveStatus();

  // Pick up changes from the server, but never while someone is typing.
  useEffect(() => {
    if (!focused.current) setText(value);
  }, [value]);

  if (disabled) {
    return (
      <div className="min-w-0">
        <span className="lg:hidden block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">{label}</span>
        <p className={`truncate ${bold ? "font-medium" : "text-muted-foreground"}`}>{value}</p>
      </div>
    );
  }

  const commit = async () => {
    const next = text.trim();
    if (!next) {
      setText(value); // these fields are required: put the old value back
      return;
    }
    if (next === value) return;
    const ok = await run(() => onSave(next));
    if (!ok) setText(value);
  };

  return (
    <FieldShell label={label} status={status}>
      <Input
        value={text}
        placeholder={placeholder}
        aria-label={label}
        className={`h-11 text-base pr-16 ${bold ? "font-medium" : ""}`}
        onFocus={() => (focused.current = true)}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          focused.current = false;
          void commit();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        data-testid={testId}
      />
    </FieldShell>
  );
}

// ---------- Time ----------

export function TimeCell({
  label,
  value,
  onSave,
  disabled,
  testId,
}: {
  label: string;
  value: string | null;
  onSave: (next: string) => Promise<void>;
  disabled?: boolean;
  testId?: string;
}) {
  const saved = value ?? "";
  const [time, setTime] = useState(saved);
  const focused = useRef(false);
  const lastSaved = useRef(saved);
  const timer = useRef<number>();
  const { status, run } = useSaveStatus();

  useEffect(() => {
    lastSaved.current = saved;
    if (!focused.current) setTime(saved);
  }, [saved]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  if (disabled) {
    return (
      <div className="min-w-0">
        <span className="lg:hidden block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">{label}</span>
        <p className="font-mono">{saved || "--:--"}</p>
      </div>
    );
  }

  const commit = async (next: string) => {
    // An empty value just means the time is half typed: wait for a full one.
    if (!next || next === lastSaved.current) return;
    lastSaved.current = next;
    const ok = await run(() => onSave(next));
    if (!ok) {
      lastSaved.current = saved;
      setTime(saved);
    }
  };

  const change = (next: string) => {
    setTime(next);
    window.clearTimeout(timer.current);
    if (next) timer.current = window.setTimeout(() => void commit(next), 700);
  };

  return (
    <FieldShell label={label} status={status}>
      <Input
        type="time"
        value={time}
        aria-label={label}
        className="h-11 font-mono text-base"
        onFocus={() => (focused.current = true)}
        onChange={(e) => change(e.target.value)}
        onBlur={() => {
          focused.current = false;
          window.clearTimeout(timer.current);
          void commit(time);
        }}
        data-testid={testId}
      />
      {!time && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="absolute right-9 top-1/2 -translate-y-1/2 h-8 px-2 text-xs bg-background"
          onClick={() => {
            const now = nowAsTime();
            setTime(now);
            void commit(now);
          }}
          data-testid={testId ? `${testId}-now` : undefined}
        >
          Now
        </Button>
      )}
    </FieldShell>
  );
}

// ---------- Signature ----------

export function SignatureCell({
  label,
  workerName,
  value,
  onSave,
  disabled,
  testId,
}: {
  label: string;
  workerName: string;
  value: string | null;
  onSave: (dataUrl: string) => Promise<void>;
  disabled?: boolean;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const { status, run } = useSaveStatus();

  if (disabled) {
    return (
      <div className="min-w-0">
        <span className="lg:hidden block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">{label}</span>
        <div className={`h-11 border rounded-md flex items-center justify-center ${value ? "border-green-500/30 bg-green-500/5" : "border-dashed"}`}>
          {value ? (
            <img src={value} alt={label} className="h-full w-full object-contain p-0.5" />
          ) : (
            <span className="text-[10px] text-muted-foreground/60">NO SIG</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <FieldShell label={label} status={status}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={value ? `${label} for ${workerName}: tap to sign again` : `${label} for ${workerName}: tap to sign`}
        className={`h-11 w-full rounded-md border flex items-center justify-center gap-1.5 transition-colors hover-elevate active-elevate-2 ${
          value ? "border-green-500/40 bg-green-500/5" : "border-dashed border-primary/50 text-primary"
        }`}
        data-testid={testId}
      >
        {value ? (
          <img src={value} alt="" className="h-full max-w-full object-contain p-0.5" />
        ) : (
          <>
            <PenLine className="h-4 w-4" />
            <span className="text-sm font-medium">Tap to sign</span>
          </>
        )}
      </button>
      <SignatureDialog
        open={open}
        onOpenChange={setOpen}
        title={`${workerName} — ${label}`}
        replacing={!!value}
        onSave={async (dataUrl) => {
          const ok = await run(() => onSave(dataUrl));
          if (ok) setOpen(false);
          return ok;
        }}
      />
    </FieldShell>
  );
}

// One signature, one big pad, one Save button: no scrolling needed on a phone.
function SignatureDialog({
  open,
  onOpenChange,
  title,
  replacing,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  replacing: boolean;
  onSave: (dataUrl: string) => Promise<boolean>;
}) {
  const pad = useRef<SignatureCanvas | null>(null);
  const [hasInk, setHasInk] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setHasInk(false);
      setSaving(false);
    }
  }, [open]);

  const save = async () => {
    if (!pad.current || pad.current.isEmpty()) return;
    setSaving(true);
    const ok = await onSave(pad.current.toDataURL("image/png"));
    if (!ok) setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {replacing ? "Sign below to replace the current signature." : "Sign with a finger or stylus."}
          </DialogDescription>
        </DialogHeader>
        <div className="border-2 border-dashed rounded-lg bg-white relative">
          <SignatureCanvas
            ref={pad}
            canvasProps={{ className: "w-full touch-none", style: { width: "100%", height: "200px" } }}
            backgroundColor="rgba(0,0,0,0)"
            onEnd={() => setHasInk(!!pad.current && !pad.current.isEmpty())}
          />
          {!hasInk && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <p className="text-muted-foreground/40 text-sm font-mono uppercase tracking-widest">Sign here</p>
            </div>
          )}
        </div>
        <div className="flex gap-3">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={() => {
              pad.current?.clear();
              setHasInk(false);
            }}
            disabled={!hasInk || saving}
          >
            Clear
          </Button>
          <Button type="button" className="flex-1" onClick={save} disabled={!hasInk || saving} data-testid="button-save-signature">
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Save signature
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
