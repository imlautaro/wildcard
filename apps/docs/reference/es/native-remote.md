# Temporizadores y alarmas remotos de iPhone

Esta implementación permite dirigir una solicitud humana privada directa desde
iOS o web a un iPhone enlazado explícitamente. Usa una alerta APNs visible y la
Notification Service Extension para programar AlarmKit sin abrir la app principal.
Es una vía experimental de dispositivo: la validación estática no demuestra que
los permisos/identidad del cliente AlarmKit o la presentación de cuenta atrás
funcionen desde nuestra extensión firmada en un iPhone físico. El éxito lo
establece un recibo, no la aceptación APNs.

## Activar y probar

1. Aprovisiona `0034_remote_native_actions.sql` mediante el release automático
   existente de commit/push. Conserva la configuración del proveedor APNs.
2. En Apple Developer, activa **App Groups** para el App ID existente de Notification
   Service, además de app principal, Widgets y Share. Asigna el mismo grupo
   (`group.com.imlautaro.Wildcard` por defecto). Xcode debe actualizar el perfil de
   desarrollo. Se requieren `Config/NotificationService.entitlements` versionado
   y ajustes de target nuevos; los archivos de código no cambian el Developer Portal.
3. Instala desde Xcode la app y extensión de notificaciones actualizadas. Ábrela una
   vez tras reiniciar/desbloquear e inicia sesión. Permite notificaciones visibles
   y AlarmKit. En **Experimentos nativos** del contacto, activa temporizadores/alarmas
   y después **Recibir temporizadores y alarmas** en detalles → **Temporizadores y
   alarmas**. El permiso pertenece a participante, contacto e instalación, también
   para contactos compartidos. Como máximo 20 contactos por dispositivo pueden
   tener permiso. La extensión comprueba además la lista local permitida por tipo.
4. En el chat web de ese contacto, envía «Pon un temporizador de dos minutos». No
   hay selector de destino: el contacto elige el teléfono desde el mensaje
   (consulta [elegir teléfono](#choosing-the-phone)). Detalles → **Temporizadores y
   alarmas** muestra los teléfonos disponibles para ti. Un reintento conserva UUID
   de mensaje e instantánea.
5. Bloquea el iPhone con la app en segundo plano y repite. Repite después de cerrarla
   desde el selector de apps. Espera una notificación visible «Preparando…», seguida
   de temporizador/alarma y recibo de dispositivo. No pulses la notificación al
   verificar ejecución desatendida. Comprueba sonido, cuenta atrás y cancelación.
   Después de la corrección de cancelación descrita abajo, el usuario informó de
   un temporizador web→iPhone exitoso en la comprobación guiada con teléfono bloqueado
   del 28 de octubre de 2026. Siguen pendientes la secuencia completa, cierre forzado
   y verificación de alertas/controles.

Los permisos existentes se vuelven a registrar silenciosamente al abrir y cuando
APNs rota el token. Como llega después de iniciar Home, el registro espera a él
(y a notificaciones visibles) sin mostrar error, y reintenta fallos transitorios
de red al abrir otra vez o cambiar el token. Solo pulsar explícitamente **Recibir
temporizadores y alarmas** informa de notificaciones o token ausentes. Es solo iOS:
la web no registra dispositivos APNs.

La vía nativa normal en primer plano sigue disponible sin permisos remotos.
Instalar este binario antes de publicar backend no activa control remoto; su
solicitud de ajustes falla visiblemente. La alternativa existente de capacidades
locales no cambia. Este prototipo no publica automáticamente ni altera capacidades
de la cuenta Apple.

## Transporte, tiempos y recibos

Por cada mensaje humano directo, la API enumera todos los teléfonos que el participante
puede usar para ese contacto (permiso o delegación vigente, propiedad del contacto,
registro push y sesión iPhone no vencida) y los captura como `remoteTargets` en el
contexto nativo del turno, cada uno solo con tipos concedidos. Los clientes no
pueden afirmar destinos; un cliente iOS envía solo su contexto local y su instalación
se excluye. Versiones antiguas de iOS que aún pasan `remoteDeviceID` reciben la
instantánea anterior de un teléfono. Grupos, programaciones, entregas de resultados
de grupos y evaluador de iniciativa no reciben herramientas nuevas de dispositivo.

`request_native_action` crea la entrada normal única `(turn_id, kind)` y campos
de bandeja remota en una sentencia SQL. Registra hora original de disparo, destino,
nonce aleatorio y plazo de reclamo no posterior a 60 segundos tras crear o a la hora
de disparo. El temporizador cuenta hasta esa hora; un push tardío no reinicia toda
la duración original. Una solicitud vencida no reclama ni programa nada. Para
reintentar hace falta una nueva solicitud humana.

El Worker API existente envía una alerta APNs inmediata con `mutable-content: 1`.
Cron puede reintentar pushes no aceptados dentro del plazo, con concesión y como
máximo tres intentos de transporte. La aceptación APNs detiene esos reintentos y
nunca marca la operación completada. Dispositivo/red/política de notificaciones
pueden retrasar o impedir ejecución. No se garantiza entrega exacta, sobre todo
para temporizadores cortos.

El payload contiene una capacidad HMAC con separación de dominio derivada de
`BETTER_AUTH_SECRET` existente y un nonce aleatorio por acción. No comparte
credenciales de sesión de la app principal. La capacidad solo autoriza el reclamo
y endpoint de recibo de esa acción; no permite leer conversación ni acciones
arbitrarias. La extensión obtiene los argumentos canónicos del servidor en vez
de confiar en el push. Comprueba cuenta local, instalación, lista permitida de
contacto/tipo y caducidad. La app principal exige autorización AlarmKit antes de
habilitar un permiso; la extensión deja que `schedule()` aplique el permiso del
sistema, sin tratar su instantánea síncrona de autorización como decisión de
cancelación. Nunca solicita permiso mientras está bloqueado.

El reclamo pendiente→en curso es atómico y nunca se repite, ni con el mismo UUID
de ejecución. Pushes APNs duplicados o procesamiento simultáneo local/extensión
no pueden reclamar dos veces. Cliente y servidor prohíben ejecutar registros
remotos por la vía nativa en primer plano. La extensión guarda un ID de alarma
antes de programar, vuelve a comprobar permisos locales y publica completado
solo después de que AlarmKit confirme éxito. Un acuse perdido nunca vuelve a
programar. Resultados desconocidos/en curso requieren inspeccionar el sistema
antes de otra solicitud. Las operaciones de red usan sesiones efímeras, origen
HTTPS configurado fijo, sin redirecciones/cookies y tiempo límite de seis segundos.
La capacidad se elimina de la notificación entregada, incluida la alternativa por
agotamiento de tiempo. La terminación de la extensión aún puede dejar una operación
sin confirmar.

La espera acotada del modelo ve recibos si llegan pronto; en otro caso el bot
informa entrega pendiente. El chat web muestra los últimos 20 recibos de operaciones
remotas, no una cuenta atrás real inventada. El iPhone importa IDs conocidos de
alarmas de la extensión a su registro protegido al actualizar autorizado en primer
plano y los concilia con AlarmKit. Verificar si las alarmas de extensión comparten
identidad de cliente con la app principal exige dispositivo físico. No infieras
estado en vivo ni éxito de control de un recibo de creación.

## Revocación y aislamiento de cuentas

Desactivar el permiso del iPhone elimina primero la lista local permitida y después
revoca el del servidor. Desactivar tipos también quita permiso local inmediatamente
y concilia el registro en primer plano. Un fallo sin conexión deja bloqueada la
ejecución local aunque el servidor aún liste un permiso obsoleto. **Revocar acceso**
en web quita el permiso del servidor. Actualizar registro renueva permisos existentes;
no recrea uno revocado desde web. Solo activarlo explícitamente en el iPhone puede
recrearlo. Revocar detiene reclamos futuros, pero no deshace alarmas ya programadas
ni operaciones del sistema en vuelo.

Cambiar cuenta/cerrar sesión borra la lista compartida de ejecución. El servidor
exige también sesión registrada actual del iPhone, acceso al contacto, permiso por
tipo y consentimiento actual de modelo. Eliminar sesión/registro push elimina
permisos en cascada; los recibos históricos permanecen con su conversación y
procedencia remota. Compartir un contacto por sí solo nunca da a otra persona
control del teléfono. La delegación explícita y separada de abajo puede dar acceso
a temporizadores/alarmas. Activar control remoto no autoriza acciones autónomas de bots.

## Almacenamiento local y caché

El App Group contiene ahora una lista opcional permitida de cuenta/dispositivo/
contacto/tipo y un traspaso acotado de hasta 200 IDs de alarma, títulos, IDs de
cuenta/contacto y plazos. Ambos usan `completeFileProtectionUntilFirstUserAuthentication`
para leer mientras está bloqueado tras el primer desbloqueo después de reiniciar.
Antes de eso, la ejecución se deniega de forma segura. Es una excepción deliberada
al almacenamiento de borradores con protección completa, necesaria para la función
pedida con dispositivo bloqueado; los borradores no cambian. No se guardan
credenciales de cuenta ni secretos bearer reutilizables de dispositivo en el
almacenamiento compartido.

La app importa registros de traspaso confirmados por el sistema a su registro
protegido y elimina archivos compartidos importados. Los registros no activos de
la misma cuenta posteriores a su hora de disparo más 24 horas se purgan al actualizar
autorizado. Los IDs de operaciones posiblemente exitosas sobreviven al cierre de
sesión para que la misma cuenta los inspeccione después. El límite de 200 archivos
deniega de forma segura en lugar de descartar IDs.

Las instantáneas web de dispositivos/recibos pertenecen a la sesión, se limitan a
20 contactos, reutilizan resultados vacíos y deduplican solicitudes en vuelo.
El sondeo existente de chat visible actualiza la instantánea con frescura de cinco
segundos. Navegar reutiliza contenido utilizable ante fallos; actualizar dispositivos
explícitamente omite la frescura. Reiniciar sesión, quitar contacto y pérdida de
acceso confirmada limpian estado y rechazan respuestas tardías. Revocar con éxito
actualiza caché inmediatamente y revalida; los envíos pendientes conservan su
destino original e ID idempotente. Complementa [caché](caching.md), no crea una
caché persistente nueva de navegador.

## Permitir a un participante de contacto compartido

La migración `0083_delegated_remote_native.sql` añade permisos explícitos de
participantes. Una vez que ambas cuentas aceptan el mismo contacto:

1. En el iPhone destino, activa tipos temporizador/alarma en **Experimentos nativos**
   y **Recibir temporizadores y alarmas** en detalles como antes.
2. En detalles → **Temporizadores y alarmas** de ese iPhone (o la misma fila en web),
   activa el participante deseado bajo **Quién puede enviar a este iPhone**. La
   delegación tiene clave por instalación del propietario. Autoriza solicitudes
   sin aprobación por acción. Solo da los tipos actualmente habilitados.
3. Ese participante solo pide en su propio chat privado con el mismo contacto
   compartido, por ejemplo «Pon un temporizador de diez minutos en el teléfono de
   Lucía» o «despierta a mi esposa a las 7». Texto y voz se comportan igual. No
   añade una interfaz de comandos por llamada de voz en vivo.
4. Desactiva el interruptor del participante en cualquiera de los clientes para
   quitar solo su permiso. Desactivar el permiso remoto padre elimina todas sus
   delegaciones; eliminar participante/contacto/cuenta/sesión/dispositivo también
   elimina los permisos dependientes.

Solo la cuenta del iPhone puede delegar su dispositivo. Ser creador del agente
compartido no autoriza controlar el dispositivo de otro participante. Quien recibe
la delegación no puede volver a delegar, registrar teléfonos ajenos, leer su chat
ni acceder a Calendario, Recordatorios, cuentas atrás en vivo u otros datos del
sistema mediante este permiso. Los teléfonos disponibles identifican al propietario
por nombre de cuenta; los sufijos de instalación los distinguen. Los historiales
privados siguen separados. Una instantánea devuelve como máximo diez teléfonos
destino vigentes, tres participantes adicionales y treinta delegaciones salientes.

La tabla aditiva referencia el contacto privado del destinatario y el permiso
existente `(device_id, contact_id)` del propietario, con borrado en cascada. Una
vista de acceso vigente comprueba que ambos contactos pertenecen al mismo agente.
Cada delegación nueva recibe identidad aleatoria; habilitar duplicado la conserva,
pero revocar/reactivar crea otra. Un turno captura esa identidad y la clave/nombre
del dispositivo resueltos por servidor. Una solicitud revocada no vuelve a ser
válida al reactivar el permiso. Los turnos anteriores de cuenta propia sin esa
instantánea siguen restringidos al permiso original de la misma cuenta.

Creación de acción, selección push y reclamo atómico comprueban acceso actual y
tipo concedido. Se comprueba consentimiento de modelo del solicitante y propietario
antes de entrega y reclamo. Las identidades push y canónica usan la cuenta/contacto
del propietario, así que la extensión sin cambios valida la lista local existente
y archiva IDs bajo el propietario correcto. La identidad solicitante queda en
servidor; los recibos solo en el chat privado solicitante. Revocar bloquea reclamos
futuros, incluso pushes entregados sin reclamar. No retira operaciones ya reclamadas
ni elimina alarmas existentes; quítalas en el iPhone. Siguen las reglas anteriores
de entrega/caducidad y resultados inciertos.

### Elegir el teléfono

El 2026-11-01 la selección explícita por chat se reemplazó por elegir desde el
mensaje. `request_native_action` recibe `device`: `this_iphone` (vía local del iPhone
solicitante) o un ID de instantánea como `r1`. El prompt enumera teléfonos con
propietarios y tipos. Una persona nombrada significa su teléfono; sin nombre,
el propio del solicitante (`this_iphone`, o su único teléfono remoto propio);
si solo aparece un teléfono ajeno, «el teléfono de mi esposa» puede resolver a ese.
Una persona ausente recibe «no lo ha permitido», nunca un sustituto; una ambigüedad
real produce una pregunta corta. El servidor rechaza IDs fuera de instantánea,
tipos ausentes y un segundo teléfono para el mismo tipo en un mensaje (una acción
por tipo y mensaje). `device` se quita del payload guardado que lee la extensión.
Recibos y confirmación nombran el teléfono, haciendo visible una elección incorrecta.

Comprobación real en D1 local con cuentas ficticias (Contributor): «Pon un temporizador
en el teléfono de Lucía» y «alarma en el teléfono de mi esposa» eligieron a Lucía;
«Pon un temporizador de 3 minutos» del propietario en web eligió su propio iPhone;
una solicitud sin nombre del delegado recibió aclaración; «teléfono de Pedro» se
rechazó. No se ejercitó entrega push (clave APNs de ejemplo).

`GET /contacts/:id/native-remote` añade `owned` a dispositivos más `participants`
y `delegations` salientes. Las rutas autenticadas solo del propietario son
`PUT` / `DELETE /contacts/:id/native-remote/:deviceID/participants/:participantID`.
El ID de participante es un ID de contacto participante actual de esa instantánea,
nunca email ni cuenta propietaria afirmada por cliente. No cambian rutas existentes
de registro/revocación. Sin secreto, binding ni entitlement Apple nuevo.

### Caché de delegación y verificación

La web amplía su caché de sesión existente de veinte contactos/cinco segundos.
iOS usa `ContactsStore.remoteSnapshots` mediante `NavigationSnapshotCache`
(ocho instantáneas, con tamaños de respuesta acotados descritos). Resultados vacíos
y recibos cargados se muestran sincrónicamente al regresar; vistas activas visibles
actualizan cada cinco segundos y la actualización manual omite frescura. Las
lecturas se deduplican y errores transitorios conservan instantáneas utilizables.
Los cambios de permiso exitosos reemplazan localmente el afectado, invalidan lecturas
anteriores y revalidan. Compuertas de mutación por contacto impiden escrituras
competidoras. Perder contacto/acceso quita instantáneas y reemplazar sesión cambia
su dueño; cambiar modelo las invalida. Lecturas tardías no restauran permisos
quitados. Nada se persiste en navegador ni archivos iOS adicionales. Los envíos
pendientes viven en almacenes de conversación existentes y conservan reglas de
expulsión. Los permisos en caché nunca autorizan una operación.

Se registran tipos API/web, comprobaciones Swift y preparación SQL con esquema
vacío. Lo estático no ejercita builds, tests en ejecución, pushes, permisos de
cuentas reales ni alarmas. Antes de afirmar operación entre dos cuentas, verifica
con cuentas ficticias: sin permiso por defecto; permiso del propietario; temporizador
y alarma del delegado desde ambos clientes, incluida voz; elección correcta con
dos teléfonos; recibo bloqueado/segundo plano; revocar antes de reclamar; revocar/
reactivar no revive turnos; desactivar permiso padre/tipo; quitar/reincorporar
participante; actualizar fallido/sin conexión; atrás/reabrir con instantáneas
vacías; cambio de cuenta durante lectura/mutación; intentos de permisos a sí mismo,
redelegados o de agente ajeno; push duplicado y recibo desconocido. Confirma alarmas
reales del sistema aparte de los recibos.

### Ajustes y disposición del chat

Los ajustes están en detalles → **Temporizadores y alarmas** en ambos clientes;
el chat no tiene control de dispositivo. iOS muestra **Teléfonos que puedes usar**
(otros teléfonos) y después **Este iPhone**: **Recibir temporizadores y alarmas**
con una línea de estado (Desactivado, Conectando este iPhone, Pausado porque
notificaciones o AlarmKit están desactivados con **Abrir Ajustes**, o Activado),
y **Quién puede enviar a este iPhone**, con el propietario y un interruptor por
participante actual. Experimentos nativos enlaza la misma pantalla. Web abre una
hoja con teléfonos utilizables y, para uno propio, interruptores de participantes
y **Dejar de recibir en tu iPhone**. Los recibos nombran el teléfono («Configurado
en el iPhone de Lucía»); `deviceName` ahora lleva el nombre del propietario en
los teléfonos ajenos.

## Iniciativa autónoma futura

El transporte de servidor bandeja/reclamo/recibo es reutilizable por un futuro
planificador autónomo. Esta implementación solo lo expone a turnos humanos privados
directos. El planificador de iniciativa no cambia y no crea alarmas/temporizadores
solo. Antes de anunciar esa capacidad hace falta permiso autónomo separado por
contacto/dispositivo, política y registro de origen, límites, semántica de programación
y revocación. No se infiere permiso de fondo de memoria compartida ni iniciativa ordinaria.

## Validación e instalación independiente

Consulta [infraestructura](infrastructure.md#remote-native-device-execution) para
configuración reproducible y reversión. Las comprobaciones locales estáticas
cubren tipos API/web, Swift de app y extensión con restricciones API de extensiones,
sintaxis plist/proyecto y compilación de 22 variantes SQL contra 34 migraciones
en SQLite vacío en memoria. No envían pushes, programan alarmas reales, prueban
respuestas del modelo, verifican firma Apple ni establecen aprobación App Review.
No se ejecutaron tests ni builds para esta implementación.

Casos de dispositivo obligatorios: segundo plano frente a cierre forzado y antes
del primer desbloqueo, denegación de permisos, Concentración, pérdida/retraso de
conectividad, push duplicado, interrupción de reclamo/recibo, revocar en web y
reabrir iOS, desactivar tipos, cambiar cuenta, eliminar contacto/perder consentimiento,
varios teléfonos, eliminar origen y visibilidad/control de alarmas en app principal.
Comprueba recibos backend y estado real del sistema de forma independiente.

Fuentes: [comportamiento de extensiones Apple](https://developer.apple.com/forums/thread/808088),
[requisitos de extensiones de notificaciones](https://developer.apple.com/documentation/usernotifications/modifying-content-in-newly-delivered-notifications),
[ejemplo AlarmKit](https://developer.apple.com/documentation/alarmkit/scheduling-an-alarm-with-alarmkit)
y [prototipo de programación desde extensión demostrado independientemente](https://blog.jacobstechtavern.com/p/apps-system-design).

### Diagnósticos de cancelación

El prototipo original agrupaba identidad de solicitud, caducidad, revocación local,
cancelación de notificación e instantánea de autorización AlarmKit de la extensión
en una rama `cancelled`. Un recibo Cancelado no identificaba qué condición falló.
Ahora la extensión da un motivo visible distinto por cada cancelación de validación.
Su instantánea de autorización es solo diagnóstica: la autorización de la app
principal sigue siendo obligatoria al activar remoto, y AlarmKit valida permiso
con `schedule()`. No se solicita permiso desde la extensión ni se elude autorización
del sistema. Un error al programar queda desconocido, nunca completado, porque un
error o acuse perdido no prueba ausencia.

Las entradas OSLog acotadas contienen solo etapa, enum de autorización y dominio/código
NSError, nunca tickets de acción, IDs, payloads ni mensajes. La notificación visible
distingue errores al programar de rechazos de solicitud. No cambian contrato de
estado backend, caché web de recibos ni vía de primer plano. Hace falta binario iOS
nuevo y solicitud nueva: no se repiten operaciones antes canceladas. Identidad y
permisos de extensión siguen necesitando comprobarse en iPhone físico; este cambio
solo no prueba que AlarmKit programe desde la extensión.

El 28 de octubre de 2026, después de instalar la corrección y pedir bloquear el
teléfono y solicitar un temporizador web nuevo, el usuario informó que funcionó.
Es un caso exitoso informado por usuario, no confirmación trazada independiente de
la causa anterior, cierre forzado, sonido al vencer ni controles de app principal.
