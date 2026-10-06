import Link from "next/link";

interface SiteLogoProps {
    size?: "sm" | "md" | "lg" | "xl";
    className?: string;
    asLink?: boolean;
}

const sizeClasses = { sm: "text-xl", md: "text-2xl", lg: "text-4xl", xl: "text-6xl" };
const bklSizes = { sm: "text-2xl", md: "text-3xl", lg: "text-5xl", xl: "text-7xl" };

export function SiteLogo({ size = "md", className = "", asLink = false }: SiteLogoProps) {
    const logo = (
        <div className={`flex items-baseline gap-2 ${className}`}>
            <span
                className={`${bklSizes[size]} font-bold font-serif leading-none`}
                style={{ color: "#A02319" }}
            >
                BKL
            </span>
            <span className={`${sizeClasses[size]} font-light text-gray-400 tracking-wide`}>
                Stargazer
            </span>
        </div>
    );

    if (asLink) {
        return (
            <Link href="http://localhost:3000" className="hover:opacity-80 transition-opacity">
                {logo}
            </Link>
        );
    }

    return logo;
}
