#!/usr/bin/env python3
"""
HYDRO-VISION-3D — Flight telemetry parser
==========================================

Drone footage often carries a flight log alongside the video. If it does, we
use real positions. If it does not, we say so and fall back — we never invent
a coordinate.

Supported formats:
  .srt   DJI subtitle telemetry (the most common case by far)
  .csv   generic log with lat/lon/altitude columns, header auto-detected
  .json  array of samples, or an object with a "records"/"data"/"samples" key
  .gpx   GPS Exchange Format track

The parser returns a TelemetryTrack, which answers one question:
"where was the drone at time t?" — by interpolating between the two nearest
samples rather than snapping to the closest one.

Usage as a library:
    from src.telemetry import load_telemetry
    track = load_telemetry("flight.SRT")
    if track:
        s = track.at(12.5)          # sample at 12.5 seconds
        print(s.lat, s.lon, s.altitude_m)

Usage as a CLI:
    python src/telemetry.py flight.SRT              # inspect
    python src/telemetry.py --make-fixture out.srt  # synthetic test file
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import re
import sys
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any, Iterable, Optional


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------

@dataclass
class TelemetrySample:
    """One instant of flight state. Every field except t_s may be missing —
    a log that carries GPS but no altitude is common, and we handle it by
    leaving altitude_m as None rather than defaulting it."""
    t_s: float
    lat: Optional[float] = None
    lon: Optional[float] = None
    altitude_m: Optional[float] = None       # above ground where available
    absolute_altitude_m: Optional[float] = None   # above sea level
    heading_deg: Optional[float] = None
    pitch_deg: Optional[float] = None
    roll_deg: Optional[float] = None
    speed_ms: Optional[float] = None

    @property
    def has_position(self) -> bool:
        return self.lat is not None and self.lon is not None


class TelemetryTrack:
    """An ordered set of samples with time-based lookup."""

    def __init__(self, samples: list[TelemetrySample], source_format: str,
                 source_path: str):
        self.samples = sorted(samples, key=lambda s: s.t_s)
        self.source_format = source_format
        self.source_path = source_path

    def __len__(self) -> int:
        return len(self.samples)

    def __bool__(self) -> bool:
        return len(self.samples) > 0

    @property
    def duration_s(self) -> float:
        if not self.samples:
            return 0.0
        return self.samples[-1].t_s - self.samples[0].t_s

    @property
    def has_position(self) -> bool:
        return any(s.has_position for s in self.samples)

    @property
    def has_altitude(self) -> bool:
        return any(s.altitude_m is not None for s in self.samples)

    def at(self, t_s: float) -> Optional[TelemetrySample]:
        """Sample at time t, linearly interpolated between neighbours.

        A drone moves continuously, so snapping to the nearest sample
        introduces error proportional to the log's sample interval. DJI logs
        at roughly 1 Hz while video runs at 30 fps, so snapping could be up to
        half a second — several metres of horizontal error — off.
        """
        if not self.samples:
            return None

        if t_s <= self.samples[0].t_s:
            return self.samples[0]
        if t_s >= self.samples[-1].t_s:
            return self.samples[-1]

        lo, hi = 0, len(self.samples) - 1
        while lo < hi - 1:
            mid = (lo + hi) // 2
            if self.samples[mid].t_s <= t_s:
                lo = mid
            else:
                hi = mid

        a, b = self.samples[lo], self.samples[hi]
        span = b.t_s - a.t_s
        if span <= 0:
            return a
        f = (t_s - a.t_s) / span

        def lerp(x: Optional[float], y: Optional[float]) -> Optional[float]:
            if x is None or y is None:
                return x if x is not None else y
            return x + (y - x) * f

        # Heading wraps at 360, so interpolate the short way round.
        def lerp_angle(x: Optional[float], y: Optional[float]) -> Optional[float]:
            if x is None or y is None:
                return x if x is not None else y
            d = ((y - x + 180.0) % 360.0) - 180.0
            return (x + d * f) % 360.0

        return TelemetrySample(
            t_s=t_s,
            lat=lerp(a.lat, b.lat),
            lon=lerp(a.lon, b.lon),
            altitude_m=lerp(a.altitude_m, b.altitude_m),
            absolute_altitude_m=lerp(a.absolute_altitude_m, b.absolute_altitude_m),
            heading_deg=lerp_angle(a.heading_deg, b.heading_deg),
            pitch_deg=lerp(a.pitch_deg, b.pitch_deg),
            roll_deg=lerp(a.roll_deg, b.roll_deg),
            speed_ms=lerp(a.speed_ms, b.speed_ms),
        )

    def median_altitude(self) -> Optional[float]:
        """A single representative altitude, for when the operator needs one
        number to configure the ground-sample-distance calculation."""
        alts = sorted(s.altitude_m for s in self.samples if s.altitude_m is not None)
        if not alts:
            return None
        n = len(alts)
        return alts[n // 2] if n % 2 else (alts[n // 2 - 1] + alts[n // 2]) / 2

    def summary(self) -> dict[str, Any]:
        lats = [s.lat for s in self.samples if s.lat is not None]
        lons = [s.lon for s in self.samples if s.lon is not None]
        alts = [s.altitude_m for s in self.samples if s.altitude_m is not None]
        return {
            "source_format": self.source_format,
            "source_path": self.source_path,
            "sample_count": len(self.samples),
            "duration_s": round(self.duration_s, 2),
            "sample_rate_hz": (round(len(self.samples) / self.duration_s, 2)
                               if self.duration_s > 0 else None),
            "has_position": self.has_position,
            "has_altitude": self.has_altitude,
            "lat_range": [round(min(lats), 7), round(max(lats), 7)] if lats else None,
            "lon_range": [round(min(lons), 7), round(max(lons), 7)] if lons else None,
            "altitude_range_m": [round(min(alts), 2), round(max(alts), 2)] if alts else None,
            "median_altitude_m": (round(self.median_altitude(), 2)
                                  if self.median_altitude() is not None else None),
            "path_length_m": round(self.path_length_m(), 1),
        }

    def path_length_m(self) -> float:
        """Total ground distance flown, by haversine between consecutive fixes."""
        total = 0.0
        prev = None
        for s in self.samples:
            if not s.has_position:
                continue
            if prev is not None:
                total += haversine_m(prev[0], prev[1], s.lat, s.lon)
            prev = (s.lat, s.lon)
        return total


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in metres between two WGS84 points."""
    R = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


# ---------------------------------------------------------------------------
# SRT — DJI subtitle telemetry
# ---------------------------------------------------------------------------

_SRT_TIME = re.compile(
    r"(\d{2}):(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*"
    r"(\d{2}):(\d{2}):(\d{2})[,.](\d{1,3})")

# DJI has used several layouts across firmware generations. Rather than
# guessing which one produced the file, we try every known key spelling.
_SRT_PATTERNS = {
    "lat": [r"\[?latitude\s*[:=]\s*([-\d.]+)", r"\[?lat\s*[:=]\s*([-\d.]+)",
            r"GPS\s*\(\s*([-\d.]+)"],
    "lon": [r"\[?long?itude\s*[:=]\s*([-\d.]+)", r"\[?lon\s*[:=]\s*([-\d.]+)",
            r"GPS\s*\(\s*[-\d.]+\s*,\s*([-\d.]+)"],
    "rel_alt": [r"\[?rel_alt\s*[:=]\s*([-\d.]+)",
                r"\[?relative_altitude\s*[:=]\s*([-\d.]+)",
                r"\[?height\s*[:=]\s*([-\d.]+)"],
    "abs_alt": [r"\[?abs_alt\s*[:=]\s*([-\d.]+)",
                r"\[?altitude\s*[:=]\s*([-\d.]+)"],
    "heading": [r"\[?yaw\s*[:=]\s*([-\d.]+)", r"\[?heading\s*[:=]\s*([-\d.]+)"],
    "pitch": [r"\[?gb_pitch\s*[:=]\s*([-\d.]+)", r"\[?pitch\s*[:=]\s*([-\d.]+)"],
    "roll": [r"\[?gb_roll\s*[:=]\s*([-\d.]+)", r"\[?roll\s*[:=]\s*([-\d.]+)"],
}


def _first_match(text: str, patterns: list[str]) -> Optional[float]:
    for p in patterns:
        m = re.search(p, text, re.IGNORECASE)
        if m:
            try:
                return float(m.group(1))
            except ValueError:
                continue
    return None


def parse_srt(path: Path) -> TelemetryTrack:
    text = path.read_text(encoding="utf-8", errors="ignore")
    blocks = re.split(r"\n\s*\n", text.strip())

    samples: list[TelemetrySample] = []
    for block in blocks:
        tm = _SRT_TIME.search(block)
        if not tm:
            continue
        h, m, s, ms = int(tm.group(1)), int(tm.group(2)), int(tm.group(3)), int(tm.group(4))
        if len(tm.group(4)) == 1:
            ms *= 100
        elif len(tm.group(4)) == 2:
            ms *= 10
        t_s = h * 3600 + m * 60 + s + ms / 1000.0

        lat = _first_match(block, _SRT_PATTERNS["lat"])
        lon = _first_match(block, _SRT_PATTERNS["lon"])
        rel = _first_match(block, _SRT_PATTERNS["rel_alt"])
        abs_ = _first_match(block, _SRT_PATTERNS["abs_alt"])

        # 0,0 is the null island — a GPS fix that has not locked yet.
        if lat == 0.0 and lon == 0.0:
            lat = lon = None

        samples.append(TelemetrySample(
            t_s=t_s, lat=lat, lon=lon,
            altitude_m=rel,
            absolute_altitude_m=abs_,
            heading_deg=_first_match(block, _SRT_PATTERNS["heading"]),
            pitch_deg=_first_match(block, _SRT_PATTERNS["pitch"]),
            roll_deg=_first_match(block, _SRT_PATTERNS["roll"]),
        ))

    return TelemetryTrack(samples, "srt", str(path))


# ---------------------------------------------------------------------------
# CSV
# ---------------------------------------------------------------------------

_CSV_ALIASES = {
    "t_s": ["time", "time_s", "timestamp", "t", "seconds", "elapsed", "offset"],
    "lat": ["latitude", "lat", "gps_lat", "gps_latitude", "gpslatitude",
            "gps(lat)", "drone_lat"],
    "lon": ["longitude", "lon", "lng", "gps_lon", "gps_longitude",
            "gpslongitude", "gps(lon)", "drone_lon"],
    "altitude_m": ["altitude", "alt", "rel_alt", "relative_altitude", "height",
                   "agl", "altitude_m"],
    "absolute_altitude_m": ["abs_alt", "absolute_altitude", "msl", "asl"],
    "heading_deg": ["heading", "yaw", "compass"],
    "pitch_deg": ["pitch", "gimbal_pitch", "gb_pitch"],
    "roll_deg": ["roll", "gimbal_roll", "gb_roll"],
    "speed_ms": ["speed", "velocity", "ground_speed"],
}


def _resolve_columns(header: Iterable[str]) -> dict[str, str]:
    """Map our field names onto whatever the file calls them."""
    norm = {h.strip().lower().replace(" ", "_"): h for h in header}
    out: dict[str, str] = {}
    for field, aliases in _CSV_ALIASES.items():
        for a in aliases:
            if a in norm:
                out[field] = norm[a]
                break
    return out


def parse_csv(path: Path) -> TelemetryTrack:
    samples: list[TelemetrySample] = []
    with path.open(newline="", encoding="utf-8", errors="ignore") as f:
        reader = csv.DictReader(f)
        if not reader.fieldnames:
            return TelemetryTrack([], "csv", str(path))
        cols = _resolve_columns(reader.fieldnames)

        def val(row: dict, field: str) -> Optional[float]:
            col = cols.get(field)
            if not col:
                return None
            raw = (row.get(col) or "").strip()
            if not raw:
                return None
            try:
                return float(raw)
            except ValueError:
                return None

        for i, row in enumerate(reader):
            t = val(row, "t_s")
            if t is None:
                t = float(i)   # no time column: assume 1 Hz, and say so later
            lat, lon = val(row, "lat"), val(row, "lon")
            if lat == 0.0 and lon == 0.0:
                lat = lon = None
            samples.append(TelemetrySample(
                t_s=t, lat=lat, lon=lon,
                altitude_m=val(row, "altitude_m"),
                absolute_altitude_m=val(row, "absolute_altitude_m"),
                heading_deg=val(row, "heading_deg"),
                pitch_deg=val(row, "pitch_deg"),
                roll_deg=val(row, "roll_deg"),
                speed_ms=val(row, "speed_ms"),
            ))

    return TelemetryTrack(samples, "csv", str(path))


# ---------------------------------------------------------------------------
# JSON
# ---------------------------------------------------------------------------

def parse_json(path: Path) -> TelemetryTrack:
    data = json.loads(path.read_text(encoding="utf-8", errors="ignore"))

    if isinstance(data, dict):
        for key in ("records", "data", "samples", "telemetry", "points"):
            if isinstance(data.get(key), list):
                data = data[key]
                break
        else:
            data = [data]

    if not isinstance(data, list):
        return TelemetryTrack([], "json", str(path))

    def pick(d: dict, field: str) -> Optional[float]:
        for a in [field] + _CSV_ALIASES.get(field, []):
            if a in d and d[a] is not None:
                try:
                    return float(d[a])
                except (TypeError, ValueError):
                    continue
        return None

    samples: list[TelemetrySample] = []
    for i, item in enumerate(data):
        if not isinstance(item, dict):
            continue
        t = pick(item, "t_s")
        if t is None:
            t = float(i)
        lat, lon = pick(item, "lat"), pick(item, "lon")
        if lat == 0.0 and lon == 0.0:
            lat = lon = None
        samples.append(TelemetrySample(
            t_s=t, lat=lat, lon=lon,
            altitude_m=pick(item, "altitude_m"),
            absolute_altitude_m=pick(item, "absolute_altitude_m"),
            heading_deg=pick(item, "heading_deg"),
            pitch_deg=pick(item, "pitch_deg"),
            roll_deg=pick(item, "roll_deg"),
            speed_ms=pick(item, "speed_ms"),
        ))

    return TelemetryTrack(samples, "json", str(path))


# ---------------------------------------------------------------------------
# GPX
# ---------------------------------------------------------------------------

def parse_gpx(path: Path) -> TelemetryTrack:
    import xml.etree.ElementTree as ET
    from datetime import datetime

    text = path.read_text(encoding="utf-8", errors="ignore")
    # Strip the namespace so we can use plain tag names.
    text = re.sub(r'\sxmlns="[^"]+"', "", text, count=1)
    root = ET.fromstring(text)

    samples: list[TelemetrySample] = []
    t0 = None
    for i, pt in enumerate(root.iter("trkpt")):
        try:
            lat = float(pt.get("lat")); lon = float(pt.get("lon"))
        except (TypeError, ValueError):
            continue

        ele_el = pt.find("ele")
        ele = None
        if ele_el is not None and ele_el.text:
            try:
                ele = float(ele_el.text)
            except ValueError:
                pass

        t_s = float(i)
        time_el = pt.find("time")
        if time_el is not None and time_el.text:
            try:
                ts = datetime.fromisoformat(time_el.text.replace("Z", "+00:00"))
                if t0 is None:
                    t0 = ts
                t_s = (ts - t0).total_seconds()
            except ValueError:
                pass

        samples.append(TelemetrySample(t_s=t_s, lat=lat, lon=lon,
                                       absolute_altitude_m=ele))

    return TelemetryTrack(samples, "gpx", str(path))


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

_PARSERS = {".srt": parse_srt, ".csv": parse_csv, ".json": parse_json,
            ".gpx": parse_gpx, ".txt": parse_csv}


def load_telemetry(path: str | Path) -> Optional[TelemetryTrack]:
    """Parse a telemetry file. Returns None on any failure — the caller then
    falls back to manual anchoring or no geolocation, and must badge it."""
    p = Path(path)
    if not p.exists():
        print(f"[TELEMETRY] Not found: {p}")
        return None

    parser = _PARSERS.get(p.suffix.lower())
    if not parser:
        print(f"[TELEMETRY] Unsupported format '{p.suffix}'. "
              f"Supported: {', '.join(sorted(_PARSERS))}")
        return None

    try:
        track = parser(p)
    except Exception as e:
        print(f"[TELEMETRY] Failed to parse {p.name}: {type(e).__name__}: {e}")
        return None

    if not track:
        print(f"[TELEMETRY] {p.name} parsed but contained no samples.")
        return None

    print(f"[TELEMETRY] {p.name}: {len(track)} samples over "
          f"{track.duration_s:.1f}s ({track.source_format})")
    if not track.has_position:
        print(f"[TELEMETRY] WARNING: no GPS fixes in this log. "
              f"Geolocation will fall back to manual anchor or none.")
    if not track.has_altitude:
        print(f"[TELEMETRY] WARNING: no altitude in this log. "
              f"Metric area cannot be computed from it.")
    return track


def find_sidecar(video_path: str | Path) -> Optional[Path]:
    """Look for a telemetry file next to the video with the same stem.
    DJI writes VIDEO.MP4 and VIDEO.SRT into the same folder."""
    v = Path(video_path)
    for ext in (".SRT", ".srt", ".csv", ".CSV", ".json", ".gpx"):
        cand = v.with_suffix(ext)
        if cand.exists():
            return cand
    return None


# ---------------------------------------------------------------------------
# Synthetic fixture — for testing the path end to end without real telemetry
# ---------------------------------------------------------------------------

def make_fixture(out: Path, duration_s: float = 60.0, rate_hz: float = 1.0,
                 start_lat: float = 12.8452, start_lon: float = 77.6602,
                 altitude_m: float = 5.5, speed_ms: float = 3.0,
                 heading_deg: float = 90.0) -> Path:
    """Write a DJI-style SRT with a straight-line flight.

    Default coordinates are Electronics City, Bengaluru. This exists so the
    telemetry code path can be tested before real footage arrives — anything
    produced from it MUST be badged geo_source: synthetic in the UI.
    """
    n = int(duration_s * rate_hz)
    dt = 1.0 / rate_hz
    lat, lon = start_lat, start_lon

    # metres -> degrees, accounting for latitude convergence of meridians
    m_per_deg_lat = 111_320.0
    m_per_deg_lon = 111_320.0 * math.cos(math.radians(start_lat))
    hr = math.radians(heading_deg)

    lines = []
    for i in range(n):
        t0, t1 = i * dt, (i + 1) * dt

        def fmt(t: float) -> str:
            h = int(t // 3600); m = int((t % 3600) // 60)
            s = int(t % 60); ms = int((t - int(t)) * 1000)
            return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"

        lines.append(str(i + 1))
        lines.append(f"{fmt(t0)} --> {fmt(t1)}")
        lines.append(
            f"[latitude: {lat:.7f}] [longitude: {lon:.7f}] "
            f"[rel_alt: {altitude_m:.3f} abs_alt: {altitude_m + 900.0:.3f}] "
            f"[yaw: {heading_deg:.1f}] [gb_pitch: -90.0] [gb_roll: 0.0]"
        )
        lines.append("")

        dn = speed_ms * dt * math.cos(hr)
        de = speed_ms * dt * math.sin(hr)
        lat += dn / m_per_deg_lat
        lon += de / m_per_deg_lon

    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text("\n".join(lines), encoding="utf-8")
    print(f"[FIXTURE] {n} samples over {duration_s}s -> {out}")
    print(f"[FIXTURE] SYNTHETIC DATA — badge as geo_source: synthetic in the UI.")
    return out


# ---------------------------------------------------------------------------

def main() -> int:
    ap = argparse.ArgumentParser(description="Inspect drone flight telemetry.")
    ap.add_argument("path", nargs="?", help="Telemetry file, or a video to find a sidecar for")
    ap.add_argument("--make-fixture", metavar="OUT",
                    help="Write a synthetic SRT for testing")
    ap.add_argument("--duration", type=float, default=60.0)
    ap.add_argument("--altitude", type=float, default=5.5)
    ap.add_argument("--at", type=float, default=None,
                    help="Print the interpolated sample at this timestamp")
    ap.add_argument("--json", action="store_true", help="Emit the summary as JSON")
    args = ap.parse_args()

    if args.make_fixture:
        make_fixture(Path(args.make_fixture), duration_s=args.duration,
                     altitude_m=args.altitude)
        return 0

    if not args.path:
        ap.print_help()
        return 1

    p = Path(args.path)
    if p.suffix.lower() in (".mp4", ".mov", ".avi", ".mkv"):
        side = find_sidecar(p)
        if not side:
            print(f"[TELEMETRY] No sidecar found for {p.name}.")
            print(f"[TELEMETRY] Looked for {p.stem}.SRT/.csv/.json/.gpx alongside it.")
            return 1
        print(f"[TELEMETRY] Found sidecar: {side.name}")
        p = side

    track = load_telemetry(p)
    if not track:
        return 1

    s = track.summary()
    if args.json:
        print(json.dumps(s, indent=2))
    else:
        print("\nTELEMETRY SUMMARY")
        print("-" * 50)
        for k, v in s.items():
            print(f"  {k:<22}{v}")

        alt = track.median_altitude()
        if alt is not None:
            print(f"\n  To use this altitude in the pipeline:")
            print(f'    POST /api/config  {{"camera": {{"altitude_m": {alt:.2f}, '
                  f'"altitude_known": true}}}}')

    if args.at is not None:
        smp = track.at(args.at)
        print(f"\nSAMPLE AT t={args.at}s")
        print("-" * 50)
        for k, v in asdict(smp).items():
            print(f"  {k:<22}{v}")

    return 0


if __name__ == "__main__":
    sys.exit(main())