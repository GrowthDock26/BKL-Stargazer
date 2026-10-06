import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Calculator, AlertTriangle, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface PersonalData {
  maritalStatus: string;
  children: number;
  grandchildren: number;
  parents: boolean;
  totalAssets: number;
  spouse: boolean;
}

interface TaxCalculation {
  heir: string;
  inheritance: number;
  allowance: number;
  taxableAmount: number;
  taxClass: number;
  taxRate: number;
  taxAmount: number;
}

const ProbeesterbenCalculator = () => {
  const [personalData, setPersonalData] = useState<PersonalData>({
    maritalStatus: "",
    children: 0,
    grandchildren: 0,
    parents: false,
    totalAssets: 0,
    spouse: false
  });
  
  const [calculations, setCalculations] = useState<TaxCalculation[]>([]);
  const [showResults, setShowResults] = useState(false);
  const { toast } = useToast();

  const allowances = {
    spouse: 500000,
    child: 400000,
    grandchild: 200000,
    parent: 100000,
    other: 20000
  };

  const taxRates = {
    class1: [
      { min: 0, max: 75000, rate: 7 },
      { min: 75000, max: 300000, rate: 11 },
      { min: 300000, max: 600000, rate: 15 },
      { min: 600000, max: 6000000, rate: 19 },
      { min: 6000000, max: 13000000, rate: 23 },
      { min: 13000000, max: 26000000, rate: 27 },
      { min: 26000000, max: Infinity, rate: 30 }
    ]
  };

  const calculateTax = (taxableAmount: number, taxClass: number) => {
    if (taxableAmount <= 0) return 0;
    
    const rates = taxRates.class1;
    for (const bracket of rates) {
      if (taxableAmount <= bracket.max) {
        return Math.round(taxableAmount * (bracket.rate / 100));
      }
    }
    return Math.round(taxableAmount * 0.30);
  };

  const handleCalculate = () => {
    if (!personalData.maritalStatus || personalData.totalAssets <= 0) {
      toast({
        title: "Unvollständige Angaben",
        description: "Bitte füllen Sie alle Pflichtfelder aus.",
        variant: "destructive"
      });
      return;
    }

    const results: TaxCalculation[] = [];
    const isMarried = personalData.maritalStatus === "married";
    const hasChildren = personalData.children > 0;
    const hasParents = personalData.parents;

    // Gesetzliche Erbfolge nach deutschem Erbrecht
    if (isMarried && hasChildren) {
      // Fall 1: Verheiratet MIT Kindern
      // Ehegatte erbt 1/2, Kinder teilen sich 1/2
      const spouseInheritance = personalData.totalAssets / 2;
      const spouseAllowance = allowances.spouse;
      const spouseTaxable = Math.max(0, spouseInheritance - spouseAllowance);
      
      results.push({
        heir: "Ehegatte/Lebenspartner",
        inheritance: spouseInheritance,
        allowance: spouseAllowance,
        taxableAmount: spouseTaxable,
        taxClass: 1,
        taxRate: spouseTaxable > 0 ? (calculateTax(spouseTaxable, 1) / spouseTaxable) * 100 : 0,
        taxAmount: calculateTax(spouseTaxable, 1)
      });

      // Kinder teilen sich die andere Hälfte
      const childrenShare = personalData.totalAssets / 2;
      const inheritancePerChild = childrenShare / personalData.children;
      const childAllowance = allowances.child;
      
      for (let i = 1; i <= personalData.children; i++) {
        const taxableAmount = Math.max(0, inheritancePerChild - childAllowance);
        results.push({
          heir: `Kind ${i}`,
          inheritance: inheritancePerChild,
          allowance: childAllowance,
          taxableAmount,
          taxClass: 1,
          taxRate: taxableAmount > 0 ? (calculateTax(taxableAmount, 1) / taxableAmount) * 100 : 0,
          taxAmount: calculateTax(taxableAmount, 1)
        });
      }
    } else if (isMarried && !hasChildren && hasParents) {
      // Fall 2: Verheiratet OHNE Kinder, MIT Eltern
      // Ehegatte erbt 3/4, Eltern erben 1/4
      const spouseInheritance = (personalData.totalAssets * 3) / 4;
      const spouseAllowance = allowances.spouse;
      const spouseTaxable = Math.max(0, spouseInheritance - spouseAllowance);
      
      results.push({
        heir: "Ehegatte/Lebenspartner",
        inheritance: spouseInheritance,
        allowance: spouseAllowance,
        taxableAmount: spouseTaxable,
        taxClass: 1,
        taxRate: spouseTaxable > 0 ? (calculateTax(spouseTaxable, 1) / spouseTaxable) * 100 : 0,
        taxAmount: calculateTax(spouseTaxable, 1)
      });

      const parentsInheritance = personalData.totalAssets / 4;
      const parentAllowance = allowances.parent;
      const parentsTaxable = Math.max(0, parentsInheritance - parentAllowance);
      
      results.push({
        heir: "Eltern",
        inheritance: parentsInheritance,
        allowance: parentAllowance,
        taxableAmount: parentsTaxable,
        taxClass: 1,
        taxRate: parentsTaxable > 0 ? (calculateTax(parentsTaxable, 1) / parentsTaxable) * 100 : 0,
        taxAmount: calculateTax(parentsTaxable, 1)
      });
    } else if (isMarried && !hasChildren && !hasParents) {
      // Fall 3: Verheiratet OHNE Kinder, OHNE Eltern
      // Ehegatte erbt alles
      const spouseInheritance = personalData.totalAssets;
      const spouseAllowance = allowances.spouse;
      const spouseTaxable = Math.max(0, spouseInheritance - spouseAllowance);
      
      results.push({
        heir: "Ehegatte/Lebenspartner",
        inheritance: spouseInheritance,
        allowance: spouseAllowance,
        taxableAmount: spouseTaxable,
        taxClass: 1,
        taxRate: spouseTaxable > 0 ? (calculateTax(spouseTaxable, 1) / spouseTaxable) * 100 : 0,
        taxAmount: calculateTax(spouseTaxable, 1)
      });
    } else if (!isMarried && hasChildren) {
      // Fall 4: Nicht verheiratet MIT Kindern
      // Kinder erben zu gleichen Teilen
      const inheritancePerChild = personalData.totalAssets / personalData.children;
      const childAllowance = allowances.child;
      
      for (let i = 1; i <= personalData.children; i++) {
        const taxableAmount = Math.max(0, inheritancePerChild - childAllowance);
        results.push({
          heir: `Kind ${i}`,
          inheritance: inheritancePerChild,
          allowance: childAllowance,
          taxableAmount,
          taxClass: 1,
          taxRate: taxableAmount > 0 ? (calculateTax(taxableAmount, 1) / taxableAmount) * 100 : 0,
          taxAmount: calculateTax(taxableAmount, 1)
        });
      }
    } else if (!isMarried && !hasChildren && hasParents) {
      // Fall 5: Nicht verheiratet OHNE Kinder, MIT Eltern
      // Eltern erben alles
      const parentsInheritance = personalData.totalAssets;
      const parentAllowance = allowances.parent;
      const parentsTaxable = Math.max(0, parentsInheritance - parentAllowance);
      
      results.push({
        heir: "Eltern",
        inheritance: parentsInheritance,
        allowance: parentAllowance,
        taxableAmount: parentsTaxable,
        taxClass: 1,
        taxRate: parentsTaxable > 0 ? (calculateTax(parentsTaxable, 1) / parentsTaxable) * 100 : 0,
        taxAmount: calculateTax(parentsTaxable, 1)
      });
    }

    if (results.length === 0) {
      toast({
        title: "Keine Erben",
        description: "Bitte geben Sie mindestens einen Erben an (Kinder oder Eltern).",
        variant: "destructive"
      });
      return;
    }

    setCalculations(results);
    setShowResults(true);
    
    toast({
      title: "Berechnung abgeschlossen",
      description: "Die Erbschaftssteuer wurde erfolgreich berechnet."
    });
  };

  const totalTax = calculations.reduce((sum, calc) => sum + calc.taxAmount, 0);

  return (
    <div className="space-y-6">
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-3 text-primary">
            <Calculator className="h-6 w-6 text-accent" />
            Probesterben-Rechner
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="maritalStatus">Familienstand *</Label>
              <Select
                value={personalData.maritalStatus}
                onValueChange={(value) => setPersonalData(prev => ({ ...prev, maritalStatus: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Bitte wählen" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="single">Ledig</SelectItem>
                  <SelectItem value="married">Verheiratet/Verpartnert</SelectItem>
                  <SelectItem value="divorced">Geschieden</SelectItem>
                  <SelectItem value="widowed">Verwitwet</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="totalAssets">Gesamtvermögen (€) *</Label>
              <Input
                id="totalAssets"
                type="number"
                placeholder="z.B. 500000"
                value={personalData.totalAssets || ""}
                onChange={(e) => setPersonalData(prev => ({ 
                  ...prev, 
                  totalAssets: parseInt(e.target.value) || 0 
                }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="children">Anzahl Kinder</Label>
              <Input
                id="children"
                type="number"
                min="0"
                value={personalData.children || ""}
                onChange={(e) => setPersonalData(prev => ({ 
                  ...prev, 
                  children: parseInt(e.target.value) || 0 
                }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="parents">Eltern vorhanden?</Label>
              <Select
                value={personalData.parents ? "yes" : "no"}
                onValueChange={(value) => setPersonalData(prev => ({ ...prev, parents: value === "yes" }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Bitte wählen" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes">Ja</SelectItem>
                  <SelectItem value="no">Nein</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button 
            onClick={handleCalculate}
            className="w-full"
            variant="accent"
            size="lg"
          >
            <Calculator className="h-4 w-4 mr-2" />
            Erbschaftssteuer berechnen
          </Button>
        </CardContent>
      </Card>

      {showResults && (
        <Card className="shadow-elegant">
          <CardHeader>
            <CardTitle className="text-primary">Berechnungsergebnis</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {calculations.map((calc, index) => (
              <div key={index} className="space-y-3">
                <div className="flex justify-between items-center">
                  <h4 className="font-semibold text-primary">{calc.heir}</h4>
                  <span className="text-sm text-muted-foreground">Steuerklasse I</span>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Erbanteil</p>
                    <p className="font-medium">{calc.inheritance.toLocaleString('de-DE')} €</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Freibetrag</p>
                    <p className="font-medium">{calc.allowance.toLocaleString('de-DE')} €</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Steuerpflichtig</p>
                    <p className="font-medium">{calc.taxableAmount.toLocaleString('de-DE')} €</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Erbschaftssteuer</p>
                    <p className="font-semibold text-accent">{calc.taxAmount.toLocaleString('de-DE')} €</p>
                  </div>
                </div>
                
                {index < calculations.length - 1 && <Separator />}
              </div>
            ))}

            <div className="bg-accent/10 p-4 rounded-lg">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-primary">Gesamte Erbschaftssteuer:</span>
                <span className="text-xl font-bold text-accent">{totalTax.toLocaleString('de-DE')} €</span>
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                Effektive Steuerbelastung: {personalData.totalAssets > 0 ? ((totalTax / personalData.totalAssets) * 100).toFixed(2) : 0}%
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex items-start gap-3 p-4 bg-yellow-50 dark:bg-yellow-950/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-500 mt-0.5 flex-shrink-0" />
                <div className="space-y-2">
                  <h5 className="font-medium text-yellow-800 dark:text-yellow-200">Wichtige Hinweise</h5>
                  <ul className="text-sm text-yellow-700 dark:text-yellow-300 space-y-1">
                    <li>• Diese Berechnung ist eine Simulation auf Basis der aktuellen Gesetzeslage</li>
                    <li>• Nicht berücksichtigt: Haushalts- und Versorgungsfreibeträge</li>
                    <li>• Nicht berücksichtigt: Zugewinnausgleichsansprüche</li>
                    <li>• Nicht berücksichtigt: Besondere Bewertungsabschläge (z.B. Immobilien)</li>
                    <li>• Für eine exakte Berechnung konsultieren Sie einen Steuerberater</li>
                  </ul>
                </div>
              </div>

              <div className="flex items-start gap-3 p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <Info className="h-5 w-5 text-blue-600 dark:text-blue-500 mt-0.5 flex-shrink-0" />
                <div>
                  <h5 className="font-medium text-blue-800 dark:text-blue-200 mb-2">Rechtliche Grundlagen</h5>
                  <p className="text-sm text-blue-700 dark:text-blue-300">
                    Berechnung nach §§ 15-19 ErbStG (Erbschaftsteuer- und Schenkungsteuergesetz). 
                    Freibeträge nach § 16 ErbStG, Steuersätze nach § 19 ErbStG.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ProbeesterbenCalculator;