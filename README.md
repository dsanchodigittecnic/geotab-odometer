# Add-In Geotab: Odómetro y Horas Motor

Este Add-In replica la logica de `app.py` en una UI dentro de MyGeotab.

## Funcionalidades

- Dos tabs:
  - `Odómetro`
  - `HorasMotor`
- Resumen superior con contadores:
  - ODOMETRO vs GPS
  - MOTOR vs GPS
- Resumen por `marca modelo`:
  - total, ODOMETRO, GPS (odometro), % GPS (odometro), MOTOR, GPS (motor), % GPS (motor)
  - alerta visual cuando `% GPS (odometro) > 20%`
  - clic en `marca modelo` para filtrar el detalle automaticamente
- Filtros:
  - `marca modelo` (aplica a ambos tabs)
  - fuente en `Odómetro`: `Todos / ODOMETRO / GPS`
  - fuente en `HorasMotor`: `Todos / MOTOR / GPS`
- Tabla `odometro` con columnas:
  - `vehiculo`, `marca modelo`, `fuente`, `odometro_km`, `hace_cuanto`, `fecha_dato`, `Soportado`
- Tabla `HorasMotor` con columnas:
  - `vehiculo`, `marca modelo`, `motor`, `horas_motor`, `hace_cuanto`, `fecha_dato`, `Soportado`
- Ordenacion por clic en cabeceras (asc/desc) en ambas tablas.
- Exportacion a Excel (`reporte_odometro.xlsx`) con hojas:
  - `odometro`
  - `HorasMotor`

## Archivos

- `index.html`: estructura de la pagina, tabs y tablas.
- `app.js`: carga de datos (MyGeotab + ByVins), render, resumen, ordenacion y export Excel.
- `styles.css`: estilos.
- `icon.svg`: icono del menu.
- `addin.json`: manifiesto del Add-In.

## Publicacion

1. Publica esta carpeta (`addin/geotab-odometer/`) en un host HTTPS.
2. Verifica `addin.json`:
   - `url`: URL publica de `index.html`.
   - `icon`: URL publica de `icon.svg`.
   - `supportEmail`.
3. En MyGeotab:
   - Admin -> System -> Add-Ins -> Add-In Management.
   - Carga/actualiza el `addin.json`.

## Notas

- El token de `myadmin.geotab.com` se introduce en la UI del Add-In.
- Se guardan en `localStorage`: token, `regionId`, `lookback`.
- Si falla `ByVins` o no hay token:
  - `Soportado` y `marca modelo` pueden quedar vacios.
