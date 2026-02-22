# Add-In Geotab: Odometro y Horas Motor

Esta carpeta contiene un Add-In para MyGeotab que replica la logica de `app.py`:

- Tabla `odometro` con:
  - `vehiculo`, `marca modelo`, `fuente`, `odometro_km`, `hace_cuanto`, `fecha_dato`, `Soportado`
- Tabla `HorasMotor` con:
  - `vehiculo`, `marca modelo`, `motor`, `horas_motor`, `hace_cuanto`, `fecha_dato`, `Soportado`
- Boton para descargar Excel (`reporte_odometro.xlsx`) con ambas hojas.

## Archivos

- `index.html`: vista del Add-In.
- `app.js`: logica de carga de datos, render y export Excel.
- `styles.css`: estilos.
- `icon.svg`: icono para el menu.
- `addin.json`: manifiesto de ejemplo para registrar el Add-In.

## Publicacion

1. Sube el contenido de `addin/` a un host HTTPS accesible.
2. Actualiza en `addin.json`:
   - `page`: URL real de `index.html`.
   - `icon`: URL real de `icon.svg`.
   - `supportEmail`.
3. En MyGeotab:
   - Admin -> System -> Add-Ins -> Add-In Management.
   - Carga el `addin.json`.

## Notas

- El token de `myadmin.geotab.com` se introduce en la UI del Add-In.
- El token y parametros (`regionId`, `lookback`) se guardan en `localStorage`.
- Si el endpoint `ByVins` falla o no hay token, las columnas `Soportado` y `marca modelo` pueden quedar vacias.
