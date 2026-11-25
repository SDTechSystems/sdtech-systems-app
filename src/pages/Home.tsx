import { CalendarClock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Home() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Hola 👋</h1>
        <p className="text-muted-foreground">Esto es lo que tienes pendiente.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <CalendarClock className="h-5 w-5 text-[var(--sd-blue)]" /> Pendientes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Aquí vas a ver reuniones, entregas y cobros próximos.</p>
        </CardContent>
      </Card>
    </div>
  );
}
