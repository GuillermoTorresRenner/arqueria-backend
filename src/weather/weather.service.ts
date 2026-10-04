import { Injectable, Logger } from '@nestjs/common';
import { CLUB_TIMEZONE } from '../config/club';

/// Open-Meteo: servicio meteorológico abierto (modelos de los servicios
/// nacionales, incluido el GFS/ECMWF), sin clave de API ni costo para uso no
/// comercial. Pronostica hasta 16 días.
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
export const FORECAST_DAYS = 16;

const CACHE_TTL = 30 * 60 * 1000;
const ERROR_TTL = 2 * 60 * 1000;
const REQUEST_TIMEOUT = 6000;

export type WeatherStatus = 'good' | 'caution' | 'bad';

export interface WeatherConditions {
  code: number;
  description: string;
  tempMin: number;
  tempMax: number;
  /// Probabilidad máxima de lluvia, en %
  precipitationProbability: number;
  /// km/h
  windMax: number;
  gustsMax: number;
}

export type ActivityWeather =
  | {
      available: true;
      /// Día del pronóstico (zona horaria del club)
      date: string;
      day: WeatherConditions;
      /// Solo las horas de la actividad; null si el modelo no las trae
      during: WeatherConditions | null;
      status: WeatherStatus;
      statusLabel: string;
      /// Motivos del estado, para mostrarlos tal cual
      reasons: string[];
      source: 'Open-Meteo';
    }
  | {
      available: false;
      reason: 'no_location' | 'out_of_range' | 'past' | 'error';
      message: string;
    };

/// Códigos WMO que usa Open-Meteo, en castellano
const WMO: Record<number, string> = {
  0: 'Despejado',
  1: 'Mayormente despejado',
  2: 'Parcialmente nublado',
  3: 'Nublado',
  45: 'Niebla',
  48: 'Niebla con escarcha',
  51: 'Llovizna débil',
  53: 'Llovizna',
  55: 'Llovizna intensa',
  56: 'Llovizna helada',
  57: 'Llovizna helada intensa',
  61: 'Lluvia débil',
  63: 'Lluvia',
  65: 'Lluvia intensa',
  66: 'Lluvia helada',
  67: 'Lluvia helada intensa',
  71: 'Nevada débil',
  73: 'Nevada',
  75: 'Nevada intensa',
  77: 'Granizo fino',
  80: 'Chubascos débiles',
  81: 'Chubascos',
  82: 'Chubascos violentos',
  85: 'Chubascos de nieve',
  86: 'Chubascos de nieve intensos',
  95: 'Tormenta eléctrica',
  96: 'Tormenta con granizo',
  99: 'Tormenta con granizo intenso',
};

const BAD_CODES = new Set([65, 67, 75, 82, 86, 95, 96, 99]);
const CAUTION_CODES = new Set([
  45, 48, 51, 53, 55, 56, 57, 61, 63, 66, 71, 73, 77, 80, 81, 85,
]);

const STATUS_LABEL: Record<WeatherStatus, string> = {
  good: 'Buen tiempo para tirar',
  caution: 'Precaución',
  bad: 'Condiciones desfavorables',
};

/// Fecha y hora locales del club como texto ISO sin zona («2026-10-05T10:00»),
/// el mismo formato en que Open-Meteo devuelve las horas con `timezone`.
export function clubLocal(date: Date): { date: string; dateTime: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: CLUB_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  const day = `${parts.year}-${parts.month}-${parts.day}`;
  return { date: day, dateTime: `${day}T${parts.hour}:${parts.minute}` };
}

/**
 * Evalúa el tiempo para tirar al aire libre. El viento pesa más que en otros
 * deportes: con rachas fuertes la flecha deriva y el tiro deja de ser seguro.
 */
export function assessWeather(c: WeatherConditions): {
  status: WeatherStatus;
  reasons: string[];
} {
  const bad: string[] = [];
  const caution: string[] = [];

  if (BAD_CODES.has(c.code)) bad.push(c.description);
  else if (CAUTION_CODES.has(c.code)) caution.push(c.description);

  if (c.precipitationProbability >= 70)
    bad.push(`Probabilidad de lluvia del ${c.precipitationProbability} %`);
  else if (c.precipitationProbability >= 40)
    caution.push(`Probabilidad de lluvia del ${c.precipitationProbability} %`);

  if (c.gustsMax >= 50 || c.windMax >= 35)
    bad.push(`Viento fuerte: rachas de hasta ${c.gustsMax} km/h`);
  else if (c.gustsMax >= 35 || c.windMax >= 20)
    caution.push(`Viento: rachas de hasta ${c.gustsMax} km/h`);

  if (c.tempMax >= 32) caution.push(`Calor: hasta ${c.tempMax} °C`);
  if (c.tempMin <= 4) caution.push(`Frío: mínima de ${c.tempMin} °C`);

  if (bad.length) return { status: 'bad', reasons: [...bad, ...caution] };
  if (caution.length) return { status: 'caution', reasons: caution };
  return { status: 'good', reasons: [] };
}

const round = (n: number) => Math.round(n);

@Injectable()
export class WeatherService {
  private readonly logger = new Logger(WeatherService.name);
  private readonly cache = new Map<
    string,
    { expires: number; value: Promise<ForecastDay | null> }
  >();

  /**
   * Pronóstico para una actividad en un lugar. Nunca lanza: si no hay
   * coordenadas, la fecha queda fuera del alcance del modelo o el servicio
   * falla, devuelve `available: false` con un mensaje para mostrar.
   */
  async forActivity(params: {
    latitude?: number | null;
    longitude?: number | null;
    startsAt: Date;
    endsAt: Date;
  }): Promise<ActivityWeather> {
    const { latitude, longitude, startsAt, endsAt } = params;
    if (latitude == null || longitude == null) {
      return {
        available: false,
        reason: 'no_location',
        message:
          'El lugar no tiene coordenadas: agrégalas para ver el pronóstico.',
      };
    }
    if (endsAt.getTime() < Date.now()) {
      return {
        available: false,
        reason: 'past',
        message: 'La actividad ya terminó.',
      };
    }

    const start = clubLocal(startsAt);
    const today = clubLocal(new Date()).date;
    const daysAhead = Math.round(
      (Date.parse(start.date) - Date.parse(today)) / 86_400_000,
    );
    if (daysAhead >= FORECAST_DAYS) {
      return {
        available: false,
        reason: 'out_of_range',
        message: `El pronóstico estará disponible ${FORECAST_DAYS} días antes de la actividad.`,
      };
    }

    const forecast = await this.fetchDay(latitude, longitude, start.date);
    if (!forecast) {
      return {
        available: false,
        reason: 'error',
        message: 'No pudimos obtener el pronóstico. Inténtalo más tarde.',
      };
    }

    // Horas que cubre la actividad dentro de ese día (si cruza la medianoche,
    // se evalúa hasta el final del día)
    const end = clubLocal(endsAt);
    const fromHour = `${start.dateTime.slice(0, 13)}:00`;
    const hours = forecast.hours.filter(
      (h) =>
        h.time >= fromHour && (h.time < end.dateTime || h.time === fromHour),
    );
    const during: WeatherConditions | null = hours.length
      ? this.summarize(hours)
      : null;

    const { status, reasons } = assessWeather(during ?? forecast.day);
    return {
      available: true,
      date: start.date,
      day: forecast.day,
      during,
      status,
      statusLabel: STATUS_LABEL[status],
      reasons,
      source: 'Open-Meteo',
    };
  }

  private summarize(hours: ForecastHour[]): WeatherConditions {
    // El código más severo de esas horas describe el periodo (los códigos
    // WMO crecen con la severidad)
    const code = Math.max(...hours.map((h) => h.code));
    return {
      code,
      description: WMO[code] ?? 'Sin datos',
      tempMin: round(Math.min(...hours.map((h) => h.temperature))),
      tempMax: round(Math.max(...hours.map((h) => h.temperature))),
      precipitationProbability: Math.max(
        ...hours.map((h) => h.precipitationProbability),
      ),
      windMax: round(Math.max(...hours.map((h) => h.wind))),
      gustsMax: round(Math.max(...hours.map((h) => h.gusts))),
    };
  }

  /// Pronóstico de un día, cacheado: el home, el área de socios y el panel
  /// piden lo mismo muchas veces y el pronóstico no cambia minuto a minuto.
  private fetchDay(
    latitude: number,
    longitude: number,
    date: string,
  ): Promise<ForecastDay | null> {
    const key = `${latitude.toFixed(3)},${longitude.toFixed(3)},${date}`;
    const now = Date.now();
    const hit = this.cache.get(key);
    if (hit && hit.expires > now) return hit.value;

    if (this.cache.size > 500) {
      for (const [k, v] of this.cache)
        if (v.expires <= now) this.cache.delete(k);
    }

    const value = this.request(latitude, longitude, date);
    this.cache.set(key, { expires: now + CACHE_TTL, value });
    // Un fallo se reintenta pronto en vez de quedar media hora en caché
    void value.then((day) => {
      if (!day) this.cache.set(key, { expires: Date.now() + ERROR_TTL, value });
    });
    return value;
  }

  private async request(
    latitude: number,
    longitude: number,
    date: string,
  ): Promise<ForecastDay | null> {
    const url = new URL(FORECAST_URL);
    url.searchParams.set('latitude', String(latitude));
    url.searchParams.set('longitude', String(longitude));
    url.searchParams.set('timezone', CLUB_TIMEZONE);
    url.searchParams.set('start_date', date);
    url.searchParams.set('end_date', date);
    url.searchParams.set('wind_speed_unit', 'kmh');
    url.searchParams.set(
      'daily',
      'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max',
    );
    url.searchParams.set(
      'hourly',
      'temperature_2m,precipitation_probability,weather_code,wind_speed_10m,wind_gusts_10m',
    );

    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as OpenMeteoForecast;
      const d = body.daily;
      const code = d.weather_code[0] ?? 0;
      const h = body.hourly;
      return {
        day: {
          code,
          description: WMO[code] ?? 'Sin datos',
          tempMin: round(d.temperature_2m_min[0] ?? 0),
          tempMax: round(d.temperature_2m_max[0] ?? 0),
          precipitationProbability: d.precipitation_probability_max[0] ?? 0,
          windMax: round(d.wind_speed_10m_max[0] ?? 0),
          gustsMax: round(d.wind_gusts_10m_max[0] ?? 0),
        },
        hours: h.time.map((time, i) => ({
          time,
          code: h.weather_code[i] ?? 0,
          temperature: h.temperature_2m[i] ?? 0,
          precipitationProbability: h.precipitation_probability[i] ?? 0,
          wind: h.wind_speed_10m[i] ?? 0,
          gusts: h.wind_gusts_10m[i] ?? 0,
        })),
      };
    } catch (error) {
      this.logger.warn(
        `No se pudo obtener el pronóstico (${latitude}, ${longitude}, ${date}): ${error.message}`,
      );
      return null;
    }
  }
}

interface ForecastHour {
  time: string;
  code: number;
  temperature: number;
  precipitationProbability: number;
  wind: number;
  gusts: number;
}

interface ForecastDay {
  day: WeatherConditions;
  hours: ForecastHour[];
}

interface OpenMeteoForecast {
  daily: {
    weather_code: (number | null)[];
    temperature_2m_max: (number | null)[];
    temperature_2m_min: (number | null)[];
    precipitation_probability_max: (number | null)[];
    wind_speed_10m_max: (number | null)[];
    wind_gusts_10m_max: (number | null)[];
  };
  hourly: {
    time: string[];
    weather_code: (number | null)[];
    temperature_2m: (number | null)[];
    precipitation_probability: (number | null)[];
    wind_speed_10m: (number | null)[];
    wind_gusts_10m: (number | null)[];
  };
}
