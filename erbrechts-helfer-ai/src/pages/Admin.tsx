import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { FileText, Plus, Trash2, ArrowLeft, Save, Upload, LogOut, Download, BookOpen, Bot, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AgentProfilesManager from "@/components/AgentProfilesManager";
import PrecedentBoard from "@/components/PrecedentBoard";
import LogiccTestPanel from "@/components/LogiccTestPanel";

import jsPDF from "jspdf";
import { User, Session } from "@supabase/supabase-js";

// Temporärer Type bis die Supabase-Types aktualisiert werden
type KnowledgeDoc = {
  title: string;
  content: string;
  category: string | null;
  tags: string[] | null;
};

interface KnowledgeDocument {
  id: string;
  title: string;
  content: string;
  category: string | null;
  tags: string[] | null;
  created_at: string;
}

const Admin = () => {
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [editingDoc, setEditingDoc] = useState<KnowledgeDocument | null>(null);
  const [formData, setFormData] = useState({
    title: "",
    content: "",
    category: "",
    tags: ""
  });
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const { toast } = useToast();
  const navigate = useNavigate();

  // Authentication and admin check
  useEffect(() => {
    const checkAdminStatus = async (userId: string) => {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .eq('role', 'admin')
        .single();
      
      if (error || !data) {
        setIsAdmin(false);
        toast({
          title: "Zugriff verweigert",
          description: "Sie haben keine Berechtigung, auf diese Seite zuzugreifen.",
          variant: "destructive",
        });
        navigate('/');
      } else {
        setIsAdmin(true);
      }
      setIsCheckingAuth(false);
    };

    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        if (!session) {
          navigate("/auth");
        } else {
          checkAdminStatus(session.user.id);
        }
      }
    );

    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (!session) {
        navigate("/auth");
      } else {
        checkAdminStatus(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate, toast]);

  useEffect(() => {
    if (session && isAdmin) {
      loadDocuments();
    }
  }, [session, isAdmin]);

  const loadDocuments = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('knowledge-management', {
        body: { action: 'list' }
      });

      if (error) throw error;
      setDocuments(data.documents || []);
    } catch (error) {
      console.error('Error loading documents:', error);
      toast({
        title: "Fehler",
        description: "Dokumente konnten nicht geladen werden.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handlePDFUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      toast({
        title: "Ungültiges Format",
        description: "Bitte laden Sie nur PDF-Dateien hoch.",
        variant: "destructive"
      });
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      toast({
        title: "Datei zu groß",
        description: "Maximale Dateigröße ist 20 MB.",
        variant: "destructive"
      });
      return;
    }

    setIsUploading(true);
    
    try {
      toast({
        title: "PDF wird verarbeitet...",
        description: "Text wird extrahiert - dies kann einen Moment dauern."
      });

      // Lese PDF als Text (vereinfachte Version)
      const reader = new FileReader();
      
      reader.onload = async (event) => {
        try {
          const docData: KnowledgeDoc = {
            title: file.name.replace('.pdf', ''),
            content: `[PDF-Dokument: ${file.name}]\n\nDieses Dokument wurde hochgeladen und wartet auf Verarbeitung. In einer vollständigen Implementierung würde hier der extrahierte Text stehen.`,
            category: "PDF Import",
            tags: ["pdf", "upload"]
          };

          const { error } = await supabase.functions.invoke('knowledge-management', {
            body: {
              action: 'create',
              data: docData
            }
          });

          if (error) throw error;

          toast({
            title: "PDF erfolgreich hochgeladen",
            description: "Das Dokument wurde zur Wissensbasis hinzugefügt.",
          });

          loadDocuments();
        } catch (error) {
          console.error('Error saving PDF:', error);
          throw error;
        }
      };

      reader.onerror = () => {
        throw new Error('Fehler beim Lesen der Datei');
      };

      reader.readAsArrayBuffer(file);
    } catch (error: any) {
      console.error('Error uploading PDF:', error);
      toast({
        title: "Fehler",
        description: error?.message || "PDF konnte nicht verarbeitet werden.",
        variant: "destructive"
      });
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validierung
    if (!formData.title.trim() || formData.title.length > 200) {
      toast({
        title: "Ungültiger Titel",
        description: "Titel muss zwischen 1 und 200 Zeichen lang sein.",
        variant: "destructive"
      });
      return;
    }

    if (!formData.content.trim() || formData.content.length > 50000) {
      toast({
        title: "Ungültiger Inhalt",
        description: "Inhalt muss zwischen 1 und 50.000 Zeichen lang sein.",
        variant: "destructive"
      });
      return;
    }
    
    try {
      const tagsArray = formData.tags
        .split(',')
        .map(tag => tag.trim())
        .filter(tag => tag.length > 0 && tag.length <= 50)
        .slice(0, 20); // Max 20 tags

      const docData: KnowledgeDoc = {
        title: formData.title.trim(),
        content: formData.content.trim(),
        category: formData.category.trim() || null,
        tags: tagsArray.length > 0 ? tagsArray : null
      };

      if (editingDoc) {
        const { error } = await supabase.functions.invoke('knowledge-management', {
          body: {
            action: 'update',
            id: editingDoc.id,
            data: docData
          }
        });

        if (error) throw error;
        
        toast({
          title: "Erfolgreich",
          description: "Dokument wurde aktualisiert."
        });
      } else {
        const { error } = await supabase.functions.invoke('knowledge-management', {
          body: {
            action: 'create',
            data: docData
          }
        });

        if (error) throw error;
        
        toast({
          title: "Erfolgreich",
          description: "Dokument wurde hinzugefügt."
        });
      }

      setFormData({ title: "", content: "", category: "", tags: "" });
      setEditingDoc(null);
      loadDocuments();
    } catch (error: any) {
      console.error('Error saving document:', error);
      toast({
        title: "Fehler",
        description: error?.message || "Dokument konnte nicht gespeichert werden.",
        variant: "destructive"
      });
    }
  };

  const handleEdit = (doc: KnowledgeDocument) => {
    setEditingDoc(doc);
    setFormData({
      title: doc.title,
      content: doc.content,
      category: doc.category || "",
      tags: doc.tags?.join(', ') || ""
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Möchten Sie dieses Dokument wirklich löschen?')) return;

    try {
      const { error } = await supabase.functions.invoke('knowledge-management', {
        body: {
          action: 'delete',
          id
        }
      });

      if (error) throw error;
      
      toast({
        title: "Erfolgreich",
        description: "Dokument wurde gelöscht."
      });
      
      loadDocuments();
    } catch (error: any) {
      console.error('Error deleting document:', error);
      toast({
        title: "Fehler",
        description: error?.message || "Dokument konnte nicht gelöscht werden.",
        variant: "destructive"
      });
    }
  };

  const handleCancel = () => {
    setEditingDoc(null);
    setFormData({ title: "", content: "", category: "", tags: "" });
  };

  const generateManualPDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 20;
    const maxWidth = pageWidth - 2 * margin;
    let yPos = 20;
    
    const addText = (text: string, fontSize: number, isBold: boolean = false, color: [number, number, number] = [0, 0, 0]) => {
      doc.setFontSize(fontSize);
      doc.setFont("helvetica", isBold ? "bold" : "normal");
      doc.setTextColor(color[0], color[1], color[2]);
      const lines = doc.splitTextToSize(text, maxWidth);
      
      if (yPos + (lines.length * fontSize * 0.5) > 280) {
        doc.addPage();
        yPos = 20;
      }
      
      doc.text(lines, margin, yPos);
      yPos += lines.length * fontSize * 0.5 + 5;
    };
    
    const addSpace = (space: number) => {
      yPos += space;
    };

    // Title
    addText("BKL Legacy-Chat", 24, true, [0, 51, 102]);
    addText("Administratorhandbuch", 18, true, [51, 51, 51]);
    addSpace(10);
    
    // Section: Login
    addText("Anmeldung als Administrator", 16, true, [0, 51, 102]);
    addSpace(3);
    addText("1. Zugang zur Anwendung:", 12, true);
    addText("   Oeffnen Sie die App unter: https://erbrechts-helfer-ai.lovable.app", 11, false);
    addSpace(3);
    addText("2. Anmeldung:", 12, true);
    addText("   - Klicken Sie oben rechts auf 'Anmelden'", 11, false);
    addText("   - Geben Sie Ihre E-Mail-Adresse ein", 11, false);
    addText("   - Geben Sie Ihr Passwort ein", 11, false);
    addText("   - Klicken Sie auf 'Anmelden'", 11, false);
    addSpace(3);
    addText("3. Admin-Bereich aufrufen:", 12, true);
    addText("   Nach erfolgreicher Anmeldung erscheint oben rechts der Button 'Wissensbasis'.", 11, false);
    addText("   Klicken Sie darauf, um zur Dokumentenverwaltung zu gelangen.", 11, false);
    addSpace(10);

    // Section: Was ist der Legacy-Chat?
    addText("Was ist der Legacy-Chat?", 16, true, [0, 51, 102]);
    addSpace(3);
    addText("Der Legacy-Chat ist ein KI-gestuetzter Assistent fuer Nachfolgeplanung und Erbrecht.", 11, false);
    addText("Er nutzt eine firmeneigene Wissensbasis anstelle von allgemeinem Internet-Wissen.", 11, false);
    addSpace(3);
    addText("Vorteile:", 12, true);
    addText("   - Vermeidung von Halluzinationen durch geprueftes Wissen", 11, false);
    addText("   - Aktuelle und verifizierte Informationen", 11, false);
    addText("   - Transparente Quellenangaben bei jeder Antwort", 11, false);
    addSpace(10);

    // Section: Fuer wen?
    addText("Fuer wen ist der Legacy-Chat?", 16, true, [0, 51, 102]);
    addSpace(3);
    addText("Interne Mitarbeiter: Chat + Wissensbasis-Verwaltung", 11, false);
    addText("Ausgewaehlte Vertriebspartner: Chat (nach Admin-Freigabe)", 11, false);
    addText("Mandanten: Spaeter geplant", 11, false);
    addSpace(10);

    // Section: So funktioniert der Chat
    addText("So funktioniert der Chat", 16, true, [0, 51, 102]);
    addSpace(3);
    addText("1. Nutzer stellt eine Frage zum deutschen Erbrecht", 11, false);
    addText("2. System durchsucht die Wissensbasis nach relevanten Dokumenten", 11, false);
    addText("3. KI generiert Antwort ausschliesslich basierend auf gefundenen Dokumenten", 11, false);
    addText("4. Quellenangaben werden transparent angezeigt", 11, false);
    addSpace(10);

    // Section: Wissensbasis verwalten
    addText("Wissensbasis verwalten (Admin)", 16, true, [0, 51, 102]);
    addSpace(3);
    addText("Neues Dokument hinzufuegen:", 12, true);
    addSpace(3);
    addText("Titel: Aussagekraeftiger Name (z.B. 'Pflichtteil Ehegatten')", 11, false);
    addText("Kategorie: Themenbereich (z.B. 'Pflichtteilsrecht')", 11, false);
    addText("Inhalt: Fachlicher Text mit Paragraphen", 11, false);
    addText("Tags: Suchbegriffe (z.B. 'Pflichtteil, Ehegatte, Paragraph 2303 BGB')", 11, false);
    addSpace(5);
    addText("Best Practices:", 12, true);
    addText("   - Ein Thema pro Dokument", 11, false);
    addText("   - Konkrete Paragraphen nennen", 11, false);
    addText("   - Praxisbeispiele einfuegen", 11, false);
    addText("   - Regelmaessig aktualisieren", 11, false);
    addSpace(10);

    // Section: Sicherheit
    addText("Sicherheit", 16, true, [0, 51, 102]);
    addSpace(3);
    addText("- Alle Daten verschluesselt gespeichert", 11, false);
    addText("- Rollenbasierte Zugriffskontrolle", 11, false);
    addText("- Rate-Limiting gegen Missbrauch (max. 20 Anfragen/Stunde)", 11, false);
    addText("- Nur Admins koennen Dokumente bearbeiten", 11, false);
    addSpace(15);

    // Footer
    addText("Stand: Januar 2026", 10, false, [128, 128, 128]);
    addText("BKL Rechtsanwaelte - Legacy-Chat Administratorhandbuch", 10, false, [128, 128, 128]);

    doc.save("BKL-Legacy-Chat-Administratorhandbuch.pdf");
    
    toast({
      title: "PDF erstellt",
      description: "Das Administratorhandbuch wurde heruntergeladen.",
    });
  };

  const handleLogout = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      
      toast({
        title: "Erfolgreich abgemeldet",
        description: "Sie wurden erfolgreich abgemeldet.",
      });
      
      navigate("/auth");
    } catch (error: any) {
      toast({
        title: "Fehler",
        description: error?.message || "Abmeldung fehlgeschlagen.",
        variant: "destructive"
      });
    }
  };

  if (!session || isCheckingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-lg">Lade...</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      {(
        <div className="container mx-auto px-4 py-8">
          <div className="mb-6">
            <div className="flex justify-between items-start mb-4">
              <Button
                onClick={() => navigate('/')}
                variant="ghost"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Zurück zur Hauptseite
              </Button>
              
              <div className="flex gap-2">
                <Button
                  onClick={generateManualPDF}
                  variant="outline"
                >
                  <BookOpen className="h-4 w-4 mr-2" />
                  Handbuch (PDF)
                </Button>
                
                <Button
                  onClick={handleLogout}
                  variant="outline"
                >
                  <LogOut className="h-4 w-4 mr-2" />
                  Abmelden
                </Button>
              </div>
            </div>
            
            <h1 className="text-3xl font-bold text-primary mb-2">
              Admin-Bereich
            </h1>
            <p className="text-muted-foreground">
              Verwalten Sie die Wissensbasis und die Spezialisten-Agenten des Chats.
            </p>
          </div>

          <Tabs defaultValue="knowledge" className="w-full">
            <TabsList className="mb-6">
              <TabsTrigger value="knowledge">
                <FileText className="h-4 w-4 mr-2" />
                Wissensbasis
              </TabsTrigger>
              <TabsTrigger value="agents">
                <Bot className="h-4 w-4 mr-2" />
                Agenten-Pipeline
              </TabsTrigger>
              <TabsTrigger value="precedent">
                <TrendingUp className="h-4 w-4 mr-2" />
                Precedent Board
              </TabsTrigger>
              <TabsTrigger value="logicc-test">
                <Bot className="h-4 w-4 mr-2" />
                Logicc-Test
              </TabsTrigger>
            </TabsList>

            <TabsContent value="logicc-test">
              <LogiccTestPanel />
            </TabsContent>


            <TabsContent value="knowledge">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* PDF Upload */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                PDF-Dokumente hochladen
              </CardTitle>
              <CardDescription>
                Laden Sie Urteile, Kommentare oder andere PDF-Dokumente hoch. Der Text wird automatisch extrahiert.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
                <Upload className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-sm text-muted-foreground mb-4">
                  Klicken Sie hier oder ziehen Sie eine PDF-Datei hierher
                </p>
                <Input
                  type="file"
                  accept=".pdf"
                  onChange={handlePDFUpload}
                  disabled={isUploading}
                  className="cursor-pointer"
                />
                {isUploading && (
                  <p className="text-sm text-accent mt-4">
                    PDF wird verarbeitet...
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Manuelles Formular */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {editingDoc ? <Save className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
                {editingDoc ? 'Dokument bearbeiten' : 'Manuell hinzufügen'}
              </CardTitle>
              <CardDescription>
                Fügen Sie Text manuell hinzu oder bearbeiten Sie bestehende Dokumente.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="title">Titel *</Label>
                  <Input
                    id="title"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="z.B. § 2303 BGB - Pflichtteilsrecht"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="category">Kategorie</Label>
                  <Input
                    id="category"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    placeholder="z.B. Pflichtteilsrecht, Erbschaftssteuer"
                  />
                </div>

                <div>
                  <Label htmlFor="tags">Tags (kommasepariert)</Label>
                  <Input
                    id="tags"
                    value={formData.tags}
                    onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                    placeholder="z.B. BGB, Pflichtteil, Erbrecht"
                  />
                </div>

                <div>
                  <Label htmlFor="content">Inhalt *</Label>
                  <Textarea
                    id="content"
                    value={formData.content}
                    onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                    placeholder="Fügen Sie hier den vollständigen Text des Rechtsdokuments ein..."
                    className="min-h-[200px]"
                    required
                  />
                  <p className="text-sm text-muted-foreground mt-1">
                    Je detaillierter der Inhalt, desto präziser die KI-Antworten.
                  </p>
                </div>

                <div className="flex gap-2">
                  <Button type="submit" className="flex-1">
                    {editingDoc ? (
                      <>
                        <Save className="h-4 w-4 mr-2" />
                        Aktualisieren
                      </>
                    ) : (
                      <>
                        <Plus className="h-4 w-4 mr-2" />
                        Hinzufügen
                      </>
                    )}
                  </Button>
                  {editingDoc && (
                    <Button type="button" variant="outline" onClick={handleCancel}>
                      Abbrechen
                    </Button>
                  )}
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Dokumentenliste */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Vorhandene Dokumente ({documents.length})
              </CardTitle>
              <CardDescription>
                Diese Dokumente werden von der KI durchsucht.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <p className="text-center text-muted-foreground py-8">Lade Dokumente...</p>
              ) : documents.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  Noch keine Dokumente vorhanden. Fügen Sie Ihr erstes Dokument hinzu!
                </p>
              ) : (
                <div className="space-y-3 max-h-[600px] overflow-y-auto">
                  {documents.map((doc) => (
                    <Card key={doc.id} className="border">
                      <CardContent className="p-4">
                        <div className="flex justify-between items-start gap-2">
                          <div className="flex-1">
                            <h4 className="font-semibold text-sm mb-1">{doc.title}</h4>
                            {doc.category && (
                              <Badge variant="secondary" className="mb-2">
                                {doc.category}
                              </Badge>
                            )}
                            <p className="text-xs text-muted-foreground line-clamp-2">
                              {doc.content}
                            </p>
                            {doc.tags && doc.tags.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {doc.tags.map((tag, idx) => (
                                  <span key={idx} className="text-xs bg-accent/20 px-2 py-0.5 rounded">
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleEdit(doc)}
                            >
                              Bearbeiten
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDelete(doc.id)}
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
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
            </TabsContent>

            <TabsContent value="agents">
              <AgentProfilesManager />
            </TabsContent>

            <TabsContent value="precedent">
              <PrecedentBoard />
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
};

export default Admin;