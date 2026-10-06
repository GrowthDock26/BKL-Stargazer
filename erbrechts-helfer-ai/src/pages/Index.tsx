import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import LegalHeader from "@/components/LegalHeader";
import ChatInterface from "@/components/ChatInterface";
import { useTokenAuth } from "@/hooks/useTokenAuth";

const Index = () => {
  const [uploadedDocuments, setUploadedDocuments] = useState<File[]>([]);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const tokenAuth = useTokenAuth();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsAuthenticated(!!session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setIsAuthenticated(!!session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleDocumentUpload = (files: File[]) => {
    setUploadedDocuments(files);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <LegalHeader />
      
      {/* Main Chat Area - ChatGPT Style */}
      <main className="flex-1 flex flex-col">
        <ChatInterface 
          documents={uploadedDocuments}
          onDocumentUpload={handleDocumentUpload}
          tokenAuth={tokenAuth}
        />
      </main>

      {/* Minimal Footer */}
      <footer className="py-4 border-t border-border text-center text-xs text-muted-foreground">
        <p>
          © 2025 Growth Dock Management GmbH |{" "}
          <a href="/impressum" className="text-primary hover:underline">
            Impressum
          </a>
        </p>
      </footer>
    </div>
  );
};

export default Index;