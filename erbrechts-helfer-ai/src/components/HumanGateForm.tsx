import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Send, Loader2, CheckCircle2, ShieldAlert } from "lucide-react";

interface HumanGateFormProps {
  originalQuestion: string;
  trigger: string;
}

const HumanGateForm = ({ originalQuestion, trigger }: HumanGateFormProps) => {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const { toast } = useToast();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim() || !email.trim() || !consent) {
      toast({
        title: "Bitte alle Felder ausfüllen",
        description: "Name, E-Mail und Zustimmung sind erforderlich.",
        variant: "destructive",
      });
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.functions.invoke("send-contact-email", {
        body: {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim(),
          question: originalQuestion,
          trigger,
        },
      });
      if (error) throw error;
      setDone(true);
      toast({
        title: "Anfrage gesendet",
        description: "Die Kanzlei BKL wurde informiert und wird sich zeitnah persönlich melden.",
      });
    } catch (err: any) {
      toast({
        title: "Fehler beim Senden",
        description: err?.message || "Bitte versuchen Sie es später erneut.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="mt-4 rounded-lg border border-green-600/30 bg-green-500/10 p-4">
        <div className="flex items-start gap-2">
          <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />
          <div className="text-sm">
            <p className="font-medium text-foreground">Anfrage erfolgreich übermittelt</p>
            <p className="text-muted-foreground mt-1">
              Ein Anwalt der Kanzlei BKL wird sich zeitnah persönlich bei Ihnen melden.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="mt-4 rounded-lg border border-accent/40 bg-accent/5 p-4 space-y-3"
    >
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <ShieldAlert className="h-4 w-4 text-accent" />
        Anwalts-Anfrage an Kanzlei BKL
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <Label htmlFor="hg-fn" className="text-xs">Vorname *</Label>
          <Input
            id="hg-fn"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            disabled={loading}
            maxLength={100}
            required
          />
        </div>
        <div>
          <Label htmlFor="hg-ln" className="text-xs">Nachname *</Label>
          <Input
            id="hg-ln"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            disabled={loading}
            maxLength={100}
            required
          />
        </div>
      </div>
      <div>
        <Label htmlFor="hg-email" className="text-xs">E-Mail *</Label>
        <Input
          id="hg-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={loading}
          maxLength={255}
          required
        />
      </div>
      <div className="flex items-start gap-2">
        <Checkbox
          id="hg-consent"
          checked={consent}
          onCheckedChange={(v) => setConsent(v === true)}
          disabled={loading}
        />
        <Label htmlFor="hg-consent" className="text-xs leading-snug cursor-pointer">
          Ich stimme zu, dass meine Daten und meine ursprüngliche Frage zur Bearbeitung an die
          Kanzlei BKL Rechtsanwälte und Steuerberater PartG mbB weitergegeben werden.
        </Label>
      </div>
      <Button type="submit" disabled={loading || !consent} className="w-full" size="sm">
        {loading ? (
          <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Wird gesendet...</>
        ) : (
          <><Send className="h-4 w-4 mr-2" /> An Anwalt weiterleiten</>
        )}
      </Button>
    </form>
  );
};

export default HumanGateForm;
