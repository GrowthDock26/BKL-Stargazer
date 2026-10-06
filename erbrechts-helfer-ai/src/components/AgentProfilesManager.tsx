import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Save, Plus, Trash2, Bot, RefreshCw } from "lucide-react";

interface AgentProfile {
  id: string;
  name: string;
  role: string;
  description: string | null;
  system_prompt: string;
  model: string;
  order_index: number;
  enabled: boolean;
  trigger_keywords: string[] | null;
}

const ROLES = [
  { value: "gatekeeper", label: "Human-Gate (eskaliert an Anwalt)" },
  { value: "classifier", label: "Klassifizierer (extrahiert Fakten)" },
  { value: "specialist", label: "Spezialist (Teilantwort)" },
  { value: "synthesizer", label: "Synthesizer (finale Antwort)" },
  { value: "analyst", label: "Analyst (Dokumenten-Pipeline)" },
];

const MODELS = [
  "google/gemini-2.5-flash-lite",
  "google/gemini-2.5-flash",
  "google/gemini-2.5-pro",
];

const emptyForm = {
  name: "",
  role: "specialist",
  description: "",
  system_prompt: "",
  model: "google/gemini-2.5-flash",
  order_index: 50,
  enabled: true,
  trigger_keywords: "",
};

const AgentProfilesManager = () => {
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const { toast } = useToast();

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("agent_profiles" as any)
      .select("*")
      .order("order_index", { ascending: true });
    if (error) {
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
    } else {
      setAgents((data as unknown as AgentProfile[]) || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const resetForm = () => {
    setEditingId(null);
    setForm(emptyForm);
  };

  const handleEdit = (a: AgentProfile) => {
    setEditingId(a.id);
    setForm({
      name: a.name,
      role: a.role,
      description: a.description || "",
      system_prompt: a.system_prompt,
      model: a.model,
      order_index: a.order_index,
      enabled: a.enabled,
      trigger_keywords: (a.trigger_keywords || []).join(", "),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.system_prompt.trim()) {
      toast({ title: "Fehler", description: "Name und System-Prompt sind erforderlich.", variant: "destructive" });
      return;
    }
    const payload = {
      name: form.name.trim(),
      role: form.role,
      description: form.description.trim() || null,
      system_prompt: form.system_prompt.trim(),
      model: form.model,
      order_index: Number(form.order_index) || 50,
      enabled: form.enabled,
      trigger_keywords: form.trigger_keywords
        .split(",")
        .map((k) => k.trim().toLowerCase())
        .filter(Boolean),
    };

    const { error } = editingId
      ? await supabase.from("agent_profiles" as any).update(payload).eq("id", editingId)
      : await supabase.from("agent_profiles" as any).insert(payload);

    if (error) {
      toast({ title: "Fehler beim Speichern", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Gespeichert", description: `Agent "${payload.name}" wurde gespeichert.` });
      resetForm();
      load();
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Agent "${name}" wirklich löschen?`)) return;
    const { error } = await supabase.from("agent_profiles" as any).delete().eq("id", id);
    if (error) {
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Gelöscht", description: `Agent "${name}" entfernt.` });
      load();
    }
  };

  const toggleEnabled = async (a: AgentProfile) => {
    const { error } = await supabase
      .from("agent_profiles" as any)
      .update({ enabled: !a.enabled })
      .eq("id", a.id);
    if (error) {
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
    } else {
      load();
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      {/* Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {editingId ? <Save className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
            {editingId ? "Agent bearbeiten" : "Neuen Agent anlegen"}
          </CardTitle>
          <CardDescription>
            Spezialisten-Pipeline für den Chat: Klassifizierer → Spezialisten (keyword-getriggert) → Synthesizer.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="agent-name">Name *</Label>
                <Input
                  id="agent-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="z.B. Erbrechtler"
                  required
                />
              </div>
              <div>
                <Label htmlFor="agent-order">Reihenfolge</Label>
                <Input
                  id="agent-order"
                  type="number"
                  value={form.order_index}
                  onChange={(e) => setForm({ ...form, order_index: Number(e.target.value) })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="agent-role">Rolle *</Label>
                <select
                  id="agent-role"
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                >
                  {ROLES.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="agent-model">Modell</Label>
                <select
                  id="agent-model"
                  value={form.model}
                  onChange={(e) => setForm({ ...form, model: e.target.value })}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                >
                  {MODELS.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <Label htmlFor="agent-desc">Beschreibung</Label>
              <Input
                id="agent-desc"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Kurze Beschreibung der Rolle"
              />
            </div>

            <div>
              <Label htmlFor="agent-keywords">
                Trigger-Keywords {form.role === "specialist" && "(kommasepariert, leer = immer aktiv)"}
              </Label>
              <Input
                id="agent-keywords"
                value={form.trigger_keywords}
                onChange={(e) => setForm({ ...form, trigger_keywords: e.target.value })}
                placeholder="z.B. pflichtteil, enterbt, schenkung"
                disabled={form.role !== "specialist"}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Nur für Spezialisten. Bei Treffer in Nutzerfrage oder Sachverhaltsanalyse wird dieser Agent aktiv.
              </p>
            </div>

            <div>
              <Label htmlFor="agent-prompt">System-Prompt *</Label>
              <Textarea
                id="agent-prompt"
                value={form.system_prompt}
                onChange={(e) => setForm({ ...form, system_prompt: e.target.value })}
                placeholder="Anweisungen an den Agent..."
                className="min-h-[180px] font-mono text-xs"
                required
              />
            </div>

            <div className="flex items-center gap-2">
              <Switch
                id="agent-enabled"
                checked={form.enabled}
                onCheckedChange={(v) => setForm({ ...form, enabled: v })}
              />
              <Label htmlFor="agent-enabled" className="cursor-pointer">Agent aktiviert</Label>
            </div>

            <div className="flex gap-2">
              <Button type="submit" className="flex-1">
                {editingId ? <><Save className="h-4 w-4 mr-2" />Aktualisieren</> : <><Plus className="h-4 w-4 mr-2" />Anlegen</>}
              </Button>
              {editingId && (
                <Button type="button" variant="outline" onClick={resetForm}>
                  Abbrechen
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {/* List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            Agenten-Pipeline ({agents.length})
          </CardTitle>
          <CardDescription>
            Sortiert nach Reihenfolge. Klassifizierer läuft zuerst, dann passende Spezialisten parallel, am Ende der Synthesizer.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Lade...
            </div>
          ) : agents.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Keine Agenten vorhanden.</p>
          ) : (
            <div className="space-y-3 max-h-[600px] overflow-y-auto">
              {agents.map((a) => (
                <Card key={a.id} className={`border ${!a.enabled ? "opacity-60" : ""}`}>
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start gap-2 mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">#{a.order_index}</span>
                          <h4 className="font-semibold text-sm">{a.name}</h4>
                          <Badge variant={a.role === "synthesizer" ? "default" : "secondary"} className="text-xs">
                            {a.role}
                          </Badge>
                        </div>
                        {a.description && (
                          <p className="text-xs text-muted-foreground mb-1">{a.description}</p>
                        )}
                        <p className="text-xs text-muted-foreground font-mono">{a.model}</p>
                        {a.trigger_keywords && a.trigger_keywords.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {a.trigger_keywords.map((kw, i) => (
                              <span key={i} className="text-xs bg-accent/20 px-2 py-0.5 rounded">{kw}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <Switch checked={a.enabled} onCheckedChange={() => toggleEnabled(a)} />
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => handleEdit(a)}>Bearbeiten</Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDelete(a.id, a.name)}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
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

export default AgentProfilesManager;
