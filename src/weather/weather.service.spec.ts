import {
  assessWeather,
  clubLocal,
  WeatherConditions,
  WeatherService,
} from './weather.service';

const calm: WeatherConditions = {
  code: 1,
  description: 'Mayormente despejado',
  tempMin: 12,
  tempMax: 22,
  precipitationProbability: 5,
  windMax: 10,
  gustsMax: 18,
};

describe('assessWeather', () => {
  it('día tranquilo: buen tiempo', () => {
    expect(assessWeather(calm)).toEqual({ status: 'good', reasons: [] });
  });

  it('rachas fuertes vuelven desfavorable el tiro', () => {
    const r = assessWeather({ ...calm, gustsMax: 55 });
    expect(r.status).toBe('bad');
    expect(r.reasons[0]).toContain('55 km/h');
  });

  it('lluvia probable o calor: precaución', () => {
    expect(
      assessWeather({ ...calm, precipitationProbability: 45 }).status,
    ).toBe('caution');
    expect(assessWeather({ ...calm, tempMax: 33 }).reasons).toEqual([
      'Calor: hasta 33 °C',
    ]);
  });

  it('tormenta: desfavorable aunque el resto acompañe', () => {
    expect(
      assessWeather({ ...calm, code: 95, description: 'Tormenta eléctrica' })
        .status,
    ).toBe('bad');
  });
});

describe('clubLocal', () => {
  it('usa la hora de Chile, no la UTC', () => {
    // 02:30 UTC del 11 de octubre son las 23:30 del 10 en Santiago (UTC-3)
    expect(clubLocal(new Date('2026-10-11T02:30:00Z'))).toEqual({
      date: '2026-10-10',
      dateTime: '2026-10-10T23:30',
    });
  });
});

describe('WeatherService.forActivity', () => {
  const service = new WeatherService();
  const inDays = (d: number, hour = 15) => {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + d);
    date.setUTCHours(hour, 0, 0, 0);
    return date;
  };

  afterEach(() => jest.restoreAllMocks());

  it('sin coordenadas no consulta el servicio', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    const r = await service.forActivity({
      latitude: null,
      longitude: null,
      startsAt: inDays(2),
      endsAt: inDays(2, 18),
    });
    expect(r).toMatchObject({ available: false, reason: 'no_location' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('más allá de 16 días avisa cuándo estará disponible', async () => {
    const r = await service.forActivity({
      latitude: -33.4,
      longitude: -70.6,
      startsAt: inDays(30),
      endsAt: inDays(30, 18),
    });
    expect(r).toMatchObject({ available: false, reason: 'out_of_range' });
  });

  it('evalúa solo las horas de la actividad', async () => {
    const startsAt = inDays(3, 13); // 10:00 en Santiago
    const endsAt = inDays(3, 16); // 13:00
    const day = clubLocal(startsAt).date;
    const hours = Array.from(
      { length: 24 },
      (_, h) => `${day}T${String(h).padStart(2, '0')}:00`,
    );
    // Tormenta a las 20:00, fuera de la actividad
    const code = hours.map((_, h) => (h === 20 ? 95 : 2));
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        daily: {
          weather_code: [95],
          temperature_2m_max: [24],
          temperature_2m_min: [9],
          precipitation_probability_max: [80],
          wind_speed_10m_max: [15],
          wind_gusts_10m_max: [30],
        },
        hourly: {
          time: hours,
          weather_code: code,
          temperature_2m: hours.map(() => 18),
          precipitation_probability: hours.map((_, h) => (h === 20 ? 80 : 10)),
          wind_speed_10m: hours.map(() => 8),
          wind_gusts_10m: hours.map(() => 15),
        },
      }),
    } as Response);

    const r = await service.forActivity({
      latitude: -33.45,
      longitude: -70.66,
      startsAt,
      endsAt,
    });
    expect(r.available).toBe(true);
    if (!r.available) return;
    expect(r.day.code).toBe(95);
    expect(r.during).toMatchObject({ code: 2, precipitationProbability: 10 });
    expect(r.status).toBe('good');
  });
});
