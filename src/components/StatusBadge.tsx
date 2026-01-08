import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: string;
  category?: string;
  className?: string;
}

export const StatusBadge = ({ status, category, className }: StatusBadgeProps) => {
  const isMVCategory = category && ["MV-Company", "MV-PublicSeller", "MV-Supplier"].includes(category);
  
  const getVariant = () => {
    switch (status.toLowerCase()) {
      case "completed":
        return "default";
      case "awaitingfirstweigh":
      case "pending":
        return "secondary";
      case "awaitingsecondweigh":
        // Blue badge for MV vehicles awaiting return
        return isMVCategory ? "info" : "secondary";
      case "overdue":
      case "paymentrequired":
        return "destructive";
      default:
        return "outline";
    }
  };

  const getLabel = () => {
    switch (status.toLowerCase()) {
      case "awaitingfirstweigh":
        return "Awaiting 1st Weigh";
      case "awaitingsecondweigh":
        // Distinct label for MV vehicles
        return isMVCategory ? "1st Weigh Done - Awaiting Return" : "Awaiting 2nd Weigh";
      case "paymentrequired":
        return "Payment Required";
      default:
        return status;
    }
  };

  return (
    <Badge variant={getVariant()} className={cn("capitalize", className)}>
      {getLabel()}
    </Badge>
  );
};
