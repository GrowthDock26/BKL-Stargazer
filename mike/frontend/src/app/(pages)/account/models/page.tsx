"use client";

import { useState } from "react";
import { AlertCircle, Check, ChevronDown } from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useUserProfile } from "@/contexts/UserProfileContext";
import type { ApiKeyState } from "@/app/lib/mikeApi";
import { MODELS } from "@/app/components/assistant/ModelToggle";
import { isModelAvailable } from "@/app/lib/modelAvailability";

export default function ModelsAndApiKeysPage() {
    const { profile, updateModelPreference } = useUserProfile();

    return (
        <div className="space-y-4">
            {/* Model Preferences */}
            <div className="pb-6">
                <div className="flex items-center gap-2 mb-4">
                    <h2 className="text-2xl font-medium font-serif">
                        Model Preferences
                    </h2>
                </div>
                <div className="space-y-4 max-w-md">
                    <div>
                        <label className="text-sm text-gray-600 block mb-2">
                            Tabular review model
                        </label>
                        <p className="text-xs text-gray-400 mb-2">
                            We recommend using a smaller model for tabular
                            reviews to reduce token costs.
                        </p>
                        <TabularModelDropdown
                            value={
                                profile?.tabularModel ??
                                "gemini-2.5-flash"
                            }
                            apiKeys={profile?.apiKeys}
                            onChange={(id) =>
                                updateModelPreference("tabularModel", id)
                            }
                        />
                    </div>
                </div>
            </div>

            {/* KI-Provider */}
            <div className="py-6">
                <div className="flex items-center gap-2 mb-2">
                    <h2 className="text-2xl font-medium font-serif">
                        KI-Provider
                    </h2>
                </div>
                <p className="text-sm text-gray-500 max-w-xl">
                    Die KI-Anbindung läuft ausschließlich über LOGICC
                    (api.logicc.io), zentral von der Kanzlei konfiguriert.
                    Es ist kein eigener API-Key erforderlich — die Modellauswahl
                    oben steht allen Nutzern gleichermaßen zur Verfügung.
                </p>
            </div>
        </div>
    );
}

function TabularModelDropdown({
    value,
    onChange,
    apiKeys,
}: {
    value: string;
    onChange: (id: string) => void;
    apiKeys?: ApiKeyState;
}) {
    const [isOpen, setIsOpen] = useState(false);
    const selected = MODELS.find((m) => m.id === value);
    const selectedAvailable = apiKeys ? isModelAvailable(value, apiKeys) : true;
    const groups: ("Google" | "OpenAI")[] = ["Google", "OpenAI"];

    return (
        <DropdownMenu onOpenChange={setIsOpen}>
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    className="w-full h-9 rounded-md border border-gray-300 bg-white px-3 text-sm shadow-sm flex items-center justify-between gap-2 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-black/10"
                >
                    <span className="flex items-center gap-2 min-w-0">
                        {!selectedAvailable && (
                            <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-500" />
                        )}
                        <span className="truncate text-gray-900">
                            {selected?.label ?? "Select a model"}
                        </span>
                    </span>
                    <ChevronDown
                        className={`h-3.5 w-3.5 shrink-0 text-gray-500 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                    />
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
                className="z-50"
                style={{ width: "var(--radix-dropdown-menu-trigger-width)" }}
                align="start"
            >
                {groups.map((group, gi) => {
                    const items = MODELS.filter((m) => m.group === group);
                    if (items.length === 0) return null;
                    return (
                        <div key={group}>
                            {gi > 0 && <DropdownMenuSeparator />}
                            <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-gray-400">
                                {group}
                            </DropdownMenuLabel>
                            {items.map((m) => (
                                <DropdownMenuItem
                                    key={m.id}
                                    className="cursor-pointer"
                                    onSelect={() => onChange(m.id)}
                                >
                                    <span className="flex-1">{m.label}</span>
                                    {m.id === value && (
                                        <Check className="h-3.5 w-3.5 text-gray-600 ml-1" />
                                    )}
                                </DropdownMenuItem>
                            ))}
                        </div>
                    );
                })}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
