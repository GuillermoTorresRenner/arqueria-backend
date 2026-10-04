import { GeocodingService } from './geocoding.service';

describe('GeocodingService', () => {
  afterEach(() => jest.restoreAllMocks());

  const mockFetch = (body: unknown) =>
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue({ ok: true, json: async () => body } as Response);

  it('en el Gran Santiago usa la comuna (suburb), no «Santiago»', async () => {
    const fetchSpy = mockFetch([
      {
        lat: '-33.457',
        lon: '-70.518',
        name: 'Parque Mahuida',
        display_name: 'Parque Mahuida, La Reina, Santiago, Chile',
        address: {
          park: 'Parque Mahuida',
          house_number: '11095',
          suburb: 'La Reina',
          city: 'Santiago',
        },
      },
    ]);
    const [r] = await new GeocodingService().search('Parque Mahuida');
    // Sin calle, el número suelto no aparece
    expect(r).toEqual({
      name: 'Parque Mahuida',
      address: 'La Reina',
      latitude: -33.457,
      longitude: -70.518,
    });
    const url = new URL(String(fetchSpy.mock.calls[0][0]));
    expect(url.searchParams.get('countrycodes')).toBe('cl');
    expect(
      (fetchSpy.mock.calls[0][1]?.headers as Record<string, string>)[
        'User-Agent'
      ],
    ).toContain('ABMA');
  });

  it('fuera de Santiago la comuna es la ciudad; conserva el punto marcado', async () => {
    mockFetch({
      lat: '-33.0387',
      lon: '-71.6291',
      display_name: 'Plaza Sotomayor, Valparaíso, Chile',
      address: {
        road: 'Plaza Sotomayor',
        house_number: '1',
        suburb: 'Barrio Puerto',
        city: 'Valparaíso',
      },
    });
    const r = await new GeocodingService().reverse(-33.03871, -71.62905);
    expect(r).toEqual({
      name: 'Plaza Sotomayor 1',
      address: 'Plaza Sotomayor 1, Valparaíso',
      latitude: -33.03871,
      longitude: -71.62905,
    });
  });
});
