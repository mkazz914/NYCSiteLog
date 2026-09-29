import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { HardHat, FileText, Users, Shield } from "lucide-react";
import { useEffect, useState } from "react";

export default function Landing() {
  const signInFailed = new URLSearchParams(window.location.search).has("error");
  // Show only the sign-in methods the server has configured.
  const [providers, setProviders] = useState<{ google: boolean; microsoft: boolean }>({
    google: true,
    microsoft: false,
  });
  useEffect(() => {
    fetch("/api/auth/providers")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setProviders(data))
      .catch(() => {});
  }, []);

  const signInButtons = (size?: "lg") => (
    <div className="flex flex-col sm:flex-row gap-3 justify-center">
      {providers.microsoft && (
        <Button size={size} onClick={() => (window.location.href = "/api/login/microsoft")} data-testid="button-login-microsoft">
          Sign in with Microsoft
        </Button>
      )}
      {providers.google && (
        <Button
          size={size}
          variant={providers.microsoft ? "outline" : "default"}
          onClick={() => (window.location.href = "/api/login")}
          data-testid="button-login-google"
        >
          Sign in with Google
        </Button>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-md">
        <div className="container flex h-16 items-center justify-between px-4 sm:px-8">
          <div className="flex items-center gap-2">
            <div className="bg-primary p-2 rounded-lg">
              <HardHat className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight leading-none">Site Log NYC</h1>
              <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Digital Logbook</p>
            </div>
          </div>
          <Button onClick={() => document.getElementById("signin")?.scrollIntoView({ behavior: "smooth" })} data-testid="button-login">
            Sign in
          </Button>
        </div>
      </header>

      {signInFailed && (
        <div className="bg-destructive/10 text-destructive text-center text-sm py-3 px-4" role="alert" data-testid="text-signin-error">
          Sign-in failed. This prototype is invite-only, so make sure you are using an approved Google account.
        </div>
      )}

      <main className="container px-4 sm:px-8 py-16">
        <div className="max-w-3xl mx-auto text-center space-y-6 mb-16">
          <h2 className="text-4xl font-bold tracking-tight sm:text-5xl">
            Digital Daily Logs for Construction Sites
          </h2>
          <p className="text-xl text-muted-foreground">
            Track worker sign-ins, capture digital signatures, and export professional PDF reports. 
            Built for NYC DDC compliance.
          </p>
          <div id="signin">{signInButtons("lg")}</div>
        </div>

        <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
          <Card>
            <CardHeader>
              <FileText className="h-10 w-10 text-primary mb-2" />
              <CardTitle>Daily Log Management</CardTitle>
              <CardDescription>
                Create and manage daily sign-in sheets with contractor info, project details, and worker entries.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <Users className="h-10 w-10 text-primary mb-2" />
              <CardTitle>Digital Signatures</CardTitle>
              <CardDescription>
                Capture worker and contractor representative signatures digitally for paperless compliance.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <Shield className="h-10 w-10 text-primary mb-2" />
              <CardTitle>PDF Export</CardTitle>
              <CardDescription>
                Export logs to official NYC DDC sign-in sheet format, ready for submission.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </main>
    </div>
  );
}
