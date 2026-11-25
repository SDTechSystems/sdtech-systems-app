import { History } from "lucide-react";
import type { ActivityEntry } from "../../shared/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { activityLabel, formatDateTime } from "@/lib/labels";

export function ActivityCard({ activity }: { activity: ActivityEntry[] }) {
  if (!activity.length) return null;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-4 w-4" /> Historial
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {activity.map((a, i) => (
            <li key={i} className="text-sm">
              <p className="font-medium">{activityLabel(a.action)}</p>
              <p className="text-muted-foreground">
                {formatDateTime(a.at)} · {a.actor}
              </p>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
