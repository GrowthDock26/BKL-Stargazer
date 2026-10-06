import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";
import { LogIn } from "lucide-react";

// Validation schemas
const emailSchema = z.string().email("Ungültige E-Mail-Adresse").max(255, "E-Mail zu lang");
const passwordSchema = z.string().min(6, "Passwort muss mindestens 6 Zeichen lang sein").max(72, "Passwort zu lang");

const Auth = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupConfirmPassword, setSignupConfirmPassword] = useState("");
  const [privacyAccepted, setPrivacyAccepted] = useState(false);

  // Check if user is already logged in
  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        navigate("/admin");
      }
    };
    checkUser();
  }, [navigate]);

  const validateEmail = (email: string): boolean => {
    try {
      emailSchema.parse(email);
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast({
          title: "Validierungsfehler",
          description: error.errors[0].message,
          variant: "destructive",
        });
      }
      return false;
    }
  };

  const validatePassword = (password: string): boolean => {
    try {
      passwordSchema.parse(password);
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast({
          title: "Validierungsfehler",
          description: error.errors[0].message,
          variant: "destructive",
        });
      }
      return false;
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateEmail(loginEmail) || !validatePassword(loginPassword)) {
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: loginEmail.trim(),
        password: loginPassword,
      });

      if (error) {
        if (error.message.includes("Invalid login credentials")) {
          toast({
            title: "Anmeldung fehlgeschlagen",
            description: "E-Mail oder Passwort ist falsch.",
            variant: "destructive",
          });
        } else {
          toast({
            title: "Anmeldung fehlgeschlagen",
            description: error.message,
            variant: "destructive",
          });
        }
        return;
      }

      if (data.session) {
        toast({
          title: "Erfolgreich angemeldet",
          description: "Willkommen zurück!",
        });
        navigate("/admin");
      }
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Ein unerwarteter Fehler ist aufgetreten.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateEmail(signupEmail) || !validatePassword(signupPassword)) {
      return;
    }

    if (signupPassword !== signupConfirmPassword) {
      toast({
        title: "Validierungsfehler",
        description: "Passwörter stimmen nicht überein.",
        variant: "destructive",
      });
      return;
    }

    if (!privacyAccepted) {
      toast({
        title: "Datenschutz",
        description: "Bitte akzeptieren Sie die Datenschutzbestimmungen.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const redirectUrl = `${window.location.origin}/admin`;
      
      const { data, error } = await supabase.auth.signUp({
        email: signupEmail.trim(),
        password: signupPassword,
        options: {
          emailRedirectTo: redirectUrl,
        },
      });

      if (error) {
        if (error.message.includes("User already registered")) {
          toast({
            title: "Registrierung fehlgeschlagen",
            description: "Diese E-Mail-Adresse ist bereits registriert.",
            variant: "destructive",
          });
        } else {
          toast({
            title: "Registrierung fehlgeschlagen",
            description: error.message,
            variant: "destructive",
          });
        }
        return;
      }

      if (data.session) {
        toast({
          title: "Registrierung erfolgreich",
          description: "Ihr Konto wurde erstellt.",
        });
        navigate("/admin");
      } else {
        toast({
          title: "Registrierung erfolgreich",
          description: "Ihr Konto wurde erstellt. Sie können sich jetzt anmelden.",
        });
      }
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Ein unerwarteter Fehler ist aufgetreten.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl text-center">Admin Bereich</CardTitle>
          <CardDescription className="text-center">
            Anmeldung nur für freigeschaltete Nutzer
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="login-email">E-Mail</Label>
              <Input
                id="login-email"
                type="email"
                placeholder="ihre@email.de"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="login-password">Passwort</Label>
              <Input
                id="login-password"
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              <LogIn className="h-4 w-4 mr-2" />
              {isLoading ? "Wird geladen..." : "Anmelden"}
            </Button>
          </form>

          <div className="mt-6 p-4 rounded-lg bg-muted text-sm text-muted-foreground text-center space-y-2">
            <p className="font-medium text-foreground">Kein Konto?</p>
            <p>
              Für den Zugang zum Erbrecht-Chat nutzen Sie bitte{" "}
              <a
                href="https://vorgesorgt.online"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary font-medium hover:underline"
              >
                vorgesorgt.online
              </a>
              . Neue Admin-Konten müssen vom Administrator freigeschaltet werden.
            </p>
          </div>

          <div className="mt-4 text-center">
            <Button variant="link" onClick={() => navigate("/")} className="text-sm">
              Zurück zur Startseite
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;
