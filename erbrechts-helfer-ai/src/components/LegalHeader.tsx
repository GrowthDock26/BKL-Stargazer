import { Settings, LogIn, LogOut, FileSearch } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";

const LegalHeader = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const checkAdminStatus = async (userId: string) => {
      const { data } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .eq('role', 'admin')
        .single();
      
      setIsAdmin(!!data);
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsAuthenticated(!!session);
      if (session) {
        checkAdminStatus(session.user.id);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setIsAuthenticated(!!session);
      if (session) {
        checkAdminStatus(session.user.id);
      } else {
        setIsAdmin(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast({
      title: "Abgemeldet",
      description: "Sie wurden erfolgreich abgemeldet.",
    });
    navigate("/");
  };

  return (
    <header className="absolute top-0 right-0 p-4 z-10">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/dokumente-analyse')}
          className="text-muted-foreground hover:text-foreground hover:bg-muted"
        >
          <FileSearch className="h-4 w-4 mr-2" />
          Dokumente prüfen
        </Button>
        {isAuthenticated ? (
          <>
            {isAdmin && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/admin')}
                className="text-muted-foreground hover:text-foreground hover:bg-muted"
              >
                <Settings className="h-4 w-4 mr-2" />
                Wissensbasis
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="text-muted-foreground hover:text-foreground hover:bg-muted"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Abmelden
            </Button>
          </>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/auth')}
            className="text-muted-foreground hover:text-foreground hover:bg-muted"
          >
            <LogIn className="h-4 w-4 mr-2" />
            Anmelden
          </Button>
        )}
      </div>
    </header>
  );
};

export default LegalHeader;