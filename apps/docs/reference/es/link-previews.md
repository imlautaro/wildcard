# Vistas previas de enlaces

Los mensajes con un enlace muestran una tarjeta con el nombre del sitio, el título,
la descripción y la imagen de la página, como otras apps de mensajería. Tanto iOS
como la web lo implementan con las mismas reglas.

## Qué enlace recibe una tarjeta

Una tarjeta por burbuja, debajo del texto:

- Mensajes de personas: el primer enlace `http(s)` (con esquema o un host `www.`,
  con la misma detección que convierte los enlaces en elementos pulsables; consulta
  [Markdown de mensajes de bots](chats.md#bot-message-markdown)).
- Mensajes de contactos: solo cuando el mensaje contiene exactamente un enlace
  distinto, para que las respuestas de investigación con varias fuentes no muestren
  una tarjeta elegida arbitrariamente.

Los demás enlaces siguen siendo pulsables. Los pies de imágenes y los mensajes de
voz no reciben tarjeta. No se muestra nada hasta que existe una vista previa lista;
una página fallida o bloqueada simplemente no muestra tarjeta.

## Obtención (API)

`GET /api/v1/link-previews?url=<url>` (sesión bearer) devuelve
`{ preview: { url, hash, status, title, description, siteName, imageVersion } }`.
`GET /api/v1/link-previews/<hash>/image` devuelve la imagen almacenada.

- La URL debe ser una URL de dominio público `http(s)` sin credenciales (la misma
  validación que las fuentes de investigación); se elimina el fragmento y la clave
  es el SHA-256 de la URL.
- El Worker obtiene la página con el flag de obtención estrictamente pública,
  sigue como máximo tres redirecciones, vuelve a validar cada una, aplica un tiempo
  límite de 8 segundos y lee solo la cabecera del documento (máximo 512 KiB).
  Extrae Open Graph, tarjetas de Twitter y alternativas HTML. Las páginas sin
  metadatos pueden anunciar un documento oEmbed, que se usa en su lugar; YouTube
  y Vimeo se consultan mediante sus endpoints oficiales de oEmbed. Los sitios que
  rechazan clientes automatizados (por ejemplo, algunos sitios de noticias) no
  reciben tarjeta; el Worker se identifica con honestidad y no suplanta otros rastreadores.
- La imagen (JPEG, PNG, WebP o GIF, reconocida por sus bytes, máximo 3 MiB) se copia
  al bucket R2 existente en `link-previews/<hash>`; los clientes nunca contactan
  con el sitio enlazado, que así no ve las direcciones IP de quienes leen.
- Las vistas previas se comparten entre cuentas: solo contienen lo que ve cualquier
  visitante de la URL. Las listas duran siete días y las fallidas seis horas; el
  Cron de cada minuto elimina las filas caducadas y sus imágenes (hasta 50 por
  ejecución). Una actualización que coincida con la caducidad puede perder la
  imagen hasta la siguiente actualización.
- Presupuestos por cuenta: 600 lecturas y 30 obtenciones sin caché por minuto.

## Cachés de los clientes

La web (`useLinkPreviews`) e iOS (`LinkPreviewCache`, propiedad de `PrivateImageCache`)
conservan una caché de sesión solo en memoria, con clave por cuenta, de hasta 200
vistas previas. Las solicitudes de la misma URL se comparten; un resultado `failed`
del servidor se recuerda durante la sesión (sin tarjeta) y los fallos de transporte
se reintentan cuando vuelve a mostrarse la burbuja. Se descartan las respuestas
que llegan después de cerrar sesión o cambiar de cuenta, y ambas cachés se vacían
en cada reinicio de sesión. Las imágenes usan las cachés privadas existentes
(caché de blobs en memoria en web; `PrivateImageCache` en iOS, recurso
`link/<hash>/<version>`, con su caché de disco protegida), con la hora de obtención
de la vista previa como versión.

## Verificación

Comprobaciones estáticas: comprobaciones de tipos de API, web e iOS; la migración y
cada sentencia nueva preparadas con `EXPLAIN` en D1 de workerd local; extracción real
para USCIS, GitHub, Wikipedia, example.com y YouTube (oEmbed). Aún deben comprobarse
en ambos clientes la visualización en dispositivo, la disposición de tarjetas en
burbujas largas, el modo oscuro y el comportamiento sin conexión.
