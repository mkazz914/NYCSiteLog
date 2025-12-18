import { Link, useLocation } from "wouter";
import { FileText, Plus, HardHat } from "lucide-react";

export function Header() {
  const [location] = useLocation();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-md">
      <div className="container flex h-16 items-center justify-between px-4 sm:px-8">
        <Link href="/">
          <div className="flex items-center gap-2 cursor-pointer group">
            <div className="bg-primary p-2 rounded-lg group-hover:bg-primary/90 transition-colors">
              <HardHat className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight leading-none">SITE COMMAND</h1>
              <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Digital Logbook</p>
            </div>
          </div>
        </Link>

        <nav className="flex items-center gap-4">
          <Link href="/">
            <div 
              className={`
                text-sm font-medium transition-colors hover:text-primary cursor-pointer
                ${location === "/" ? "text-foreground" : "text-muted-foreground"}
              `}
            >
              Logs
            </div>
          </Link>
          <Link href="/create">
            <div 
              className={`
                flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all cursor-pointer
                ${location === "/create" 
                  ? "bg-primary text-white shadow-lg shadow-primary/25" 
                  : "bg-secondary text-secondary-foreground hover:bg-secondary/80"}
              `}
            >
              <Plus className="h-4 w-4" />
              <span>New Log</span>
            </div>
          </Link>
        </nav>
      </div>
    </header>
  );
}
