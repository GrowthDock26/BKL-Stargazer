import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";

const inter = Inter({
    variable: "--font-inter",
    subsets: ["latin"],
    weight: ["300", "400", "500", "600"],
});

const playfair = Playfair_Display({
    variable: "--font-playfair",
    subsets: ["latin"],
    weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
    title: "BKL Stargazer",
    description: "KI-Assistent der Kanzlei BKL Rechtsanwälte und Steuerberater Partnerschaft mbB",
    icons: {
        icon: [
            { url: "/icon.svg", type: "image/svg+xml" },
            { url: "/favicon.ico" },
        ],
        apple: "/apple-touch-icon.png",
    },
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="de">
            <body className={`${inter.variable} ${playfair.variable} font-sans antialiased`}>
                <Providers>{children}</Providers>
            </body>
        </html>
    );
}
