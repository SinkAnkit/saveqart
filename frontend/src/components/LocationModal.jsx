import { useState, useRef, useEffect, useCallback } from 'react';
import { MapPin, Navigation, X, Search, Loader2, Crosshair } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { api } from '../api.js';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix default marker icon paths (vite doesn't bundle leaflet's images by default)
const DefaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

const INDIA_CENTER = [22.5, 79.0];
const INDIA_ZOOM = 5;

function MapController({ center, zoom }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.setView(center, zoom ?? map.getZoom(), { animate: true });
  }, [center, zoom, map]);
  return null;
}

function ClickHandler({ onPick }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function LocationModal({ open, onClose, required = false }) {
  const { user, updateLocation } = useAuth();
  const { toast } = useToast();
  const [query, setQuery] = useState(user?.location?.label || '');
  const [suggestions, setSuggestions] = useState([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [err, setErr] = useState('');
  const [pin, setPin] = useState(
    user?.location?.lat && user?.location?.lng
      ? { lat: user.location.lat, lng: user.location.lng, label: user.location.label }
      : null
  );
  const [mapCenter, setMapCenter] = useState(
    pin ? [pin.lat, pin.lng] : INDIA_CENTER
  );
  const [mapZoom, setMapZoom] = useState(pin ? 14 : INDIA_ZOOM);
  const inputRef = useRef(null);
  const debounceRef = useRef(null);
  const listRef = useRef(null);
  const sessionRef = useRef(null);

  // Google Places session token: groups autocomplete keystrokes + the final
  // details lookup into one billable session. Regenerated after each pick.
  const ensureSession = useCallback(() => {
    if (!sessionRef.current) {
      sessionRef.current =
        (typeof crypto !== 'undefined' && crypto.randomUUID)
          ? crypto.randomUUID()
          : `sess-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
    return sessionRef.current;
  }, []);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  const runSearch = useCallback(async (q) => {
    if (!q || q.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    setSearching(true);
    try {
      const data = await api.geocodeSearch(q, ensureSession());
      setSuggestions(data.results || []);
    } catch (e) {
      setSuggestions([]);
    } finally {
      setSearching(false);
    }
  }, [ensureSession]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query || query.length < 2) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(() => runSearch(query), 350);
    return () => debounceRef.current && clearTimeout(debounceRef.current);
  }, [query, runSearch]);

  const pickSuggestion = (s) => {
    setPin({
      lat: s.lat,
      lng: s.lng,
      label: s.shortLabel || s.label,
      pincode: s.pincode || null,
      city: s.city || null,
      state: s.state || null,
    });
    setQuery(s.shortLabel || s.label);
    setMapCenter([s.lat, s.lng]);
    setMapZoom(15);
    setSuggestions([]);
    sessionRef.current = null; // end Google Places billing session
  };

  const onMapPick = async (lat, lng) => {
    setResolving(true);
    setPin({ lat, lng, label: 'Locating…' });
    setErr('');
    try {
      const r = await api.geocodeReverse(lat, lng);
      const label = r.shortLabel || r.label || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      setPin({
        lat,
        lng,
        label,
        pincode: r.pincode || null,
        city: r.city || null,
        state: r.state || null,
      });
      setQuery(label);
    } catch (e) {
      const fallback = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      setPin({ lat, lng, label: fallback });
      setQuery(fallback);
    } finally {
      setResolving(false);
    }
  };

  const detect = () => {
    if (!navigator.geolocation) {
      setErr('Geolocation not supported by your browser');
      return;
    }
    setDetecting(true);
    setErr('');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        setMapCenter([latitude, longitude]);
        setMapZoom(16);
        await onMapPick(latitude, longitude);
        setDetecting(false);
      },
      (e) => {
        setDetecting(false);
        setErr(e.message || 'Failed to detect location. Type or pick on the map.');
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30_000 }
    );
  };

  const confirm = async () => {
    // If user typed a location but never picked from suggestions/map, try to resolve it
    if (!pin && query.trim().length >= 2) {
      setSaving(true);
      setErr('');
      try {
        const data = await api.geocodeSearch(query.trim(), ensureSession());
        const results = data.results || [];
        if (results.length > 0) {
          const s = results[0];
          const label = s.shortLabel || s.label;
          await updateLocation({
            label,
            lat: s.lat,
            lng: s.lng,
            pincode: s.pincode || null,
            city: s.city || null,
            state: s.state || null,
          });
          sessionRef.current = null;
          toast(`Delivering to ${label}`);
          onClose();
          return;
        } else {
          setErr('Could not find that location. Try a different search or pick on the map.');
          return;
        }
      } catch (e) {
        setErr(e.message || 'Failed to resolve location');
        return;
      } finally {
        setSaving(false);
      }
    }

    if (!pin) {
      setErr('Pick a location on the map, or search for one.');
      return;
    }
    if (pin.label === 'Locating…') {
      setErr('Still resolving your location, please wait a moment.');
      return;
    }
    setSaving(true);
    setErr('');
    try {
      await updateLocation({
        label: pin.label,
        lat: pin.lat,
        lng: pin.lng,
        pincode: pin.pincode || null,
        city: pin.city || null,
        state: pin.state || null,
      });
      toast(`Delivering to ${pin.label}`);
      onClose();
    } catch (e) {
      setErr(e.message || 'Failed to save location');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-foreground/50 flex items-center justify-center p-3 sm:p-6">
      <div className="card w-full max-w-2xl relative overflow-hidden flex flex-col max-h-[90vh]">
        {!required && (
          <button
            onClick={onClose}
            className="absolute top-3 right-3 z-20 h-10 w-10 rounded-md flex items-center justify-center
              bg-muted text-foreground transition-colors duration-200 hover:bg-border
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
              focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            aria-label="Close"
          >
            <X size={18} strokeWidth={2.5} />
          </button>
        )}

        <div className="px-6 pt-6 pb-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-11 w-11 rounded-md bg-primary text-primary-foreground
              flex items-center justify-center shrink-0">
              <MapPin size={20} strokeWidth={2.5} />
            </div>
            <div>
              <h2 className="font-display text-2xl font-extrabold tracking-tight leading-none">
                Where to?
              </h2>
              <p className="mt-1 text-sm font-medium text-muted-foreground">
                Search any address in India, drop a pin, or use GPS.
              </p>
            </div>
          </div>

          <div className="relative" ref={listRef}>
            <Search
              size={18}
              strokeWidth={2.5}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              ref={inputRef}
              className="input pl-11"
              placeholder="Area, street, or landmark…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {searching && (
              <Loader2
                size={18}
                strokeWidth={2.5}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground animate-spin"
              />
            )}
            {suggestions.length > 0 && (
              <ul className="absolute left-0 right-0 top-full mt-2 bg-card rounded-lg
                z-30 overflow-hidden max-h-72 overflow-y-auto border-2 border-border">
                {suggestions.map((s, i) => (
                  <li
                    key={`${s.lat},${s.lng},${i}`}
                    className="px-4 py-3 cursor-pointer flex items-start gap-2.5
                      transition-colors duration-200 hover:bg-tint-primary"
                    onClick={() => pickSuggestion(s)}
                  >
                    <MapPin size={15} strokeWidth={2.5} className="text-primary shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate">{s.shortLabel}</div>
                      <div className="text-xs font-medium text-muted-foreground truncate">
                        {s.label}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <button
            onClick={detect}
            disabled={detecting || saving}
            className="btn-secondary w-full mt-3 text-sm"
          >
            <Navigation size={15} strokeWidth={2.5} className="text-primary" />
            {detecting ? 'Detecting your location…' : 'Use my current location (GPS)'}
          </button>
        </div>

        <div className="relative h-[320px] sm:h-[380px] bg-muted mx-6 rounded-lg overflow-hidden">
          <MapContainer
            center={mapCenter}
            zoom={mapZoom}
            style={{ height: '100%', width: '100%' }}
            scrollWheelZoom
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <MapController center={mapCenter} zoom={mapZoom} />
            <ClickHandler onPick={onMapPick} />
            {pin && <Marker position={[pin.lat, pin.lng]} />}
          </MapContainer>
          <div className="absolute bottom-3 left-3 right-3 sm:right-auto bg-card rounded-md
            px-3 py-2 text-xs font-medium pointer-events-none flex items-center gap-2 max-w-md z-[1000]">
            <Crosshair size={15} strokeWidth={2.5} className="text-primary shrink-0" />
            {pin ? (
              <span className="truncate">
                <span className="font-semibold text-foreground">{pin.label}</span>
                <span className="text-muted-foreground"> · {pin.lat.toFixed(4)}, {pin.lng.toFixed(4)}</span>
              </span>
            ) : (
              <span className="text-muted-foreground">Click the map to drop a pin</span>
            )}
          </div>
        </div>

        <div className="px-6 py-4 flex items-center gap-3">
          {err && (
            <div className="mr-auto text-sm font-medium text-accent-hover">{err}</div>
          )}
          {!err && (
            <div className="mr-auto text-xs font-medium text-muted-foreground">
              {pin ? 'Pin set. Confirm to save.' : 'No location selected'}
            </div>
          )}
          {!required && (
            <button onClick={onClose} className="btn-ghost text-sm">
              Cancel
            </button>
          )}
          <button
            onClick={confirm}
            disabled={saving || resolving || pin?.label === 'Locating…'}
            className="btn-primary text-sm"
          >
            {saving ? 'Saving…' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}
