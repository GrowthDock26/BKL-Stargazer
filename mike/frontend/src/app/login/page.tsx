"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { SiteLogo } from "@/components/site-logo";
import { useAuth } from "@/contexts/AuthContext";
export default function LoginPage() {
    const router = useRouter();
    const { isAuthenticated, authLoading } = useAuth();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!authLoading && isAuthenticated) {
            router.replace("/assistant");
        }
    }, [authLoading, isAuthenticated, router]);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (error) throw error;

            router.push("/assistant");
        } catch (error: any) {
            const msg: string = error?.message ?? "";
            if (msg.includes("Invalid login credentials") || msg.includes("invalid_credentials")) {
                setError("E-Mail-Adresse oder Passwort ist falsch. Bitte erneut versuchen.");
            } else if (msg.includes("Email not confirmed")) {
                setError("Bitte bestätigen Sie zuerst Ihre E-Mail-Adresse (Link in der Willkommens-E-Mail).");
            } else if (msg.includes("Too many requests") || msg.includes("rate limit")) {
                setError("Zu viele Anmeldeversuche. Bitte warten Sie einige Minuten und versuchen Sie es erneut.");
            } else if (msg.includes("network") || msg.includes("fetch")) {
                setError("Keine Verbindung zum Server. Bitte Internetverbindung prüfen.");
            } else {
                setError("Anmeldung fehlgeschlagen. Bitte erneut versuchen oder den Support kontaktieren.");
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-dvh bg-white flex items-start justify-center px-6 pt-32 md:pt-40 pb-10 relative">
            <div className="absolute top-4 md:top-8 left-1/2 -translate-x-1/2">
                <SiteLogo size="md" className="md:text-4xl" asLink />
            </div>
            <div className="w-full max-w-md">
                {/* Login Form */}
                <div className="bg-white border border-gray-200 rounded-2xl p-8 mb-4">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-left text-2xl font-serif">
                            Anmelden
                        </h2>
                        <div className="bg-gray-100 p-1 rounded-md flex text-xs font-medium">
                            <span className="text-gray-600 px-3 py-1 bg-white rounded-sm shadow-sm">
                                Anmelden
                            </span>
                            <Link
                                href="/signup"
                                className="px-3 py-1 text-gray-500 hover:text-gray-900"
                            >
                                Registrieren
                            </Link>
                        </div>
                    </div>
                    <form onSubmit={handleLogin} className="space-y-4">
                        <div>
                            <label
                                htmlFor="email"
                                className="block text-sm font-medium text-gray-700 mb-2"
                            >
                                E-Mail
                            </label>
                            <Input
                                id="email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="Ihre E-Mail-Adresse"
                                required
                                className="w-full"
                            />
                        </div>

                        <div>
                            <label
                                htmlFor="password"
                                className="block text-sm font-medium text-gray-700 mb-2"
                            >
                                Passwort
                            </label>
                            <Input
                                id="password"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Ihr Passwort"
                                required
                                className="w-full"
                            />
                        </div>

                        {error && (
                            <div className="text-red-600 text-sm bg-red-50 p-3 rounded">
                                {error}
                            </div>
                        )}

                        <Button
                            type="submit"
                            disabled={loading}
                            className="w-full mt-5 text-white"
                            style={{ backgroundColor: "#0F325A" }}
                        >
                            {loading ? "Wird angemeldet…" : "Anmelden"}
                        </Button>
                    </form>
                </div>
                <p className="text-center text-xs text-gray-400 leading-relaxed px-2">
                    BKL Stargazer · Internes KI-System der Kanzlei BKL.<br />
                    Nur für autorisierte Kanzleimitarbeiter. Mandantendaten
                    unterliegen der anwaltlichen Verschwiegenheitspflicht (§ 43a BRAO).
                </p>
            </div>
        </div>
    );
}
