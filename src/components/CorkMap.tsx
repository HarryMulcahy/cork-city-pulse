import { useEffect, useMemo, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Polygon,
  Polyline,
  CircleMarker,
  ZoomControl,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import { CATEGORY_COLORS, type Category } from "@/lib/constants";

export type LatLng = { lat: number; lng: number };
export type ShapeKind = "polygon" | "line";

/**
 * Inline SVG paths (lucide-style stroke icons) for each category.
 * Kept as raw SVG strings so they can be injected into Leaflet divIcons
 * without rendering React inside Leaflet.
 */
const CATEGORY_SVG: Record<Category, string> = {
  residential:
    '<path d="M3 9l9-7 9 7"/><path d="M5 9v11h14V9"/><path d="M10 20v-6h4v6"/>',
  commercial:
    '<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18"/><path d="M6 12h12"/><path d="M6 7h12"/><path d="M6 17h12"/>',
  infrastructure:
    '<rect x="6" y="3" width="12" height="14" rx="2"/><path d="M9 17l-2 4"/><path d="M15 17l2 4"/><path d="M6 11h12"/><circle cx="9" cy="14" r="0.5" fill="currentColor"/><circle cx="15" cy="14" r="0.5" fill="currentColor"/>',
  public_space:
    '<path d="M12 2a6 6 0 0 0-3 11.2V18h6v-4.8A6 6 0 0 0 12 2z"/><path d="M9 22h6"/>',
  mixed_use:
    '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  other:
    '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
};

function pinHtml(category: Category, variant: "default" | "selected" | "picked") {
  const color = CATEGORY_COLORS[category] ?? CATEGORY_COLORS.other;
  return `
    <div class="dev-pin dev-pin--${variant}" style="--pin-color:${color}" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        ${CATEGORY_SVG[category] ?? CATEGORY_SVG.other}
      </svg>
    </div>`;
}

function makeCategoryIcon(category: Category, variant: "default" | "selected" | "picked") {
  return L.divIcon({
    className: "",
    html: pinHtml(category, variant),
    iconSize: [32, 40],
    iconAnchor: [16, 38],
    popupAnchor: [0, -34],
  });
}

function makeClusterIcon(count: number) {
  return L.divIcon({
    className: "",
    html: `
      <div style="
        width:38px;height:38px;border-radius:9999px;
        background:#1a2b3c;color:#ffcc00;
        border:2px solid #ffcc00;
        display:flex;align-items:center;justify-content:center;
        font-weight:800;font-size:13px;font-family:system-ui;
        box-shadow:0 3px 10px rgb(0 0 0 / 0.35);
        cursor:pointer;
      ">${count}</div>`,
    iconSize: [38, 38],
    iconAnchor: [19, 19],
  });
}

interface DevPoint {
  id: string;
  latitude: number;
  longitude: number;
  title: string;
  category: Category;
  area?: LatLng[] | null;
  shape?: ShapeKind;
}

interface Props {
  /** [lat, lng] center for the active city. */
  center: [number, number];
  /** [[south, west], [north, east]] bounds for the active city. */
  bounds: [[number, number], [number, number]];
  /** A stable key per city so the map remounts cleanly when changed. */
  cityKey: string;
  developments: DevPoint[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  pickMode?: boolean;
  pickedPoint?: LatLng | null;
  pickedCategory?: Category;
  onPick?: (lat: number, lng: number) => void;

  /** Drawing mode + shape kind being drawn. */
  drawMode?: boolean;
  drawShape?: ShapeKind;
  drawCategory?: Category;
  drawPoints?: LatLng[];
  onDrawPoint?: (lat: number, lng: number) => void;
  onDrawFinish?: () => void;
  /** Changes whenever the map's visible area changes (e.g. sidebar open/close) so it recentres. */
  resizeKey?: string | number;
}

/** Recompute Leaflet's size + recentre after the container's visible area changes. */
function InvalidateOnResize({ trigger }: { trigger: string | number }) {
  const map = useMap();
  useEffect(() => {
    // Wait out the container's CSS transition (~300ms), then recentre in the new area.
    const t = setTimeout(() => map.invalidateSize({ pan: true }), 320);
    return () => clearTimeout(t);
  }, [trigger, map]);
  return null;
}

function FlyTo({ id, points }: { id?: string | null; points: DevPoint[] }) {
  const map = useMap();
  useEffect(() => {
    if (!id) return;
    const p = points.find((x) => x.id === id);
    if (!p) return;
    if (p.area && p.area.length >= 2) {
      const bounds = L.latLngBounds(
        p.area.map((pt) => [pt.lat, pt.lng] as [number, number]),
      );
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
  onMapClick,
}: {
  pickMode: boolean;
  drawMode: boolean;
  onPick?: (lat: number, lng: number) => void;
  onDrawPoint?: (lat: number, lng: number) => void;
  onDrawFinish?: () => void;
  onMapClick?: () => void;
}) {
  useMapEvents({
    click(e) {
      if (drawMode && onDrawPoint) {
        onDrawPoint(e.latlng.lat, e.latlng.lng);
      } else if (pickMode && onPick) {
        onPick(e.latlng.lat, e.latlng.lng);
      } else if (onMapClick) {
        onMapClick();
      }
    },
    dblclick() {
      if (drawMode && onDrawFinish) onDrawFinish();
    },
  });
  return null;
}

/** Group dev points by ~1m precision so we can spiderfy coincident pins. */
function clusterCoincident(points: DevPoint[]) {
  const groups = new Map<string, DevPoint[]>();
  for (const p of points) {
    // 5 decimals ≈ 1.1m, treat as same spot
    const key = `${p.latitude.toFixed(5)},${p.longitude.toFixed(5)}`;
    const arr = groups.get(key);
    if (arr) arr.push(p);
    else groups.set(key, [p]);
  }
  return Array.from(groups.values());
}

/** Compute spiderfy positions in screen-pixel space so the radius is consistent at any zoom. */
function spiderfyOffsets(count: number, radiusPx: number) {
  const offsets: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < count; i++) {
    const angle = (2 * Math.PI * i) / count - Math.PI / 2;
    offsets.push({ x: Math.cos(angle) * radiusPx, y: Math.sin(angle) * radiusPx });
  }
  return offsets;
}

/** Renders an expanded spider with leg lines + offset child pins. */
function Spider({
  center,
  items,
  selectedId,
  onSelect,
}: {
  center: LatLng;
  items: DevPoint[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
}) {
  const map = useMap();
  const [tick, setTick] = useState(0);
  // Recompute on zoom/move so legs/positions stay anchored to the same lat/lng
  useEffect(() => {
    const handler = () => setTick((t) => t + 1);
    map.on("zoomend moveend", handler);
    return () => {
      map.off("zoomend moveend", handler);
    };
  }, [map]);

  const radius = items.length <= 6 ? 38 : 38 + (items.length - 6) * 4;
  const offsets = useMemo(
    () => spiderfyOffsets(items.length, radius),
    [items.length, radius],
  );
  const centerPx = map.latLngToLayerPoint([center.lat, center.lng]);
  const positioned = items.map((c, i) => {
    const px = L.point(centerPx.x + offsets[i].x, centerPx.y + offsets[i].y);
    const ll = map.layerPointToLatLng(px);
    return { dev: c, latlng: ll };
  });

  // Force re-render when map moves
  void tick;

  return (
    <>
      {positioned.map(({ dev, latlng }) => (
        <Polyline
          key={`leg-${dev.id}`}
          positions={[
            [center.lat, center.lng],
            [latlng.lat, latlng.lng],
          ]}
          pathOptions={{ color: "#1a2b3c", weight: 1.5, opacity: 0.5 }}
          interactive={false}
        />
      ))}
      {positioned.map(({ dev, latlng }) => {
        const isSelected = dev.id === selectedId;
        return (
          <Marker
            key={`spider-${dev.id}`}
            position={[latlng.lat, latlng.lng]}
            icon={makeCategoryIcon(dev.category, isSelected ? "selected" : "default")}
            zIndexOffset={isSelected ? 1200 : 1100}
            keyboard
            title={dev.title}
            alt={dev.title}
            eventHandlers={{ click: () => onSelect?.(dev.id) }}
          />
        );
      })}
    </>
  );
}

export function CorkMap({
  center,
  bounds,
  cityKey,
  developments,
  selectedId,
  onSelect,
  pickMode,
  pickedPoint,
  pickedCategory = "other",
  onPick,
  drawMode,
  drawShape = "polygon",
  drawCategory = "other",
  drawPoints = [],
  onDrawPoint,
  onDrawFinish,
  resizeKey,
}: Props) {
  const cursor = drawMode || pickMode ? "crosshair" : undefined;
  const drawColor = CATEGORY_COLORS[drawCategory] ?? CATEGORY_COLORS.other;

  // Track which coincident-pin cluster is currently spiderfied (by group key).
  const [openCluster, setOpenCluster] = useState<string | null>(null);

  const clusters = useMemo(() => clusterCoincident(developments), [developments]);

  // If the selected dev belongs to a multi-pin cluster, auto-open it.
  useEffect(() => {
    if (!selectedId) return;
    const grp = clusters.find((g) => g.length > 1 && g.some((d) => d.id === selectedId));
    if (grp) {
      const key = `${grp[0].latitude.toFixed(5)},${grp[0].longitude.toFixed(5)}`;
      setOpenCluster(key);
    }
  }, [selectedId, clusters]);

  return (
    <MapContainer
      key={cityKey}
      center={center}
      zoom={13}
      maxBounds={bounds}
      maxBoundsViscosity={0.6}
      minZoom={10}
      maxZoom={18}
      style={{ height: "100%", width: "100%", cursor }}
      scrollWheelZoom
      doubleClickZoom={!drawMode}
      zoomControl={false}
    >
      <ZoomControl position="bottomright" />
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
        onMapClick={() => setOpenCluster(null)}
      />
      <FlyTo id={selectedId} points={developments} />
      <InvalidateOnResize trigger={resizeKey ?? ""} />

      {/* Existing area outlines / lines */}
      {developments.map((d) => {
        if (!d.area || d.area.length < 2) return null;
        const positions = d.area.map((p) => [p.lat, p.lng] as [number, number]);
        const isSelected = d.id === selectedId;
        const color = CATEGORY_COLORS[d.category] ?? CATEGORY_COLORS.other;
        const style = {
          color,
          weight: isSelected ? 4 : 3,
          opacity: 0.95,
          fillColor: color,
          fillOpacity: isSelected ? 0.28 : 0.18,
        };
        if (d.shape === "line") {
          return (
            <Polyline
              key={`area-${d.id}`}
              positions={positions}
              pathOptions={style}
              eventHandlers={{ click: () => onSelect?.(d.id) }}
            />
          );
        }
        if (d.area.length < 3) return null;
        return (
          <Polygon
            key={`area-${d.id}`}
            positions={positions}
            pathOptions={style}
            eventHandlers={{ click: () => onSelect?.(d.id) }}
          />
        );
      })}

      {/* Pins — single per group; multi-pin groups render as a cluster badge */}
      {clusters.map((group) => {
        const first = group[0];
        const key = `${first.latitude.toFixed(5)},${first.longitude.toFixed(5)}`;
        if (group.length === 1) {
          const d = first;
          const isSelected = d.id === selectedId;
          return (
            <Marker
              key={d.id}
              position={[d.latitude, d.longitude]}
              icon={makeCategoryIcon(d.category, isSelected ? "selected" : "default")}
              zIndexOffset={isSelected ? 1000 : 0}
              keyboard
              title={d.title}
              alt={d.title}
              eventHandlers={{ click: () => onSelect?.(d.id) }}
            />
          );
        }
        // Multiple pins at same spot
        const isOpen = openCluster === key;
        if (!isOpen) {
          return (
            <Marker
              key={`cluster-${key}`}
              position={[first.latitude, first.longitude]}
              icon={makeClusterIcon(group.length)}
              zIndexOffset={500}
              title={`${group.length} developments here — click to expand`}
              alt={`${group.length} developments`}
              eventHandlers={{ click: () => setOpenCluster(key) }}
            />
          );
        }
        return (
          <Spider
            key={`spider-group-${key}`}
            center={{ lat: first.latitude, lng: first.longitude }}
            items={group}
            selectedId={selectedId}
            onSelect={(id) => onSelect?.(id)}
          />
        );
      })}

      {pickedPoint && (
        <Marker
          position={[pickedPoint.lat, pickedPoint.lng]}
          icon={makeCategoryIcon(pickedCategory, "picked")}
        />
      )}

      {/* In-progress drawing */}
      {drawMode && drawPoints.length > 0 && (
        <>
          {drawShape === "polygon" && drawPoints.length >= 3 ? (
            <Polygon
              positions={drawPoints.map((p) => [p.lat, p.lng] as [number, number])}
              pathOptions={{
                color: drawColor,
                weight: 2,
                dashArray: "6 4",
                fillColor: drawColor,
                fillOpacity: 0.12,
              }}
            />
          ) : (
            <Polyline
              positions={drawPoints.map((p) => [p.lat, p.lng] as [number, number])}
              pathOptions={{
                color: drawColor,
                weight: 3,
                dashArray: "6 4",
                opacity: 0.9,
              }}
            />
          )}
          {drawPoints.map((p, i) => (
            <CircleMarker
              key={i}
              center={[p.lat, p.lng]}
              radius={5}
              pathOptions={{
                color: drawColor,
                fillColor: "#ffffff",
                fillOpacity: 1,
                weight: 2,
              }}
            />
          ))}
        </>
      )}
    </MapContainer>
  );
}
