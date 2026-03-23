# Cashy

Cashy es una app web tipo dashboard para controlar tu patrimonio personal desde un solo sitio.

Permite registrar cuentas bancarias, fondos, inversiones y criptomonedas, y visualizar de forma rapida el estado global de tus finanzas.

## Que hace la app

- Gestiona activos por categorias: banco, fondos, bolsa, cripto y movimientos.
- Calcula el patrimonio neto total en tiempo real.
- Muestra distribucion de riesgo/diversificacion por tipo de activo.
- Incluye modo privado para ocultar importes sensibles en pantalla.
- Permite cambiar entre modo claro/oscuro.
- Incluye objetivos financieros con progreso.
- En cripto, permite:
	- guardar cantidad y precio medio de compra,
	- consultar precio actual,
	- ver porcentaje de ganancia/perdida,
	- ver ganancia/perdida en dinero,
	- actualizar datos en tiempo real,
	- mostrar logo de la moneda (por ejemplo DOGE).

## Funciones de edicion y aportaciones

- Edicion de cuentas bancarias (nombre, saldo, aportacion mensual).
- Edicion de fondos indexados (nombre, cantidad, precio, aportacion mensual).
- Eliminacion de cuentas y fondos.

## Fondos en vivo

- Puedes registrar fondos por nombre o con formato `Nombre | ID` (ejemplo: `Vanguard FTSE All-World | VWCE.DE`).
- La app intenta resolver automaticamente el ID del fondo si solo pones el nombre.
- Si el fondo tiene ID valido, muestra precio actual y evolucion intradia en tiempo real.

## Tecnologia

- HTML + CSS + JavaScript vanilla
- TailwindCSS (CDN)
- Chart.js para graficas
- Service Worker + Manifest para uso como PWA
- Persistencia local con localStorage

## Uso local

1. Abre [index.html](index.html) en el navegador.
2. Registra tus activos desde "Registrar Actividad".
3. Navega por las pestanas para revisar banco, fondos, bolsa, cripto y analisis.

Para experiencia PWA completa (cache/service worker), se recomienda abrirla servida desde un entorno local (por ejemplo Live Server) en lugar de doble clic directo.

## Autores

Hecha por Pablo Pascual Cáceres y Gonzalo Tobajas Adrada.