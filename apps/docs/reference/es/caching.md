# Caché de navegación de iOS

El [contexto temporal de respuestas](chats.md#temporal-conversation-context) se deriva
en el servidor del turno actual y su historial visible acotado. Es local a la solicitud;
no hay caché nueva de tiempos en cliente o persistente, rutina aprendida, paginación
ni retención en disco. Los presupuestos existentes de historial, frescura,
deduplicación de solicitudes, rechazo de respuestas tardías, IDs pendientes,
invalidación por eliminación/pérdida de acceso y cambio de cuenta se aplican en iOS
y web. Las respuestas publicadas usan el sondeo normal de historial/lista. Siguen
pendientes reabrir/volver, actualizar y verificación sin conexión/en dispositivo.

Los tiempos de respuesta privada los administra el Workflow API compartido, con
duraciones restantes de lectura, escritura y pausas de inactividad guardadas en
checkpoints. Los plazos vencidos no crean respuestas fallidas. Esto no cambia claves
de caché, frescura, invalidación, IDs pendientes ni permisos de reintento de iOS o
web. Tras el release, verifica actualización lenta de memoria seguida de mensaje
corto, reabrir/volver y actualizar: el turno pendiente existente debería actualizarse
mediante sondeo normal. La recuperación en producción y comportamiento en dispositivo
requieren verificación durante la ejecución.

HomeView con sesión posee ContactsStore, que posee ConversationCache. Las vistas
reutilizan el mismo ChatStore para cada contacto en lugar de construir uno nuevo
en cada navegación. El contenido cargado sigue visible durante actualización y
fallos de red. El indicador completo de carga se reserva para la primera carga
exitosa; las listas vacías en caché mantienen su estado vacío durante revalidación.

### Fallos transitorios durante la revalidación en segundo plano

Las actualizaciones por sondeo (sincronización de chat cada segundo, acciones
nativas cada cinco segundos) mantienen contenido cargado visible y permanecen
silenciosas ante fallos transitorios, en lugar de mostrar un error que el siguiente
ciclo borra. Transitorio significa fallo de conectividad (iOS `URLError` por tiempo
agotado, sin conexión, conexión perdida, host inaccesible o DNS; web `ApiError` con
estado 0) o fallo de gateway (web 502/503/504; iOS
`AuthAPI.Failure.temporarilyUnavailable`, usado por grupos para 429/5xx). Ambos
clientes comparten la regla mediante `AuthAPI.isTransient` (iOS) e
`isTransientFailure` (web), aplicada a listas de contactos/grupos, historiales
privados/grupales e instantáneas de acciones nativas/remotas. Las primeras cargas
sin caché, acciones iniciadas por usuario y fallos no transitorios (404 por pérdida
de acceso, 401, validación) siguen mostrando su error. Un error existente permanece
hasta la siguiente actualización exitosa, en lugar de borrarse al comenzar una
solicitud. El control «Cargar más» iOS espera una actualización de lista en curso
en lugar de desactivarse por ella, para que la revalidación de fondo no alterne su estado.

Verifica en dispositivo activando modo avión con chats cargados: filas e historiales
siguen visibles sin banner de error; desactívalo y confirma que se ponen al día.
Sin caché, la primera carga aún muestra su error y Reintentar.

## Sincronización compartida de conversaciones

`HomeView` posee `ConversationSync` para la sesión iniciada. Un temporizador de
primer plano de un segundo, navegación, envíos completados y APNs en primer plano
solicitan sincronización mediante flujos de eventos combinados. Las listas privadas
y grupales tienen consumidores independientes. Los historiales corren por separado
por ID de conversación, y la precarga de lista usa como máximo cuatro historiales
concurrentes por fuente. Un historial lento no demora publicar lista, otra conversación
ni confirmaciones de lectura. Las invitaciones se actualizan por separado cada
15 segundos.

Quienes solicitan listas e historiales esperan la misma solicitud en curso en
lugar de descartar una actualización detrás de un indicador de carga. Cancelar
navegación no cancela la lectura compartida. Las lecturas iniciadas pueden terminar
tras pasar a segundo plano; el bucle de sesión cancelado no inicia más ciclos.
Las identidades de ejecución de activación impiden que la limpieza de un bucle viejo
detenga su reemplazo. La autorización de sesión e invalidación de stores siguen
rechazando resultados obsoletos. Una señal de activación que llega mientras hay una
solicitud de lista en curso se conserva para otra pasada.

Home deriva vista previa del último mensaje, remitente, reloj de envío y confirmación
de la misma conversación observable en caché usada por el chat cuando esa evidencia
es al menos tan reciente como el resumen del servidor. Ambas cachés exponen inserciones
observables, para que un chat creado después del primer renderizado de Home pueda
actualizar la lista inmediatamente. Los aciertos de caché actualizan solo los datos
LRU no observables. Reemplazar una entrada observable durante un renderizado SwiftUI
invalidaría repetidamente ese mismo renderizado; las búsquedas estables conservan
la identidad del store original sin publicar una mutación. Inserciones y eliminaciones
siguen observables, y la expulsión LRU respeta stores visibles/pendientes. La evidencia
de confirmaciones del resumen se concilia con el mensaje correspondiente en caché.
Los resúmenes privados identifican turnos salientes por su hora exacta de creación
en servidor; los grupos usan IDs inmutables. Nunca se transfiere evidencia a otro
mensaje. La combinación de turnos privados respeta intentos/fechas y conserva
confirmaciones de lectura independientemente; la combinación grupal solo avanza
Enviado → Recibido → Leído. La puesta al día recorre páginas faltantes sin reemplazar
historial ya cargado.

La aceptación HTTP grupal marca la fila optimista como Enviado antes del audio o
una solicitud posterior de historial. No implica Recibido ni Leído. Luego el historial
reemplaza esa fila por UUID sin mostrar ambas. Una respuesta grupal 429, 5xx o
transitoria no clasificada conserva el UUID para reintento. Las finalizaciones
privadas recién observadas solicitan audio después de confirmar el historial
compartido. Los push remotos en primer plano piden datos nuevos en lugar de reproducir
sonidos inmediatamente; los banners grupales usan la actividad obtenida. El audio
espera 100 ms adicionales para actualizaciones de observación y las filas de respuesta
visibles conservan su demora de inserción. Son demoras de presentación, no prueba
de un fotograma renderizado; los tiempos en dispositivo físico requieren comprobación.

Esta implementación usa la API HTTP y APNs existentes, con sondeo como respaldo.
No agrega servicio WebSocket/SSE, migración ni dependencia de despliegue. Un ciclo
de un segundo es intervalo de planificación, no garantía de latencia; solicitudes,
cortes de red, límites API y generación de servidor pueden tardar más. Aumenta el
volumen de solicitudes en primer plano respecto al sondeo anterior de tres segundos.
Los historiales privados no abiertos obtenidos solo para identificar una notificación
nueva son transitorios y no expulsan las ocho cachés de navegación. Las reglas
existentes de retención, privacidad, presupuestos de imágenes y revocación siguen vigentes.

Ejecuta las regresiones aisladas optativas de stores con
`python3 scripts/checks/ios-conversation-sync.py` en macOS con Xcode instalado.
Compilan los stores de producción con modelos ficticios y transporte en memoria;
no se usan red, credenciales, build de app, simulador ni APNs. La verificación en
dispositivo debe cubrir envío → Home → chat, respuestas y confirmaciones demoradas/
fuera de orden, varios contactos que responden en grupo, recuperación lenta/sin
conexión, navegación repetida, segundo plano/reanudar, carreras push/sondeo, orden
de audio, paginación, revocación de acceso y cambio de cuenta. Instala el binario
iOS actualizado para verificar estas presentaciones.

## Duración de confirmaciones de lectura

Las escrituras de marcas de no leídos privadas y grupales usan una
`ReadAcknowledgementQueue` de sesión. Los chats visibles y activos registran
sincrónicamente su última marca de respuesta/mensaje cargado al aparecer, cargar
contenido y salir. Home no crea observaciones de lectura desde vistas previas ni
precarga. Cancelar una vista o salir con teclado abierto no cancela una escritura
ya en cola. La cola combina hasta la secuencia observada más alta y envía una
observación nueva que llegue durante una escritura en curso. Fallos y confirmaciones
parciales quedan en cola para el temporizador de primer plano, independientemente
de solicitudes de lista atascadas. Ninguna tarea de lectura duerme o reintenta
reteniendo sincrónicamente el actor principal.

La confirmación del servidor actualiza cantidades de filas e insignia combinada;
una escritura fallida conserva la cantidad del servidor en lugar de simular éxito.
Las revisiones de lectura rechazan una respuesta de lista iniciada antes de confirmar.
Las respuestas privadas de lectura concurrentes concilian diferencias de cantidades
si otra lectura ya terminó, evitando que una instantánea antigua del total deshaga
esa finalización. Eliminación, pérdida confirmada de acceso y comprobaciones de
sesión existentes descartan trabajo obsoleto. Estas intenciones solo viven en memoria
de sesión; terminar el proceso puede perder una escritura que aún no llegó al servidor,
y la siguiente activación actualiza desde el estado del servidor.

Las confirmaciones de lectura por destinatario grupal son distintas de las marcas
de no leídos: solo observar una fila al menos 50 % en pantalla crea esa confirmación.
Un reconocimiento de fila cancelado queda pendiente y una actualización posterior
del historial en caché lo reintenta, incluso después de salir del grupo. Ni las
vistas previas de Home ni una marca de lectura inventan evidencia Leído de destinatario.

Las regresiones aisladas reproducen un acierto de caché que se invalidaba a sí mismo
y una lectura cancelada que dejaba Home no leído contra la implementación anterior.
Cubren búsquedas estables privadas/grupales, orden LRU, combinación de lecturas,
recuperación de lectura fallida desde Home, lista atascada durante reintento, lecturas
grupal canceladas y confirmaciones de destinatarios, y respuestas obsoletas de lista.
Renderizado UI, respuesta del teclado y cancelación real de red requieren verificación
en dispositivo físico.

## Frescura y solicitudes

- Los contactos individuales permanecen frescos 30 segundos durante navegación.
  La estructura con sesión fuerza actualización de lista al activarse y cada segundo
  mientras está activa para actualizar no leídos y vistas previas fuera de conversación.
  Las actualizaciones automáticas conservan páginas posteriores ya cargadas; arrastrar
  para actualizar restablece la paginación.
- Las conversaciones visibles revalidan en cada ciclo de primer plano de un segundo,
  incluido historial inactivo, para observar presencia del servidor. La presencia se
  borra al salir o pasar el chat a segundo plano y tras fallos de actualización.
  Las solicitudes fallidas reintentan en el mismo ciclo; se siguen evitando superposiciones.
- Arrastrar para actualizar y Actualizar conversación omiten frescura. No se superponen
  actualizaciones de una misma conversación, lista o contacto individual.
- Enviar inserta una burbuja saliente optimista separada antes de la solicitud de
  red. Conserva UUID de envío y bytes locales del adjunto en el store en caché
  durante el envío, sobrevive a actualizaciones de historial y se reemplaza por el
  turno persistido correspondiente sin duplicación. Nunca participa en cálculos de
  secuencia del servidor ni de lectura. Los fallos sin confirmar la eliminan y
  restauran un borrador sin cambios. Enviar/reintentar actualiza turnos persistidos
  en caché tras aceptación del servidor e invalida frescura para reanudar sondeo
  pronto. Los cambios del último turno actualizan la vista previa. Crear y renombrar
  contactos actualiza el contacto local de inmediato e invalida frescura de lista.
- Las revisiones descartan respuestas superadas por mutaciones, invalidación o una
  ventana de historial reemplazada. El transporte API compartido normaliza
  `URLError.cancelled` de URLSession y resultados de tareas canceladas a
  `CancellationError`. Listas e historial grupales, invitaciones, detalles de miembros,
  compartir y editores de contacto ignoran cancelación como las actualizaciones
  privadas, conservando contenido cargado e identificadores pendientes. Cancelar
  no crea fila de error ni botón Actualizar/Reintentar. Los demás fallos mantienen
  sus controles de error/recuperación; cancelar un envío no implica rechazo del servidor.
- Las filas prefieren `lastMessageAt` de la API. Con APIs anteriores, reutilizan el
  último turno correspondiente en caché o una fecha de sesión por contacto y vista
  previa. La falta de fechas requiere una consulta de historial por vista previa
  no almacenada, no otra cada vez que aparece la fila. Eliminar el contacto borra
  su fecha. No se escribe caché de fechas en disco.

La conversación visible revalida en cada ciclo de primer plano. También revalidan
conversaciones privadas en caché con respuestas pendientes y grupos en caché con
vistas previas modificadas o confirmaciones salientes pendientes. Abrir o volver
a un chat solicita actualización inmediata de historial; la generación en segundo
plano continúa en el servidor. El historial antiguo sigue disponible por la API
de paginación existente. Confirmar no leídos invalida instantáneas concurrentes de
contacto para que una respuesta tardía no resucite una cantidad borrada. La lectura
se persiste en servidor; la caché de navegación sigue en memoria.

## Localización

Las traducciones se incluyen en cada cliente y nunca se obtienen de la API, así
que no requieren caché, invalidación ni aislamiento de cuenta. La preferencia web
(`localStorage` `wildcard-language`) y el idioma por app iOS son ajustes de dispositivo
que sobreviven al cierre de sesión. Las etiquetas de lista traducidas por clientes
(líneas de actividad, vistas previas redactadas en inglés por la API) se derivan
al renderizar de los resúmenes existentes en caché, sin solicitud extra. Consulta
[localización](localization.md).

## Listas de Chats y Contactos

La lista inicial espera que carguen las cachés de contactos y grupos antes de mostrar
filas combinadas y ordenadas por actividad. Ambas solicitudes comienzan independientemente;
el sondeo de primer plano y arrastrar para actualizar también actualizan ambas fuentes
concurrentemente. Las cachés cargadas siguen visibles al revalidar. Una fuente fallida
libera la barrera inicial para mantener accesibles filas disponibles con controles
de reintento. Cancelar no cuenta como lista vacía exitosa. El límite existente de
paginación privada sigue determinando qué grupos antiguos son visibles. No se agrega
caché ni endpoint de red.

Verificación en dispositivo: abrir Chats en frío con cualquier respuesta demorada,
sin contactos, sin grupos y con ambas listas vacías; confirmar una única aparición
inicial y el estado vacío correcto. Fallar cualquier solicitud, reintentar, navegar
fuera/volver, actualizar, reanudar y cambiar cuentas ficticias. Las filas mixtas en
caché deben permanecer visibles durante revalidación exitosa y fallos transitorios.
Estas comprobaciones de presentación siguen pendientes en dispositivo.

Ambas pantallas comparten caché de contactos de sesión y estado de mutación. Chats
filtra contactos sin metadatos de mensaje y conserva orden por actividad. Contactos
ordena todos los cargados por nombre y obtiene automáticamente páginas restantes
para mantener accesibles conversaciones vacías. Chats omite automáticamente páginas
con solo conversaciones vacías. Las protecciones de carga y mutación impiden solicitudes
de página superpuestas; los fallos conservan caché y muestran Reintentar. Las
actualizaciones en primer plano conservan páginas posteriores y recalculan paginación
si cambia la membresía de la primera página.

## Memoria y aislamiento

La caché mantiene ocho conversaciones recientes y expulsa la entrada elegible menos
usada al abrir otra. Los stores visibles y los que tienen envío/reintento o solicitud
de página activos están temporalmente exentos. Salir conserva los últimos 100 turnos
si no hay mutación ni solicitud de página en curso; los antiguos se pueden recuperar
con el cursor de paginación restaurado. Durante la lectura, las páginas cargadas
explícitamente permanecen disponibles hasta salir.

Eliminar un contacto o recibir 404 de contacto invalida y elimina su conversación
en caché. Un 404 de historial borra ese store y desactiva envío. Los stores invalidados
rechazan resultados tardíos. Cerrar sesión, vencer y cambiar usuario eliminan la
estructura con sesión y su caché; withSession también rechaza resultados de una
credencial reemplazada.

Registros de conversación, metadatos de contacto y credenciales no se persisten por
la caché de navegación. Terminar el proceso inicia stores nuevos. Los bytes recientes
de imagen usan la caché protegida separada descrita abajo. Restaurar sesión aún
requiere validación del servidor y puede mostrar la pantalla de inicio existente.
No cambian cabeceras HTTP no-store ni obtención autenticada. La caché de navegación
original no agrega infraestructura. El seguimiento de no leídos requiere además
migración 0005 y el release API correspondiente descritos en notifications.md.

## Verificación

La comprobación estática de tipos Swift, validación de espacios del diff de git y
39 regresiones aisladas de stores cubren la actualización de sincronización compartida.
No son parte de esta verificación builds de app, simulador, comprobaciones reales
APNs/audio ni solicitudes de cuentas reales. El comportamiento instalado aún debe
comprobarse: abrir y reabrir conversación, navegar pestañas, actualizar manualmente,
perder/restaurar conectividad, terminar respuesta pendiente, cargar páginas antiguas,
eliminar contacto e iniciar sesión con otra cuenta ficticia. Reinstala/ejecuta la
app iOS actualizada para usar el cambio.

## Imágenes recientes de chat y avatares

AuthStore posee `PrivateImageCache`, compartida por miniaturas, visor completo,
avatares de contacto y cuenta. Solo se activa después de verificar sesión. Tiene
dos niveles:

- Memoria: objetivos de costo NSCache de 32 MiB para miniaturas/avatares decodificados
  y 16 MiB para bytes originales codificados. iOS puede expulsar por presión de memoria.
  Los avatares se decodifican hasta 288 píxeles y miniaturas hasta 520. Las vistas
  consultan sincrónicamente la caché decodificada al recrearse para evitar un destello
  de placeholder en un acierto.
- Disco: hasta 64 MiB de bytes originales por cuenta en `Caches/PrivateImages-v1`,
  eliminando primero archivos leídos menos recientemente. Las entradas sin uso siete
  días vencen; las lecturas depuran como máximo una vez por minuto y las escrituras
  aplican el presupuesto. El SO puede purgar Caches. Lecturas/escrituras y depuración
  corren en actor separado. Directorios y archivos usan protección completa; los
  directorios se excluyen de backups. Nombres de cuentas y recursos son hashes
  SHA-256 en disco. Los fallos de E/S usan carga normal sin hacer fallar la imagen.

Las claves de avatar incluyen ID de contacto y photoVersion (o photoVersion de
cuenta). Las de chat incluyen ID de conversación y turno inmutable. Todas las
entradas se separan por cuenta. Las versiones nuevas de foto eligen claves nuevas
inmediatamente; las anteriores inaccesibles vencen o se expulsan. Cargas aceptadas
y mensajes de imagen alimentan la caché de bytes originales, incluidos envíos
inciertos confirmados luego por historial. Las vistas optimistas no aceptadas
quedan solo en memoria de vista. Los PDF no se guardan aquí. Las imágenes completas
se decodifican hasta 4096 píxeles desde el mismo original, sin nueva descarga en
aciertos; los grandes decodificados quedan en su visor, no consumen la caché de miniaturas.

Los fallos de caché concurrentes del mismo recurso comparten una solicitud de
disco/red. Salir no cancela la descarga compartida, para precargar al volver. Las
épocas de sesión/caché rechazan resultados tras invalidación; invalidar disco impide
también que solicitudes tardías repueblen archivos borrados. La decodificación está
fuera del actor principal. Los datos de imagen inválidos se eliminan para recuperarlos
de nuevo al reintentar.

Cerrar sesión o una sesión restaurada rechazada/ausente borra la caché de la cuenta
relevante (todas las cuentas si no se conoce ID de usuario). El vencimiento también
la borra. Eliminar contacto, detectar eliminación confirmada en primera página
actualizada o recibir 404 de contacto/historial borra conservadoramente toda la
caché de imágenes de la cuenta actual. Estas comprobaciones no descubren revocación
sin conexión; imágenes cargadas pueden seguir visibles hasta que metadatos/historial
detecten pérdida. Los archivos locales son datos privados de app, no URLs públicas
ni autorización para otra cuenta. La limpieza es de mejor esfuerzo; archivos protegidos
pueden quedar hasta una purga posterior si falla eliminarlos. La extensión de
notificación conserva su descarga efímera independiente.

Sigue pendiente verificar en app instalada: salir/volver, abrir en frío tras restaurar
sesión correctamente, abrir completo sin conexión tras cachear, reemplazar/quitar
avatar, simular presión de memoria, exceder disco, reintentar datos corruptos,
revocar/eliminar contacto y cerrar/iniciar sesión con otra cuenta ficticia. No se
hicieron builds, pruebas de ejecución, descargas multimedia privadas ni acciones de
cuentas reales para este cambio.

Las visitas en primer plano y ediciones del compositor también informan actividad
mediante tarea separada de tres segundos. No marca fresco el historial ni interfiere
con su sondeo. Abrir registra una visita con vencimiento; el sondeo inactivo no la
renueva. Segundo plano/navegación la cierran con mejor esfuerzo, y TTL de servidor
vence clientes perdidos. Consulta [presencia de visita](chats.md#visiting-a-chat-and-composing-a-draft).

## Audio de mensajes de voz

La ilustración de reproducción del sistema reutiliza la caché versionada existente
de avatares del remitente: iOS reutiliza/carga una imagen de 288 píxeles y conserva
solo la ilustración actual en el reproductor de sesión; web fija su URL de objeto
activa en el LRU de imágenes de 150 entradas y la libera al detener/reemplazar.
No se agrega caché de imágenes paralela ni retención privada extra en disco. Las
fotos ausentes/sin conexión usan avatar genérico no privado. El audio inicia
independientemente de la carga de foto. Cancelación, identidad de reproductor/solicitud
y épocas existentes rechazan ilustraciones tardías tras reemplazo/invalidación;
restablecer cuenta/acceso/historial borra metadatos del sistema y cachés originales.
Consulta [ilustración del remitente](voice.md#sender-artwork-on-system-playback-controls)
para divulgación de foto y comprobaciones pendientes sin conexión/navegación/expulsión/cuenta.

Un mensaje cargado ahora permanece en el reproductor de sesión entre navegación y
segundo plano. iOS conserva el reproductor activo decodificado en memoria sin leer
archivos protegidos al estar bloqueado; web conserva/fija la URL de objeto activa
existente. No se agrega caché de descarga, período de retención ni revalidación en
segundo plano. Posición, estado de salida/proximidad y metadatos multimedia del
sistema siguen solo en memoria; grabación, finalización, fallo, pérdida conocida de
acceso, vaciar/eliminar historial y restablecer cuenta liberan recursos de reproducción
y borran metadatos. Pausar conserva clip y posición para reanudar explícitamente.
Las invalidaciones existentes siguen deteniendo reproducción y rechazando descargas
tardías. Consulta [reproducción en segundo plano](voice.md#background-playback-and-ear-routing)
para limitaciones de plataforma y comprobaciones requeridas sin conexión/reabrir,
sensor, pantalla bloqueada, revocación y cambio de cuenta; el comportamiento físico
aún no está verificado.

Los bytes de voz usan `VoiceAudioCache`, propiedad de `PrivateImageCache`, compartiendo
activación y todos los borrados (cierre de sesión, vencimiento, cambio de cuenta,
eliminación de contacto, 404 de contacto/historial, pérdida de membresía grupal).
Mantiene 8 MiB en memoria y un directorio protegido separado,
`Caches/PrivateAudio-v1`, escrito por el mismo actor `ProtectedDiskCache`: protección
completa, excluido de backups, 64 MiB por cuenta, expulsión por lectura menos reciente
y vencimiento tras siete días inactivo. Las claves incluyen directorio de cuenta,
ID de conversación, mensaje o turno inmutable, lado y parte de respuesta. Las
solicitudes concurrentes comparten descarga, los fallos no se cachean (la burbuja
muestra Reintentar) y los clips salientes aceptados alimentan caché. Un clip que
falló al enviar queda en el store de conversación de sesión con su UUID hasta
reintentarlo o eliminarlo, y ese store no se expulsa mientras tanto. El catálogo de
voces es una `NavigationSnapshotCache` de sesión en `ContactsStore`. La API combina
todas las páginas de voces predeterminadas y guardadas de ElevenLabs de la instalación,
deduplica IDs y guarda solo un resultado completo exitoso durante una hora por
isolate Worker. Cambios de colección no invalidan cachés de sesión cliente: tras
vencer servidor, actualiza explícitamente en iOS o inicia nueva sesión web. Los
fallos del proveedor no reemplazan la instantánea de servidor con lista parcial;
las lecturas vencidas fallan y las instantáneas cliente existentes siguen utilizables.
La carga se limita a 20 segundos y 100 páginas de 100 voces por filtro. No se
persisten metadatos del proveedor en disco. Verifica altas/bajas de colección,
IDs duplicados, colecciones guardadas vacías, múltiples páginas, actualización
fallida y cambio de cuenta en ambos clientes. Consulta [mensajes de voz](voice.md#ios-caching).
Verificación pendiente en dispositivo: reproducir tras navegar y reiniciar, reproducir
clip cacheado sin conexión, reintento de descarga, expulsión por presupuesto y cambio
de cuenta.

### Avatares y forma de onda de burbujas de voz

Ambos clientes reutilizan las cachés versionadas existentes de fotos de cuenta,
contacto y miembros para avatares dentro de burbujas y junto a filas de voz grupal
entrante. Los avatares exterior e interior comparten recurso miembro/versión y
reglas existentes de deduplicación, expulsión e invalidación de cuenta/acceso.
Las burbujas visibles cargan audio inmutable por la caché existente y derivan 37
muestras reales de amplitud RMS. Análisis y reproducción comparten descargas; navegar
repetidamente usa muestras cacheadas o las deriva de bytes cacheados. Los clips
pendientes usan bytes locales sin descarga separada.

iOS almacena muestras derivadas en `VoiceAudioCache` con presupuesto de 256 KiB y
límite de 512 entradas, deduplica análisis concurrente, lo cancela al restablecer/
eliminar y rechaza resultados tardíos de sesión. Decodificar ocurre fuera del
actor principal con fragmentos PCM acotados y archivo temporal protegido eliminado
al completar/cancelar; los archivos obsoletos por interrupción se limpian al inicializar
caché después de 15 minutos. Las muestras nunca persisten. Los bytes protegidos
existentes mantienen presupuestos y vencimiento. Web guarda muestras/análisis en
curso en sus entradas de audio, cobra bytes numéricos contra el mismo presupuesto
de 32 MiB y serializa decodificación. Expulsar elimina muestras y audio; restablecer
borra todo y rechaza análisis tardío. Ningún cliente conserva buffers PCM decodificados.

Los clips silenciosos producen barras mínimas. Los fallos de decodificación muestran
una línea neutral y pueden reintentar al volver al área visible o reproducir, sin
impedir reproducción. La caché no conserva resultados fallidos de muestras. No
cambian API, permisos ni frescura; la autorización del servidor sigue requerida
para audio no cacheado. Consulta [verificación de burbujas de voz](voice.md#voice-bubble-presentation-and-verification)
para comprobaciones pendientes en dispositivo/navegador, incluidas reabrir/volver,
reproducción cacheada sin conexión, fallos de descarga/decodificación, expulsión,
actualización de foto, pérdida de acceso y cambio de cuenta. Hasta ahora esta
presentación solo tiene validación estática.

## Imágenes de grupos

Versiones de avatar e IDs de mensaje usan claves distintas
`group/<id>/avatar/<version>` y `group/<id>/attachment/<messageID>` en la misma caché
de cuenta, compartiendo presupuestos, protección, duración, deduplicación y limpieza
al cerrar sesión. Los envíos confirmados alimentan bytes locales. Perder membresía
en lista, salir/eliminar explícitamente y 404 de historial borran conservadoramente
la caché de cuenta. Las imágenes cacheadas requieren metadatos grupales actualizados
para descubrir revocación; sin conexión pueden quedar hasta esa comprobación. Los
avatares de miembros usan la misma caché con claves de grupo/miembro/versión. Consulta
[multimedia grupal](groups.md#group-photos-attachments-and-voice).

## Actualizaciones de confirmaciones

Los resúmenes Home llevan estado de confirmación saliente e identidad de remitente
grupal con su vista previa cacheada. Los stores grupales conservan estados agregados
por mensaje; el sondeo visible actualiza historial reciente y obtiene solo estados
agregados de IDs salientes antiguos retenidos en lotes de 100. La combinación de
historial conserva la evidencia más fuerte por ID. Home confirma recepción de
vistas previas grupales en una solicitud acotada por conjunto modificado; los fallos
reintentan en actualizaciones posteriores. Las filas confirman lectura solo visibles
en primer plano. Los stores conservan lecturas observadas sin confirmar para
reintentar durante sondeo y rechazan actualizaciones tras invalidación. La deduplicación
exitosa de entrega/lectura sigue el historial retenido más IDs de vista previa y
desaparece con la estructura de sesión. No se persisten datos nuevos de mensajes/
confirmaciones en dispositivo. Las filas de confirmación del servidor usan D1 con
migración 0022 y cascada al eliminar grupo/mensaje; las instantáneas de membresía
sobreviven intencionalmente a la salida de un destinatario. Consulta
[semántica y verificación de confirmaciones](groups.md#delivery-and-read-receipts).

## Navegación grupal y pantallas secundarias

GroupsStore ahora posee `GroupConversationCache`, por lo que salir y volver reutiliza
historial, paginación, instantánea, estado de respuesta e ID de envío incierto.
Apunta a ocho grupos recientes; están exentos los stores visibles y con envío,
solicitud de página antigua o envío sin resolver. Los historiales inactivos conservan
los últimos 100 mensajes y restauran cursor anterior. Se puede exceder el objetivo
si todos están exentos. Expulsar y pérdida confirmada de membresía invalidan stores
y rechazan respuestas tardías.

El historial grupal registra su primera carga exitosa independientemente de la
instantánea. En la primera entrada, la carga sigue visible hasta recibir historial;
los metadatos solos nunca disparan conversación vacía. Los historiales vacíos exitosos
conservan ese estado al actualizar en segundo plano. Los fallos conservan controles
existentes Error/Actualizar, e invalidar restablece indicador de carga de historial
junto con mensajes cacheados.

Chat, detalles de miembros, invitar usuario y agregar contacto comparten instantánea
grupal. Las lecturas concurrentes comparten solicitud. Navegar muestra la instantánea
al instante y revalida; el chat visible sigue sondeando historial y respuesta en el
ciclo compartido de un segundo. Una caché no suprime actualizaciones en vivo. Cambios
de identidad, miembros y permisos invalidan lecturas concurrentes antes de revalidar.
Salir/eliminar explícitamente quita el grupo cacheado. Los envíos de imagen confirmados
por historial también alimentan bytes tras perderse el reconocimiento de envío.

Los avatares de miembros ahora usan `PrivateImageCache`, con aciertos decodificados
síncronos, decodificación en segundo plano, descargas compartidas y disco protegido.
Las claves incluyen grupo, tipo e ID de miembro y versión, conservando contexto de
acceso grupal. Comparten presupuestos y limpieza existentes de cuenta.

ContactsStore posee instancias `NavigationSnapshotCache` separadas para programaciones
y metadatos de compartir, cada una con límite LRU de ocho contactos. Las listas vacías
son valores cacheados exitosos. Reabrir muestra al instante y revalida; programaciones
mantienen sondeo de cinco segundos. Las lecturas concurrentes comparten solicitud
que puede terminar tras navegar. Las mutaciones invalidan lecturas en curso, mantienen
contenido visible y recargan tras éxito. Eliminación, baja confirmada de primera
página y 404 de recurso descartan datos afectados. No se agregan códigos de invitación
ni interruptores de consentimiento a la caché. Todas estas cachés de metadatos e
historial son solo de sesión y desaparecen con su estructura.

Las reglas para funciones futuras viven en [AGENTS.md](../AGENTS.md#cache-by-default).
Verificación en dispositivo: abrir grupo poblado con historial demorado y confirmar
que no destella vacío, abrir uno realmente vacío, reintentar fallo inicial, reabrir
grupo y detalles, revisitar programaciones y compartir (incluidas listas vacías),
volver con reconocimiento de envío incierto, paginar más de 100 mensajes, navegar
más de ocho grupos, reemplazar/quitar fotos de miembros, actualizar sin conexión,
revocar membresía y cambiar cuentas ficticias. La validación estática no demuestra
suavidad de desplazamiento ni latencia medida.

## App web

La [app web](web.md) aplica la misma política a una pestaña, con cachés solo en memoria.

- **Propiedad.** Cada store (`useChats`, `useConversation`, `useGroupConversation`,
  `usePrivateImage`) llama a `registerSessionReset`. Cerrar sesión, un 401 de cualquier
  solicitud autenticada e iniciar con otra cuenta los borran antes de cargar datos
  nuevos. También registran generación o revisión para descartar respuestas tardías
  de sesiones/solicitudes anteriores.
- **Navegación.** Lista de chats, directorio, invitaciones y hasta 20 conversaciones
  privadas/grupales recientes se renderizan sincrónicamente de memoria, incluidos
  resultados vacíos. Los indicadores aparecen solo en primera carga. Las actualizaciones
  corren en segundo plano y los fallos conservan contenido con aviso de reintento.
  Updates y Cuenta ocultan la lista montada en lugar de destruirla, conservando
  Archivados y desplazamiento. Los reintentos de lista/lectura y sondeo de invitaciones
  continúan mientras la pestaña es visible. El menú de navegación no agrega caché,
  cadencia, retención ni invalidación nuevas.
- **Frescura.** El sondeo corre solo con pestaña visible, en la cadencia iOS de un
  segundo (consulta [app web](web.md)), y volver actualiza al instante. La actualización
  combina su página más nueva con historial cacheado por ID: los turnos privados
  siguen `merging` de iOS (intento posterior, actualización posterior, estado más
  avanzado, manteniendo `readAt` más reciente), y las confirmaciones grupales solo
  avanzan Enviado → Recibido → Leído. Si la página nueva no alcanza historial cacheado,
  obtiene hasta diez anteriores para unirlo; más allá, descarta la caché desconectada.
  «Cargar mensajes anteriores» antepone páginas antiguas.
- **Proyección de Home.** Las filas leen conversación cacheada sin reordenar caché:
  un envío pendiente o último turno/mensaje al menos tan reciente como resumen aporta
  vista previa, remitente, reloj y confirmación. Las confirmaciones del resumen se
  concilian con el mensaje grupal correspondiente. Actualizar lista precarga conversaciones
  ya abiertas con actividad nueva, máximo cuatro a la vez, sin confirmarlas recibidas.
- **Lectura.** Las marcas de no leídos pasan por cola de sesión que sobrevive a navegar
  y reintenta con la lista. Se recuerdan marcas confirmadas para impedir que una lista
  obtenida antes de escribir restaure cantidades borradas. Las confirmaciones por
  destinatario se siguen por grupo fuera de reactividad: IDs recibidos/leídos se
  deduplican (acotados al historial retenido), lecturas pendientes sobreviven a fallos
  y vistas previas confirmadas de Home se acotan a IDs actuales.
- **Mutaciones.** Los envíos son optimistas. Un envío pendiente conserva UUID, texto
  y adjunto o clip de voz entre navegación y fallos. Reintentar reenvía mismo UUID
  (idempotente para API), y Editar devuelve texto al compositor (Eliminar descarta
  voz fallida). Editar/eliminar contactos, salir/eliminar grupos y confirmaciones
  actualizan la lista en sitio. Un 404 marca conversación no disponible y la quita.
- **Imágenes.** Avatares y miniaturas se obtienen por proxy y quedan como URLs blob
  en LRU acotado (150 entradas) por ID de cuenta, ruta de acceso y versión o ID de
  mensaje. Las entradas expulsadas/restablecidas se revocan. Los fallos no se cachean.
  La cabecera API `no-store` mantiene bytes fuera de disco del navegador. No van datos
  privados a `localStorage`, IndexedDB ni service worker. Las imágenes abren en visor
  completo dentro de la página con la misma URL blob original de su miniatura de
  portada, sin obtención ni caché adicionales. Las pendientes usan su URL de vista
  previa local. El visor se elimina al cambiar fuente/cuenta o desmontar; el modal
  no sobrevive navegación. Verifica reapertura sin conexión, reemplazar fuente,
  navegación y cambio de cuenta en navegador. Los PDF abren desde URL blob temporal
  revocada después de un minuto.
- **Audio.** Bytes de mensajes y muestras son URLs de objeto en LRU solo en memoria
  de 32 MiB por sesión, por ID de cuenta y ruta de descarga, con descargas deduplicadas,
  fallos no cacheados, alimentación desde clips aceptados y restablecimiento completo
  (reproducción detenida, URLs revocadas) al cerrar/cambiar cuenta. El catálogo de
  voces carga una vez por sesión. Consulta [mensajes de voz](voice.md#web-caching).
- **Energía.** La energía del creador usa hasta ocho instantáneas solo de memoria
  reutilizadas sincrónicamente al entrar, con lecturas compartidas en curso,
  actualización cada cinco segundos con editor visible y restablecimiento que invalida
  lecturas anteriores. Un 404 descarta instantánea. Eliminar contacto y restablecer
  sesión la borran.
- **Borradores de recorte.** Los editores web conservan el bitmap elegido y orientado
  solo mientras el diálogo local está abierto (limitado a 2048 píxeles). Cancelar,
  confirmar, navegar, perder edición y cambiar cuenta lo liberan; las protecciones
  de generación descartan decodificación tardía y codificación tras desmontar. Recortar
  no solicita nada hasta **Usar foto**. Las cargas aceptadas mantienen caché versionada
  existente, sin almacenamiento persistente de fuente. Verifica cancelar/reabrir,
  fallo de carga, navegar y cambiar cuenta; las comprobaciones estáticas no establecen
  estas interacciones.
- **No cacheado.** Compartir, administración de miembros y datos de cuenta siempre
  cargan al abrir porque controlan permisos.

Verificado en navegador sin interfaz con cuentas ficticias: navegación cacheada,
progresión de confirmaciones, borrado de no leídos y cerrar/iniciar sesión. Aún no
verificado: recuperación sin conexión, revocación con chat abierto y puesta al día
de múltiples páginas. Consulta el estado en [app web](web.md#verification-status).

## Energía del contacto

Los detalles del creador reutilizan una `NavigationSnapshotCache<ContactEnergy>` de
sesión de ocho entradas. Cero es un valor cargado. Entrar y actualizar cada cinco
segundos con vista activa comparten lecturas en curso; saldos del servidor cacheados
siguen visibles al reabrir o fallo transitorio. Ningún temporizador local calcula
energía ni autoriza envío. Restablecer invalida solicitudes previas antes de guardar
respuesta; revisiones rechazan tardías tras invalidación/expulsión. Eliminación,
pérdida confirmada de acceso y desmontar stores de cuenta borran entradas. Sin
estado nuevo en disco. Verifica detalles → volver → detalles, saldos cero/lleno,
restablecer durante actualización, sin conexión/reintento, segundo plano/reanudar
y cambiar cuentas ficticias. Consulta [energía](energy.md) para recarga de servidor
y límites independientes de conversación.

## Instantáneas de reacciones

Consulta [reacciones de mensajes](reactions.md) para selector compartido iOS/web,
identidad de actor/mensaje, herramientas de agente, permisos, reintentos de mutación,
frescura de caché de sesión y verificación. Usan sincronización existente y no
agregan no leídos ni alertas push.

## Citas de respuestas

Las [respuestas de mensajes](replies.md#cache) viajan dentro de cargas cacheadas;
no hay caché, solicitud ni disco separados. Los envíos pendientes conservan objetivo
de respuesta con UUID idempotente. Alcanzar un original antiguo pagina historial
mediante **Cargar anteriores** existente, limitado a 20 páginas.

Avisos de membresía (`event`) y citas `beforeJoin` (migración 0081) fluyen por la
caché de historial grupal (`useGroupConversation` web) e instantánea existentes;
no se agregan caché, solicitud ni almacenamiento. Una cita `beforeJoin` nunca pagina
ni obtiene adjunto. El historial conserva `event`; frescura y vistas previas comparan
con el último mensaje no aviso, como campos resumen API.

## Metadatos de conexiones MCP

Ambos clientes cachean un catálogo de cuenta de sesión con máximo dieciséis catálogos
de conectores de 256 KB (unos 4 MB JSON antes de sobrecarga), incluido resultado
vacío. Las cuentas antiguas con más de dieciséis conservan todos los conectores
migrados; su instantánea puede exceder el presupuesto normal hasta quitar redundantes
explícitamente. La migración nunca borra autorización silenciosamente. Los esquemas
se cachean una vez por conector, independientes de asignaciones. iOS usa
NavigationSnapshotCache y web useMcpConnections (clave `account`). Los preajustes
de biblioteca (unas 35 entradas pequeñas) y URI callback OAuth viajan en la misma
instantánea `GET /me/mcp`, evitando una segunda solicitud iOS para callback; los
logos se incluyen con clientes y nunca se descargan. Las listas de acceso de
contacto/grupo usan instantáneas sin esquemas separadas mediante caché iOS y
useMcpAccess existentes, limitadas a ocho listas (hasta dieciséis opciones por
contacto o 32 pares bot/conector por grupo). El descubrimiento completo sigue acotado/
paginado; un fallo conserva la instantánea completa anterior. Buscar es estado
local transitorio. No entran credenciales ni resultados del proveedor. Entrar/
actualizar explícitamente revalida en segundo plano y deduplica lecturas. Las
mutaciones invalidan respuestas anteriores; mutaciones de cuenta invalidan listas
de acceso y revocar contacto invalida listas grupales. Pérdida de acceso, eliminación
y cambio de cuenta rechazan tardías y borran entradas relevantes. Las instantáneas
obsoletas nunca autorizan ejecución. Consulta
[contrato completo de caché y verificación](connectors.md#client-caching).

Activar todas las herramientas usa la mutación existente de permisos: invalida
lecturas pendientes, envía un conjunto completo de huellas y revalida una vez los
permisos guardados. Filtrar búsqueda no reduce alcance de aprobación. La confirmación
retiene la instantánea revisada; el servidor rechaza diferencias de catálogo y
conflictos de actualización condicional sin cambios parciales. Los fallos conservan
contenido y muestran error; sin reintento automático ni caché nueva. Comprueba
cancelación, aprobación filtrada, conflictos de catálogo obsoleto, recuperación sin
conexión, reabrir y cambio de cuenta en ambos; verificación de ejecución/dispositivo
pendiente para aprobación masiva.

Estado OAuth, emisor/alcance públicos y URI callback comparten instantáneas MCP de
sesión. Tokens, estado PKCE, códigos y secretos de cliente no. sessionStorage web
solo mantiene IDs iniciales de flujo/contacto/conexión/usuario durante OAuth a
página completa y los borra al completar/restablecer. La prueba de un uso se elimina
del historial URL antes de completar autenticadamente. iOS mantiene
ASWebAuthenticationSession y flujo correspondiente solo en memoria; navegar/cancelar
no puede completarlo después. Reautorizar invalida aprobaciones de servidor. Ambos
revalidan metadatos y descubren herramientas por separado al completar; un fallo
de catálogo deja cuenta conectada con herramientas que requieren actualizar/revisar.
Consulta la guía OAuth para vencimiento, cambio de cuenta y comprobaciones pendientes.

## Preferencia de modelo de cuenta

El perfil de sesión existente mantiene chatModel. iOS revalida al entrar a Cuenta;
web deduplica lectura de perfil en segundo plano al montar y rechaza lecturas
anteriores a guardar modelo, cerrar o restablecer sesión. Guardar aplica el perfil
devuelto sincrónicamente. Web actualiza indicadores Contributor de listas/grupos
cacheados y rechaza instantáneas anteriores sin borrar historial, borradores ni
UUID pendientes. iOS cancela lecturas de detalles grupales, quita instantáneas
secundarias de compartir, despierta sincronización de listas y actualiza indicadores
de consentimiento de invitación; detalles revalidan al reabrir. No cambian retención
acotada, expulsión ni aislamiento. La caché de respuestas del gateway se omite
porque la tarea es observar costos e incluye estado privado/llamadas a herramientas.

Consulta [ajustes de modelo](model-settings.md) para API, consentimiento compartido,
comportamiento de caché, gasto AI Gateway y verificación pendiente durante ejecución/
en dispositivo.

## Checkpoints de generación grupal

Investigación y finalización grupales reutilizan checkpoints de Workflow del servidor
limitados a una respuesta, intento, borrador/revisión y nombre de paso. Son resultados
duraderos de cálculo, no caché cliente nueva. Los resultados exitosos de inferencia/
herramientas se reutilizan al repetir; recuperar formato no puede invalidarlos ni
conceder ejecuciones adicionales. MCP conserva reservas/confirmaciones de la respuesta
y permisos actuales antes de inferencia/ejecución nueva. La protección de marca de
publicación y cachés de conversación de sesión siguen siendo autoridad para historial
visible y rechazo de tardías. Sin persistencia cliente extra.

Las instantáneas de contexto incluyen historial acotado y referencias a adjuntos;
los bytes se cargan de R2 privado dentro de pasos de inferencia y nunca persisten
en su salida. Las respuestas del modelo conservan límites de transporte 256 KiB
y texto de 20,000 puntos de código; investigar admite máximo seis rondas y seis
resultados acotados (24 KB cada uno para MCP), luego decisión final separada. La
retención privada operativa de checkpoints la administra Workflow existente; no es
LRU de navegación ni log público. La instantánea no se convierte en memoria compartida/
propia. Revocar acceso y cambiar cuenta siguen invalidando permisos cliente y
rechazando respuestas tardías UI. La inferencia comprueba acceso grupal actual y
autorización de confirmaciones externas guardadas; publicar aún comprueba membresía/
consentimiento e historial actuales.

Las comprobaciones estáticas no verifican reabrir/volver, historial vacío, actualizar,
recuperación sin conexión, mutaciones, revocación ni cambio de cuenta en dispositivo.
Verifica ambos clientes tras release autorizado con datos MCP ficticios, incluido
cerrar durante investigación y volver tras respuesta final.

## Memoria de agente local a la conversación

La memoria MCP local es solo de servidor y se arma durante generación; los clientes
no obtienen ni persisten perfiles de hechos/persona. No cambian cargas API, claves
de caché de sesión, deduplicación, presupuestos de retención, expulsión ni invalidación
por mutación. Ambos clientes muestran la misma explicación de retención local antes
de conceder conectores. Conceder usa actualización e invalidación de acceso existentes;
desconectar nunca promueve conocimiento local a un perfil compartido. Verifica
reabrir/volver, actualización fallida, conceder/revocar, quitar miembro y cambiar
cuenta con memorias locales ficticias en ambos tras release autorizado. Pendiente
en dispositivo.

## Presentación de fallos de respuesta

Los errores son proyecciones de mensajes de sesión e instantáneas grupales existentes,
no una caché separada. Los metadatos fuente grupales comparten deduplicación, expulsión,
rechazo de revisión e invalidación por cuenta/membresía. Actualizar instantánea
elimina fallos resueltos; las comprobaciones de mensajes cargados ocultan inmediatamente
un aviso obsoleto si ya está el mensaje posterior del mismo bot. La visibilidad
privada se deriva de secuencia de turnos y texto posterior guardado del asistente.
No hay persistencia local de descarte ni finalización optimista. Reintentar usa
admisión y actualización existentes; reintentos obsoletos/resueltos devuelven 409
en lugar de afirmar silenciosamente que empezó trabajo nuevo. Recuperar en servidor
conserva ID de turno/respuesta, para que combinación/orden de finalización y sondeo
manejen normalmente su mensaje guardado.

Con datos ficticios, verifica ambos: un agente fallido entre exitosos en grupo,
avisos bajo la fuente correcta humana/bot, cargar fuentes anteriores, recargar/volver
con fallo antiguo, respuestas posteriores de otro frente al mismo bot, fallo privado
seguido de éxito, reintento/actualización fallidos, reabrir sin conexión, quitar acceso
y cambiar cuenta. Pendientes vista/dispositivo; tipos estáticos no establecen
desplazamiento ni accesibilidad.

## Presentación Markdown

El formato de mensajes bot y vistas previas compactas se deriva sincrónicamente del
texto fuente en instantáneas existentes privadas/grupales de sesión. No agrega
obtención de red, persistencia de disco, caché alternativa ni resultados de parser
retenidos entre cuentas. Web conserva HTML calculado solo por mensaje montado y
lo invalida al cambiar texto; iOS deriva bloques con atributos del texto actual al
disponer contenido. Paginación, presupuestos, rechazo de tardías, invalidación por
acceso y expulsión al cerrar/cambiar cuenta siguen siendo autoridad. Reabrir historial
cacheado lo formatea sin esperar revalidar, incluso sin conexión. Los envíos humanos
pendientes mantienen texto literal e IDs idempotentes. Pasaron comprobaciones
estáticas cliente; pendiente verificación visual/sin conexión/cambio de cuenta.
Consulta [contrato de formato y verificación](chats.md#bot-message-markdown).

Los campos opcionales `lastMessagePreview` y `previewText` de cita/actividad comparten
instantáneas y duración/invalidación existentes; no son caché separada. Las proyecciones
de conversación actualizan resumen plano junto al texto original y metadatos de
remitente, incluidos mensajes humanos optimistas, para que no sobreviva el resumen
de un bot anterior a un mensaje nuevo. Los resúmenes del servidor analizan fuente
bot completa antes de recortar; las instantáneas anteriores usan respaldo cliente.
No se basan fechas ni comparaciones de fuente en la vista previa limpia.

## Experimentos nativos

Los experimentos NFC, focus, recetas y habla nativa están retirados desde el
30/10/2026. Al activarse, iOS cruza tipos guardados con lista activa permitida y
elimina fechas automáticas retiradas, persistiendo ajustes filtrados. Siguen
 disponibles instantáneas/confirmaciones históricas; las solicitudes retiradas no
pueden ejecutar. Las actividades antiguas focus/recetas activas terminan. No se
agrega caché ni retención. Verifica actualizar desde ajustes antiguos, reabrir sin
conexión, cambiar cuenta y temporizadores/alarmas restantes en dispositivo; no
cambia guía/caché del navegador.

El store `NativeExperiments` de sesión retiene hasta 20 listas de acciones por
contacto de 50 registros. Cachea vacíos; frescura de cinco segundos y solicitudes
compartidas evitan cargas repetidas al navegar. La pantalla activa y un ejecutor
automático en primer plano comparten caché y revalidan cada cinco segundos; cambios
de respuesta y actualización explícita también la actualizan. Fallos transitorios
conservan listas, y cambio de cuenta/pérdida confirmada de acceso rechazan tardías
y borran estado aplicable. Fechas de activación por tipo viven en ajustes locales
por cuenta y excluyen propuestas antiguas. Desactivar elimina fecha; reactivar
inicia corte nuevo. No se sincronizan en nube ni comparten mediante App Group.
La sesión registra IDs automáticos intentados para no reintentar ejecución incierta;
restablecer borra el conjunto. Los errores conservan recuperación manual en la lista
y aparecen en banner descartable. El respaldo de capacidades de API antigua reintenta
una vez un mensaje rechazado con mismo ID/contenido, omitiendo solo la indicación
opcional de tipos automáticos. No restablece envío cacheado ni reintenta reclamaciones.
Nunca se repiten automáticamente reclamaciones de operación. Consulta
[experimentos nativos](native-experiments.md#cloud-action-contract-and-failure-handling).

El App Group base contiene identidades explícitamente habilitadas y borradores
compartidos acotados por cuenta (diez × 5 MB, vencimiento 24 horas), con protección
completa. Las credenciales siguen en Keychain de la app principal. La ejecución
remota opcional agrega lista protegida y traspaso de IDs descritos abajo. Abrir en
frío la misma cuenta conserva borradores; cerrar/reemplazar cuenta los borra. Se
eliminan al enviar/descartar, no al navegar. Instantáneas de identidad idénticas no
reescriben almacenamiento ni recargan widgets. Las líneas temporales solicitan
actualización de 15 minutos, sujeta a iOS. No hay caché de disco de propuestas nativas;
no cambian reglas de imágenes privadas. La guía enumera comprobaciones de ciclo de
vida/fallos pendientes hasta ejecutarlas en dispositivo firmado.

Administrar AlarmKit nativo conserva un registro separado protegido en Application
Support de hasta 200 IDs/títulos e identidades de cuenta/contacto, incluso al cerrar
sesión, para administrar alarmas que siguen en iOS. La vista filtra registros propios;
actualizar con autorización depura alarmas eliminadas del sistema. No es caché de
red ni memoria del agente y no se expone al App Group ni herramientas del modelo.

## Iniciativa de conversación

El campo por participante `initiativeEnabled` usa caché de contactos e aislamiento,
frescura, paginación y presupuestos existentes. No agrega caché cliente ni retención
privada de disco. Detalles iOS usa frescura de 30 segundos y actualización deduplicada;
web actualiza en segundo plano al entrar. Ambos reutilizan contactos cargados
sincrónicamente y conservan contenido ante errores. Una mutación confirmada reemplaza
contacto cacheado y rechaza lecturas anteriores; los controles serializan mutaciones
y conservan ajuste confirmado si falla. Eliminación/pérdida de acceso y cambios de
cuenta usan invalidación existente, con generación que rechaza tardías. Los seguimientos
son turnos completados solo del asistente y usan revalidación normal de conversación/
lista, paginación y confirmaciones. Los planes no tienen instantánea cliente ni
endpoint de sondeo. Consulta [iniciativa](initiative.md) para retención de servidor
y matriz pendiente de verificación entre clientes.

La cadencia más rápida (migración 0033) solo cambia planificación de servidor y
prompts. iOS y web conservan cachés, intervalos, frescura, reutilización de vacíos,
aislamiento y rechazo de tardías. No agrega cuenta regresiva cliente, caché de
ajustes, cambio de paginación ni disco. Los mensajes siguen entrando por historial/
lectura/vista previa normales.

La iniciativa adaptativa (0065) deriva actividad/receptividad de como máximo 160
turnos completados durante 28 días de chat de este participante. Son estadísticas
locales a solicitud, no caché materializada ni cliente. Los comentarios categóricos
vinculados a fuente permanecen en sus turnos originales; la pausa explícita queda
en el contacto.

Bienvenidas y reactivación (0094) son solo de servidor. Llegan como turnos ordinarios
del asistente por historial, lista, no leídos y push existentes; no cambian caché,
intervalo de sondeo ni estado retenido. Ninguna se copia a memoria factual compartida
ni perfil de otro participante. Vaciar historial elimina etiquetas y pausa incluso
si se conserva memoria factual; eliminar contacto/cuenta hace cascada. Archivar
cancela el plan. Las oportunidades ambientales finitas siguen en plan D1 y checkpoints
Workflow acotados, sin solicitudes, paginación ni disco extra. No cambian invalidación
por mutación ni protecciones de historial/cuenta/acceso. La ayuda ahora explica
 tiempos adaptativos; pendientes reabrir/volver, actualizar, sin conexión, mutación
fallida, revocación y cambio de cuenta.

El estado nativo dentro de app reutiliza lista acotada de acciones para confirmaciones
por mensaje. Agrega instantánea AlarmKit en memoria filtrada por cuenta para máximo
200 IDs locales ya existentes; no cambia registro ni retención. La secuencia
`alarmUpdates` y actualización de primer plano concilian bajas del sistema, pausas/
reanudaciones y alertas sin red. Las líneas temporales de un segundo leen ActivityKit
local, nunca sondean API ni persisten presentación. Borrar cuenta descarta instantáneas.
Un fallo transitorio del store del sistema conserva IDs conocidos; se muestra estado
no disponible hasta actualizar exitosamente. Tarjetas en vivo focus/recetas/habla
usan actividades existentes y altavoz de sesión. Este estado no requiere caché
independiente de red. Las lecturas de confirmaciones del modelo se acotan a diez
resultados terminales por contacto/persona/dispositivo; no cachean ni exponen estado ajeno.

### Delegación remota de temporizadores/alarmas de contactos compartidos

La migración 0083 amplía instantánea remota con dispositivos propios/delegados,
nombres actuales y autorizaciones salientes. iOS usa
`ContactsStore.remoteSnapshots` / `NavigationSnapshotCache` de sesión (ocho instantáneas
acotadas), y web mantiene caché de veinte contactos. Ambos actualizan cada cinco
segundos visibles/activos, reutilizan cargadas/vacías al navegar, deduplican lecturas
y admiten actualización explícita. Las respuestas se limitan a diez teléfonos,
tres participantes, treinta autorizaciones salientes y veinte confirmaciones.
Las mutaciones exitosas actualizan autorización al instante, invalidan lecturas
anteriores y actualizan; las barreras por contacto serializan cambios de permiso.
Un fallo transitorio conserva datos utilizables. La pérdida confirmada de contacto/
acceso quita instantáneas; reemplazar cuenta descarta propietarios de sesión y
rechaza tardías. Cambiar modelo invalida instantáneas iOS. Sin retención nueva de
disco. Un teléfono seleccionado revocado/no disponible sigue como objetivo explícito
y falla autorización de servidor en lugar de cambiar a otro. Los envíos pendientes
conservan objetivo y UUID al reintentar. Consulta
[verificación de delegación](native-remote.md#delegation-cache-and-verification)
para comprobaciones requeridas de reabrir, vacío, sin conexión, revocar/reactivar
y cambiar cuenta.

### Prototipo remoto de temporizadores/alarmas

La [ejecución nativa remota](native-remote.md#local-storage-and-cache) agrega
instantáneas web de dispositivos/confirmaciones de sesión para hasta 20 contactos,
con frescura de cinco segundos, lecturas compartidas, reutilización de vacío,
invalidación por acceso/sesión y rechazo de tardías. Revocar actualiza opciones
cacheadas; un envío pendiente conserva dispositivo, zona horaria e ID originales.
No hay persistencia de disco del navegador.

En iOS la preferencia remota por cuenta vive con ajustes nativos. El App Group
contiene solo la lista autorizada de ejecución y hasta 200 registros de traspaso
 de alarmas, legibles bloqueado tras primer desbloqueo mediante protección hasta
primera autenticación. Los tokens principales permanecen en Keychain. Los borradores
con protección completa no cambian. Cerrar/reemplazar cuenta borra lista de ejecución;
los IDs posiblemente programados quedan para conciliación de la misma cuenta. La
app principal importa IDs confirmados al registro protegido y depura traspasos no
activos vencidos al actualizar autorizadamente. Consulta la guía para retención,
casos de dispositivo y verificación pendiente de identidad cliente.

## Envíos privados consecutivos y escritura

Las conversaciones conservan stores de sesión, paginación, recuperación por UUID,
revisiones, sondeo, expulsión e invalidación de cuenta existentes. Los turnos aceptados
se combinan de inmediato, permitiendo el siguiente envío independientemente de la
respuesta. Un envío HTTP sin resolver sigue protegido por cliente; escribir otro
borrador no lo reemplaza. Los mensajes agrupados por servidor se normalizan como
turnos completados solo de usuario y se combinan por orden de estado existente;
su texto sigue visible sin confirmaciones inventadas del asistente.

La escritura no se cachea ni persiste deliberadamente en clientes: es una fecha
efímera de seis segundos en la visita existente del servidor, sin borrador. El foco
solo no la actualiza. Abrir un borrador cacheado no recrea escritura. Las solicitudes
de actividad no obtienen instantáneas ni cambian autoridad de permisos. Web rechaza
renovar una visita/contacto reemplazado y cierra visitas al ocultarse; iOS renueva
con ediciones reales posteriores. La limpieza existente elimina filas vencidas tras
un día. No se agrega retención privada de disco.

Verifica reabrir/volver cacheado, múltiples envíos, chat vacío, actualización explícita,
envío/respuesta demorados, recuperación sin conexión, pérdida de acceso y cambio de
cuenta, además de dejar teclado/borrador inactivos. Pendientes comprobaciones de
ejecución/dispositivo; tipos no establecen UI.

### Presentación cronológica del chat privado

Los stores siguen poseyendo turnos por secuencia; una línea temporal derivada divide
cada turno en elementos humano (`createdAt`) y asistente (publicación `updatedAt`)
con IDs estables de turno/lado. Fechas iguales desempatan por lado, secuencia e ID.
Solo cambia presentación; cursores, combinación de estado, identidades de respuesta/
reacción, reintentos UUID, presupuestos LRU e invalidación conservan reglas. Los
envíos optimistas web y salientes iOS entran en su hora local hasta llegar fecha
aceptada del servidor. Sin red ni persistencia privada extra. La observación de
desplazamiento y actualización de confirmaciones nativas iOS detectan cambios tardíos
 de turnos anteriores además de la última secuencia.

La API puede normalizar un turno conversacional en curso como completado solo de
usuario si llega entrada elegible nueva antes de publicar. Ambos clientes ya
combinan este terminal. Solo se descarta borrador no publicado sin herramientas;
respuestas y confirmaciones existentes permanecen. Reabrir/volver, actualizar,
combinar páginas, envíos optimistas, fechas iguales, navegación de citas, confirmaciones,
revocación y cambiar cuenta requieren ejecución; pasaron tipos/SQL estáticos.

## Miniapps

`read_mini_app` conversacional usa lectura D1 nueva de chat privado, sin caché extra:
una respuesta IA debe usar las últimas entradas guardadas exitosamente, no una
vista resuelta posiblemente obsoleta. Definición y estado se leen juntos; páginas
posteriores requieren la misma revisión/versión o reiniciar. No agrega disco ni
ejecución automática de conectores. Es comportamiento compartido iOS/web; las cachés
y colas optimistas siguientes no cambian. Consulta
[acceso al contenido guardado](mini-apps.md#discussing-saved-content-2026-10-31)
para límites y verificación pendiente.

Las [miniapps](mini-apps.md) usan lista de sesión por base `contacts/<id>` o
`groups/<id>` (máximo 20 listas, frescura cinco segundos, revalidadas por sondeo de
chat visible y detalles de contacto/grupo) y vista resuelta por app (máximo 16,
expulsión por carga más antigua) en iOS (`MiniAppStore` dentro de `ContactsStore`
para privadas y de `GroupConversationCache` para grupales) y web (`useMiniApps`).
El chat grupal fuerza actualizar lista al cambiar último mensaje, porque una app
compartida se crea justo antes del mensaje de tarjeta. Salir/eliminar/perder grupo
descarta lista y vistas. Una vista se reutiliza 60 segundos porque cada carga ejecuta
lecturas remotas. Acciones locales sin lecturas remotas devuelven vista actualizada,
que reemplaza la cacheada salvo carga más reciente iniciada; de lo contrario,
completar acción fuerza recargar. Actualizar explícitamente, arrastrar, cambiar
entrada o completar acción omiten la ventana. Las cargas se deduplican; nueva
selección, invalidación o cambio de cuenta rechazan tardías. Los fallos transitorios
conservan vista; fallo inicial muestra reintento. Aprobar, desactivar y eliminar
reemplazan entrada y descartan vista. Un 404 o `REVIEW_REQUIRED` borra vista y
revalida lista. Quitar contacto, perder acceso confirmado y cerrar sesión borran
ambas. Los datos resueltos de conectores solo viven en memoria, sin disco. Una acción
pendiente conserva UUID de ejecución solo en estado de pantalla; salir lo descarta
y nunca reenvía un resultado desconocido. Pendientes reabrir, volver, actualizar,
sin conexión, revocación y cambiar cuenta en dispositivo.

Las pulsaciones locales y ediciones directas de componentes vinculados (interruptor,
opción, entrada, filas de comprobación) se encolan por vista en memoria y aplican
al instante al estado mostrado. Se envían en orden, cada una con UUID. Una respuesta
con `resolution` reemplaza vista cacheada; se muestra esa vista más pulsaciones
pendientes. Un fallo transitorio reintenta mismo UUID dos veces, luego descarta cola
y recarga. Salir mantiene cola en store de sesión. Cambio de cuenta e invalidación
de vista la descartan y rechazan tardías.

## Instantáneas y borradores de personalidad

El [editor de personalidad](personality.md) usa `NavigationSnapshotCache` más
objetos `PersonalityDraft` de sesión en `ContactsStore` iOS, y `usePersonality` web.
Cada uno presupuesta ocho entradas en memoria. Los guardados activos están protegidos
de expulsión normal y pueden excederlo temporalmente. No se persisten perfil,
borrador modificado ni estado derivado de relaciones en disco cliente.

Las especialidades viven en mismas instantáneas y borradores que identidad/rasgos,
con mismo presupuesto de ocho, revisiones e invalidación. No se agrega solicitud,
caché persistente ni catálogo de capacidades. Los perfiles antiguos normalizan
especialidades ausentes a texto vacío.

La última instantánea (incluso predeterminada desactivada/vacía) se reutiliza al
instante. Abrir/reabrir revalida en segundo plano; iOS también al primer plano.
Actualizar explícitamente pregunta antes de descartar borrador modificado. Su
revisión de servidor nunca avanza silenciosamente al revalidar. Las solicitudes
deduplican, guardar invalida lecturas y el éxito actualiza instantánea y borrador.
Los errores conservan datos/entrada; eliminación/pérdida confirmada y cambios de
cuenta borran estado y rechazan tardías. Sin paginación ni caché nueva de imágenes.
Edad/cumpleaños se actualizan al navegar o actualizar explícitamente; el contexto
de respuesta siempre deriva fecha actual en servidor.

Verifica que especialidades sobrevivan reabrir/volver y guardados fallidos, se borren
al cambiar cuenta y preserven ediciones al actualizar. Verifica valores vacíos,
actualizar/descartar, lecturas sin conexión y guardados fallidos, ediciones concurrentes/
409, guardar pendiente al navegar, expulsión, eliminar/revocar y cambiar cuenta en
ambos. Pendientes en dispositivo/navegador; tipos no establecen UI.

Proyecciones de relación y planes de actuación son solo de servidor y nunca se
cachean ni persisten en clientes. Se reconstruyen desde fuentes elegibles actuales
por preparación/revisión, volviendo a comprobar consentimiento e aislamiento de
conectores. El texto de ambos editores explica continuidad sin causas privadas y
excepción de conectores. Su API de instantánea/borrador y retención no cambian por
continuidad; sin estado UI de red adicional.

## Incorporación del primer círculo

Ambos clientes conservan una instantánea de opciones, progreso y borrador de sesión;
se cachean vacíos/pendientes. Primeras lecturas cargan, navegar reutiliza y revalida
en segundo plano. Lecturas y envíos se deduplican. Revisiones de mutación/sesión
rechazan obsoletas y cerrar/vencer/cambiar cuenta borra todo. Sondeo de 3 segundos
al generar y 10 en otro caso, con actualización manual tras errores. Las tareas
de envío pendientes sobreviven navegación. Los borradores solo persisten en memoria;
entrada/planes de identidad aceptados persisten en D1 para reanudar, sin vencimiento
automático. Sin paginación para recurso único; listas fijas más una instantánea/
borrador acotan memoria. Las claves de avatar conservan cuenta, contexto de acceso,
identidad de agente y versión inmutable en caché privada existente. Consulta
[incorporación](onboarding.md#cache-and-account-isolation) para recuperación, mutaciones
y verificación pendiente de dispositivo/navegador.

Con [configuración progresiva](onboarding.md#progressive-setup), la misma instantánea
sirve a la lista: se obtiene una vez al aparecer Chats por sesión (sin catálogo de
opciones) y cada 3 segundos mientras el círculo está en cola/generándose, y para
al completar/fallar. Los contactos aparecen y se activan mediante caché de lista y
revalidación existentes; `setupPending` es campo del contacto cacheado, de modo que
una fila obsoleta sigue desactivada hasta la próxima actualización como máximo.
Reintentar reemplaza instantánea e incrementa revisión para que una lectura antigua
no la sobrescriba.

## Imágenes de perfil bajo demanda en contexto del modelo

La ruta `view_profile_photo` de la API compartida iOS/web evita intencionalmente
caché persistente de imágenes de inferencia. Cada inferencia revalida membresía,
consentimiento y versión inmutable solicitada, lee R2 dentro del paso y comprueba
acceso/versión otra vez después. Los checkpoints solo guardan referencias; los bytes
transitorios se deduplican por miembro y limitan a tres imágenes y 8 MiB por inferencia.
Ausentes/reemplazadas/revocadas producen marcador no disponible. Esto impide que
un checkpoint o imagen cacheada conceda acceso posterior. `PrivateImageCache` cliente
y cachés web mantienen comportamiento e invalidación; no se agrega estado de red
cliente ni carga al navegar. Consulta [fotos de perfil](profile-photos.md#profile-images-available-to-contacts)
para casos con datos ficticios; comportamiento en dispositivo/modelo real pendiente.

La edad de incorporación sigue el mismo ciclo de borrador e instantánea de sesión.
La nueva entrada exige edad entera 1–120; la antigua sin edad se decodifica vacía,
conserva configuración guardada inmutable y puede reintentar. Mutaciones/cambios de
cuenta rechazan tardías y ningún cliente agrega retención de edad en disco. Los
planes y retratos se reutilizan sin regenerarse tras actualizar el prompt de edad.

## Secuencias de respuesta entregadas

Las partes privadas viven en ChatTurn cacheado existente iOS/web. IDs estables y
fechas renderizan burbujas separadas; el texto agregado sigue disponible para vistas
previas/compatibilidad. Se aplican sin cambios protecciones de intento/hora,
deduplicación, paginación y expulsión. No entran salida no enviada del modelo,
temporizador cliente ni copia de disco extra. Reabrir muestra prefijo entregado
cacheado al instante y sincronizar anexa partes nuevas; perder acceso/cambiar cuenta
lo invalida con su conversación. Las partes grupales usan filas y caché normales.
Las esperas de composición por longitud solo corren en Workflow; ambos clientes
sondean el mismo prefijo y Escribiendo/Grabando actuales. Nunca retienen una respuesta
completa para liberarla con temporizador. Un cliente sin conexión/suspendido puede
recibir varias partes ya publicadas en una actualización; los intervalos solo se
observan sincronizando en vivo. Comprueba reabrir/volver, historial vacío/antiguo,
sin conexión, entrada nueva durante ráfaga, tardías, revocación y cambiar cuenta
según [mensajes sucesivos](reply-messages.md).

## Permisos de texto privado grupal

Los ajustes viven en instantáneas grupales existentes: GroupChatStore iOS y caché
web de sesión de 20 conversaciones grupales. Los arreglos vacíos son resultados
cargados reutilizables. Detalles renderiza caché al instante y revalida al entrar/
actualizar explícitamente. Las solicitudes concurrentes comparten una; invalidar
por mutación rechaza finalizaciones anteriores y conceder/revocar exitosamente
actualiza interruptores antes de revalidar. Sin conexión/fallos conservan contenido.
Se aplican expulsión, borrado por acceso y restablecimiento existentes. No agrega
disco ni caché de transcripción privada sin procesar. La autorización es en vivo
en cada recuperación; revocar cancela intentos grupales afectados para invalidar
también checkpoints de modelo. Valida reabrir/volver, vacío, actualización fallida
tras mutar, revocación y cambiar cuenta en dispositivo/navegador; estático no basta.

## Instantáneas de escritura grupal

`replies[].isTyping` grupal viaja en instantáneas de sesión y sondeo visible de un
segundo existentes iOS/web. Ambos exigen 1 explícito y estado en curso; las instantáneas
antiguas sin campo no muestran escritura. Ocupar cola nunca predice escritura.
No agrega solicitud, caché, disco, retención, paginación ni política de expulsión.
La revalidación reemplaza estado transitorio con protecciones existentes; sin
conexión puede conservar lo último observado hasta actualizar con éxito. Eliminar,
perder acceso y cambiar cuenta usan invalidación existente. Verifica reabrir, volver,
actualizar, recuperación sin conexión, revocación y cambiar cuentas ficticias en
ambos; pendientes comprobaciones de ejecución/visuales.

### Posicionamiento de historial iOS

Chats privados y grupos miden todas las filas cargadas con `VStack` normal para que
posicionar al final no dependa de estimaciones diferidas de altura de mensajes
largos. Navegar desde caché conserva ancla inferior predeterminada; la primera carga
asíncrona posiciona sin animación. Actualizaciones privadas solo de confirmación
no solicitan otro desplazamiento. `ScrollPosition` nativo apunta al borde inferior
incluidos márgenes de desplazamiento. Siguiendo lo último, cambios inactivos de
contenido/área/márgenes realinean sin animación; cambiar solo offset no lo provoca.
Interacción de desplazamiento, cargar anteriores y navegar citas desactivan alineación
hasta desplazarse explícitamente a lo último. El fundido del botón se limita a su
superposición. No cambian propiedad, frescura, deduplicación, rechazo de tardías,
paginación, compactación, LRU, envíos pendientes, invalidación ni persistencia; sin
obtención ni caché nuevas. El costo del diseño inmediato crece con páginas cargadas
explícitamente. Verifica reabrir en frío/cacheado y volver, últimos mensajes largos,
páginas antiguas, citas, teclado, actualizar sin conexión, eliminar/revocar y cambiar
cuenta en dispositivo. Lo estático no demuestra fluidez ni rendimiento de historiales grandes.

## Citas escritas por contactos

Las citas privadas viajan en `assistantMessages` entregados y las grupales en mensajes
normales. Las cachés de conversación de sesión retienen cargas; sin obtención,
disco, caché de imágenes ni temporizador nuevos. Revalidar resuelve citas desde
historial autorizado actual; no cambian protecciones de intento/hora, paginación,
expulsión, invalidación por acceso ni aislamiento. Verifica citas tras reabrir,
recuperación sin conexión, paginación y cambio de cuenta en ambos. Una cita cacheada
nunca concede acceso al original.

La participación contextual de grupos reutiliza instantáneas de ronda/historial
existentes en ambos. Omitir no publica ni expone borrador; el sondeo actualiza estado
y presencia sin burbuja sintética ni caché paralela. Verifica rondas vacías/omitidas
al reabrir, recuperar sin conexión y cambiar cuenta.

Las respuestas grupales terminales cierran atómicamente sus propias continuaciones
bot en cola al publicar. Sin entradas de caché, mensajes sintéticos ni sondeo nuevo.
Las instantáneas revalidan cola/presencia iOS/web. Confirma estabilidad al navegar/
recuperar sin conexión y que tráfico humano nuevo actualice tras quedar en silencio.

## Imágenes generadas del asistente

iOS proporciona el lado asistente mediante elementos de consulta del constructor
en lugar de incrustarlo en la ruta URL. No cambian identidades, presupuestos ni
invalidación por acceso. Tras instalar cliente corregido, reintenta imagen fallida,
ábrela completa y desde multimedia y reabre; verifica también imagen humana del
mismo turno, recuperación sin conexión y cambiar cuenta. Pendiente en dispositivo.

Los metadatos privados generados son parte del mensaje entregado, para rechazar
obsoletos mediante combinación de intento/hora. La ruta de bytes tiene
`?side=assistant`; iOS agrega `assistantAttachment` al enum de recursos existente
PrivateImageCache. Las claves inmutables distintas incluyen identidad conversación/
turno y límite de cuenta, evitando colisiones con adjuntos humanos. Miniaturas y
completas usan misma caché, presupuestos y disco protegido, con expulsión,
deduplicación, invalidación por acceso/cuenta y cancelación normales. Grupos reutilizan
claves de adjuntos. Ninguna vista agrega sondeo o descarga. Verifica reabrir/volver,
actualizar, sin conexión, publicación, eliminar, revocar y cambiar cuenta en ambos.
Consulta [imágenes generadas](generated-images.md) para retención de bytes y limpieza.

## Multimedia de detalles de chat

Ambos mantienen una lista de páginas de sesión por chat/tipo (`image` o `file`):
`NavigationSnapshotCache<ChatMediaPage>` iOS (en `ContactsStore` para privadas y
`GroupConversationCache` para grupos, ocho entradas LRU) y `useChatMedia` web
(24 entradas). Solo tienen metadatos; miniaturas cargan por
`PrivateImageCache`/`usePrivateImage` con mismas claves que burbujas
(`contact/:id/attachment/:turn`, `contact/:id/assistant-attachment/:turn`,
`group/:id/attachment/:message`). Las imágenes 2–3 de álbum generado agregan
`/image/N` a claves iOS e `image=N` a rutas web; imagen 0 mantiene original
([álbumes](generated-images.md#albums)).

- Reabrir detalles muestra página cacheada al instante, incluso vacía, y revalida
  primera en segundo plano (iOS cada visita, web tras 15 segundos). Actualizar
  reemplaza por primera página y descarta posteriores.
- **Cargar más** anexa siguiente; primeras solicitudes se deduplican.
- Fallos transitorios conservan lista; 403/404 la borra.
- Quitar contacto, salir/perder grupo y cerrar sesión descartan listas
  (`forgetConversation`/`forgetGroup` web; rutas de eliminación de stores iOS).
- No se escribe disco salvo caché protegida existente de imágenes.

Pendiente en dispositivo: reabrir detalles tras enviar imagen, cambiar pestañas
al cargar, obtener más páginas, salir de grupo con detalles abiertos y cambiar cuenta.

## Documentos de chat

Los informes de investigación web agregan procedencia anulable a instantáneas de
lista/detalle existentes. Ambos reutilizan entradas de sesión para panel de fuentes
e insignia, incluidas listas vacías. No hay solicitud de fuentes ni búsqueda al
navegar/actualizar. Deduplicación, rechazo de tardías, frescura, mutaciones, LRU,
invalidación por acceso y borrado de cuenta siguen como documentos normales. La
procedencia original queda fija al editar y se elimina con documento. Verifica
reabrir/volver, actualizar, sin conexión, eliminar, revocar y cambiar cuenta en
ambos; estático no verifica presentación. Consulta [investigación web](web-research.md).

Por chat hay lista (solo resúmenes) y hasta ocho (iOS, `NavigationSnapshotCache`)
o 16 (web, `useDocuments`) documentos abiertos en memoria, nunca disco. El chat
actualiza lista ante respuestas nuevas para mostrar tarjetas; visor abierto revalida
cada cinco segundos pero nunca reemplaza borrador abierto. Guardar reemplaza documento
y invalida lista; 409 recarga y conserva borrador para decidir. 404 borra entrada.
Quitar contacto, salir de grupo y cerrar sesión descartan listas. Pendiente en dispositivo.

## Tableros de tareas

Un tablero (`{ lists, members }`) por chat: `NavigationSnapshotCache<TaskBoard>` iOS
(`ContactsStore.taskSnapshots`, `GroupConversationCache.tasks`) y `useTasks` web
(16 entradas). Reabrir muestra caché al instante y revalida; visible, cada cinco
segundos porque los contactos cambian tareas en sus turnos. Editar devuelve tablero
completo que reemplaza caché; en web editar pendiente bloquea sobrescritura por
sondeo. Un fallo muestra error y recarga. Los transitorios conservan tablero;
404 muestra no disponible. Quitar contacto, salir y cerrar sesión descartan tableros.
Sin disco. Pendiente en dispositivo.

Trabajo persistente (0054): estado, siguiente paso, evidencia, motivo de bloqueo
y consumo de turnos viajan en este mismo tablero. Pausar/reanudar/cancelar y editar
progreso usan PATCH versionado y reemplazo completo existentes. No agrega permisos
optimistas, solicitudes independientes, disco ni claves. El sondeo puede mostrar
turno antiguo en cola hasta que Workflow observe generación revocada; admisión/
publicación de servidor siguen siendo autoridad. Comprueba reabrir/volver, tableros
vacíos cacheados, actualizar explícitamente, sin conexión, editor antiguo contra
progreso de fondo (409), pausar/reanudar desde otro cliente, cancelar, perder acceso
y cambiar cuenta con datos ficticios. Validación estática no establece esos comportamientos.

## Índice interno de descripciones de imágenes de chat

La migración 0048 guarda descripciones visuales derivadas y contexto atribuido en
D1 para la API compartida. No es caché cliente: iOS/web conservan stores, claves
cuenta/contexto/recurso inmutable, deduplicación, rechazo de tardías, límites de
disco protegido, reutilización y visor sin conexión. No entran descripciones ni
claves de objeto en historial público ni endpoints multimedia; sin descargas locales
a vista.

Indexar reutiliza descripción completa por clave inmutable y resumen, y comparte
lease de 60 segundos entre bots grupales concurrentes. Los fallos reintentan tras
lease; historial antiguo se llena de forma diferida, una imagen por búsqueda.
Cada búsqueda y lectura para modelo comprueba fuente, audiencia, membresía,
consentimiento y marca de secuencia actuales. Las referencias cacheadas se reautorizan
en inferencia posterior, generación y antes de publicar. Eliminar mensaje fuente
elimina metadatos; objetos generados/filas huérfanos siguen limpieza de registro
tras gracia de 24 horas. Reemplazar avatar no invalida imágenes entregadas antiguas.

Con cuentas ficticias, verifica reabrir/volver, ver sin conexión y recuperar,
límites de páginas con imágenes humanas/asistente, fallo de indexación, eliminación,
revocación de membresía/consentimiento, aislamiento de conectores y cambiar cuenta
en ambos. Solo se comprobaron tipos API y preparación SQL para este cambio de servidor.

### Grupo opcional de incorporación y filas iniciales de Chats

Propósito, interruptor de grupo y ocupación/estudios comparten borrador de sesión,
envío congelado, sondeo y reglas de restablecimiento/revisión. Amigos borra ocupación/
estudios. Sin persistencia local ni caché adicional. Los contactos creados en
incorporación llevan `onboardingChat: 1` en instantáneas existentes de lista/detalle
iOS/web. La marca persistida en servidor conserva filas vacías entre actualizar,
navegar y reiniciar sesión; contactos vacíos normales siguen ocultos. Los mensajes
reales toman vistas previas/orden normalmente. Eliminar/perder acceso/cambiar cuenta
siguen expulsión existente. Verifica completar con/sin grupo, actualizar/reabrir
filas vacías, ordenar primer mensaje, recuperar sin conexión, eliminar y cambiar
cuenta en dispositivos/navegadores; estático no confirma flujos.

## Creación IA y borradores de personalidad

iOS y web crean con [un formulario](contact-generation.md) cuyos campos vacíos se
generan con IA, con contexto de incorporación persistido y selectores solo de bot.
Usa borrador/ID pendiente de sesión y trabajo D1 duradero en Workflow existente;
navegar reutiliza caché y revalida. Los nuevos generados reciben cumpleaños adultos
aleatorios; editar exige al menos 18. Ambos reemplazan formulario por indicador
destacado desde enviar hasta creación activa, muestran **Creando…** y rotan explicación
cada cinco segundos después de confirmar trabajo. Los trabajos activos cacheados
muestran actividad al reabrir. El borrador también tiene bytes JPEG elegidos solo
en memoria; completar trabajo, cerrar o cambiar cuenta los borra (un fallo reintenta
con copia preparada de servidor). La animación es solo de vista y se detiene al
desmontar (también inactivo en iOS); sin solicitudes, caché, persistencia ni etapas
nuevas. Consulta [actividad visible](contact-generation.md#visible-creation-activity)
para texto, accesibilidad y verificación pendiente entre clientes. Los creadores
pueden generar/regenerar campos de personalidad al borrador, revisar y guardar
con protección de revisión. En web salir de personalidad con ediciones pregunta
(navegación interna y cerrar pestaña); confirmar salida interna descarta borrador.
iOS conserva al volver sin preguntar. Una foto IA para contacto existente actualiza
caché desde respuesta como una carga; bytes pasan por cachés existentes con versión
nueva. Generar conserva nombre y cumpleaños adulto. Cambiar cuenta/perder acceso
descarta estado privado; cachés de fotos siguen siendo autoridad para bytes. Consulta
guía para recuperación, retención, límites, caché y comprobaciones pendientes.

Investigación de tareas (0055): consulta exacta pública, intentos y estado de
confirmación viajan en mismo tablero. La actualización de cinco segundos reemplaza
confirmación aunque no cambie versión de edición; editar sigue usando versión e
instantánea de autorización de apertura aunque el sondeo reemplace tablero. Un
conflicto exige reabrir editor actualizado. Autorizar usa PATCH existente y reemplaza
tablero completo; ningún permiso actúa optimísticamente. Informes/procedencia usan
caché de documentos anterior; sin disco, estado de red de vista ni clave nueva.
Revocación/pérdida/restablecimiento y rechazo de tardías siguen mismas reglas.
Pendiente en dispositivo/navegador para reabrir, vacíos, sin conexión, revocar en
curso, confirmaciones fallidas/inciertas y cambiar cuenta con consultas ficticias.

Monitores (0056): URL, palabras, intervalo, turnos por cambios, pendiente y últimos
cinco resultados viajan en tablero y siguen mismas reglas de actualizar, edición
versionada, conflicto, acceso y cuenta. Extractos y texto de página quedan en
servidor. Sin caché, sondeo ni disco nuevos. Pendiente verificar sección, actualizar
lista de comprobaciones, revocar y reasignar. Consulta [monitores](monitors.md).

Colaboración (0058): título de entregable, rondas y comentarios viajan en tablero;
los títulos de documentos siguen actualización del tablero, no caché de documentos.
Sin caché ni sondeo nuevos.

## Panel de superadministración

`apps/admin` mantiene cachés de sesión en memoria para resumen, ajustes y búsqueda
actual, con revalidación al navegar, contenido conservado ante transitorios,
revisiones que rechazan tardías, invalidación tras eliminar cuenta/cambiar ajustes
y restablecimiento al cerrar/vencer. No persiste en navegador. La API lee ajustes
de D1 en cada uso, sin caché de isolate. Detalles:
[caché administrativa](admin.md#panel-caching). Una respuesta 202 de eliminación
quita fila e invalida Overview al instante, mientras continúa limpieza duradera
R2/Workflow. Sin caché, almacenamiento ni sondeo nuevos. Reabrir lista, transitorios,
respuestas tardías y cambiar cuenta conservan revisiones. Otras sesiones iOS/web
borran instantáneas privadas al confirmar vencimiento/pérdida; las copias descargadas
sin conexión no se retiran remotamente. Pendiente verificar corrección en navegador/dispositivo.

## Preferencia de acento (0061)

El acento compartido viaja en respuestas de contacto; `ContactsStore` iOS y `useChats`
web lo retienen en mismas instantáneas de cuenta que ID de voz. Sin caché separada
ni persistencia local. El selector lee sincrónicamente, usa revalidación de fondo
existente y solo actualiza desde mutación exitosa del creador. Serialización y
protecciones de generación rechazan obsoletas; fallos conservan selección guardada.
Otros participantes observan cambios al actualizar normalmente, sin sondeo ni push
entre dispositivos nuevos. Cerrar/cambiar cuenta, eliminar/perder acceso usan
invalidación existente. El servidor vuelve a comprobar propiedad en cada escritura
y lee preferencia actual para audio nuevo. Los preajustes son constantes incluidas,
no datos de red.

Los MP3 conservan claves inmutables existentes. Cambiar ajustes no invalida audio
histórico ni regenera muestras; la próxima respuesta obtiene entrega nueva. No
cambian deduplicación, presupuestos memoria/disco, expulsión ni rechazo de sesión.
Pendiente en ambos: volver/reabrir, guardar sin conexión, actualizar tras edición
ajena, restricciones creador/miembro, revocación y cambiar cuenta durante guardado.

## Coordinación de actualización de conversación web

Los historiales privados/grupales web deduplican por entrada cacheada. Actualizar
panel lateral prioriza historial visible antes de publicar actividad nueva. Se
mantienen propiedad, expulsión, comprobaciones de obsoletas e IDs pendientes. El
desplazamiento es local a visita y no agrega datos privados persistidos. Consulta
[desplazamiento web](web-chat-scrolling.md) para comportamiento y comprobaciones
pendientes, incluidas navegación, fallos y cambios de sesión/cuenta.

## Preferencia de velocidad de voz

La velocidad es preferencia local pequeña, separada de audio cacheado. Un valor
numérico validado (1, 1.5 o 2) por cuenta se conserva en UserDefaults iOS y localStorage
web bajo `voicePlaybackRate.v1.<userID>`. Restaura sincrónicamente al activarse el
reproductor de esa cuenta, con respaldo 1x ante ausente/inválido. Sin obtención,
actualización, deduplicación ni entrada de caché multimedia extra. El reproductor
cambia inmediatamente y clips posteriores reutilizan; bytes, muestras, claves,
presupuestos y expulsión siguen iguales. Tiempos y búsqueda siguen en segundos
 del audio fuente.

Cerrar/cambiar cuenta detiene y borra velocidad en memoria, reteniendo número
guardado para próximo inicio. No contiene audio, transcripción ni posición;
intencionalmente no se borra con caché multimedia, eliminar contacto o perder acceso.
Borrar almacenamiento local la elimina. No hay sincronización entre dispositivos,
navegadores o pestañas activas. Fallos de almacenamiento mantienen selección en
memoria durante sesión. Verifica reinicio, cambio de cuenta, reproducción sin
conexión/interrumpida y almacenamiento denegado en clientes reales; estático no lo establece.

## Indicadores de actividad de respuesta

Ambos muestran Grabando... al preparar voz y Escribiendo... para texto. Las segundas
líneas de listas muestran actividad en lugar de vistas previas/confirmaciones,
conservando orden, fechas y no leídos. Los grupos identifican contactos activos.
Reutiliza resúmenes de sesión, sondeo, deduplicación, paginación, aislamiento y
expulsión existentes sin solicitudes por fila ni disco. Consulta
[actividad](chats.md#reply-activity-indicators) para frescura/fallos y comprobaciones
pendientes, y [migración 0062](infrastructure.md#recording-presence-migration-0062)
para configuración reproducible y rollback.

## Invalidación por ciclo de vida de chats

Archivados abre desde menú superior izquierdo iOS y botón de archivo junto a Cuenta
web, sin fila en Home. Mantienen mismos stores y actualización/paginación. Detalles
web leen archivo reactivamente y usan helpers de ciclo existentes para archivar,
vaciar y eliminar; sin caché local a vista. Verifica detalles tras archivar/desarchivar
e invalidación tras vaciar, con ambas opciones de memoria y fallos. Verifica volver
de archivado, archivo vacío, desarchivar y Volver a Chats en dispositivo/navegador.

[Vaciar/eliminar](chat-lifecycle.md) purga conversaciones, envíos, reacciones e
instantáneas secundarias, detiene reproducción y borra cachés de imagen/audio
(incluido disco protegido iOS). Las revisiones de historial del servidor restablecen
cachés de otros dispositivos y protegen paginación/envíos sin conexión. Archivar
usa lista y paginación existentes; los no leídos aún incluyen archivados. Pendiente
recuperación de fallos en dispositivo/navegador.

La validación de ciclo ahora incluye eliminar fuente, permisos de memoria retenida
y limpieza pendiente entre alcances privados/grupales vinculados. Consulta
[informe de integración local](chat-lifecycle-testing.md). Las correcciones 0064
son de servidor y preservan contrato de revisión/invalidación cliente; expulsión
y respuestas obsoletas de visor aún requieren UI.

## Metadatos de escucha de voz

La migración 0066 guarda escucha privada entrante por turno/parte de asistente
inmutable y grupal por mensaje/cuenta. Historial y resúmenes devuelven `ownListenedAt`;
`listenedAt` saliente conserva significado existente de escucha del contacto. La
API comprueba propiedad/membresía y tipo de audio dentro de escrituras idempotentes.
Los metadatos privados se eliminan con turno; las filas grupales hacen cascada con
mensaje/cuenta. Guarda metadatos de reproducción, nunca otra copia de audio.

Ambos actualizan store de conversación de sesión tras iniciar reproducción, combinan
escrituras concurrentes y evidencia de historial/resumen sin volver a no escuchado
por respuesta obsoleta. Las listas proyectan mismos metadatos y duración desde
conversaciones/envíos retenidos antes de resúmenes. Sin disco cliente, paginación
ni presupuesto de audio nuevos; comparten LRU/ciclo existente. Cambiar cuenta,
vaciar/eliminar y perder acceso confirmado lo descartan con conversación. Tardías
no recrean datos. Los fallos conservan evidencia local hasta expulsar y reintentan
al reproducir siguiente; solo escrituras confirmadas sobreviven cerrar/recargar.
Actualizar fondo y explícitamente incorpora confirmaciones de otros dispositivos
conservando contenido ante transitorios.

Pendiente manual iOS/web: audio recibido comienza gris, reproducir cambia control/
micrófono e ícono de última fila al color de lectura, pausar/reproducir/volver lo
conservan y sesión/dispositivo nuevos restauran confirmación. Comprueba ambos
sentidos, grupos de dos humanos, envíos pendientes, respuestas múltiples terminadas
en audio frente a texto, prioridad de actividad, oscuro, lectores de pantalla,
decodificación fallida, solo buscar y cargar onda sin reproducir. También reproducción
sin conexión/reintento, chats vacíos, actualizar, expulsión, vaciar/eliminar,
revocar membresía y cambiar cuenta durante solicitud.

## Aprendizaje de conversación

El [aprendizaje de conversación](conversation-learning.md) usa
`NavigationSnapshotCache` de sesión de ocho entradas en stores iOS de contacto/grupo;
entrar/actualizar revalidan sin ocultar cargado/vacío. El mapa web tiene ocho
instantáneas, frescura treinta segundos y Actualizar explícito. Las lecturas deduplican;
revisiones e identidad rechazan obsoletas, incluidos cambios de cuenta. Fallos
transitorios conservan contenido. Pérdida confirmada, vaciar y quitar contacto/grupo
descartan instantáneas. Cambios locales de consentimiento/membresía invalidan
aprendizaje grupal. Sin disco, paginación ni sondeo extra; cada respuesta tiene máximo
ocho perfiles acotados y no-store.

El aprendizaje de servidor vence al leer y limpiar cada minuto, conservando solo
marca pequeña tras vencer perfil. Restablecer/desactivar avanza piso de fuentes
y época; inferencias tardías y borradores no publicados no restauran aprendizaje
antiguo. Memoria factual normal sigue sus controles. Verifica reabrir/volver,
vacíos, actualizar, recuperar sin conexión/fallos, restablecer durante solicitud,
vaciar, revocar remotamente y cambiar cuenta en ambos; pendiente dispositivo/navegador.

## Estilo natural de conversación

El [estilo de conversación](conversation-style.md) no introduce recurso descargado
ni caché cliente. Los hábitos estables se calculan en servidor desde ID de agente
compartido y rasgos actuales. La redacción regional lee la anulación de acento y
preferencias originales validadas durante preparación. Los comentarios locales
sobre nombre/longitud e índice de participación usan solo historial ya autorizado
de esa audiencia; no se cachean medidas entre conversaciones.

Ambos conservan stores de conversación/contacto de sesión, paginación, deduplicación,
instantáneas cargadas/vacías, actualizar en fondo, rechazo de tardías, envíos e
invalidación de cuenta/acceso. Las mutaciones de acento actualizan respuestas de
contacto; fallos conservan selección anterior. Sin persistencia, expulsión ni clave
de imagen nueva. Los checkpoints pueden mantener dirección antigua para borrador
en curso; contextos nuevos usan ajustes actuales. Los mensajes históricos no cambian
tras release. Comprueba reabrir, actualizar, vacíos, sin conexión, mutación fallida,
revocar y cambiar cuenta iOS/web. Estático no verifica estos comportamientos.

La revisión final grupal usa checkpoints Workflow existentes; sin caché ni estado
descargado cliente. Solo ve contexto grupal autorizado y prosa candidata, nunca
texto privado ajeno. Revisar no concede acceso, cambia permisos ni repite herramientas.
Publicar conserva comprobaciones actuales de membresía/consentimiento/historial,
y revisión de borrador obsoleto maneja tráfico durante llamada extra. Efectos solo
de texto no aptos para habla llegan como texto normal a ambos stores.

## Conjuntos de nombres y actividad conversacional

Los candidatos de nombres son datos efímeros de servidor durante generación. Solo
los elegidos entran en plan/contacto D1 inmutable y cachés normales iOS/web; sin
endpoint de candidatos, historial local ni caché global entre cuentas. Los planes
se reutilizan tras reintento/navegación; contacto completado sigue actualización
normal. No cambian deduplicación de creación, IDs pendientes, restablecimiento por
acceso/cuenta, protecciones de obsoletas, paginación ni presupuestos.

Dirección conversacional y estadísticas siguen locales a solicitud/checkpoints.
La iniciativa privada lee marca de escritura en lugar de visita pasiva; sin solicitudes
ni caché de tiempos cliente. Los grupos reutilizan filas normales y sincronización
de un segundo, incluida escritura entre partes. Reabrir/volver/vacío usan instantáneas;
sin conexión puede obtener varias publicaciones juntas. Eliminar/revocar/cambiar
cuenta mantienen invalidación y rechazo de tardías. Sin disco privado adicional.
Pendientes comprobaciones de estas transiciones en dispositivo.

## Investigación conversacional

La migración 0068 guarda hallazgos públicos conversacionales en confirmación existente
de servidor, no documento ni caché cliente nueva. La API reutiliza como máximo dos
hallazgos locales a audiencia como contexto acotado, comprobando secuencia, modelo/
consentimiento, roles y alcance contacto/usuario/agente en cada lectura. Los extractos
locales a solicitud no son permisos, memoria factual compartida ni caché entre
cuentas. Las confirmaciones retienen un cuerpo/procedencia normalizado acotado
hasta eliminar padre; vaciar historial los elimina por cascada incluso conservando
memoria factual. Sin persistencia privada cliente ni limpiador adicional.

Solo respuesta normal llega a stores iOS/web, incluidos enlaces usados realmente.
Entregar documento explícito sigue actualizando cachés/paneles normales. La entrega
conversacional no muta Docs, por lo que listas vacías cacheadas siguen válidas.
Se aplican sin cambios frescura, deduplicación, paginación, presupuestos/expulsión,
IDs pendientes, rechazo de tardías, invalidación por mutación, pérdida de acceso y
cuenta. Reabrir/volver/recuperar sin conexión reutiliza mensajes y revalida normalmente;
nunca vuelve a buscar. Pendiente funcional en dispositivo/navegador.

## Detalles de lectura de mensajes grupales

**Información del mensaje** usa instantánea inmutable por endpoint con membresía
`groups/:id/message-info`. iOS conserva ocho entradas NavigationSnapshot por grupo
retenido; web LRU de sesión de 32. Cargados y vacíos se muestran sincrónicamente
al reabrir; actualiza al abrir, cada cinco segundos visible y manualmente. Las
solicitudes deduplican y rechazan escrituras tras invalidar. Los transitorios
conservan instantáneas. Vaciar/eliminar grupo/perder acceso/restablecer cuenta
quitan valores relevantes; sin disco privado. No hay caché de conversación ni
paginación nuevas. Los permisos servidor son autoridad. Reabrir, volver, vacío,
recuperar sin conexión/error, actualizar, vaciar/revocar y cambiar cuenta requieren
verificación dispositivo/navegador; estático no los demuestra.

## Audio público de mensajes web

La app raíz solo cachea en memoria dos buffers públicos decodificados UI y cargas
en curso (menos de 1 MiB a frecuencia incluida). Reutiliza inmediatamente; fallos
expulsan, desmontar borra y archivos sin cambios usan HTTP normal. Sin audio privado
ni cuenta en esta caché. Restablecer sesión detiene sonidos e invalida eventos/IDs
reproducidos; perder visibilidad también. Reproducir comprueba generación, destino
y visibilidad tras decodificar, y omite eventos demorados más de 1.5 segundos.
No repite sonidos antiguos tras desbloquear, navegar, cambiar cuenta ni recuperar
sin conexión. Sin verificar escucha, desbloqueo por teclado/tacto y segundo plano/
reanudar en navegador.

## Exportaciones explícitas de chat

La [exportación JSON](chat-export.md) no tiene caché intencionalmente en iOS/web:
debe incluir historial no cargado y no guardar otra copia privada. Cada exportación
es una solicitud deduplicada mientras corre, descartada al cancelar/salir de página
(web), cerrar o cambiar cuenta, y nunca toca cachés de conversación. Web libera
URL Blob tras descargar; iOS elimina su único temporal al cerrar hoja de compartir
o antes de próxima exportación. Pendiente dispositivo/navegador (consulta guía).

## Exportaciones explícitas de depuración (solo web)

La [exportación JSON de depuración](debug-export.md) no tiene caché: descargar todo
el historial por pedido debe obtener páginas no cargadas y no retener otra copia
privada. Una operación de sesión deduplica clics, carga 25 filas por página,
retiene máximo 100 MB de partes JSON y libera tras descarga/fallo/cancelación.
Las asignaciones finales Blob/navegador pueden añadir memoria temporalmente. No
persiste disco salvo descarga explícita. Cancelar, cerrar hoja, desmontar Cuenta
y restablecer abortan solicitud y rechazan tardías; URL temporal se revoca después.
Reintentar empieza de cero; cachés intactas. Autoriza cada página y comprueba manifiesto
de alcance/historial otra vez antes de guardar. Sigue siendo exportación en vivo,
no instantánea transaccional. Pendientes navegación, vacíos/archivados, recuperar
sin conexión, revocar, vaciar, cancelar y cambiar cuenta; guía tiene lista completa
con datos ficticios.

## Tarjetas de vista previa de enlaces

Ambos mantienen metadatos en caché de sesión solo en memoria por cuenta (web
`useLinkPreviews`, iOS `LinkPreviewCache` de `PrivateImageCache`) de máximo 200 URLs.
Las vistas cacheadas se muestran sincrónicamente al reabrir/navegar; solicitudes por
URL deduplican; un resultado servidor `failed` queda por sesión y fallos de transporte
reintentan al próximo renderizado. Restablecer/cerrar/cambiar cuenta y perder acceso
descartan caché; tardías de sesión anterior se descartan. Las imágenes reutilizan
cachés privadas con fecha de obtención como versión. En servidor vencen a siete
días (fallidas a seis horas). Consulta [vistas previas](link-previews.md).

## Feed de Updates

El feed se llama **Para ti**, con ícono Home en iOS/web desde el 01/11/2026. Este
cambio de presentación conserva claves, frescura, revalidación, confirmación de
insignia y aislamiento.

Ambos poseen un feed [Updates](updates.md) (recurso API `home`) por sesión:
`HomeFeedStore` iOS (creado por estructura de sesión, descartado al cerrar/cambiar)
y `useHome` web (registrado al restablecer). Solo memoria, nunca disco porque las
tarjetas pueden contener datos de conectores. El último feed se muestra sincrónicamente
al volver; primera carga muestra placeholders. Visible, revalidan tras 60 segundos
y cada 4 mientras curación está actualizando/pendiente; solicitudes deduplicadas.
`POST /home/refresh`, `POST /home/topics` y `PATCH /home/topics/:id` devuelven feed
completo que reemplaza caché; mutar incrementa revisión para impedir sobrescritura
por lectura anterior. Transitorios conservan tarjetas; solo fallo inicial muestra
error y Reintentar. `setup` opcional comparte instantánea solo de memoria, incluidos
vacíos. Feeds con contactos en creación sondean cada cuatro segundos con actualización
forzada; reabrir cualquier configuración revalida de inmediato en fondo. Cambiar
IDs, estado de creación, vaciar o archivo marca feed obsoleto y rechaza lecturas
anteriores (web montado, iOS desde estructura de sesión). iOS revalida al elegir
Para ti; de otro modo lee al próximo abrir. Una lectura iOS cancelada solo borra
su espacio de solicitud por revisión, conservando deduplicación del reemplazo al
cambiar disponibilidad durante solicitud. El servidor decide elegibilidad, por lo
que lista parcial nunca demuestra ausencia de contactos. `HOME_NO_CONTACTS` antiguo
se muestra como bienvenida. Sin caché ni persistencia extra; feeds listos conservan
60 segundos. Cabecera simplificada y mayor espacio no cambian claves/retención;
redacción nueva no reescribe publicaciones cacheadas. Verifica primer registro con/
sin IA, generación a listo y agregar/eliminar/archivar, reabrir/volver, vacío/sin
conexión y cambio de cuenta en ambos; estático no establece comportamientos.
Ocultar tema quita tarjeta y publicaciones del feed devuelto al instante. La línea
temporal ([publicaciones](updates.md#posts)) forma parte de misma respuesta: máximo
50, sin paginar, y el hilo filtra caché para abrir síncrono y seguir mutaciones.
Los comentarios vienen en la misma respuesta y comentar devuelve feed completo;
con respuesta pendiente sondean cada pocos segundos. Los IDs de publicaciones ya
mostradas solo viven en memoria para contar píldora **N publicaciones nuevas**.
La cantidad de insignia (`GET /home/badge`, cada 15 segundos fuera de Updates) solo
vive en memoria; abrir la pone a cero localmente, rechaza lecturas en curso por
revisión y registra visita con `POST /home/seen`
([detalles](updates.md#new-card-badge)). Avatares usan lista y cachés privadas; imagen
de titular reutiliza cachés de enlaces. En servidor, tarjetas quedan hasta reemplazar,
retirar, ocultar o eliminar cuenta (cascada); publicaciones y comentarios quedan
14 días, hasta ocultar/eliminar tema o eliminar cuenta. Pendiente verificar estos
recorridos en dispositivo.

## Invalidación de alias de contacto

`setAlias` (`useChats`) aumenta generación de lista para rechazar lecturas antiguas,
aplica contacto devuelto al instante y actualiza en fondo. Las cachés web con nombres
resueltos se actualizan/descartan: grupos se modifican en sitio (`senderName` de
mensaje/cita, borradores y citas pendientes, agentes miembros, nombres de escritura,
reacciones), aumentando revisión y descartando detalles en curso; se olvidan tareas,
documentos, información de mensaje y aprendizaje; Updates sigue visible y vuelve
a obtenerse. Cambiar cuenta y perder acceso los borran como antes. iOS:
`ContactsStore.setAlias` actualiza contacto conocido/fila al instante (generación
rechaza obsoletas, mutaciones concurrentes bloqueadas), invalida aprendizaje, tareas
y documentos e incrementa `aliasRevision`; `HomeView` reacciona invalidando grupos
y marcando Updates obsoleto (`HomeFeed.markStale`, contenido visible hasta recargar).
`GroupConversationCache.aliasChanged()` descarta conversaciones inactivas (se obtienen
al abrir) y llama a `invalidateDetails()` en visibles o con envío pendiente. Límites:
las retenidas pueden mantener mensajes con nombre anterior hasta actualizar; no
se invalidan explícitamente reacciones/citas privadas ni instantáneas MCP grupales.
Verificación: cambia alias, reabre grupo con bot, miembros, citas, tareas y Updates,
y confirma que otro miembro no cambia. No ejecutado en dispositivo ni navegador.

## Contactos vinculados

`ContactsStore.linkSnapshots` iOS y `useContactLinks` web mantienen instantánea por
contacto (máximo ocho, solo memoria, descartadas con sesión). Volver muestra al
instante y revalida en fondo, y en primer plano iOS. Cada vínculo cambia e invalida
todas (son mutuos), y la respuesta reemplaza actual; una lectura fallida conserva
última con Reintentar. Eliminar contacto borra instantáneas iOS. Consulta
[contactos vinculados](contacts.md#linked-contacts).

## Imágenes contextuales y espontáneas de chat (0079)

El encuadre se elige en servidor; miniaturas cargadas iOS/web conservan composición
completa con píxeles cacheados. La iniciativa privada guarda imagen como
`assistantMessages[0].attachment` normal, con mismas claves cuenta/alcance/ID inmutable,
endpoint autorizado, deduplicación, revalidación, memoria acotada y expulsión de
disco protegido iOS. No agrega caché, retención, sondeo, paginación ni URL pública.
Se aplican invalidación por vaciar/eliminar/acceso/cuenta y protecciones de tardías.
Placeholders y mosaicos cuadrados no cambian. Antes de publicar el servidor vuelve
a comprobar fuente/revisión, acceso, referencias, modelo, consentimiento, escritura
y presupuestos; imágenes no publicadas siguen gracia de limpieza de registro de
24 horas. Verifica reabrir/volver, actualizar, vacío/sin conexión, vaciar/eliminar,
revocar referencias y cambiar cuenta con datos ficticios en ambos; estático no
establece comportamiento en dispositivo.

## Preferencia de apariencia

Sin datos de red, por lo que no aplica caché de sesión. Sistema/Claro/Oscuro es
ajuste de dispositivo (`UserDefaults` `appearance` iOS, `localStorage` `wildcard-theme`
web) sin datos privados que sobrevive intencionalmente cerrar/cambiar cuenta.
Consulta [apariencia](appearance.md).

## Entrega privada de mensajes de contactos compartidos

La [mensajería entre participantes](sharing.md#private-messages-between-shared-contact-participants)
usa cachés de chat/lista de sesión, sondeo, actualizar explícitamente, IDs pendientes,
lecturas combinadas, paginación y presupuestos existentes iOS/web. Sin disco nuevo
ni descarga de historial destinatario. Lecturas acotadas en vivo de herramientas
resuelven destinatarios actuales; cachear permisos no sirve porque eliminación/
aislamiento pueden cambiar durante turno. Guardar y push los revalidan. Mensajes
cargados sobreviven transitorios; cambiar cuenta, pérdida confirmada y eliminar
conservan invalidación/rechazo. Reabrir/volver, vacío, visibilidad de mutación,
recuperar sin conexión, revocación y cambiar cuenta requieren comprobaciones con
cuentas ficticias de la guía.

La resolución de respuestas y estado de entrega reciben ahora instantáneas de
confirmaciones del servidor locales a solicitud: máximo tres referencias entrantes
(últimos doce turnos completos o cita explícita) y seis salientes, con extractos
de 1,600 bytes. Confirmaciones propias antiguas solo se buscan a pedido de herramienta
 del modelo. Las lecturas usan D1 y acceso en vivo existentes, sin endpoint/caché/
disco cliente, y se actualizan por turno; el solicitante no sondea cambios de
historial ajeno. No cambian cachés iOS/web, aislamiento, IDs, actualizar por mutación
ni rechazo de tardías. Verifica respuestas por pronombres, reabrir, sin conexión,
revocar y cambiar cuenta tras release.

El panel lateral web expandido (01/11/2026) es solo presentación. Mantiene lista
montada con `v-show` y reutiliza stores, sondeo de insignias e invalidación. No
agrega caché, solicitud ni persistencia. Las comprobaciones visuales/de navegación
están pendientes en `docs/web.md`.

## Borradores y etiquetas de reacciones en la lista

Los borradores viven en entradas de conversación de sesión (`ChatStore.draft` /
`GroupChatStore.draft` iOS, `entry.draft` web), sobreviven navegar y alimentan etiqueta
`Draft:`. Web la suprime para chat/grupo abierto, derivando visibilidad de ruta sin
cambiar borrador ni solicitar; aparece al salir y se oculta al reabrir. Solo memoria,
nunca persistidos ni cargados, descartados con entrada al cerrar/cambiar cuenta,
vaciar/eliminar/perder acceso. Un borrador no vacío protege entrada de LRU (8 iOS,
20 web), como envío pendiente. Reacciones vienen de `lastReaction` de resúmenes de
listas cacheadas y siguen frescura/rechazo existentes; sin solicitud separada para
lista. Consulta [vistas previas](chats.md#chat-list-previews).

## Stickers

Web (`useStickers`, solo memoria; consulta [stickers](stickers.md#web)) e iOS
(`StickerStore`, solo memoria; consulta [stickers](stickers.md#ios) e
[iOS](#stickers-ios) abajo) siguen mismas reglas; las viñetas describen web y las
diferencias iOS están al final.

- **Listas.** Una biblioteca (`GET /stickers`, límite 120) y una lista por contacto
  (`GET /contacts/:id/stickers`, máximo 20 retenidas, primero menos usadas). Abrir
  selector muestra listas cacheadas síncronas, incluso vacías; indicador solo para
  lista nunca cargada.
- **Frescura.** Listas de más de 30 segundos revalidan en fondo al abrir o cambiar
  pestaña; **Reintentar** fuerza lectura. Los contactos agregan stickers de avatar y
  guardan nuevos, por lo que no hay TTL mayor. Los transitorios conservan stickers
  con aviso; 404 del contacto vacía lista.
- **Deduplicación y lecturas obsoletas.** Máximo una lectura en curso por lista.
  Registra revisión; cerrar/cambiar cuenta, eliminar (`forgetContactStickers`) y
  toda mutación la aumentan, descartando lecturas anteriores o terminadas tras
  cambiar cuenta.
- **Mutaciones.** Crear, Guardar (de pestaña o mensaje) y cambiar emoji actualizan
  biblioteca en sitio desde `sticker` API; Eliminar quita (404 cuenta eliminado).
  Guardar deduplica por resumen en servidor: una entrada existente vuelve sin cambios,
  y pestaña muestra **Guardado** si su resumen ya está en biblioteca. Nada persiste,
  y las mutaciones de biblioteca no tocan listas por contacto.
- **Imágenes.** Cargan mediante `usePrivateImage`; la ruta lleva resumen
  (`stickers/:id/image?v=<digest>`), por lo que clave es cuenta + ruta + resumen y
  editar/reemplazar nunca sirve bytes viejos. Mensajes usan adjunto normal
  (`…/attachment?side=assistant&part=N`), y burbuja optimista reutiliza ruta de
  biblioteca para mostrar imagen cacheada sin solicitud. Sin caché paralela.
- **Envíos pendientes.** Mantienen UUID y ID de biblioteca entre navegación/fallos;
  Reintentar reenvía mismo UUID. Si se eliminó sticker, falla con «Este sticker ya
  no está en tu biblioteca».
- **Creación.** JPEG fuente y PNG previo solo quedan en diálogo abierto (blobs/URLs),
  liberados al Cancelar, Guardar, desmontar o cambiar cuenta; respuestas tardías de
  recorte/guardado tras Cancelar o «Elegir otra foto» se ignoran. Cancelar aborta
  solicitud de recorte.
- **No cacheado.** Nunca reutiliza recortes: cada intento es solicitud nueva.
- **Verificación (no realizada).** Reabrir selector (instantáneo, incluido vacío),
  actualizar tras agregar/eliminar en otro dispositivo, reabrir sin conexión,
  eliminar con envío pendiente, 409 biblioteca llena, cambiar cuenta con selector
  abierto y cancelar recorte.

### Stickers (iOS)

`StickerStore` pertenece a `ContactsStore` y usa primitivas existentes; nada persiste
ni descarga por cuenta de una vista.

- **Biblioteca.** Una `NavigationSnapshot<StickerLibrary>` (stickers más `limit`
  servidor). `StickerPickerView` lee `value` síncronamente al abrir, para mostrar
  biblioteca cacheada al instante, incluso vacía (`value == []` no es nil); indicador
  solo con `value == nil`. Abrir y arrastrar revalidan en fondo (sin TTL: es pequeña
  y pestaña de contacto depende de cambios externos). Fallar revalidación conserva
  lista; solo una nunca cargada muestra error y **Reintentar**.
- **Pestañas de contacto.** `NavigationSnapshotCache<[Sticker]>` por ID, máximo ocho
  (expulsa menos usada), revalida al seleccionar. Un 404 muestra «Este contacto ya
  no está disponible» y descarta; eliminar/perder acceso (rutas de `ContactsStore`)
  llama `forget(contactID:)`. Vaciar chat no toca cachés de stickers (bibliotecas
  independientes del historial).
- **Deduplicación y obsoletas.** `NavigationSnapshot.refresh` comparte lectura por
  lista y descarta revisión modificada. `create`, `changeEmoji`, `delete`, `save` y
  `saveMessageSticker` actualizan y hacen `replace` de instantánea, cancelando e
  ignorando anteriores. `busy` (IDs con mutación en curso) rechaza segunda mutación
  concurrente del mismo sticker. Guardar deduplica por resumen en servidor; **Guardado**
  se deriva de resúmenes existentes.
- **Cambiar/cerrar cuenta.** `ContentView` aplica `.id(auth.user?.id)` a `HomeView`,
  para que cuenta nueva reciba `ContactsStore`/`StickerStore` nuevos; cerrar los
  descarta con vista. `AuthStore.withSession` también convierte resultados de sesión
  reemplazada en cancelaciones.
- **Imágenes.** Recursos `sticker(id:digest:)` (`sticker/<id>/<digest>`) y
  `contactSticker(contactID:stickerID:digest:)` de `PrivateImageCache`; resumen
  inmutable por ID. Conserva partición, límites (32 MiB decodificados, 16 MiB
  originales) y 64 MiB de disco protegido. Mosaicos decodifican a 300 px, mensajes
  a 520; 120 stickers pueden exceder decodificados y volver a decodificar desde
  originales al desplazar. Mensajes usan claves existentes; `assistantAttachment`
  ganó `part` (clave igual en parte 0). Tras enviar, `PrivateImageCache.copy` cambia
  clave de bytes de biblioteca a mensaje para no recargar burbuja optimista.
- **Envíos pendientes.** UUID se conserva al navegar/fallar (`ChatStore.submission`,
  `GroupChatStore.pending`), como adjuntos.
- **Creación.** JPEG y PNG recortado solo en `StickerCreateModel`, liberados al
  restablecer, Guardar y desaparecer pantalla. Contador de generación descarta
  respuestas tardías; tarea se cancela con él. Nunca reutiliza recortes.
- **Verificación (no realizada).** Reabrir hoja (instantánea, incluido vacío),
  actualizar tras cambiar biblioteca en otro dispositivo, reabrir sin conexión,
  eliminar con envío pendiente, biblioteca llena, cambiar cuenta con hoja abierta
  y salir durante recorte.

## Controles de privacidad

La [privacidad](privacy.md) no agrega caché. El interruptor de cuenta forma parte
 del usuario de sesión (`useSession` web, `AuthStore.user` iOS) y lo reemplaza la
respuesta autorizada `PUT /me/privacy`. «Mantener este chat privado» es campo de
contacto actualizado por mutación existente (`useChats.setKeepPrivate` web,
`ContactsStore.setKeepPrivate` iOS), que rechaza listas antiguas. Ambos cambios
descartan todas las instantáneas de vínculos (`invalidateContactLinks` web,
`linkSnapshots.removeAll()` iOS), porque chat privado sale de todos los vínculos
y el interruptor cambia `allContacts`. Las instantáneas grupales (interruptores
«Hablar de mis chats privados») revalidan en fondo como antes; el servidor ya quitó
autorizaciones. Pendientes comprobaciones en dispositivo y navegador.
