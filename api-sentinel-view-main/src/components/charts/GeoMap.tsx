import React from 'react';
import { ComposableMap, Geographies, Geography, Marker } from 'react-simple-maps';

// Features from Natural Earth
const GEO_URL = 'https://unpkg.com/world-atlas@2.0.2/countries-110m.json';

interface ThreatMarker {
    lat: number;
    lng: number;
    severity: 'critical' | 'high' | 'medium' | 'low';
}

interface GeoMapProps {
    threats?: ThreatMarker[];
    height?: number;
}

const severityColors = {
    critical: '#EF4444',
    high: '#F97316',
    medium: '#EAB308',
    low: '#22C55E'
};

const GeoMap: React.FC<GeoMapProps> = ({ threats = [], height = 160 }) => {
    return (
        <div className="w-full bg-bg-base rounded border border-border-subtle overflow-hidden flex items-center justify-center relative p-2" style={{ height }}>
            <span className="absolute top-2 left-3 text-xs text-muted-foreground font-medium z-10">Geolocation</span>

            <div className="w-full h-full scale-[1.2] translate-y-[10%]">
                <ComposableMap
                    projection="geoMercator"
                    style={{ width: '100%', height: '100%' }}
                >
                    <Geographies geography={GEO_URL}>
                        {({ geographies }) =>
                            geographies.map(geo => (
                                <Geography
                                    key={geo.rsmKey}
                                    geography={geo}
                                    fill="#1E293B"
                                    stroke="#0F172A"
                                    strokeWidth={0.5}
                                    style={{
                                        default: { outline: "none" },
                                        hover: { outline: "none", fill: "#334155" },
                                        pressed: { outline: "none" }
                                    }}
                                />
                            ))
                        }
                    </Geographies>
                    {threats.map((t, i) => (
                        <Marker key={i} coordinates={[t.lng, t.lat]}>
                            <circle r={4} fill={severityColors[t.severity]} opacity={0.8} />
                            <circle r={8} fill={severityColors[t.severity]} opacity={0.2} className="animate-pulse" />
                        </Marker>
                    ))}
                </ComposableMap>
            </div>
        </div>
    );
};

export default GeoMap;
