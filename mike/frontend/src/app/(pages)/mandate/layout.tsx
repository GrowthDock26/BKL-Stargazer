/**
 * Scroll-Container für alle Mandats-Seiten.
 *
 * Das übergeordnete Layout setzt <main> auf `md:overflow-hidden`, weil die
 * Chat- und Tabellenansichten ihre Höhe selbst verwalten und keine zweite
 * Bildlaufleiste vertragen. Seiten, die einfach untereinander weglaufen,
 * müssen deshalb ihren eigenen Scroll-Bereich mitbringen — sonst wird auf
 * dem Desktop alles unterhalb der Fensterkante abgeschnitten.
 *
 * Unterseiten, die bereits `h-full` mit eigenem Scroll-Bereich verwenden
 * (Aufnahme, Nachlassverzeichnis), passen exakt in diesen Rahmen; sie
 * erzeugen dadurch keine doppelte Bildlaufleiste.
 */
export default function MandateLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <div className="h-full overflow-y-auto">{children}</div>;
}
