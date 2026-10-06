import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Trash2, RefreshCw, TrendingUp, Search } from "lucide-react";

interface PrecedentRow {
  id: string;
  question_sample: string;
  topic: string | null;
  classification: string | null;
  count: number;
  first_seen: string;
  last_seen: string;
}

const PrecedentBoard = () => {
  const [rows, setRows] = useState<PrecedentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const { toast } = useToast();

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("precedent_questions")
      .select("*")
      .order("count", { ascending: false })
      .limit(200);

    if (error) {
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
    } else {
      setRows((data as PrecedentRow[]) || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const remove = async (id: string) => {
    if (!confirm("Diesen Eintrag wirklich löschen?")) return;
    const { error } = await (supabase as any).from("precedent_questions").delete().eq("id", id);
    if (error) {
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
    } else {
      setRows((r) => r.filter((x) => x.id !== id));
    }
  };

  const filtered = rows.filter((r) => {
    if (!filter.trim()) return true;
    const f = filter.toLowerCase();
    return (
      r.question_sample.toLowerCase().includes(f) ||
      (r.topic || "").toLowerCase().includes(f) ||
      (r.classification || "").toLowerCase().includes(f)
    );
  });

  const totalAsks = rows.reduce((s, r) => s + r.count, 0);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Precedent Board
          </CardTitle>
          <CardDescription>
            Anonymisierte, wiederkehrende Nutzerfragen — gruppiert und nach Häufigkeit sortiert.
            Identifiziert Themen, die in die Wissensbasis aufgenommen werden sollten. Persönliche
            Daten werden vor dem Speichern entfernt.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Filter nach Thema oder Schlagwort..."
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="pl-8"
              />
            </div>
            <Button variant="outline" onClick={load} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Aktualisieren
            </Button>
          </div>

          <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
            <Badge variant="secondary">{rows.length} eindeutige Fragen</Badge>
            <Badge variant="secondary">{totalAsks} Anfragen gesamt</Badge>
            <Badge variant="secondary">{filtered.length} angezeigt</Badge>
          </div>

          {loading && rows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Lade...</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Noch keine Einträge vorhanden. Sobald Nutzer Fragen stellen, erscheinen sie hier.
            </p>
          ) : (
            <div className="space-y-3">
              {filtered.map((r) => (
                <Card key={r.id} className="border-l-4 border-l-primary">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge className="bg-primary text-primary-foreground">
                            {r.count}×
                          </Badge>
                          {r.topic && (
                            <Badge variant="outline" className="max-w-md truncate">
                              {r.topic}
                            </Badge>
                          )}
                          <span className="text-xs text-muted-foreground">
                            zuletzt: {new Date(r.last_seen).toLocaleString("de-DE")}
                          </span>
                        </div>
                        <p className="text-sm">{r.question_sample}</p>
                        {r.classification && (
                          <details className="text-xs text-muted-foreground">
                            <summary className="cursor-pointer hover:text-foreground">
                              Klassifizierer-Notiz anzeigen
                            </summary>
                            <pre className="whitespace-pre-wrap mt-2 p-2 bg-muted rounded">
                              {r.classification}
                            </pre>
                          </details>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => remove(r.id)}
                        title="Löschen"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default PrecedentBoard;
