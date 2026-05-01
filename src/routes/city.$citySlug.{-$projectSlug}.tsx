import { createFileRoute } from "@tanstack/react-router";
import { HomePage } from "./index";

export const Route = createFileRoute("/city/$citySlug/{-$projectSlug}")({
  component: CityRoute,
});

function CityRoute() {
  const { citySlug, projectSlug } = Route.useParams();
  return <HomePage routeCitySlug={citySlug} routeProjectSlug={projectSlug} />;
}
