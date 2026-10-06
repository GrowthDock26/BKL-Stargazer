import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { FlaskConical, Info } from "lucide-react";

const STORAGE_KEY = "use_logicc";

const LogiccTestPanel = () => {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    setEnabled(localStorage.getItem(STORAGE_KEY) === "true");
  }, []);

  const toggle = (val: boolean) => {
    setEnabled(val);
    if (val) localStorage.setItem(STORAGE_KEY, "true");
    else localStorage.removeItem(STORAGE_KEY);
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-accent" />
            Logicc-API Test-Modus
            {enabled && <Badge variant="default" className="ml-2">aktiv</Badge>}
          </CardTitle>
          <CardDescription>
            Leitet Chat-Anfragen an die parallele Edge Function <code className="text-xs bg-muted px-1 py-0.5 rounded">legal-chat-logicc</code> um,
            die Logicc statt Lovable AI verwendet. Der Standard-Chat (<code className="text-xs bg-muted px-1 py-0.5 rounded">legal-chat</code>) bleibt unverändert.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label htmlFor="logicc-toggle" className="text-base">Logicc verwenden</Label>
              <p className="text-sm text-muted-foreground">
                Einstellung wird lokal in diesem Browser gespeichert (nur für Sie sichtbar).
              </p>
            </div>
            <Switch id="logicc-toggle" checked={enabled} onCheckedChange={toggle} />
          </div>

          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Konfiguration</AlertTitle>
            <AlertDescription className="space-y-2 mt-2 text-sm">
              <p>
                <strong>Endpunkt:</strong> <code className="text-xs">https://api.logicc.io/v1/chat/completions</code>
              </p>
              <p>
                <strong>Default-Modell:</strong> <code className="text-xs">claude-4.6-sonnet</code> (Anthropic, überschreibbar via Secret <code className="text-xs">LOGICC_MODEL</code>)
              </p>
              <p>
                <strong>Authentifizierung:</strong> Bearer-Token aus Secret <code className="text-xs">LOGICC_API_KEY</code> ✓
              </p>
              <p className="text-muted-foreground">
                Hinweis: Im Test-Modus werden Multi-Agent-Pipeline, Math-Verifier und externe Rechtsprechungs-Suche
                deaktiviert, um Logicc isoliert zu vergleichen. Wissensbasis-Lookup bleibt aktiv.
              </p>
            </AlertDescription>
          </Alert>

          <Alert className="border-amber-500/30 bg-amber-500/5">
            <Info className="h-4 w-4 text-amber-600" />
            <AlertTitle className="text-amber-700">Modell-ID prüfen</AlertTitle>
            <AlertDescription className="text-sm mt-1 text-amber-700/90">
              Verwendet wird <strong>Claude 4.6 Sonnet</strong> (Anthropic) – Default-ID: <code className="text-xs">claude-4.6-sonnet</code>.
              Falls Logicc eine abweichende Schreibweise nutzt (z.B. <code className="text-xs">claude-sonnet-4-6</code>),
              prüfen Sie via <code className="text-xs">GET https://api.logicc.io/v1/models</code> und tragen Sie die korrekte ID
              als Secret <code className="text-xs">LOGICC_MODEL</code> ein.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
};

export default LogiccTestPanel;
