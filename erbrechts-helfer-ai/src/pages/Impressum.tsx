import { Scale } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const Impressum = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-gradient-hero text-primary-foreground shadow-elegant">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Scale className="h-8 w-8 text-accent" />
              <h1 className="text-2xl font-bold">Impressum</h1>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/')}
              className="text-primary-foreground hover:bg-primary-foreground/10"
            >
              Zurück zur Startseite
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-12 max-w-4xl">
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-3xl">Impressum</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6 text-foreground">
            <section>
              <h2 className="text-xl font-semibold mb-3">Angaben gemäß § 5 TMG</h2>
              <div className="space-y-1">
                <p className="font-medium">Growth Dock Management GmbH</p>
                <p>Große Bleichen 34</p>
                <p>20354 Hamburg</p>
                <p>Deutschland</p>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">Vertreten durch</h2>
              <p>Geschäftsführer: Bastian Schmidt-Vollmer</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">Kontakt</h2>
              <div className="space-y-1">
                <p>E-Mail: info@growth-dock.com</p>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">Registereintrag</h2>
              <div className="space-y-1">
                <p>Eintragung im Handelsregister</p>
                <p>Registergericht: [Registergericht]</p>
                <p>Registernummer: [HRB-Nummer]</p>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">Umsatzsteuer-ID</h2>
              <p>Umsatzsteuer-Identifikationsnummer gemäß § 27 a Umsatzsteuergesetz:</p>
              <p>[USt-IdNr.]</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">Verantwortlich für den Inhalt nach § 55 Abs. 2 RStV</h2>
              <div className="space-y-1">
                <p>Bastian Schmidt-Vollmer</p>
                <p>Große Bleichen 34</p>
                <p>20354 Hamburg</p>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">EU-Streitschlichtung</h2>
              <p className="text-sm">
                Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung (OS) bereit:{" "}
                <a 
                  href="https://ec.europa.eu/consumers/odr/" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  https://ec.europa.eu/consumers/odr/
                </a>
                . Unsere E-Mail-Adresse finden Sie oben im Impressum.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">Verbraucherstreitbeilegung / Universalschlichtungsstelle</h2>
              <p className="text-sm">
                Wir sind nicht bereit oder verpflichtet, an Streitbeilegungsverfahren vor einer 
                Verbraucherschlichtungsstelle teilzunehmen.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">Haftungsausschluss</h2>
              
              <h3 className="font-semibold mt-4 mb-2">Haftung für Inhalte</h3>
              <p className="text-sm mb-4">
                Als Diensteanbieter sind wir gemäß § 7 Abs.1 TMG für eigene Inhalte auf diesen Seiten nach den 
                allgemeinen Gesetzen verantwortlich. Nach §§ 8 bis 10 TMG sind wir als Diensteanbieter jedoch nicht 
                verpflichtet, übermittelte oder gespeicherte fremde Informationen zu überwachen oder nach Umständen 
                zu forschen, die auf eine rechtswidrige Tätigkeit hinweisen.
              </p>

              <h3 className="font-semibold mt-4 mb-2">Haftung für Links</h3>
              <p className="text-sm mb-4">
                Unser Angebot enthält Links zu externen Websites Dritter, auf deren Inhalte wir keinen Einfluss haben. 
                Deshalb können wir für diese fremden Inhalte auch keine Gewähr übernehmen. Für die Inhalte der 
                verlinkten Seiten ist stets der jeweilige Anbieter oder Betreiber der Seiten verantwortlich.
              </p>

              <h3 className="font-semibold mt-4 mb-2">Urheberrecht</h3>
              <p className="text-sm">
                Die durch die Seitenbetreiber erstellten Inhalte und Werke auf diesen Seiten unterliegen dem 
                deutschen Urheberrecht. Die Vervielfältigung, Bearbeitung, Verbreitung und jede Art der Verwertung 
                außerhalb der Grenzen des Urheberrechtes bedürfen der schriftlichen Zustimmung des jeweiligen 
                Autors bzw. Erstellers.
              </p>
            </section>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default Impressum;
