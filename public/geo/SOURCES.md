# Geo data sources

Both files are served from this site and used offline. Nothing is sent anywhere to look up a place.

- `countries-110m.json`: country outlines from [Natural Earth](https://www.naturalearthdata.com/)
  1:110m, as TopoJSON from the [world-atlas](https://github.com/topojson/world-atlas) package.
  Public domain.
- `cities15000.min.json`: towns with more than 15,000 inhabitants from
  [GeoNames](https://www.geonames.org/) (`cities15000`), reduced to name, country code, latitude
  and longitude. Licensed under
  [Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/).
  Data by GeoNames.

Rebuilt with `pnpm geo:build`.
