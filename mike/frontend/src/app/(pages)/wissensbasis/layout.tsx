/**
 * Scroll-Container für die Wissensbasis — siehe mandate/layout.tsx:
 * <main> ist auf dem Desktop `overflow-hidden`, jede lang laufende Seite
 * bringt ihren eigenen Scroll-Bereich mit.
 */
export default function WissensbasisLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <div className="h-full overflow-y-auto">{children}</div>;
}
