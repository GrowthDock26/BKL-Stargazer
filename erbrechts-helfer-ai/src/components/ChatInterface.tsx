import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Send, Bot, User, LogIn, Paperclip, X, RefreshCw, Shield, FlaskConical, ShieldCheck, ShieldAlert, ShieldX } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import LegalDisclaimer from "@/components/LegalDisclaimer";
import HumanGateForm from "@/components/HumanGateForm";
import { useFreeQuestionLimit } from "@/hooks/useFreeQuestionLimit";
import type { TokenAuthResult } from "@/hooks/useTokenAuth";

type Confidence = 'high' | 'medium' | 'low';

interface HumanGateInfo {
  trigger: string;
  originalQuestion: string;
  gatekeeper?: string;
}

interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: Date;
  verified?: boolean;
  sources?: string[];
  confidence?: Confidence;
  unverifiedCitations?: string[];
  humanGate?: HumanGateInfo;
}

interface ChatInterfaceProps {
  initialMessage?: string;
  documents: File[];
  onDocumentUpload?: (files: File[]) => void;
  tokenAuth?: TokenAuthResult;
}

const ChatInterface = ({ initialMessage, documents, onDocumentUpload, tokenAuth }: ChatInterfaceProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
  const [hasAskedFirstQuestion, setHasAskedFirstQuestion] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();
  const navigate = useNavigate();
  const freeLimit = useFreeQuestionLimit();

  const isTokenAuthorized = tokenAuth?.isTokenValid === true;
  const isTokenExpired = tokenAuth?.isExpired === true;
  const isTokenExpiringSoon = tokenAuth?.isExpiringSoon === true;

  useEffect(() => {
    const initChat = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUserId(session.user.id);
        await loadMessages(session.user.id);
      }
    };
    initChat();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (session?.user) {
          setUserId(session.user.id);
          if (messages.length > 0 && event === 'SIGNED_IN') {
            setTimeout(async () => {
              for (const msg of messages) {
                await saveMessage(msg);
              }
            }, 0);
          }
        } else {
          setUserId(null);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (initialMessage) {
      setInput(initialMessage);
    }
  }, [initialMessage]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px';
    }
  }, [input]);

  const loadMessages = async (uid: string) => {
    const { data, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('user_id', uid)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error loading messages:', error);
      return;
    }

    if (data) {
      const loadedMessages: Message[] = data.map(msg => ({
        id: msg.id,
        content: msg.content,
        role: msg.role as 'user' | 'assistant',
        timestamp: new Date(msg.created_at),
        verified: msg.verified || false,
        sources: msg.sources || []
      }));
      setMessages(loadedMessages);
    }
  };

  const saveMessage = async (message: Message) => {
    if (!userId) return;
    
    const { error } = await supabase
      .from('chat_messages')
      .insert({
        user_id: userId,
        content: message.content,
        role: message.role,
        verified: message.verified || false,
        sources: message.sources || []
      });

    if (error) {
      console.error('Error saving message:', error);
    }
  };

  const callAIAPI = async (userMessage: string): Promise<Message> => {
    const accessLevel = tokenAuth?.accessLevel || (userId ? 'subscriber' : 'free');
    const useLogicc = typeof window !== 'undefined' && localStorage.getItem('use_logicc') === 'true';
    const functionName = useLogicc ? 'legal-chat-logicc' : 'legal-chat';

    const { data, error } = await supabase.functions.invoke(functionName, {
      body: {
        messages: [{ role: 'user', content: userMessage }],
        accessLevel
      }
    });

    if (error) {
      console.error('AI API error:', error);
      throw error;
    }

    return {
      id: Date.now().toString(),
      content: data.response,
      role: 'assistant',
      timestamp: new Date(),
      verified: data.verified ?? true,
      sources: data.sources || [],
      confidence: (data.confidence as Confidence) || 'medium',
      unverifiedCitations: data.unverifiedCitations || [],
      humanGate: data.humanGate?.triggered
        ? {
            trigger: data.humanGate.trigger,
            originalQuestion: data.humanGate.originalQuestion,
            gatekeeper: data.humanGate.gatekeeper,
          }
        : undefined,
    };
  };

  // Determine access mode
  const getAccessMode = (): 'unlimited' | 'free' => {
    if (userId) return 'unlimited';            // logged-in user
    if (isTokenAuthorized) return 'unlimited';  // valid notfallkoffer token
    return 'free';                              // anonymous
  };

  const canSendMessage = (): boolean => {
    if (isTokenExpired) return false;
    const mode = getAccessMode();
    if (mode === 'unlimited') return true;
    return !freeLimit.isExhausted;
  };

  const handleSendMessage = async () => {
    if (!input.trim()) return;

    // Token expired
    if (isTokenExpired) {
      toast({
        title: "Sitzung abgelaufen",
        description: "Bitte laden Sie die Seite über Ihren Notfallkoffer neu.",
        variant: "destructive"
      });
      return;
    }

    const mode = getAccessMode();

    // Free mode exhausted
    if (mode === 'free' && freeLimit.isExhausted) {
      setShowAuthPrompt(true);
      toast({
        title: "Kontingent aufgebraucht",
        description: `Sie haben Ihre ${freeLimit.limit} kostenlosen Fragen diesen Monat aufgebraucht. Registrieren Sie sich für unbegrenzten Zugang.`,
        variant: "default"
      });
      return;
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      content: input,
      role: 'user',
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    if (userId) {
      await saveMessage(userMessage);
    }
    setInput("");
    setIsLoading(true);

    try {
      const aiResponse = await callAIAPI(input);
      setMessages(prev => [...prev, aiResponse]);
      if (userId) {
        await saveMessage(aiResponse);
      }

      // Increment free question counter for anonymous users
      if (mode === 'free') {
        freeLimit.increment();
      }

      if (!hasAskedFirstQuestion) {
        setHasAskedFirstQuestion(true);
        // Show auth prompt for free users after first question
        if (mode === 'free') {
          setShowAuthPrompt(true);
        }
      }
    } catch (error: any) {
      console.error('Chat error:', error);
      toast({
        title: "Fehler",
        description: error?.message || "Bei der Generierung der Antwort ist ein Fehler aufgetreten.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0 && onDocumentUpload) {
      onDocumentUpload([...documents, ...files]);
      toast({
        title: "Dokument hinzugefügt",
        description: `${files.length} Dokument(e) wurde(n) hinzugefügt.`
      });
    }
  };

  const removeDocument = (index: number) => {
    if (onDocumentUpload) {
      const newDocs = documents.filter((_, i) => i !== index);
      onDocumentUpload(newDocs);
    }
  };

  const accessMode = getAccessMode();

  return (
    <div className="flex-1 flex flex-col max-w-4xl mx-auto w-full px-4">
      {/* Notfallkoffer branding */}
      {isTokenAuthorized && !isTokenExpired && (
        <div className="flex items-center justify-center gap-2 py-2 text-xs text-muted-foreground">
          <Shield className="h-3 w-3 text-primary" />
          <span>Bereitgestellt über Ihren Digitalen Notfallkoffer</span>
          {tokenAuth?.accessLevel && (
            <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium capitalize">
              {tokenAuth.accessLevel}
            </span>
          )}
        </div>
      )}

      {/* Token expiring soon warning */}
      {isTokenExpiringSoon && !isTokenExpired && (
        <div className="pt-4">
          <Alert className="border-amber-500/30 bg-amber-500/5">
            <RefreshCw className="h-4 w-4 text-amber-600" />
            <AlertTitle className="text-amber-700">Sitzung läuft bald ab</AlertTitle>
            <AlertDescription className="mt-1 text-amber-600">
              Ihre Sitzung läuft in Kürze ab. Öffnen Sie den Chat erneut über vorgesorgt.online, um eine neue Sitzung zu starten.
            </AlertDescription>
          </Alert>
        </div>
      )}

      {/* Token expired banner */}
      {isTokenExpired && (
        <div className="pt-4">
          <Alert className="border-destructive/30 bg-destructive/5">
            <RefreshCw className="h-4 w-4 text-destructive" />
            <AlertTitle>Sitzung abgelaufen</AlertTitle>
            <AlertDescription className="mt-2">
              <p className="mb-3">
                Ihre Sitzung ist abgelaufen. Bitte öffnen Sie den Chat erneut über Ihren Digitalen Notfallkoffer, um fortzufahren.
              </p>
              <Button
                onClick={() => window.location.reload()}
                variant="outline"
                size="sm"
              >
                <RefreshCw className="h-3 w-3 mr-2" />
                Seite neu laden
              </Button>
            </AlertDescription>
          </Alert>
        </div>
      )}

      {/* Beta Disclaimer – always visible */}
      <div className="pt-4">
        <Alert className="border-accent/30 bg-accent/5">
          <FlaskConical className="h-4 w-4 text-accent" />
          <AlertTitle className="text-accent-foreground">Beta-Version</AlertTitle>
          <AlertDescription className="mt-1 text-sm text-muted-foreground leading-relaxed">
            Dieser Chat befindet sich im <strong>Beta-Modus</strong>. Der Chatbot ist angelernt, 
            es kann jedoch nicht garantiert werden, dass alle Ergebnisse zu 100&nbsp;% korrekt sind. 
            Bitte behandeln Sie die Antworten wie eine kuratierte Internetrecherche. 
            Eine Haftung für die Richtigkeit wird nicht übernommen. Sollte eine Antwort eine 
            nicht nur unerhebliche Bedeutung für Sie haben, empfehlen wir dringend, diese 
            <strong> anwaltlich überprüfen zu lassen</strong>.
          </AlertDescription>
        </Alert>
      </div>

      {/* Welcome / Empty State */}
      {messages.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center py-12">
          <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center mb-6">
            <Bot className="h-8 w-8 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-bold text-foreground mb-2">Legacy-Chat</h1>
          <p className="text-muted-foreground text-center max-w-md">
            Ihr Helfer bei der Nachfolgeplanung
          </p>
        </div>
      )}

      {/* Disclaimer after first answer */}
      {hasAskedFirstQuestion && (
        <div className="pt-4">
          <LegalDisclaimer />
        </div>
      )}

      {/* Auth Prompt for free users */}
      {showAuthPrompt && !userId && !isTokenAuthorized && (
        <div className="pt-4">
          <Alert className="border-primary/30 bg-primary/5">
            <LogIn className="h-4 w-4 text-primary" />
            <AlertTitle>Unbegrenzten Zugang erhalten</AlertTitle>
            <AlertDescription className="mt-2">
              <p className="mb-3">
                Für unbegrenzten Zugang zum Erbrecht-Chat nutzen Sie den Digitalen Notfallkoffer auf{" "}
                <a
                  href="https://vorgesorgt.online"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary font-medium hover:underline"
                >
                  vorgesorgt.online
                </a>.
                {freeLimit.remaining > 0 && (
                  <span className="block mt-1 text-muted-foreground">
                    Sie haben noch {freeLimit.remaining} von {freeLimit.limit} kostenlosen Fragen diesen Monat.
                  </span>
                )}
              </p>
              <Button
                onClick={() => window.open('https://vorgesorgt.online', '_blank')}
                variant="default"
                size="sm"
              >
                Zu vorgesorgt.online
              </Button>
            </AlertDescription>
          </Alert>
        </div>
      )}

      {/* Messages */}
      {messages.length > 0 && (
        <div className="flex-1 overflow-y-auto py-6 space-y-6">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex gap-4 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {message.role === 'assistant' && (
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                    <Bot className="h-4 w-4 text-primary-foreground" />
                  </div>
                </div>
              )}

              <div className={`max-w-[75%] ${message.role === 'user' ? 'order-2' : ''}`}>
                <div className={`rounded-2xl px-4 py-3 ${
                  message.role === 'user' 
                    ? 'bg-primary text-primary-foreground' 
                    : 'bg-secondary text-secondary-foreground'
                }`}>
                  <div className="prose prose-sm max-w-none">
                    {message.content.split('\n').map((line, index) => {
                      if (line.startsWith('**') && line.endsWith('**')) {
                        return <h4 key={index} className="font-semibold mt-2 mb-1">{line.slice(2, -2)}</h4>;
                      } else if (line.startsWith('• ')) {
                        return <li key={index} className="ml-4">{line.slice(2)}</li>;
                      } else if (line.trim()) {
                        return <p key={index} className="mb-1">{line}</p>;
                      }
                      return null;
                    })}
                  </div>

                  {message.humanGate && (
                    <HumanGateForm
                      originalQuestion={message.humanGate.originalQuestion}
                      trigger={message.humanGate.trigger}
                    />
                  )}

                  {message.sources && message.sources.length > 0 && (
                    <div className="mt-3 pt-2 border-t border-border/30">
                      <p className="text-xs font-medium mb-1 opacity-70">Rechtsgrundlagen:</p>
                      <div className="flex flex-wrap gap-1">
                        {message.sources.map((source, index) => (
                          <span key={index} className="text-xs bg-background/20 px-2 py-0.5 rounded">
                            {source}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {message.role === 'assistant' && message.confidence && (
                    <div className="mt-3 pt-2 border-t border-border/30 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        {message.confidence === 'high' && (
                          <span className="inline-flex items-center gap-1 text-xs font-medium bg-green-500/15 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-full">
                            <ShieldCheck className="h-3 w-3" /> Hohe Konfidenz · Quellen geprüft
                          </span>
                        )}
                        {message.confidence === 'medium' && (
                          <span className="inline-flex items-center gap-1 text-xs font-medium bg-amber-500/15 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full">
                            <ShieldAlert className="h-3 w-3" /> Mittlere Konfidenz · anwaltlich prüfen lassen
                          </span>
                        )}
                        {message.confidence === 'low' && (
                          <span className="inline-flex items-center gap-1 text-xs font-medium bg-destructive/15 text-destructive px-2 py-0.5 rounded-full">
                            <ShieldX className="h-3 w-3" /> Geringe Konfidenz · unbedingt anwaltlich verifizieren
                          </span>
                        )}
                        {message.unverifiedCitations && message.unverifiedCitations.length > 0 && (
                          <span className="text-xs text-muted-foreground" title={message.unverifiedCitations.join(', ')}>
                            {message.unverifiedCitations.length} Zitat(e) nicht in Wissensbasis verifiziert
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1 px-2">
                  {message.timestamp.toLocaleTimeString()}
                </p>
              </div>

              {message.role === 'user' && (
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-muted rounded-lg flex items-center justify-center">
                    <User className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="flex gap-4">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <Bot className="h-4 w-4 text-primary-foreground" />
              </div>
              <div className="bg-secondary rounded-2xl px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                    <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                    <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      )}

      {/* Input Area */}
      <div className="py-4">
        {/* Document chips */}
        {documents.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {documents.map((doc, index) => (
              <div key={index} className="flex items-center gap-1 bg-secondary text-secondary-foreground rounded-full px-3 py-1 text-sm">
                <Paperclip className="h-3 w-3" />
                <span className="max-w-32 truncate">{doc.name}</span>
                <button 
                  onClick={() => removeDocument(index)}
                  className="ml-1 hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="relative bg-secondary rounded-2xl border border-border shadow-card">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={isTokenExpired ? "Sitzung abgelaufen – bitte Seite neu laden" : "Stellen Sie Ihre Frage zur Nachfolgeplanung..."}
            className="w-full bg-transparent px-4 py-3 pr-24 resize-none focus:outline-none min-h-[52px] max-h-[200px]"
            disabled={isLoading || isTokenExpired}
            rows={1}
          />
          
          <div className="absolute right-2 bottom-2 flex items-center gap-1">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              className="hidden"
              accept=".pdf,.doc,.docx,.txt"
              multiple
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => fileInputRef.current?.click()}
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              title="Dokument anhängen"
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            <Button
              onClick={handleSendMessage}
              disabled={!input.trim() || isLoading || !canSendMessage()}
              size="icon"
              className="h-8 w-8 rounded-lg"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
        
        <div className="flex items-center justify-center gap-3 mt-2">
          <p className="text-xs text-muted-foreground">
            Legacy-Chat kann Fehler machen. Bitte prüfen Sie wichtige Informationen.
          </p>
          {/* Free user question counter */}
          {accessMode === 'free' && (
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
              freeLimit.remaining <= 1 
                ? 'bg-destructive/10 text-destructive' 
                : 'bg-primary/10 text-primary'
            }`}>
              {freeLimit.remaining}/{freeLimit.limit} Fragen übrig
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatInterface;
