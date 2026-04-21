import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Polygon, Polyline, CircleMarker, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { CORK_CENTER, CORK_BOUNDS } from "@/lib/constants";

function makePinIcon(variant: "default" | "selected" | "picked" = "default") {
  return L.divIcon({
    className: "",
    html: `<div class="dev-pin dev-pin--${variant}" aria-hidden="true"></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -28],
  });
}

const pinIconDefault = makePinIcon("default");
const pinIconSelected = makePinIcon("selected");
const pinIconPicked = makePinIcon("picked");

export type LatLng = { lat: number; lng: number };

interface DevPoint {
  id: string;
  latitude: number;
  longitude: number;
  title: string;
  area?: LatLng[] | null;
}

interface Props {
  developments: DevPoint[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  pickMode?: boolean;
  pickedPoint?: LatLng | null;
  onPick?: (lat: number, lng: number) => void;
  drawMode?: boolean;
  drawPoints?: LatLng[];
  onDrawPoint?: (lat: number, lng: number) => void;
  onDrawFinish?: () => void;
}

function FlyTo({ id, points }: { id?: string | null; points: DevPoint[] }) {
  const map = useMap();
  useEffect(() => {
    if (!id) return;
    const p = points.find((x) => x.id === id);
    if (!p) return;
    if (p.area && p.area.length >= 3) {
      const bounds = L.latLngBounds(p.area.map((pt) => [pt.lat, pt.lng] as [number, number]));
      map.flyToBounds(bounds, { duration: 0.8, padding: [40, 40], maxZoom: 17 });
    } else {
      map.flyTo([p.latitude, p.longitude], 16, { duration: 0.8 });
    }
  }, [id, points, map]);
  return null;
}

function ClickHandler({
  pickMode,
  drawMode,
  onPick,
  onDrawPoint,
  onDrawFinish,
}: {
  pickMode: boolean;
  drawMode: boolean;
  onPick?: (lat: number, lng: number) => void;
  onDrawPoint?: (lat: number, lng: number) => void;
  onDrawFinish?: () => void;
}) {
  useMapEvents({
    click(e) {
      if (drawMode && onDrawPoint) {
        onDrawPoint(e.latlng.lat, e.latlng.lng);
      } else if (pickMode && onPick) {
        onPick(e.latlng.lat, e.latlng.lng);
      }
    },
    dblclick() {
      if (drawMode && onDrawFinish) onDrawFinish();
    },
  });
  return null;
}

export function CorkMap({
  developments,
  selectedId,
  onSelect,
  pickMode,
  pickedPoint,
  onPick,
  drawMode,
  drawPoints = [],
  onDrawPoint,
  onDrawFinish,
}: Props) {
  const cursor = drawMode ? "crosshair" : pickMode ? "crosshair" : undefined;

  return (
    <MapContainer
      center={CORK_CENTER}
      zoom={14}
      maxBounds={CORK_BOUNDS}
      minZoom={12}
      maxZoom={18}
      style={{ height: "100%", width: "100%", cursor }}
      scrollWheelZoom
      doubleClickZoom={!drawMode}
    >
      <TileLayer
        attribution='&copy; <a href="https://carto.com/">CARTO</a> &copy; OpenStreetMap'
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
      />
      <ClickHandler
        pickMode={!!pickMode}
        drawMode={!!drawMode}
        onPick={onPick}
        onDrawPoint={onDrawPoint}
        onDrawFinish={onDrawFinish}
      />
      <FlyTo id={selectedId} points={developments} />

      {/* Existing area outlines */}
      {developments.map((d) =>
        d.area && d.area.length >= 3 ? (
          <Polygon
            key={`area-${d.id}`}
            positions={d.area.map((p) => [p.lat, p.lng] as [number, number])}
            pathOptions={{
              className: `dev-area ${d.id === selectedId ? "dev-area--selected" : ""}`,
            }}
            eventHandlers={{ click: () => onSelect?.(d.id) }}
          />
        ) : null
      )}

      {/* Pins */}
      {developments.map((d) => {
        const isSelected = d.id === selectedId;
        return (
          <Marker
            key={d.id}
            position={[d.latitude, d.longitude]}
            icon={isSelected ? pinIconSelected : pinIconDefault}
            zIndexOffset={isSelected ? 1000 : 0}
            keyboard
            title={d.title}
            alt={d.title}
            eventHandlers={{ click: () => onSelect?.(d.id) }}
          />
        );
      })}

      {pickedPoint && (
        <Marker position={[pickedPoint.lat, pickedPoint.lng]} icon={pinIconPicked} />
      )}

      {/* In-progress drawing */}
      {drawMode && drawPoints.length > 0 && (
        <>
          {drawPoints.length >= 3 ? (
            <Polygon
              positions={drawPoints.map((p) => [p.lat, p.lng])}
              pathOptions={{ className: "dev-area dev-area--draft" }}
            />
          ) : (
            <Polyline
              positions={drawPoints.map((p) => [p.lat, p.lng])}
              pathOptions={{ className: "dev-area dev-area--draft" }}
            />
          )}
          {drawPoints.map((p, i) => (
            <CircleMarker
              key={i}
              center={[p.lat, p.lng]}
              radius={5}
              pathOptions={{
                className: "dev-vertex",
              }}
            />
          ))}
        </>
      )}
    </MapContainer>
  );
}
