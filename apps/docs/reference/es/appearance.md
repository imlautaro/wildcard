# Apariencia (Sistema, Claro, Oscuro)

Ambos clientes permiten elegir el tema de la app independientemente de la configuración
del sistema. **Cuenta → Apariencia** ofrece **Sistema** (predeterminado, sigue al
dispositivo), **Claro** y **Oscuro**. La elección se aplica inmediatamente. La fila
**Idioma** que está al lado se describe en [localización](localization.md).

## Almacenamiento y alcance

La preferencia es una configuración del dispositivo, no de la cuenta: no se envía
nada a la API, sobrevive al cierre de sesión y se aplica a todas las cuentas de ese
dispositivo o navegador. No contiene datos privados, por lo que no requiere una
decisión de retención ni aislamiento por cuenta.

| Cliente | Dónde | Valor |
| --- | --- | --- |
| iOS | Clave `appearance` de `UserDefaults` (`@AppStorage`) | `system`, `light`, `dark` |
| Web y administración | Clave `wildcard-theme` de `localStorage` | `light` o `dark`; Sistema elimina la clave |

## iOS

`Design/AppAppearance.swift`. `WildcardApp` lee el valor almacenado y establece
`overrideUserInterfaceStyle` en cada ventana de cada escena conectada (`.unspecified`
para Sistema), al iniciar, con cada cambio y cuando la escena pasa a estar activa.
Usar la configuración de ventana (en lugar de `preferredColorScheme` en la raíz)
mantiene las presentaciones de UIKit, como alertas y hojas de Safari, en el tema
elegido, y permite volver limpiamente a Sistema. Las presentaciones que fuerzan un
esquema siguen haciéndolo (el visor de imágenes de pantalla completa permanece oscuro).
El selector es una fila de menú `Picker` en el formulario de Cuenta. La extensión
para compartir, los widgets y el servicio de notificaciones se ejecutan en procesos
propios y siguen usando el sistema.

## Web (y administración)

La capa `packages/ui` es la propietaria para que ambas apps de navegador compartan
una implementación:

- `app/utils/theme.ts` contiene un script en línea que `nuxt.config.ts` coloca en
  `<head>`. Se ejecuta antes del primer renderizado, resuelve la preferencia a
  `<html data-theme="light|dark">` (Sistema usa `prefers-color-scheme` y sigue
  escuchando cambios), refleja la preferencia en `data-theme-preference` y crea sus
  propias etiquetas `<meta>` de `color-scheme` y `theme-color`. Esas etiquetas se
  mantienen fuera del administrador de cabecera de Nuxt intencionalmente: este
  restablecía su contenido después de la hidratación. Otras pestañas se sincronizan
  mediante el evento `storage`.
- `app/composables/useTheme.ts` expone `preference` y `setPreference()`;
  `app/plugins/theme.client.ts` ejecuta el script si no se emitió y sincroniza el
  estado de la preferencia entre pestañas.
- Los estilos oscuros dependen de `:root[data-theme="dark"]`, nunca de
  `@media (prefers-color-scheme: dark)`: los roles de color oscuros de `tokens.css`,
  la línea fina oscura de los paneles en `main.css` de ambas apps, los nombres de
  remitentes de grupos, las citas de respuestas y los acentos de tarjetas de novedades.
  Las nuevas reglas oscuras deben usar el mismo selector o ignorarán una elección
  explícita de Claro u Oscuro. En los estilos Vue con alcance,
  `:root[data-theme="dark"] .x` se compila a `:root[data-theme="dark"] .x[data-v-…]`
  (comprobado con `compileStyle`).
- La app web muestra el selector como una fila de Cuenta que abre una hoja con
  opciones de radio. El panel de administración no tiene selector; sigue Sistema
  o una elección realizada en la app web del mismo origen (orígenes distintos
  mantienen almacenamiento separado).

## Verificación

- iOS: pasa `swiftc -typecheck` de toda la app. El comportamiento en dispositivo
  (cambiar durante la ejecución, hojas y alertas, volver a Sistema, reiniciar) no está
  verificado.
- Web: pasan `typecheck:web` y `typecheck:admin`. En `nuxt dev` con Chrome sin
  interfaz, el tema resuelto, el fondo del cuerpo, `--md-surface`, `theme-color` y
  `color-scheme` fueron correctos para Sistema con SO oscuro, Claro con SO oscuro,
  Oscuro con SO claro, Sistema con SO claro y un cambio en vivo del SO a oscuro
  mientras estaba en Sistema (31/10/2026). No se renderizó la hoja de Cuenta
  (requiere una sesión iniciada); no se cargó el panel de administración.
