import { useState, useEffect, useCallback } from "react";

export interface TokenAuthResult {
  isTokenValid: boolean | null;
  accessLevel: string | null;
  tokenUserId: string | null;
  expiresAt: string | null;
  isExpired: boolean;
  isExpiringSoon: boolean; // <30 min remaining
  isLoading: boolean;
}

const VALIDATE_URL =
  "https://pimaquygpgcejciowgll.supabase.co/functions/v1/validate-chat-token";

export const useTokenAuth = (): TokenAuthResult => {
  const [isTokenValid, setIsTokenValid] = useState<boolean | null>(null);
  const [accessLevel, setAccessLevel] = useState<string | null>(null);
  const [tokenUserId, setTokenUserId] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [isExpired, setIsExpired] = useState(false);
  const [isExpiringSoon, setIsExpiringSoon] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const THIRTY_MINUTES = 30 * 60 * 1000;

  const checkExpiry = useCallback(() => {
    if (!expiresAt) return;
    const remainingMs = new Date(expiresAt).getTime() - Date.now();
    if (remainingMs <= 0) {
      setIsExpired(true);
      setIsExpiringSoon(false);
      setIsTokenValid(false);
    } else if (remainingMs <= THIRTY_MINUTES) {
      setIsExpiringSoon(true);
    } else {
      setIsExpiringSoon(false);
    }
  }, [expiresAt]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    const ref = params.get("ref");

    if (ref !== "notfallkoffer" || !token) {
      setIsTokenValid(null);
      return;
    }

    const validate = async () => {
      setIsLoading(true);
      try {
        const res = await fetch(VALIDATE_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });

        if (!res.ok) {
          setIsTokenValid(false);
          return;
        }

        const data = await res.json();
        setIsTokenValid(data.valid === true);
        setAccessLevel(data.access_level ?? null);
        setTokenUserId(data.user_id ?? null);
        setExpiresAt(data.expires_at ?? null);
      } catch (err) {
        console.error("Token validation failed:", err);
        setIsTokenValid(false);
      } finally {
        setIsLoading(false);
      }
    };

    validate();
  }, []);

  // Check expiry every 60 seconds
  useEffect(() => {
    checkExpiry();
    const interval = setInterval(checkExpiry, 60_000);
    return () => clearInterval(interval);
  }, [checkExpiry]);

  return { isTokenValid, accessLevel, tokenUserId, expiresAt, isExpired, isExpiringSoon, isLoading };
};
