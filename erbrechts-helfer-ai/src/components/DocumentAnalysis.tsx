import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Upload, File, X, Loader2, FileSearch, Sparkles, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface DocFile {
  file: File;
  base64?: string;
}

const ALLOWED = ["application/pdf", "text/plain", "image/jpeg", "image/png"];
const MAX_TOTAL_MB = 15;

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = reader.result as string;
      resolve(res.split(",")[1] || "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const DocumentAnalysis = () => {
  const [files, setFiles] = useState<DocFile[]>([]);
  const [familyContext, setFamilyContext] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const onFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(e.target.files || []);
    const valid = list.filter((f) => ALLOWED.includes(f.type));
    if (valid.length !== list.length) {
      toast({
        title: "Ungültige Dateitypen",
        description: "Erlaubt: PDF, TXT, JPG, PNG.",
        variant: "destructive",
      });
    }
    const total = [...files.map((f) => f.file), ...valid].reduce((s, f) => s + f.size, 0);
    if (total > MAX_TOTAL_MB * 1024 * 1024) {
      toast({
        title: "Zu groß",
        description: `Max ${MAX_TOTAL_MB} MB Gesamtgröße.`,
        variant: "destructive",
      });
      return;
    }
    setFiles((prev) => [...prev, ...valid.map((file) => ({ file }))]);
    if (inputRef.current) inputRef.current.value = "";
  };

  const remove = (i: number) => setFiles((prev) => prev.filter((_, idx) => idx !== i));

  const analyze = async () => {
    if (files.length === 0) {
      toast({ title: "Keine Dokumente", description: "Bitte mindestens 1 Dokument hochladen.", variant: "destructive" });
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const docs = await Promise.all(
        files.map(async (f) => ({
          name: f.file.name,
          mimeType: f.file.type,
          dataBase64: await fileToBase64(f.file),
        })),
      );
      const { data, error } = await supabase.functions.invoke("document-analysis", {
        body: { documents: docs, familyContext },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setResult(data);
      toast({ title: "Analyse abgeschlossen", description: "Ergebnisse unten einsehbar." });
    } catch (e: any) {
      toast({ title: "Fehler", description: e.message || "Analyse fehlgeschlagen", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="border-border shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-primary">
            <FileSearch className="w-5 h-5" />
            Dokumenten-Analyse (Beta)
          </CardTitle>
          <CardDescription>
            Laden Sie Testament, Erbvertrag, Schenkungsvertrag, Vorsorgevollmacht, Patientenverfügung oder
            Vermögensübersicht hoch. Die KI-Pipeline klassifiziert, prüft Formgültigkeit, berechnet Erbquoten &
            Erbschaftsteuer und erarbeitet Verbesserungsvorschläge. <strong>Keine Rechtsberatung.</strong>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            className="border-2 border-dashed border-accent/30 rounded-lg p-6 text-center hover:border-accent/60 transition cursor-pointer"
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="h-8 w-8 text-accent mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Klicken zum Hochladen (PDF, TXT, JPG, PNG)</p>
            <p className="text-xs text-muted-foreground mt-1">Max. {MAX_TOTAL_MB} MB gesamt, 10 Dateien</p>
          </div>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".pdf,.txt,.jpg,.jpeg,.png,application/pdf,text/plain,image/jpeg,image/png"
            className="hidden"
            onChange={onFiles}
          />

          {files.length > 0 && (
            <div className="space-y-2">
              {files.map((f, i) => (
                <div key={i} className="flex items-center justify-between p-2 bg-secondary rounded">
                  <div className="flex items-center gap-2 text-sm">
                    <File className="h-4 w-4 text-accent" />
                    <span className="font-medium">{f.file.name}</span>
                    <span className="text-xs text-muted-foreground">
                      ({(f.file.size / 1024 / 1024).toFixed(2)} MB)
                    </span>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => remove(i)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div>
            <Label htmlFor="family-ctx">Familienkonstellation (optional, hilft bei Quoten & Steuer)</Label>
            <Textarea
              id="family-ctx"
              placeholder="z.B. Erblasser verheiratet (Zugewinngemeinschaft), 2 leibliche Kinder, 1 Enkel aus vorverstorbenem Sohn..."
              value={familyContext}
              onChange={(e) => setFamilyContext(e.target.value)}
              className="min-h-[80px]"
            />
          </div>

          <Button onClick={analyze} disabled={loading || files.length === 0} className="w-full">
            {loading ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Analyse läuft (kann 30–60s dauern)...</>
            ) : (
              <><Sparkles className="h-4 w-4 mr-2" /> Dokumente analysieren</>
            )}
          </Button>
        </CardContent>
      </Card>

      {result && <AnalysisResult data={result} />}
    </div>
  );
};

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <Card>
    <CardHeader className="pb-3">
      <CardTitle className="text-base">{title}</CardTitle>
    </CardHeader>
    <CardContent>{children}</CardContent>
  </Card>
);

const JsonBlock = ({ data }: { data: any }) => (
  <pre className="text-xs bg-muted p-3 rounded overflow-x-auto max-h-96 whitespace-pre-wrap">
    {typeof data === "string" ? data : JSON.stringify(data, null, 2)}
  </pre>
);

const AnalysisResult = ({ data }: { data: any }) => {
  const specialists = (data.specialists || []) as Array<{ agent: string; result?: any; error?: string }>;
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 p-3 bg-accent/10 border border-accent/30 rounded text-sm">
        <AlertTriangle className="h-4 w-4 mt-0.5 text-accent shrink-0" />
        <span>
          Diese Analyse ist eine KI-gestützte Ersteinschätzung und <strong>keine Rechtsberatung</strong>. Für eine
          rechtssichere Beurteilung wenden Sie sich an Kanzlei BKL.
        </span>
      </div>

      {data.meta?.agents_used && (
        <div className="flex flex-wrap gap-1">
          {data.meta.agents_used.map((a: string, i: number) => (
            <Badge key={i} variant="secondary" className="text-xs">{a}</Badge>
          ))}
        </div>
      )}

      {data.classification && (
        <Section title="Dokumenten-Klassifikation"><JsonBlock data={data.classification} /></Section>
      )}

      {specialists.map((s, i) => (
        <Section key={i} title={s.agent}>
          {s.error ? (
            <p className="text-sm text-destructive">Fehler: {s.error}</p>
          ) : (
            <JsonBlock data={s.result} />
          )}
        </Section>
      ))}

      {data.optimizer && (
        <Section title="🎯 Verbesserungsvorschläge"><JsonBlock data={data.optimizer} /></Section>
      )}
    </div>
  );
};

export default DocumentAnalysis;
