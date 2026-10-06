import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Users, Calculator, BookOpen } from "lucide-react";

interface LegalTopicsProps {
  onTopicSelect: (topic: string) => void;
}

const LegalTopics = ({ onTopicSelect }: LegalTopicsProps) => {
  const topics = [
    {
      icon: <FileText className="h-8 w-8" />,
      title: "Testament & Erbfolge",
      description: "Gesetzliche Erbfolge, Testamentserstellung und Erbausschlagung",
      query: "Ich habe Fragen zur gesetzlichen Erbfolge und Testamentserstellung"
    },
    {
      icon: <Users className="h-8 w-8" />,
      title: "Pflichtteil",
      description: "Pflichtteilsrecht, Berechnung und Entziehung",
      query: "Ich benötige Informationen zum Pflichtteilsrecht"
    },
    {
      icon: <Calculator className="h-8 w-8" />,
      title: "Erbschaftssteuer",
      description: "Steuerberechnung, Freibeträge und Probesterben",
      query: "Ich möchte die potentielle Erbschaftssteuer berechnen lassen"
    },
    {
      icon: <BookOpen className="h-8 w-8" />,
      title: "Allgemeine Fragen",
      description: "Sonstige Fragen zum deutschen Erbrecht",
      query: "Ich habe eine allgemeine Frage zum Erbrecht"
    }
  ];

  return (
    <div className="grid grid-cols-1 gap-4">
      {topics.map((topic, index) => (
        <Card 
          key={index} 
          className="group relative overflow-hidden border-border/50 hover:border-accent/50 transition-all duration-300 shadow-card hover:shadow-elegant cursor-pointer bg-gradient-to-br from-card via-card to-accent/5 hover:to-accent/10"
          onClick={() => onTopicSelect(topic.query)}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-accent/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          
          <CardHeader className="pb-4 relative">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-gradient-to-br from-accent/20 to-accent/10 rounded-xl text-accent group-hover:scale-110 transition-transform duration-300 flex-shrink-0">
                {topic.icon}
              </div>
              <div className="flex-1 min-w-0">
                <CardTitle className="text-lg font-semibold text-primary group-hover:text-accent transition-colors duration-300">
                  {topic.title}
                </CardTitle>
                <p className="text-muted-foreground text-sm mt-2 leading-relaxed">
                  {topic.description}
                </p>
              </div>
            </div>
          </CardHeader>
        </Card>
      ))}
    </div>
  );
};

export default LegalTopics;