# Experimentos nativos de iOS

El [prototipo remoto de temporizadores/alarmas](native-remote.md) también permite
solicitudes iOS/web a un iPhone enlazado explícitamente por su extensión de
notificaciones. Requiere 0034 y firma App Groups para la extensión. La ejecución
bloqueada es experimental y aún no está verificada en nuestro dispositivo firmado.
La iniciativa autónoma no cambia.

Los experimentos dejan que un contacto individual proponga acciones para el iPhone
de una persona. Son opcionales y quedan desactivados hasta habilitar cada contacto
en ese dispositivo. El agente puede compartirse, pero activar herramientas no da
acceso al teléfono, Calendario, Recordatorios, archivos, ubicación ni solicitudes
privadas de otro participante.

## Experimentos retirados (2026-10-30)

NFC, sesiones de Concentración, recetas guiadas y respuestas habladas se retiraron
de la app. Se conserva el código con comentarios de obsolescencia o bloques
excluidos de compilación; se desactiva registro de widgets de concentración/receta.
Los mensajes de voz ordinarios siguen mediante la [función de voz](voice.md).

La lista activa contiene temporizadores, alarmas, Calendario, Recordatorios y
recordatorios de ubicación. iOS filtra y persiste ajustes de herramientas y
preferencias automáticas al activar, para que ajustes antiguos no restauren
herramientas retiradas. Las Live Activities existentes de concentración/receta
se terminan al activar; los intents antiguos solo pueden terminarlas. La UI e
implementación NFC están excluidas y entitlement/clave de privacidad comentados.
Siguen enlaces autorizados de contactos, Siri, Atajos, widgets y borradores compartidos.

La API acepta listas antiguas de capacidades y filtra tipos retirados sin bloquear
mensajes ordinarios. Solo anuncia tipos activos, rechaza propuestas retiradas e
impide reclamar acciones pendientes antiguas retiradas. Filas/recibos históricos
siguen legibles y reclamos ya en curso pueden informar resultado; la app actualizada
no ejecuta retiradas. Los elementos Calendario/Recordatorios y alarmas existentes
no cambian. Sin migración ni servicio nuevo. Apps antiguas necesitan actualización
para coincidir; publicar API no les quita UI. Revertir código podría reactivar
experimentos retirados y no es vía admitida para conservar esta política.

Lo estático no verifica limpieza al actualizar en dispositivo. Verifica ajustes
guardados, solicitudes antiguas pendientes, limpieza de sesiones activas,
herramientas restantes y voz en instalación firmada. El comportamiento archivado
marcado abajo describe código conservado, no capacidades actuales.

## Primeros pasos

Abre privado, pulsa nombre/avatar y **Experimentos nativos** en detalles, o
**Cuenta → Experimentos nativos**. Activa contacto y herramientas permitidas.
Expone explícitamente su nombre a consultas Siri/Atajos, widget y extensión
Compartir en este dispositivo. Las actividades de alarma pueden mostrar títulos
bloqueados; se aplican ajustes de privacidad/pantalla del sistema. Activar el
experimento no solicita por sí solo ningún permiso de sistema.

Cuenta, directorio nativo y herramientas usan la ruta raíz `HomeDestination`.
El directorio es destino basado en valor; pulsar un contacto empuja herramientas
sobre el directorio visible; Atrás vuelve a él y luego Cuenta. Detalles usa el
mismo destino; no hay botón aparte en barra de chat. La entrada está disponible
para contactos propios/compartidos existentes, incluidos perfiles de solo lectura.
La navegación reutiliza almacenes sin cambiar frescura ni permisos. Verifica
ambas entradas y avance/retroceso repetido al instalar app nueva.

Pide en privado: temporizadores y alarmas nuevos se ejecutan sin otra confirmación
mientras Wildcard está en primer plano, incluso tras salir del chat. El ejecutor
de sesión comprueba contactos habilitados cada cinco segundos y usa caché compartida
existente. Sigue el permiso inicial AlarmKit. Una vez programados continúan aparte
de app. Las solicitudes de la vía local original con app cerrada esperan a primer
plano. La [vía remota](native-remote.md) activada por separado usa extensión. Ninguna
promete tiempos exactos.

**Ejecutar sin confirmación** controla cada tipo compatible por contacto, cuenta
e instalación. Temporizadores/alarmas activados por defecto; recordatorios opcionales.
Calendario y recordatorios de ubicación mantienen revisión manual. Cada tipo guarda
fecha de activación: propuestas antiguas siguen manuales, incluso al actualizar,
reactivar tipo o automatismo. Cambiar ajustes no deshace acciones ya ejecutadas.
Los intentos automáticos se serializan, comprueban acceso vigente y ajustes locales
y usan el mismo reclamo atómico/recibos manuales. Un intento incierto no se reintenta
en la sesión; los reclamos en curso no se repiten al reiniciar. Los fallos aparecen
en banner y lista. La app debe estar abierta para iniciar una acción.

Para manuales, abre **Experimentos nativos → Solicitudes en este iPhone**, revisa
propuesta completa y pulsa **Revisar y ejecutar**. Calendario presenta editor del
sistema; recordatorio sin ubicación presenta mapa para elegir. Pendiente no significa
ejecutado. **Completado** significa que el teléfono informó finalizar operación
(por ejemplo programar alarma), no que sonó ni que la persona terminó una tarea.

### Estado en app y conocimiento del agente

Una franja fija de tarjetas compactas de cristal en privado muestra alarmas/
temporizadores activos de esta cuenta/contacto; una ocupa ancho y varias deslizan
horizontalmente. Otras pantallas muestran las mismas de la cuenta; tocar título
abre chat. Los temporizadores ofrecen controles redondos Pausar/Reanudar y Cancelar/Detener.
Cada mensaje muestra además recibos nativos como chips centrados: pendiente, en
curso, completado, fallido, cancelado e incierto, con icono de color según resultado.
Los manuales se ejecutan desde chip. El recibo es histórico: un temporizador puede
programarse bien y cancelarse después sin cambiar ese recibo.

`alarmUpdates` de AlarmKit actualiza instantáneas de sistema filtradas por cuenta
con app activa; el ejecutor también, incluido retorno. La línea de tiempo de un
segundo solo lee instantáneas locales de sistema/ActivityKit. La cuenta exacta
usa `AlarmPresentationState.Mode.Countdown.fireDate`, incluidos cambios de pausa/
reanudación; sin presentación se muestra Temporizador en curso, sin inventar plazo.
Estados distinguen programada, cuenta atrás, pausada y sonando. Tarjetas Calendario/
Recordatorios confirman guardado, no progreso de tarea. La app no lee su contenido.
No cambia retención de IDs ni se escribe más información privada en disco.

Para tipos automáticos, `request_native_action` espera hasta diez consultas de
recibo de un segundo en el paso Workflow existente antes de responder al modelo.
Ese bucle nunca ejecuta ni repite acciones. Cada lectura comprueba turno/intento/
cuenta/contacto de origen. Un recibo completado indica confirmar sin pedir activación.
Pendiente tras esperar se describe como enviado al iPhone con estado en app;
fallido/cancelado/desconocido nunca se convierte en éxito. Hasta seis llamadas
automáticas añaden máximo 60 segundos en el paso de respuesta de tres minutos;
latencia y calidad reales sin verificar. Los turnos nativos activos también reciben
los diez recibos terminales recientes de participante, contacto y dispositivo.
No contienen cuenta atrás actual ni contenido Calendario/Recordatorios ni autorizan
acciones nuevas.

Los cambios API/prompt requieren publicación automática desde commit/push autorizado.
Instalar solo iOS muestra tarjetas y conserva alternativa a API antigua, pero no
cambia instrucciones manuales de su modelo. Mensajes anteriores se preservan.
Verifica respuestas nuevas tras actualizar backend y app.

| Capacidad | Ejemplo | Implementación |
| --- | --- | --- |
| Temporizador | «Pon uno de 12 minutos» | Cuenta atrás AlarmKit, pausar/reanudar/cancelar |
| Alarma | «Pon alarma mañana a las 7» | Fecha futura fija AlarmKit |
| Calendario | «Añade reunión mañana de 15 a 16» | Editor EventKitUI; usuario elige calendario y guarda |
| Recordatorio | «Recuérdame regar mañana a las 9» | EventKit, lista predeterminada, fecha/alarma opcional |
| Recordatorio de ubicación | «Recuérdame comprar leche al llegar» | Alarma de ubicación estructurada de Recordatorios; mapa si falta |

AlarmKit tiene autorización propia y puede sonar con Silencio/Concentración.
Es distinto de programaciones en nube, que generan mensajes. Recordatorios requiere
acceso completo aunque Wildcard solo crea elementos pedidos y encuentra lista
predeterminada; sus contenidos no se consultan ni envían al modelo. Calendario
usa editor fuera de proceso sin acceso general. iOS Recordatorios evalúa ubicación;
Wildcard no registra seguimiento de fondo ni sube el lugar elegido. Buscar en mapa
envía lo escrito a MapKit de Apple.

### Implementación archivada de concentración/recetas (retirada)

Las actividades conservadas corrían localmente y no reciben pushes ActivityKit.
La cuenta de concentración es visual: no suena, cambia Concentración del sistema
ni escribe automáticamente al bot. Pide un temporizador aparte si quieres.
ActivityKit impone vida de ocho horas; pausar no la amplía. Se rechazan payloads
por encima del límite conservador de 3,800 bytes combinados de atributos/estado.
El widget muestra pantalla bloqueada/Dynamic Island con controles accesibles.
Sesiones y alarmas comparten glifos y cuentan grande o pasos, progreso de receta,
progreso de temporizador y cápsulas. Una sesión/temporizador pausado muestra tiempo
restante; concentración no muestra barra porque pausar no guarda duración original.
Los controles requieren autenticación y contacto/cuenta actualmente expuestos.
Terminar acaba presentación, no un turno cloud. No se implementa progreso continuo
de investigación ni actualizaciones remotas; push ordinario sigue aplicando.

## Siri, Atajos, botón Acción y widget

**Abrir contacto de Wildcard** y **Redactar mensaje a Wildcard** aparecen como App
Shortcuts. Las consultas de entidades usan solo identidades habilitadas explícitamente
del App Group. Configura cualquiera en botones Acción compatibles o combínalo con
acciones de Atajos elegidas por usuario. Redactar nunca envía; revisa en bandeja
de borradores compartidos. Intents requieren autenticación. Abren app, no son proxy
irrestricto de conversación Siri. El modelo sigue siendo Meta configurado, no Apple.

Añade **Contactos de Wildcard** a inicio para abrir hasta tres contactos (pequeño)
o cuatro (mediano), con iniciales porque no se comparten fotos con extensión.
Solo identidades, sin vistas previas ni historial. Pide actualizar cada 15 minutos,
sujeto al sistema; cambios explícitos de identidad piden recarga. Sin garantía en tiempo real.

## Extensión Compartir y borradores privados

Desde Safari, Fotos o Archivos, **Compartir → Wildcard**, contacto habilitado y
borrador. Solo importa primer elemento. Admite texto, enlaces HTTP(S), imágenes
y PDF hasta 5 MB; imágenes genéricas se convierten JPEG. Lee archivo temporal con
tamaño comprobado antes de importar bytes. Hasta diez borradores, cada uno caduca
tras 24 horas, ID aleatorio y vínculo a cuenta/contacto. Los archivos se escriben
atómicamente con protección completa en App Group, sin token. Abre Wildcard,
**Revisar borradores compartidos** y revisa en chat; nunca sobrescribe compositor
no vacío. Se elimina tras enviar bien o Descartar explícito. Salir del chat conserva
original para otra revisión. Caducados se ocultan; escribir otro purga caducados.
Salir/reemplazar cuenta limpia bandeja; inicio frío a misma cuenta conserva.
Los borradores ordinarios mantienen comportamiento.

## Enlaces de contacto

Leer/escribir NFC está retirado y excluido. La descripción siguiente solo registra
código conservado. **Compartir enlace de contacto** sigue activo.

**Compartir enlace de contacto** crea Universal Link HTTPS con ID del agente.
**Escribir enlace en etiqueta NFC** confirma reemplazar NDEF y requiere etiqueta
escribible suficiente. **Leer NFC** solo acepta host HTTPS configurado y ruta
`/native/contact`. La URL lleva enrutamiento, nunca instrucciones, credenciales,
texto ni autorización de ejecución. El receptor resuelve ID contra sus contactos
aceptados. Poseer enlace no une ni da acceso; un externo necesita invitación normal.
Leer/escribir dentro de app exige iPhone NFC; abrir en fondo requiere Universal
Links funcionales. iOS muestra notificación para tocar, no ejecuta arbitrariamente.

La alternativa web resuelve conversación autorizada con caché de directorio de
sesión. Visitantes sin sesión ven acceso; reabre tras entrar. El navegador puede
solicitar temporizadores/alarmas en iPhone enlazado; nunca ejecuta frameworks Apple
localmente. Consulta [web](web.md).

## Contrato cloud y manejo de fallos

`0031_native_actions.sql` añade `chat_turn.native_context_json` anulable y registro
`native_action`. Un envío iOS puede incluir `nativeContext` con UUID de instalación,
lista de tipos y `automaticKinds` opcional (subconjunto único permitido de
temporizador/alarma/concentración/receta/recordatorio/habla). Clientes antiguos lo
omiten y mantienen revisión manual. Si API antigua rechaza capacidades explícitamente,
iOS reintenta una vez omitiendo solo `automaticKinds`, conservando dispositivo,
tipos, ID, texto, zona, adjunto y cita. Otros errores no activan alternativa.
El automatismo local sigue activo; hasta actualizar API, el modelo puede describir
revisión manual. El reintento compatible no ejecuta acciones. El modelo recibe
guía automática sin equiparar pendiente a éxito. Se captura con el ID pendiente
ante envíos inciertos. Otros clientes omiten contexto local; servidor añade teléfonos
permitidos (consulta [elegir teléfono](native-remote.md#choosing-the-phone)).
UUID reside en Keychain When-Unlocked, This-Device-Only aparte de credencial de
sesión. Afinidad es restricción de enrutamiento, no atestación de hardware; siempre
requiere cuenta autenticada y su contacto.

Solo turnos humanos privados directos con contexto reciben `request_native_action`
y `list_native_actions`. No grupos, programaciones ni resultados privados de grupos.
Servidor valida campos por tipo, longitudes, rangos finitos, fechas futuras con
offset explícito y duración acotada. Coordenadas deben venir de entrada humana
explícita; omitir ambas difiere a mapa. Recordatorios son del sistema, no memoria
compartida nueva. Estas herramientas no devuelven lecturas de calendario,
recordatorios, micrófono ni ubicación.

Crear comprueba condicionalmente turno/intento activo y contacto vigente.
`(turn_id, kind)` único devuelve propuesta original al reintentar, incluidos
argumentos. Cambiarla requiere otro mensaje humano. Hasta una por tipo/mensaje
dentro de las seis llamadas existentes. Vencen para ejecutar tras 24 horas;
las fechas se comprueban otra vez en dispositivo.

Endpoints autenticados bajo `/api/v1/contacts/:id/native-actions` requieren consulta
`deviceID` y consentimiento actual de contacto/modelo:

- `GET /`: últimas 50 propuestas de persona, chat y dispositivo, más nuevas primero.
- `POST /:actionID`: `{executionID,status}`; reclama pending → running atómicamente;
  termina running → completed/failed/cancelled/unknown con mismo ID. Pendientes
  pueden descartarse. No se repiten reclamos.

Solo corre una operación a la vez. Debe ganar el reclamo antes de invocar sistema;
concurrentes reciben 409. No se repite un reclamo incierto por red y un acuse
fallido nunca vuelve a ejecutar. Una solicitud en curso interrumpida queda sin
confirmar y ofrece **Marcar resultado desconocido**. Inspecciona app del sistema
antes de otra solicitud. El dispositivo reporta resultado, no lo verifica servidor.
Una caída o acuse perdido puede dejar éxito sin confirmar.

Cambiar cuenta rechaza respuestas tardías y cierra editores/habla activos.
Elementos guardados Calendario/Recordatorios y alarmas siguen en sistema tras salir,
eliminar contacto o desactivar; no deshacen datos guardados en silencio. Gestiona
Calendario/Recordatorios en sus apps. AlarmKit no inserta en Reloj de Apple:
usa **Alarmas del sistema programadas** del contacto, **Cuenta → Experimentos
nativos → Alarmas Wildcard programadas** o controles Live Activity. La lista de
cuenta sigue tras eliminar/desactivar contacto. Un registro protegido Application
Support conserva IDs, títulos e identidad de cuenta/contacto entre sesiones para
gestionarlas al volver. Nunca se envía al modelo ni al App Group. El remoto usa
traspaso App Group separado y acotado para IDs/títulos de extensión hasta importar;
consulta [retención remota](native-remote.md#local-storage-and-cache). Hasta 200
alarmas seguidas entre cuentas locales; las quitadas por sistema se purgan al
actualizar autorizado. Listas nunca exponen alarmas de otra cuenta. Se guarda ID
antes de programar para inspeccionar/cancelar un resultado incierto en próxima
actualización autorizada. Live Activities e identidades expuestas se quitan al
salir/quitar contacto; ajustes permitidos siguen por cuenta local. Las antiguas
concentración/receta terminan al activar. iOS controla permisos.

## Caché y retención

Las listas pertenecen a sesión, se reutilizan al volver incluidos vacíos y revalidan
tras cinco segundos mientras pantalla de solicitudes o ejecutor automático estén
activos. Comparten solicitudes y frescura. Deslizar explícitamente la omite;
se deduplican solicitudes en vuelo. Respuestas de chat también revalidan para
mostrar propuestas nuevas al navegar. Errores transitorios conservan contenido
sin banner si ya hay lista o sondeo automático;
consulta [fallos transitorios](caching.md#transient-failures-during-background-revalidation).
Perder acceso confirmadamente limpia contacto. Límite 20 contactos × 50 acciones,
expulsando carga más antigua. Sin caché en disco, subida cloud de borrador antes
de Enviar ni reutilización entre cuentas. Propuestas/recibos siguen retención del
origen y cascada al borrar turno; caducar no borra registro. El modelo recupera
últimos 20 estados de dispositivo solo en este chat. Identidades compartidas se
actualizan solo si cambia contenido. Consulta [caché](caching.md).

## Reproducción y comprobaciones de dispositivo

Consulta [infraestructura](infrastructure.md#native-ios-experiments) para App IDs,
App Group, Associated Domains, extensiones, migración, asociación web y reversión.
Requiere instalación correctamente firmada. Tipos de simulador no comprueban firma,
extracción de metadatos, permisos, ciclo de vida, Siri, NFC ni APNs.

Tras release autorizado:

1. Activa un contacto, inspecciona entidades Siri/Atajos y widget y desactiva.
2. Pide cada acción con títulos ficticios; comprueba pendiente/completado, deniega
   permisos, cancela editores y verifica sistema antes de marcar éxito.
3. Actualiza desde ajustes concentración/receta/habla y verifica retirada,
   solicitudes antiguas que no ejecutan y actividades terminadas.
4. Programa/cancela temporizador, prueba Silencio/Concentración deliberadamente y
   ve cuenta/pausa en pantalla bloqueada e Island.
5. Guarda recordatorio en ubicación ficticia/de prueba; ve condición llegada/salida
   en Recordatorios. Sin historial real de ubicación.
6. Comparte texto, URL, imagen y PDF, incluidos no compatibles/grandes; reabre,
   sal/vuelve, conserva borrador no vacío, envía una vez, descarta e inicia en frío.
7. Actualiza offline, toques duplicados, interrupción, acuse perdido, propuestas
   vencidas, quitar contacto, salir/cambiar cuenta. Nunca repitas una acción incierta
   para probar idempotencia con datos personales reales.
8. Confirma ausencia NFC. Resuelve enlace normal como participante, externo y
   visitante web sin sesión.

Verificación actual: tipos API/web y Swift, sintaxis plist/proyecto y SQL contra
esquema migrado vacío solo estáticos. Esta implementación no hace builds, tests,
instalación, firma, acciones reales de modelo/nativas, migraciones de producción ni releases.

## Referencias Apple

- [Live Activities y restricciones](https://developer.apple.com/documentation/activitykit/displaying-live-data-with-live-activities?changes=_6)
- [Programación AlarmKit y requisitos de extensión](https://developer.apple.com/documentation/AlarmKit/scheduling-an-alarm-with-alarmkit)
- [Acceso Calendario y Recordatorios](https://developer.apple.com/documentation/EventKit/accessing-the-event-store?language=objc)
- [Alarmas de geovalla](https://developer.apple.com/documentation/eventkit/ekalarm/structuredlocation?changes=_7_1)
- [App Intents y entradas de sistema](https://developer.apple.com/videos/play/wwdc2025/244/)
- [NFC en segundo plano y Universal Links](https://developer.apple.com/documentation/corenfc/adding-support-for-background-tag-reading)

El manifiesto principal declara motivos de preferencias UserDefaults propias y
metadatos locales/elegidos; Share declara metadatos de archivos elegidos. Describen
uso de API, no revisión App Store completada.
[Documentación Apple de motivos obligatorios](https://developer.apple.com/documentation/bundleresources/app-privacy-configuration/nsprivacyaccessedapitypes/nsprivacyaccessedapitype).

### Verificar ejecución automática en dispositivo

Verifica temporizadores/alarmas desde chat sin abrir experimentos. Desactiva/reactiva
automatismo y confirma antiguas manuales. Sal del chat esperando, fondo/primer plano,
deniega, cambia cuenta y revoca acceso. Reclamos/acuses interrumpidos no deben
duplicar. Verifica herramientas automáticas opcionales y revisión manual Calendario/
ubicación. Necesita dispositivo firmado y sigue pendiente.

Verifica temporizador de dos minutos con backend/app nuevos: bot confirma recibo
sin instrucciones de activación manual y el temporizador sigue visible al chatear
y navegar Cuenta/Chats. Pausa/reanuda/cancela desde sistema y tarjeta; cuenta exacta
sigue presentación y reconoce honestamente indisponibilidad. Prueba caducidad,
denegación, acuse ausente, reinicio, herramientas desactivadas, cuenta y limpieza
antigua concentración/receta. Pendiente dispositivo/modelo; tipos no prueban ejecución.

## Disposición

En iOS, principal arriba; **Herramientas permitidas**, **Ejecutar sin confirmación**
y **Probar en chat** como filas con conteos que abren hojas; enlace a detalles →
**Temporizadores y alarmas** para recibir desde web/personas. Explicaciones, enlace
de contacto y solicitudes tras botones info. En web, lista de capacidades y hojas
Ejecución automática, Estado y recibos, Temporizadores y alarmas remotos y Qué queda
en tu iPhone. Consulta patrón en [contactos](contacts.md#contact-details-layout).

## Acceso a temporizadores/alarmas de contacto compartido

Con 0083, la cuenta del iPhone enlazado permite explícitamente a un participante
actual en **Quién puede enviar a este iPhone** y lo desactiva desde iOS/web.
Compartir contacto o automatismo local por sí solos no conceden acceso. El solicitante
pide en su propio privado y el contacto elige teléfono permitido desde texto o voz.
Ambos muestran recibos de programación. Consulta
[delegación y caché](native-remote.md#allow-a-shared-contact-participant) para
configuración, permisos limitados, revocación/en vuelo, recuperación de envíos y
comprobaciones de dos cuentas pendientes. Este control web no ejecuta frameworks
Apple en navegador.
