import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { CORK_CENTER, CORK_BOUNDS } from "@/lib/constants";

const pinIcon = L.divIcon({
  className: "",
  html: '<div class="dev-pin"></div>',
  iconSize: [28, 28],
  iconAnchor: [14, 28],
  popupAnchor: [0, -28],
});

interface DevPoint {
  id: string;
  latitude: number;
  longitude: number;
  title: string;
}

interface Props {
  developments: DevPoint[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  pickMode?: boolean;
  pickedPoint?: { lat: number; lng: number } | null;
  onPick?: (lat: number, lng: number) => void;
}

function FlyTo({ id, points }: { id?: string | null; points: DevPoint[] }) {
  const map = useMap();
  useEffect(() => {
    if (!id) return;
    const p = points.find((x) => x.id === id);
    if (p) map.flyTo([p.latitude, p.longitude], 16, { duration: 0.8 });
  }, [id, points, map]);
  return null;
}

function ClickHandler({ enabled, onPick }: { enabled: boolean; onPick?: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      if (enabled && onPick) onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export function CorkMap({ developments, selectedId, onSelect, pickMode, pickedPoint, onPick }: Props) {
  return (
    <MapContainer
      center={CORK_CENTER}
      zoom={14}
      maxBounds={CORK_BOUNDS}
      minZoom={12}
      maxZoom={18}
      style={{ height: "100%", width: "100%", cursor: pickMode ? "crosshair" : undefined }}
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://carto.com/">CARTO</a> &copy; OpenStreetMap'
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
      />
      <ClickHandler enabled={!!pickMode} onPick={onPick} />
      <FlyTo id={selectedId} points={developments} />
      {developments.map((d) => (
        <Marker
          key={d.id}
          position={[d.latitude, d.longitude]}
          icon={pinIcon}
          eventHandlers={{ click: () => onSelect?.(d.id) }}
        />
      ))}
      {pickedPoint && (
        <Marker position={[pickedPoint.lat, pickedPoint.lng]} icon={pinIcon} />
      )}
    </MapContainer>
  );
}
