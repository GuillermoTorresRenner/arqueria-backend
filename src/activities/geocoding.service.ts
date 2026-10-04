import { Injectable, Logger } from '@nestjs/common';
import { CLUB_COUNTRY } from '../config/club';

/// Nominatim, el buscador de OpenStreetMap: encuentra direcciones, parques y
/// recintos (no solo comunas) y traduce un punto del mapa a su dirección.
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org';
/// Su política de uso exige identificarse y no pasar de 1 petición/segundo
const USER_AGENT = `ABMA-Galadhrym/1.0 (${process.env.MAIL_FROM || 'arqueria.galadhrym@gmail.com'})`;
const MIN_INTERVAL = 1100;
const CACHE_TTL = 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT = 8000;

export interface GeocodingResult {
  /// Nombre corto («Parque Mahuida») o, si no tiene, la calle
  name: string;
  /// Dirección legible y breve: calle y número, comuna
  address: string;
  latitude: number;
  longitude: number;
}

interface NominatimPlace {
  lat: string;
  lon: string;
  name?: string;
  display_name: string;
  address?: Record<string, string>;
}

@Injectable()
export class GeocodingService {
  private readonly logger = new Logger(GeocodingService.name);
  private readonly cache = new Map<
    string,
    { expires: number; value: unknown }
  >();
  /// Cola: cada petición espera a la anterior más el intervalo mínimo
  private queue: Promise<unknown> = Promise.resolve();
  private last = 0;

  async search(query: string): Promise<GeocodingResult[]> {
    const places = await this.request<NominatimPlace[]>('/search', {
      q: query,
      countrycodes: CLUB_COUNTRY.toLowerCase(),
      limit: '8',
      addressdetails: '1',
    });
    return places.map((p) => this.toResult(p));
  }

  /// Dirección del punto marcado en el mapa; null si no hay nada cerca
  async reverse(
    latitude: number,
    longitude: number,
  ): Promise<GeocodingResult | null> {
    const place = await this.request<NominatimPlace & { error?: string }>(
      '/reverse',
      {
        lat: latitude.toFixed(6),
        lon: longitude.toFixed(6),
        zoom: '18',
        addressdetails: '1',
      },
    );
    if (!place || place.error) return null;
    // Se conserva el punto exacto que eligió el admin, no el del edificio
    return { ...this.toResult(place), latitude, longitude };
  }

  private toResult(p: NominatimPlace): GeocodingResult {
    const a = p.address ?? {};
    const road = a.road ?? a.pedestrian ?? a.footway;
    // Sin calle, un número suelto («11095») no orienta a nadie
    const street = road ? [road, a.house_number].filter(Boolean).join(' ') : '';
    // En el Gran Santiago OSM pone «Santiago» como ciudad y la comuna en
    // `suburb`; en el resto del país la comuna es la ciudad o el pueblo.
    const commune =
      a.city === 'Santiago' && a.suburb
        ? a.suburb
        : (a.city ?? a.town ?? a.village ?? a.municipality ?? a.suburb);
    const address =
      [street, commune].filter(Boolean).join(', ') ||
      p.display_name.split(',').slice(0, 3).join(',').trim();
    return {
      name: p.name || street || p.display_name.split(',')[0],
      address,
      latitude: Number(p.lat),
      longitude: Number(p.lon),
    };
  }

  private async request<T>(
    path: string,
    params: Record<string, string>,
  ): Promise<T> {
    const url = new URL(NOMINATIM_URL + path);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('accept-language', 'es');
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

    const key = url.toString();
    const hit = this.cache.get(key);
    if (hit && hit.expires > Date.now()) return hit.value as T;

    const run = this.queue.then(async () => {
      const wait = this.last + MIN_INTERVAL - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      this.last = Date.now();
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT),
      });
      if (!res.ok) throw new Error(`Nominatim ${res.status}`);
      return (await res.json()) as T;
    });
    // Un fallo no debe bloquear la cola para las siguientes
    this.queue = run.catch(() => undefined);

    try {
      const value = await run;
      if (this.cache.size > 1000) this.cache.clear();
      this.cache.set(key, { expires: Date.now() + CACHE_TTL, value });
      return value;
    } catch (error) {
      this.logger.warn(`Geocodificación fallida (${path}): ${error.message}`);
      throw error;
    }
  }
}
