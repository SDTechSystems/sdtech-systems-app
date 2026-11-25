import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function NoAccess() {
  return (
    <div className="py-16 text-center space-y-4">
      <h1 className="text-xl font-bold">Esta sección es solo para el dueño</h1>
      <p className="text-muted-foreground">Pídele a Juan que haga este cambio.</p>
      <Button asChild variant="outline">
        <Link to="/">Volver al inicio</Link>
      </Button>
    </div>
  );
}
