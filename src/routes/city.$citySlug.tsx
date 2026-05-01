import { createFileRoute } from "@tanstack/react-router";
import { HomePage } from "./index";

export const Route = createFileRoute("/city/$citySlug")({
  component: CityRoute,
});

function CityRoute() {
  const { citySlug } = Route.useParams();
  return <HomePage routeCitySlug={citySlug} />;
}
