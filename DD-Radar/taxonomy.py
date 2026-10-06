"""DD-Katalog: Soll-Dokumente einer Investoren-Due-Diligence (deutsches Start-up).

Der Katalog ist die deterministische Grundlage des Tools. Die KI ordnet gefundene
Dokumente diesen IDs zu — sie erfindet keine eigenen Kategorien.

Quellenbasis: Klotzkette-Plugins `grosskanzlei-corporate-ma` (Datenraum-Aufbau,
DD-Legal, Datenraum-Gap-Analyse, Information Request List) und
`gesellschaftsgruender` (Cap Table, SHA, Wandeldarlehen, Handelsregister),
zugeschnitten auf die Verkäufer-/Zielgesellschaftsperspektive bei einer
VC-Finanzierungsrunde.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from config import PRIO_HOCH, PRIO_KRITISCH, PRIO_MITTEL

# ---------------------------------------------------------------------------
# Workstreams (Reihenfolge = Reihenfolge im Bericht und im Datenraum)
# ---------------------------------------------------------------------------

WORKSTREAMS: dict[str, str] = {
    "CORP": "01 Gesellschaftsrecht & Corporate Housekeeping",
    "FIN":  "02 Finanzierung & Cap Table",
    "ACC":  "03 Rechnungswesen & Steuern",
    "HR":   "04 Personal & Arbeitsrecht",
    "IP":   "05 IP, Marken & Technologie",
    "COM":  "06 Kunden-, Lieferanten- & Vertriebsverträge",
    "DAT":  "07 Datenschutz, IT-Sicherheit & KI-Compliance",
    "REG":  "08 Genehmigungen & Regulatorik",
    "INS":  "09 Versicherungen",
    "IMM":  "10 Immobilien, Miete & Leasing",
    "LIT":  "11 Streitigkeiten & Haftung",
    "ESG":  "12 ESG & Sonstiges",
}

PROFILE: dict[str, str] = {
    "SEED": "Pre-Seed / Seed — schlanker Katalog, Fokus Gründungs- und IP-Hygiene",
    "VC":   "Venture-Capital-Finanzierungsrunde (Series A/B) — Standardkatalog",
    "MA":   "M&A / Share Deal — vollständiger Katalog inkl. Exit-Themen",
}

ALLE = ("SEED", "VC", "MA")
AB_VC = ("VC", "MA")
NUR_MA = ("MA",)


@dataclass(frozen=True)
class SollDokument:
    """Ein erwarteter Datenraum-Bestandteil."""

    id: str
    workstream: str
    titel: str
    prioritaet: str
    warum: str                                  # Investorensicht: was passiert, wenn es fehlt
    stichworte: tuple[str, ...]                 # deterministische Vorfilterung
    rechtsgrundlage: str = ""
    mehrfach: bool = False                      # mehrere Dokumente erwartet
    profile: tuple[str, ...] = ALLE
    pruefpunkte: tuple[str, ...] = field(default_factory=tuple)


def _d(*args, **kwargs) -> SollDokument:  # Kurzform für die Katalogdefinition
    return SollDokument(*args, **kwargs)


KATALOG: tuple[SollDokument, ...] = (
    # -- CORP ---------------------------------------------------------------
    _d("CORP-01", "CORP", "Aktueller Handelsregisterauszug (HRB)", PRIO_KRITISCH,
       "Ohne aktuellen HR-Auszug kann der Investor Existenz, Vertretung und Stammkapital nicht verifizieren.",
       ("handelsregister", "hrb", "hra", "registerauszug", "amtsgericht", "chronologisch"),
       "§ 8 GmbHG, § 15 HGB",
       pruefpunkte=("Abrufdatum < 3 Monate?", "Chronologischer Auszug beigefügt?")),
    _d("CORP-02", "CORP", "Gesellschaftsvertrag / Satzung (aktuelle Fassung)", PRIO_KRITISCH,
       "Grundlage jeder Beteiligung; veraltete Fassungen führen zu falschen Annahmen über Vinkulierung und Mehrheiten.",
       ("gesellschaftsvertrag", "satzung", "articles of association", "statuten"),
       "§ 3 GmbHG",
       pruefpunkte=("Notariell beurkundet?", "Fassung entspricht letztem HR-Stand?", "Vinkulierung geregelt?")),
    _d("CORP-03", "CORP", "Gesellschafterliste (zum Register eingereicht)", PRIO_KRITISCH,
       "Nur die im Register aufgenommene Liste legitimiert gegenüber der Gesellschaft (§ 16 GmbHG).",
       ("gesellschafterliste", "liste der gesellschafter", "shareholder list"),
       "§ 40 GmbHG, § 16 GmbHG"),
    _d("CORP-04", "CORP", "Cap Table (voll verwässert)", PRIO_KRITISCH,
       "Fully-diluted Cap Table ist die Rechengrundlage der Runde; Abweichungen zur Gesellschafterliste sind ein Standard-Red-Flag.",
       ("cap table", "captable", "beteiligungsstruktur", "anteilsverteilung", "fully diluted", "verwässert"),
       "",
       pruefpunkte=("Wandeldarlehen/SAFE eingerechnet?", "ESOP-Pool ausgewiesen?", "Abgleich mit Gesellschafterliste")),
    _d("CORP-05", "CORP", "Gesellschaftervereinbarung / SHA inkl. Nachträge", PRIO_KRITISCH,
       "Altvereinbarungen (Vetos, Liquidationspräferenzen, Drag/Tag) kollidieren häufig mit dem neuen Term Sheet.",
       ("gesellschaftervereinbarung", "shareholders agreement", "sha", "beteiligungsvertrag",
        "investment agreement", "drag along", "tag along"),
       "",
       pruefpunkte=("Alle Nachträge vollständig?", "Change-of-Control-Klauseln?", "Zustimmungsvorbehalte")),
    _d("CORP-06", "CORP", "Gesellschafterbeschlüsse / GV-Protokolle", PRIO_HOCH,
       "Fehlende Beschlüsse zu Kapitalmaßnahmen und GF-Bestellungen machen Corporate Housekeeping angreifbar.",
       ("gesellschafterbeschluss", "beschluss", "protokoll", "gesellschafterversammlung", "umlaufbeschluss"),
       "§§ 47 ff. GmbHG", mehrfach=True),
    _d("CORP-07", "CORP", "Geschäftsführer-Bestellungen und Geschäftsordnung", PRIO_HOCH,
       "Vertretungsbefugnis und Zustimmungskataloge sind Kernpunkte der Governance-Prüfung.",
       ("geschäftsordnung", "bestellung", "geschäftsführer", "gf-vertrag", "zustimmungskatalog", "befreiung § 181"),
       "§ 35 GmbHG, § 181 BGB"),
    _d("CORP-08", "CORP", "Transparenzregister-Meldung / wirtschaftlich Berechtigte", PRIO_HOCH,
       "Bußgeldrisiko und KYC-Blocker beim Investor, wenn die Meldung fehlt.",
       ("transparenzregister", "wirtschaftlich berechtigte", "ubo", "beneficial owner"),
       "§§ 19, 20 GwG"),
    _d("CORP-09", "CORP", "Anteilsübertragungen / notarielle Urkunden", PRIO_HOCH,
       "Formfehler bei Anteilsübertragungen führen zu Nichtigkeit und damit zu Lücken in der Beteiligungskette.",
       ("anteilsübertragung", "abtretung", "share purchase", "notariell", "urkunde", "urnr"),
       "§ 15 Abs. 3, 4 GmbHG", mehrfach=True, profile=AB_VC),
    _d("CORP-10", "CORP", "Konzernstruktur / Tochtergesellschaften & Beteiligungen", PRIO_MITTEL,
       "Unbekannte Tochtergesellschaften erweitern den DD-Umfang kurz vor Signing.",
       ("konzernstruktur", "struktur", "tochtergesellschaft", "beteiligung", "organigramm", "holding"),
       "", profile=AB_VC),
    _d("CORP-11", "CORP", "Beiratsvereinbarung / Advisory Board", PRIO_MITTEL,
       "Beiratsrechte können mit Investorenrechten kollidieren.",
       ("beirat", "advisory board", "aufsichtsrat", "beiratsordnung"),
       "", profile=AB_VC),
    _d("CORP-12", "CORP", "Gründungsunterlagen / Handelsregisteranmeldungen", PRIO_MITTEL,
       "Belegt die Kapitalaufbringung; bei Sachgründungen besonders relevant.",
       ("gründungsurkunde", "handelsregisteranmeldung", "sachgründungsbericht", "gründung"),
       "§§ 5, 7, 8 GmbHG"),

    # -- FIN ----------------------------------------------------------------
    _d("FIN-01", "FIN", "Wandeldarlehensverträge / SAFEs inkl. Nachträge", PRIO_KRITISCH,
       "Nicht offengelegte Wandler verwässern die Runde nachträglich — klassischer Deal-Breaker.",
       ("wandeldarlehen", "convertible", "safe", "wandelanleihe", "wandlungsrecht", "cap", "discount"),
       "", mehrfach=True,
       pruefpunkte=("Wandlungsmechanik und Cap dokumentiert?", "In Cap Table berücksichtigt?", "Qualifizierter Rangrücktritt?")),
    _d("FIN-02", "FIN", "Beteiligungs- und Investorenverträge früherer Runden", PRIO_KRITISCH,
       "Liquidationspräferenzen und Verwässerungsschutz früherer Runden bestimmen die Ökonomie der neuen Runde.",
       ("beteiligungsvertrag", "investment agreement", "term sheet", "series a", "seed agreement"),
       "", mehrfach=True, profile=AB_VC),
    _d("FIN-03", "FIN", "ESOP / VSOP — Programmbedingungen und Zuteilungen", PRIO_KRITISCH,
       "Optionszusagen ohne saubere Dokumentation erzeugen unklare Verwässerung und Streitrisiko mit Mitarbeitenden.",
       ("esop", "vsop", "virtuelle", "option", "mitarbeiterbeteiligung", "phantom", "share option"),
       "§ 19a EStG",
       pruefpunkte=("Poolgröße und Vesting dokumentiert?", "Alle Zuteilungen unterzeichnet?", "Leaver-Regelungen?")),
    _d("FIN-04", "FIN", "Vesting-/Gründervereinbarungen", PRIO_HOCH,
       "Fehlendes Gründer-Vesting ist für Investoren ein Standard-Nachverhandlungspunkt.",
       ("vesting", "gründervereinbarung", "founder agreement", "leaver", "cliff"),
       "", profile=AB_VC),
    _d("FIN-05", "FIN", "Bank- und Darlehensverträge, Sicherheiten", PRIO_HOCH,
       "Financial Covenants und Change-of-Control-Klauseln können durch die Runde ausgelöst werden.",
       ("darlehensvertrag", "kreditvertrag", "bankvertrag", "bürgschaft", "sicherheiten", "kontokorrent", "loan"),
       "", mehrfach=True),
    _d("FIN-06", "FIN", "Fördermittel und Zuschüsse (EXIST, INVEST, Forschungszulage, KfW)", PRIO_HOCH,
       "Förderbescheide enthalten Zweckbindungen und Rückzahlungsauslöser bei Gesellschafterwechsel.",
       ("förderbescheid", "exist", "invest", "zuschuss", "forschungszulage", "kfw", "zim", "eu-förderung"),
       "", mehrfach=True,
       pruefpunkte=("Zweckbindungsfrist noch offen?", "Anzeigepflicht bei Anteilsübertragung?")),
    _d("FIN-07", "FIN", "Finanzplan / Business Plan / Forecast", PRIO_HOCH,
       "Der Investor gleicht Plan und Ist ab; ohne Plan fehlt die Basis für Bewertung und Milestones.",
       ("businessplan", "business plan", "finanzplan", "forecast", "planung", "budget", "modell"),
       ""),
    _d("FIN-08", "FIN", "Investoren-Reporting der letzten 12 Monate", PRIO_MITTEL,
       "Zeigt Reportingdisziplin; Widersprüche zu Zahlen sind ein Vertrauensproblem.",
       ("investor update", "reporting", "quartalsbericht", "monatsbericht", "kpi"),
       "", mehrfach=True, profile=AB_VC),
    _d("FIN-09", "FIN", "Kapitalmaßnahmen: Kapitalerhöhungen, genehmigtes Kapital", PRIO_HOCH,
       "Belegt, dass frühere Kapitalerhöhungen wirksam durchgeführt und eingetragen sind.",
       ("kapitalerhöhung", "genehmigtes kapital", "bezugsrecht", "einzahlungsbeleg", "stammkapital"),
       "§§ 55 ff. GmbHG", mehrfach=True, profile=AB_VC),

    # -- ACC ----------------------------------------------------------------
    _d("ACC-01", "ACC", "Jahresabschlüsse der letzten drei Geschäftsjahre", PRIO_KRITISCH,
       "Kern der Financial DD; fehlende oder verspätete Abschlüsse sind ein Governance-Signal.",
       ("jahresabschluss", "bilanz", "gewinn- und verlust", "guv", "annual accounts", "e-bilanz"),
       "§§ 242, 264 HGB", mehrfach=True,
       pruefpunkte=("Offenlegung im Bundesanzeiger erfolgt?", "Feststellungsbeschluss vorhanden?")),
    _d("ACC-02", "ACC", "Aktuelle BWA / Summen- und Saldenliste", PRIO_HOCH,
       "Zeigt die Lage zwischen zwei Abschlüssen; ohne BWA ist kein Cash-Bridge möglich.",
       ("bwa", "betriebswirtschaftliche auswertung", "susa", "summen- und salden"),
       "", mehrfach=True),
    _d("ACC-03", "ACC", "Steuererklärungen und Steuerbescheide (3 Jahre)", PRIO_HOCH,
       "Offene Veranlagungen und Nachzahlungsrisiken beeinflussen die Kaufpreis-/Bewertungsmechanik.",
       ("steuererklärung", "steuerbescheid", "körperschaftsteuer", "gewerbesteuer", "umsatzsteuer", "finanzamt"),
       "", mehrfach=True),
    _d("ACC-04", "ACC", "Umsatzsteuer-Voranmeldungen / USt-ID", PRIO_MITTEL,
       "Rückstände beim Finanzamt sind unmittelbar liquiditätswirksam.",
       ("umsatzsteuervoranmeldung", "ustva", "ust-id", "umsatzsteuer-identifikationsnummer"),
       "§ 18 UStG", mehrfach=True),
    _d("ACC-05", "ACC", "Betriebsprüfungsberichte / laufende Prüfungen", PRIO_HOCH,
       "Laufende Betriebsprüfungen erzeugen unquantifizierte Steuerrisiken.",
       ("betriebsprüfung", "prüfungsbericht", "außenprüfung", "prüfungsanordnung"),
       "§§ 193 ff. AO", profile=AB_VC),
    _d("ACC-06", "ACC", "Verlustvorträge / § 8c KStG-Dokumentation", PRIO_HOCH,
       "Der Anteilserwerb kann Verlustvorträge vernichten — bewertungsrelevant.",
       ("verlustvortrag", "8c kstg", "verlustnutzung", "fortführungsgebundener"),
       "§ 8c, § 8d KStG", profile=AB_VC),
    _d("ACC-07", "ACC", "Offene Posten Debitoren/Kreditoren", PRIO_MITTEL,
       "Basis für Working-Capital-Betrachtung und Ausfallrisiken.",
       ("offene posten", "debitoren", "kreditoren", "forderungen", "verbindlichkeiten", "opos"),
       "", profile=AB_VC),
    _d("ACC-08", "ACC", "Bankkonten, Kontovollmachten, aktuelle Salden", PRIO_MITTEL,
       "Cash-Nachweis zum Stichtag; Vollmachten sind Compliance-relevant.",
       ("kontoauszug", "bankkonto", "kontovollmacht", "saldenbestätigung"),
       "", profile=AB_VC),

    # -- HR -----------------------------------------------------------------
    _d("HR-01", "HR", "Geschäftsführer-Dienstverträge", PRIO_KRITISCH,
       "Vergütung, Kündigungsfristen und Wettbewerbsverbote der Gründer sind Kern jeder Runde.",
       ("geschäftsführeranstellungsvertrag", "gf-dienstvertrag", "dienstvertrag", "anstellungsvertrag geschäftsführer",
        "managing director"),
       "", mehrfach=True,
       pruefpunkte=("Nachvertragliches Wettbewerbsverbot mit Karenzentschädigung?", "D&O-Bezug?", "IP-Übertragung enthalten?")),
    _d("HR-02", "HR", "Muster-Arbeitsvertrag und Liste aller Mitarbeitenden", PRIO_KRITISCH,
       "Ohne Mitarbeiterliste (Eintritt, Gehalt, Funktion) kann Personalaufwand nicht plausibilisiert werden.",
       ("arbeitsvertrag", "mitarbeiterliste", "personalliste", "employment agreement", "stellenübersicht"),
       "§ 2 NachwG",
       pruefpunkte=("Nachweisgesetz-konform (Textform, § 2 NachwG)?", "Befristungen schriftlich vor Arbeitsantritt?")),
    _d("HR-03", "HR", "Freelancer- / Beraterverträge", PRIO_KRITISCH,
       "Scheinselbständigkeit erzeugt Nachforderungen der Sozialversicherung für bis zu vier Jahre — häufigster HR-Red-Flag bei Start-ups.",
       ("freelancer", "freiberufler", "beratervertrag", "dienstleistungsvertrag", "contractor", "werkvertrag"),
       "§ 7 SGB IV, § 611a BGB", mehrfach=True,
       pruefpunkte=("Statusfeststellungsverfahren durchgeführt?", "Weisungsfreiheit gelebt?", "IP-Übertragungsklausel enthalten?")),
    _d("HR-04", "HR", "Werkstudenten-, Praktikanten- und Minijob-Verträge", PRIO_HOCH,
       "Fehlerhafte Einordnung führt zu Beitragsnachforderungen und Mindestlohnrisiken.",
       ("werkstudent", "praktikant", "praktikum", "minijob", "aushilfe", "geringfügig"),
       "§ 22 MiLoG, § 8 SGB IV", mehrfach=True),
    _d("HR-05", "HR", "Sozialversicherungs-Statusfeststellungen (GF & Freelancer)", PRIO_HOCH,
       "Ohne Statusbescheid bleibt das Beitragsrisiko offen und wird vom Investor als Rückstellung verlangt.",
       ("statusfeststellung", "clearingstelle", "deutsche rentenversicherung", "sozialversicherungsstatus"),
       "§ 7a SGB IV", profile=AB_VC),
    _d("HR-06", "HR", "Prüfberichte Rentenversicherung / Lohnsteuer-Außenprüfung", PRIO_MITTEL,
       "Belegt, ob Beitrags- und Lohnsteuerrisiken bereits geprüft wurden.",
       ("betriebsprüfung rentenversicherung", "lohnsteueraußenprüfung", "prüfbericht dr", "sv-prüfung"),
       "§ 28p SGB IV", profile=AB_VC),
    _d("HR-07", "HR", "Betriebsvereinbarungen / Betriebsrat", PRIO_MITTEL,
       "Mitbestimmungsrechte können Transaktions- und Integrationsschritte verzögern.",
       ("betriebsvereinbarung", "betriebsrat", "mitbestimmung", "einigungsstelle"),
       "BetrVG", profile=AB_VC),
    _d("HR-08", "HR", "Beendigungen: Kündigungen, Aufhebungsverträge, Zeugnisse", PRIO_MITTEL,
       "Offene Kündigungsschutzverfahren sind Eventualverbindlichkeiten.",
       ("kündigung", "aufhebungsvertrag", "abwicklungsvertrag", "arbeitszeugnis"),
       "KSchG", mehrfach=True, profile=AB_VC),
    _d("HR-09", "HR", "Wettbewerbsverbote und Vertraulichkeitsvereinbarungen (Mitarbeitende)", PRIO_HOCH,
       "Ohne wirksame Vereinbarungen ist Know-how nicht geschützt (§ 2 GeschGehG: angemessene Geheimhaltungsmaßnahmen).",
       ("wettbewerbsverbot", "verschwiegenheit", "nda mitarbeiter", "geheimhaltungsvereinbarung"),
       "§ 74 HGB, § 2 GeschGehG"),

    # -- IP -----------------------------------------------------------------
    _d("IP-01", "IP", "IP-Übertragung der Gründer auf die Gesellschaft", PRIO_KRITISCH,
       "Klassischer Killer: die Gesellschaft besitzt das Produkt nicht, weil vor Gründung entwickelter Code/Design nie übertragen wurde.",
       ("ip-übertragung", "ip assignment", "rechteübertragung", "einbringung", "nutzungsrechte", "urheberrecht"),
       "§§ 31, 69b UrhG",
       pruefpunkte=("Alle Gründer erfasst?", "Auch Vor-Gründungs-Phase abgedeckt?", "Ausschließliche Rechte, zeitlich/räumlich unbeschränkt?")),
    _d("IP-02", "IP", "IP-Klauseln in Freelancer- und Dienstleisterverträgen", PRIO_KRITISCH,
       "Ohne ausdrückliche Einräumung verbleiben Nutzungsrechte beim Freelancer (§ 31 Abs. 5 UrhG, Zweckübertragungslehre).",
       ("nutzungsrechte", "rechteeinräumung", "work for hire", "ip klausel", "entwicklungsvertrag"),
       "§ 31 Abs. 5 UrhG"),
    _d("IP-03", "IP", "Markenanmeldungen und Registerauszüge (DPMA/EUIPO)", PRIO_HOCH,
       "Ohne Marke ist der Name angreifbar; Investoren prüfen Kollisionen und Widerspruchsfristen.",
       ("marke", "markenanmeldung", "dpma", "euipo", "markenurkunde", "trademark", "widerspruch"),
       "MarkenG, UMV", mehrfach=True),
    _d("IP-04", "IP", "Patente / Gebrauchsmuster / Anmeldungen", PRIO_HOCH,
       "Bei Deep-Tech zentral; Prioritätsfristen sind unwiederbringlich.",
       ("patent", "gebrauchsmuster", "epa", "pct", "priorität", "erfindungsmeldung"),
       "PatG, GebrMG", mehrfach=True, profile=AB_VC),
    _d("IP-05", "IP", "Arbeitnehmererfindungen: Meldungen und Inanspruchnahme", PRIO_HOCH,
       "Ohne dokumentierte Inanspruchnahme und Vergütung drohen Ansprüche der Erfinder.",
       ("arbeitnehmererfindung", "erfindungsmeldung", "inanspruchnahme", "erfindervergütung", "arbnerfg"),
       "ArbnErfG", profile=AB_VC),
    _d("IP-06", "IP", "Domains und Namensrechte (Inhaberschaft)", PRIO_HOCH,
       "Domains laufen häufig privat auf einen Gründer — Investor verlangt Übertragung vor Closing.",
       ("domain", "denic", "whois", "domainübertragung", "namensrecht"),
       ""),
    _d("IP-07", "IP", "Open-Source-Compliance / SBOM / Lizenzliste", PRIO_KRITISCH,
       "Copyleft-Lizenzen (GPL/AGPL) im Produktkern können Offenlegungspflichten für den Quellcode auslösen.",
       ("open source", "oss", "lizenzliste", "sbom", "gpl", "agpl", "mit", "apache", "third party licenses"),
       "",
       pruefpunkte=("AGPL/GPL im Auslieferungsstand?", "Lizenztexte und Hinweise mitgeliefert?", "Scan-Report vorhanden?")),
    _d("IP-08", "IP", "Software-Lizenzen und SaaS-Abos (eingekauft)", PRIO_MITTEL,
       "Unterlizenzierung erzeugt Nachzahlungs- und Auditrisiken.",
       ("lizenzvertrag", "software lizenz", "saas", "abonnement", "subscription", "eula"),
       "", mehrfach=True),
    _d("IP-09", "IP", "Technische Dokumentation / Architektur / Repository-Übersicht", PRIO_MITTEL,
       "Tech-DD prüft Wartbarkeit und Abhängigkeiten; fehlende Doku senkt die Bewertung.",
       ("architektur", "technische dokumentation", "repository", "stack", "readme", "systemdokumentation"),
       "", profile=AB_VC),
    _d("IP-10", "IP", "Entwicklungs-/Kooperationsverträge mit Dritten (inkl. Hochschulen)", PRIO_HOCH,
       "Hochschulkooperationen enthalten oft Rückbehalte an den Ergebnissen.",
       ("kooperationsvertrag", "entwicklungsvereinbarung", "forschungsvertrag", "hochschule", "fraunhofer"),
       "", mehrfach=True, profile=AB_VC),

    # -- COM ----------------------------------------------------------------
    _d("COM-01", "COM", "Top-10-Kundenverträge", PRIO_KRITISCH,
       "Umsatzkonzentration und Change-of-Control-Klauseln sind bewertungsrelevant.",
       ("kundenvertrag", "rahmenvertrag", "auftrag", "leistungsvertrag", "customer agreement", "msa"),
       "", mehrfach=True,
       pruefpunkte=("Change-of-Control-Kündigungsrecht?", "Laufzeit und Kündigungsfrist?", "Haftungsbegrenzung wirksam?")),
    _d("COM-02", "COM", "Allgemeine Geschäftsbedingungen (aktuelle Fassung)", PRIO_HOCH,
       "Unwirksame AGB-Klauseln (§§ 305 ff. BGB) schlagen auf den gesamten Kundenbestand durch.",
       ("agb", "allgemeine geschäftsbedingungen", "terms of service", "nutzungsbedingungen", "tos"),
       "§§ 305 ff. BGB",
       pruefpunkte=("Haftungsklausel AGB-fest?", "Verbraucher-/B2B-Fassung getrennt?", "Widerrufsbelehrung bei B2C?")),
    _d("COM-03", "COM", "SLA / Support- und Wartungsvereinbarungen", PRIO_MITTEL,
       "Zugesagte Verfügbarkeiten erzeugen Pönalen und Rückstellungsbedarf.",
       ("sla", "service level", "wartungsvertrag", "support", "verfügbarkeit"),
       "", profile=AB_VC),
    _d("COM-04", "COM", "Lieferanten- und Dienstleisterverträge (wesentliche)", PRIO_HOCH,
       "Abhängigkeit von Einzellieferanten (z. B. Cloud, Hardware) ist ein Konzentrationsrisiko.",
       ("lieferantenvertrag", "einkauf", "bezugsvertrag", "supplier", "hosting", "cloud vertrag"),
       "", mehrfach=True),
    _d("COM-05", "COM", "Vertriebs-, Partner- und Reseller-Verträge", PRIO_MITTEL,
       "Exklusivitäten und Ausgleichsansprüche (§ 89b HGB analog) binden den Vertrieb langfristig.",
       ("vertriebsvertrag", "handelsvertreter", "reseller", "partnervertrag", "distribution"),
       "§§ 84 ff. HGB", mehrfach=True, profile=AB_VC),
    _d("COM-06", "COM", "NDAs mit Kunden, Partnern und Investoren", PRIO_MITTEL,
       "Belegt angemessene Geheimhaltungsmaßnahmen nach § 2 Nr. 1 lit. b GeschGehG.",
       ("nda", "geheimhaltungsvereinbarung", "vertraulichkeitsvereinbarung", "non-disclosure"),
       "§ 2 GeschGehG", mehrfach=True),
    _d("COM-07", "COM", "Umsatzübersicht nach Kunden (Konzentration)", PRIO_HOCH,
       "Ohne Kundenkonzentrationsanalyse kann der Investor das Umsatzrisiko nicht einschätzen.",
       ("umsatzübersicht", "kundenumsatz", "arr", "mrr", "kohorten", "churn"),
       "", profile=AB_VC),

    # -- DAT ----------------------------------------------------------------
    _d("DAT-01", "DAT", "Verzeichnis von Verarbeitungstätigkeiten (VVT)", PRIO_KRITISCH,
       "Fehlendes VVT ist der schnellste Nachweis mangelnder Datenschutz-Compliance und bußgeldbewehrt.",
       ("verzeichnis von verarbeitungstätigkeiten", "vvt", "verarbeitungsverzeichnis", "record of processing"),
       "Art. 30 DSGVO"),
    _d("DAT-02", "DAT", "Auftragsverarbeitungsverträge (AVV) mit allen Dienstleistern", PRIO_KRITISCH,
       "Jeder Cloud-/Tool-Anbieter ohne AVV ist ein eigenständiger DSGVO-Verstoß.",
       ("auftragsverarbeitung", "avv", "dpa", "data processing agreement", "art. 28"),
       "Art. 28 DSGVO", mehrfach=True,
       pruefpunkte=("Alle Tools erfasst?", "Unterauftragsverarbeiter gelistet?", "Drittlandtransfer geregelt (SCC)?")),
    _d("DAT-03", "DAT", "Technische und organisatorische Maßnahmen (TOM)", PRIO_HOCH,
       "TOM sind Anlage jedes AVV; ohne sie sind die AVV unvollständig.",
       ("tom", "technische und organisatorische maßnahmen", "sicherheitskonzept", "art. 32"),
       "Art. 32 DSGVO"),
    _d("DAT-04", "DAT", "Datenschutzerklärung Website/App und Cookie-Consent", PRIO_HOCH,
       "Abmahnrisiko und Bußgeldrisiko; Consent-Banner ist häufig fehlerhaft implementiert.",
       ("datenschutzerklärung", "privacy policy", "cookie", "consent", "einwilligung", "ttdsg", "tddg"),
       "Art. 13 DSGVO, § 25 TDDG"),
    _d("DAT-05", "DAT", "Datenschutz-Folgenabschätzung (DSFA), soweit erforderlich", PRIO_MITTEL,
       "Bei Scoring, Tracking oder KI-Einsatz häufig Pflicht; das Fehlen ist ein eigener Verstoß.",
       ("dsfa", "datenschutz-folgenabschätzung", "dpia", "art. 35"),
       "Art. 35 DSGVO", profile=AB_VC),
    _d("DAT-06", "DAT", "Bestellung Datenschutzbeauftragter / Begründung des Verzichts", PRIO_HOCH,
       "Ab 20 Personen mit ständiger automatisierter Verarbeitung ist die Bestellung Pflicht.",
       ("datenschutzbeauftragter", "dsb", "bestellung dsb", "benennung"),
       "Art. 37 DSGVO, § 38 BDSG"),
    _d("DAT-07", "DAT", "Lösch- und Aufbewahrungskonzept", PRIO_MITTEL,
       "Belegt Umsetzung von Speicherbegrenzung und Betroffenenrechten.",
       ("löschkonzept", "aufbewahrungsfristen", "retention", "speicherbegrenzung"),
       "Art. 5, 17 DSGVO", profile=AB_VC),
    _d("DAT-08", "DAT", "Dokumentierte Datenpannen und Meldungen", PRIO_MITTEL,
       "Ungemeldete Vorfälle sind Haftungsrisiko und werden vom Investor abgefragt.",
       ("datenpanne", "data breach", "meldung aufsichtsbehörde", "art. 33", "sicherheitsvorfall"),
       "Art. 33, 34 DSGVO", profile=AB_VC),
    _d("DAT-09", "DAT", "IT-Sicherheit: Backup-, Notfall- und Berechtigungskonzept", PRIO_HOCH,
       "Tech-DD prüft Ausfallsicherheit; fehlende Backups sind ein sofortiger Red Flag.",
       ("backup", "notfallplan", "disaster recovery", "berechtigungskonzept", "iso 27001", "penetrationstest"),
       ""),
    _d("DAT-10", "DAT", "KI-Einsatz: Einstufung nach KI-VO und Transparenzunterlagen", PRIO_HOCH,
       "Bei KI-Produkten prüfen Investoren die Risikoklasse und die Pflichten als Anbieter/Betreiber.",
       ("ki-vo", "ai act", "künstliche intelligenz", "risikoklasse", "hochrisiko", "modellkarte", "ki-richtlinie"),
       "VO (EU) 2024/1689", profile=AB_VC),

    # -- REG ----------------------------------------------------------------
    _d("REG-01", "REG", "Gewerbeanmeldung / erforderliche Erlaubnisse", PRIO_HOCH,
       "Tätigkeit ohne erforderliche Erlaubnis kann Verträge und Umsätze infrage stellen.",
       ("gewerbeanmeldung", "gewerbeschein", "erlaubnis", "genehmigung", "konzession"),
       "§ 14 GewO"),
    _d("REG-02", "REG", "Branchenspezifische Zulassungen (KWG/ZAG, MDR, TKG u. a.)", PRIO_KRITISCH,
       "Erlaubnispflichtige Tätigkeit ohne BaFin-Erlaubnis ist strafbewehrt und macht die Runde unfinanzierbar.",
       ("bafin", "kwg", "zag", "erlaubnis", "mdr", "medizinprodukt", "ce-kennzeichnung", "tkg", "zulassung"),
       "§ 32 KWG, § 10 ZAG", profile=AB_VC),
    _d("REG-03", "REG", "Produkt-Compliance: CE, Konformitätserklärungen, Normen", PRIO_MITTEL,
       "Fehlende Konformitätsnachweise blockieren Vertrieb im EU-Binnenmarkt.",
       ("konformitätserklärung", "ce", "produktsicherheit", "norm", "prüfbericht", "zertifikat"),
       "", profile=AB_VC),
    _d("REG-04", "REG", "Compliance-Richtlinien (Code of Conduct, Antikorruption, GwG)", PRIO_MITTEL,
       "Institutionelle Investoren verlangen ein Mindest-Compliance-Set.",
       ("code of conduct", "compliance", "antikorruption", "whistleblower", "hinweisgeber", "gwg"),
       "HinSchG", profile=AB_VC),
    _d("REG-05", "REG", "Außenwirtschaft: Exportkontrolle, Sanktionslisten-Screening", PRIO_MITTEL,
       "Bei Hardware/Dual-Use und ausländischen Investoren (Investitionsprüfung AWV) relevant.",
       ("exportkontrolle", "dual use", "sanktionsliste", "awv", "embargo", "bafa"),
       "AWG/AWV", profile=NUR_MA),

    # -- INS ----------------------------------------------------------------
    _d("INS-01", "INS", "Versicherungsübersicht mit allen Policen", PRIO_HOCH,
       "Deckungslücken werden vom Investor als Risikoabschlag oder Closing-Bedingung behandelt.",
       ("versicherung", "police", "versicherungsschein", "deckung", "haftpflicht"),
       "", mehrfach=True),
    _d("INS-02", "INS", "D&O-Versicherung", PRIO_MITTEL,
       "Investoren, die einen Beirat besetzen, verlangen regelmäßig D&O-Schutz.",
       ("d&o", "directors and officers", "organhaftpflicht", "managerhaftpflicht"),
       "", profile=AB_VC),
    _d("INS-03", "INS", "Cyber- und Betriebshaftpflichtversicherung", PRIO_MITTEL,
       "Bei datengetriebenen Geschäftsmodellen Standarderwartung.",
       ("cyberversicherung", "betriebshaftpflicht", "vermögensschaden", "produkthaftpflicht"),
       "", profile=AB_VC),

    # -- IMM ----------------------------------------------------------------
    _d("IMM-01", "IMM", "Mietvertrag Geschäftsräume inkl. Nachträge", PRIO_HOCH,
       "Lange Laufzeiten, Kautionen und Change-of-Control-Klauseln binden Liquidität.",
       ("mietvertrag", "gewerbemietvertrag", "büro", "coworking", "nachtrag", "kaution"),
       "§§ 535 ff. BGB",
       pruefpunkte=("Schriftform § 550 BGB gewahrt?", "Kündigungsrecht bei Gesellschafterwechsel?")),
    _d("IMM-02", "IMM", "Leasing- und Mietkaufverträge (Fahrzeuge, Hardware)", PRIO_MITTEL,
       "Off-Balance-Verpflichtungen, die in der Planung fehlen.",
       ("leasing", "mietkauf", "fahrzeug", "dienstwagen", "hardware leasing"),
       "", mehrfach=True, profile=AB_VC),
    _d("IMM-03", "IMM", "Grundbuchauszüge / Eigentum an Immobilien", PRIO_MITTEL,
       "Nur relevant bei eigenem Grundbesitz; dann aber zwingend.",
       ("grundbuch", "grundstück", "eigentum immobilie", "erbbaurecht"),
       "", profile=NUR_MA),

    # -- LIT ----------------------------------------------------------------
    _d("LIT-01", "LIT", "Übersicht laufender und drohender Rechtsstreitigkeiten", PRIO_KRITISCH,
       "Nicht offengelegte Verfahren führen regelmäßig zu Garantieverletzungen im Beteiligungsvertrag.",
       ("rechtsstreit", "klage", "verfahren", "gericht", "mahnbescheid", "prozess", "litigation"),
       "", mehrfach=True),
    _d("LIT-02", "LIT", "Abmahnungen, Unterlassungserklärungen, Schutzrechtsverwarnungen", PRIO_HOCH,
       "Abgegebene Unterlassungserklärungen wirken unbefristet und lösen Vertragsstrafen aus.",
       ("abmahnung", "unterlassungserklärung", "vertragsstrafe", "verwarnung", "einstweilige verfügung"),
       "", mehrfach=True),
    _d("LIT-03", "LIT", "Behördliche Verfahren (Datenschutz, Zoll, Steuern, Kartell)", PRIO_HOCH,
       "Aufsichtsverfahren binden Management und erzeugen Bußgeldrisiken.",
       ("aufsichtsbehörde", "bußgeld", "anhörung", "ordnungswidrigkeit", "verfahren behörde"),
       "", profile=AB_VC),
    _d("LIT-04", "LIT", "Anwaltliche Stellungnahmen zu Streitfällen (Legal Opinions)", PRIO_MITTEL,
       "Belegt die Bewertung von Prozessrisiken; Grundlage für Rückstellungen.",
       ("stellungnahme", "legal opinion", "gutachten", "rechtsauskunft", "risikoeinschätzung"),
       "", profile=AB_VC),

    # -- ESG ----------------------------------------------------------------
    _d("ESG-01", "ESG", "ESG-/Nachhaltigkeitsangaben und Investorenfragebögen", PRIO_MITTEL,
       "Institutionelle Fonds haben eigene SFDR-Berichtspflichten und reichen sie durch.",
       ("esg", "nachhaltigkeit", "sfdr", "co2", "diversity", "impact"),
       "", profile=AB_VC),
    _d("ESG-02", "ESG", "Lieferkettensorgfalt (soweit anwendbar)", PRIO_MITTEL,
       "Nur bei Schwellenwertüberschreitung Pflicht, wird aber von Kunden vertraglich durchgereicht.",
       ("lieferkettensorgfaltspflichten", "lksg", "csddd", "supply chain", "menschenrechte"),
       "LkSG", profile=NUR_MA),
    _d("ESG-03", "ESG", "Vollständigkeits- und Offenlegungserklärung der Geschäftsführung", PRIO_HOCH,
       "Abschluss jeder Datenraum-Befüllung: die Geschäftsführung bestätigt Vollständigkeit.",
       ("vollständigkeitserklärung", "disclosure", "offenlegung", "management representation"),
       "", profile=AB_VC),
)


# ---------------------------------------------------------------------------
# Zugriffsfunktionen
# ---------------------------------------------------------------------------

# Positionen, bei denen eine fehlende Unterschrift ein echter Mangel ist.
# Registerauszüge, Listen, Pläne, Berichte und Richtlinien tragen naturgemäß
# keine Unterschrift — dort darf „nicht unterzeichnet" nicht abgewertet werden.
SIGNATUR_RELEVANT: frozenset[str] = frozenset({
    "CORP-02", "CORP-05", "CORP-06", "CORP-07", "CORP-09", "CORP-12",
    "FIN-01", "FIN-02", "FIN-03", "FIN-04", "FIN-05",
    "HR-01", "HR-03", "HR-04", "HR-07", "HR-08", "HR-09",
    "IP-01", "IP-02", "IP-05", "IP-10",
    "COM-01", "COM-03", "COM-04", "COM-05", "COM-06",
    "IMM-01", "IMM-02",
    "LIT-02", "ESG-03",
})


def katalog_fuer(profil: str = "VC") -> list[SollDokument]:
    """Liefert die Soll-Dokumente des gewählten Profils in Katalogreihenfolge."""
    p = (profil or "VC").upper()
    if p not in PROFILE:
        p = "VC"
    return [d for d in KATALOG if p in d.profile]


def by_id(doc_id: str) -> SollDokument | None:
    for d in KATALOG:
        if d.id == doc_id:
            return d
    return None


def workstream_name(kuerzel: str) -> str:
    return WORKSTREAMS.get(kuerzel, kuerzel)


def katalog_als_prompt(profil: str = "VC") -> str:
    """Kompakte Katalogdarstellung für den System-Prompt der Klassifikation."""
    zeilen: list[str] = []
    aktueller_ws = ""
    for d in katalog_fuer(profil):
        if d.workstream != aktueller_ws:
            aktueller_ws = d.workstream
            zeilen.append(f"\n# {d.workstream} — {WORKSTREAMS[d.workstream]}")
        zeilen.append(f"{d.id}: {d.titel}")
    return "\n".join(zeilen).strip()


def stichwort_treffer(text: str, profil: str = "VC") -> list[tuple[str, int]]:
    """Deterministische Vorabzuordnung über Stichworte.

    Liefert [(katalog_id, score), …] absteigend sortiert. Wird im Offline-Modus
    als alleinige Zuordnung und sonst als Kontrollgröße gegen die KI verwendet.
    """
    low = text.lower()
    treffer: list[tuple[str, int]] = []
    for d in katalog_fuer(profil):
        score = sum(3 if len(w) > 12 else 2 for w in d.stichworte if w in low)
        if score:
            treffer.append((d.id, score))
    treffer.sort(key=lambda t: (-t[1], t[0]))
    return treffer
