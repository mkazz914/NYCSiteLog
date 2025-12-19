import { Link, useLocation } from "wouter";
import { Plus, HardHat, LogOut } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export function Header() {
  const [location] = useLocation();
  const { user, logout, isLoggingOut } = useAuth();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-md">
      <div className="container flex h-16 items-center justify-between gap-4 px-4 sm:px-8">
        <Link href="/">
          <div className="flex items-center gap-2 cursor-pointer group">
            <div className="bg-primary p-2 rounded-lg group-hover:bg-primary/90 transition-colors">
              <HardHat className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight leading-none">Site Log NYC</h1>
              <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Digital Logbook</p>
            </div>
          </div>
        </Link>

        <nav className="flex items-center gap-4 flex-wrap">
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
                  : "bg-secondary text-secondary-foreground"}
              `}
            >
              <Plus className="h-4 w-4" />
              <span>New Log</span>
            </div>
          </Link>
          
          {user && (
            <div className="flex items-center gap-2">
              <Avatar className="h-8 w-8">
                <AvatarImage src={user.profileImageUrl || undefined} alt={user.firstName || "User"} />
                <AvatarFallback>
                  {user.firstName?.[0]?.toUpperCase() || user.email?.[0]?.toUpperCase() || "U"}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm text-muted-foreground hidden sm:inline">
                {user.firstName || user.email?.split("@")[0] || "User"}
              </span>
              <Button 
                variant="ghost" 
                size="icon"
                onClick={() => logout()}
                disabled={isLoggingOut}
                data-testid="button-logout"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          )}
        </nav>
      </div>
    </header>
  );
}
