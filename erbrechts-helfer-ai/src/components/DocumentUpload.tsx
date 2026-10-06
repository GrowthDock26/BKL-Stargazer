import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload, File, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import documentIcon from "@/assets/document-icon.jpg";

interface DocumentUploadProps {
  onDocumentUpload: (files: File[]) => void;
}

const DocumentUpload = ({ onDocumentUpload }: DocumentUploadProps) => {
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    
    // Filter allowed file types
    const allowedTypes = ['.pdf', '.doc', '.docx', '.txt'];
    const validFiles = files.filter(file => {
      const extension = '.' + file.name.split('.').pop()?.toLowerCase();
      return allowedTypes.includes(extension);
    });

    if (validFiles.length !== files.length) {
      toast({
        title: "Ungültige Dateitypen",
        description: "Nur PDF, DOC, DOCX und TXT Dateien sind erlaubt.",
        variant: "destructive"
      });
    }

    if (validFiles.length > 0) {
      const newFiles = [...uploadedFiles, ...validFiles];
      setUploadedFiles(newFiles);
      onDocumentUpload(newFiles);
      
      toast({
        title: "Dokumente hochgeladen",
        description: `${validFiles.length} Dokument(e) erfolgreich hochgeladen.`
      });
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeFile = (index: number) => {
    const newFiles = uploadedFiles.filter((_, i) => i !== index);
    setUploadedFiles(newFiles);
    onDocumentUpload(newFiles);
  };

  return (
    <Card className="border-border shadow-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-3 text-primary">
          <img src={documentIcon} alt="Document" className="w-6 h-6 rounded" />
          Dokumente hochladen
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div 
            className="border-2 border-dashed border-accent/30 rounded-lg p-6 text-center hover:border-accent/50 transition-smooth cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-8 w-8 text-accent mx-auto mb-2" />
            <p className="text-sm text-muted-foreground mb-2">
              Klicken Sie hier oder ziehen Sie Dokumente hierher
            </p>
            <p className="text-xs text-muted-foreground">
              Unterstützt: PDF, DOC, DOCX, TXT
            </p>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.txt"
            onChange={handleFileUpload}
            className="hidden"
          />

          {uploadedFiles.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-primary">Hochgeladene Dokumente:</h4>
              {uploadedFiles.map((file, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-secondary rounded-lg">
                  <div className="flex items-center gap-2">
                    <File className="h-4 w-4 text-accent" />
                    <span className="text-sm font-medium">{file.name}</span>
                    <span className="text-xs text-muted-foreground">
                      ({(file.size / 1024 / 1024).toFixed(2)} MB)
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => removeFile(index)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default DocumentUpload;