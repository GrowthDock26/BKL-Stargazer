import LegalHeader from "@/components/LegalHeader";
import LegalDisclaimer from "@/components/LegalDisclaimer";
import DocumentAnalysis from "@/components/DocumentAnalysis";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

const DokumenteAnalyse = () => {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-background relative">
      <LegalHeader />
      <main className="container max-w-4xl mx-auto px-4 py-12 pt-20">
        <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="mb-6">
          <ArrowLeft className="h-4 w-4 mr-2" /> Zurück zum Chat
        </Button>
        <h1 className="text-3xl font-semibold text-primary mb-2">Erbrechtliche Dokumenten-Analyse</h1>
        <p className="text-muted-foreground mb-8">
          KI-gestützte Prüfung von Testament, Erbvertrag, Schenkungsvertrag, Vorsorgevollmacht, Patientenverfügung
          und Vermögensübersichten – inkl. Erbquoten, Erbschaftsteuer und Optimierungsvorschlägen.
        </p>
        <DocumentAnalysis />
        <div className="mt-8">
          <LegalDisclaimer />
        </div>
      </main>
    </div>
  );
};

export default DokumenteAnalyse;
