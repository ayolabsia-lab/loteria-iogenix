# Lotería iO.GENIX · Navidad 2026

App de décimos digitales: cada pedido web del 1 al 21 de diciembre de 2026 obtiene un número único de 5 cifras para el Gordo de Navidad.

- **App de clientes:** `index.html` (admite `?pedido=REF&email=EMAIL` para rellenar el formulario)
- **Panel interno:** `admin.html` (contraseña común del equipo)
- **Bases legales:** `bases.html`
- **Base de datos:** Supabase, proyecto `ayolabsIA` (`supabase/schema.sql`). Todo pasa por funciones RPC; las tablas no son accesibles con la clave pública.

## Enlace para el email de confirmación de PrestaShop (plantilla order_conf)

```
https://ayolabsia-lab.github.io/loteria-iogenix/?pedido={order_name}&email={email}
```

## Premios (no acumulables)

| Coincidencia con el Gordo | Premio |
|---|---|
| 3 últimas cifras | 150 € en cupón |
| 4 últimas cifras | 500 € en cupón |
| 5 cifras | 1.000 € en cupón |

## Pruebas

Las referencias que empiezan por `TEST` se pueden registrar en cualquier momento y no cuentan en estadísticas, premios ni tómbola. Se borran desde *Ajustes → Pruebas*.

## Mantenimiento

`.github/workflows/keepalive.yml` llama a la API cada 3 días para que Supabase (plan gratuito) no pause el proyecto.
