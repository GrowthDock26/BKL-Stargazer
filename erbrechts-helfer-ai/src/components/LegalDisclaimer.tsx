import { AlertTriangle, Mail } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const LegalDisclaimer = () => {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleContactRequest = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      toast({
        title: "Fehlende Angaben",
        description: "Bitte geben Sie Ihren Vor- und Nachnamen ein.",
        variant: "destructive",
      });
      return;
    }

    if (!email || !/\S+@\S+\.\S+/.test(email)) {
      toast({
        title: "Ungültige Email",
        description: "Bitte geben Sie eine gültige Email-Adresse ein.",
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
      const { error } = await supabase.functions.invoke('send-contact-email', {
        body: { firstName, lastName, email }
      });

      if (error) throw error;

      toast({
        title: "Anfrage gesendet",
        description: "Wir werden uns in Kürze bei Ihnen melden.",
      });
      
      setFirstName("");
      setLastName("");
      setEmail("");
      setPrivacyAccepted(false);
    } catch (error) {
      console.error('Error sending contact request:', error);
      toast({
        title: "Fehler",
        description: "Die Anfrage konnte nicht gesendet werden. Bitte versuchen Sie es später erneut.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="border-accent/20 bg-accent/5 shadow-card">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-accent mt-0.5 flex-shrink-0" />
          <div className="text-sm">
            <h3 className="font-semibold text-accent-foreground mb-2">Wichtiger Haftungshinweis</h3>
            <p className="text-muted-foreground leading-relaxed">
              Diese KI-Anwendung bietet allgemeine Informationen zum deutschen Erbrecht und ersetzt 
              <strong className="text-destructive"> keine professionelle Rechtsberatung</strong>. 
              Für verbindliche rechtliche Auskünfte und individuelle Beratung wenden Sie sich bitte 
              an einen qualifizierten Rechtsanwalt oder Notar. Alle Angaben sind ohne Gewähr.
            </p>
          </div>
        </div>

        <div className="border-t border-accent/20 pt-4">
          <p className="text-sm font-medium text-foreground mb-3">
            Ich habe weitere Fragen und bin an einer konkreten Rechtsberatung interessiert
          </p>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="text"
                placeholder="Vorname"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                disabled={isLoading}
              />
              <Input
                type="text"
                placeholder="Nachname"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                disabled={isLoading}
              />
            </div>
            <Input
              type="email"
              placeholder="Ihre Email-Adresse"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading}
            />
            <div className="flex items-start gap-2">
              <Checkbox
                id="privacy"
                checked={privacyAccepted}
                onCheckedChange={(checked) => setPrivacyAccepted(checked === true)}
                disabled={isLoading}
              />
              <Label htmlFor="privacy" className="text-xs text-muted-foreground leading-tight cursor-pointer">
                Ich bin damit einverstanden, dass meine Angaben zur Kontaktaufnahme und 
                Zuordnung für eventuelle Rückfragen gespeichert werden. Die Daten werden 
                nur für die Bearbeitung meiner Anfrage verwendet und nicht an Dritte weitergegeben.
              </Label>
            </div>
            <Button 
              onClick={handleContactRequest} 
              className="w-full gap-2"
              disabled={isLoading}
            >
              <Mail className="h-4 w-4" />
              {isLoading ? "Wird gesendet..." : "Kontakt aufnehmen"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default LegalDisclaimer;