import { useRef, useEffect, useState } from "react";
import SignatureCanvas from "react-signature-canvas";
import { Eraser, PenLine } from "lucide-react";
import { Button } from "./ui/button";

interface SignaturePadProps {
  label: string;
  value?: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
}

export function SignaturePad({ label, value, onChange, disabled = false }: SignaturePadProps) {
  const sigRef = useRef<SignatureCanvas>(null);
  const [isEmpty, setIsEmpty] = useState(!value);

  // Initialize with existing value if provided
  useEffect(() => {
    if (value && sigRef.current && isEmpty) {
      sigRef.current.fromDataURL(value);
      setIsEmpty(false);
    }
  }, [value]);

  const handleClear = (e: React.MouseEvent) => {
    e.preventDefault();
    sigRef.current?.clear();
    setIsEmpty(true);
    onChange(null);
  };

  const handleEnd = () => {
    if (sigRef.current && !sigRef.current.isEmpty()) {
      onChange(sigRef.current.toDataURL());
      setIsEmpty(false);
    } else {
      onChange(null);
      setIsEmpty(true);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <PenLine className="w-4 h-4" /> {label}
        </label>
        {!disabled && !isEmpty && (
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleClear}
            className="h-6 px-2 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10"
          >
            <Eraser className="w-3 h-3 mr-1" /> Clear
          </Button>
        )}
      </div>
      
      <div className="relative group">
        <SignatureCanvas
          ref={sigRef}
          canvasProps={{
            className: `sigCanvas ${disabled ? 'opacity-50 pointer-events-none bg-muted/20' : ''}`
          }}
          onEnd={handleEnd}
          clearOnResize={false}
        />
        {isEmpty && !disabled && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-muted-foreground/30 text-sm font-mono uppercase tracking-widest">Sign Here</p>
          </div>
        )}
      </div>
      <p className="text-[10px] text-muted-foreground">
        Draw signature above. Valid for legal certification.
      </p>
    </div>
  );
}
