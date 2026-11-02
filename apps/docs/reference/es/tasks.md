# Listas de tareas compartidas

Los contactos y las personas pueden mantener **listas de pendientes** en cualquier
chat para trabajar en algo concreto. En un chat privado las listas pertenecen al
chat de ese participante con el contacto; en un grupo se comparten con todos los
miembros y las tareas pueden asignarse a contactos o personas del grupo. Las tareas
pueden esperar a otras (requisitos), de modo que las independientes se ejecutan en
paralelo y las dependientes en serie. Las listas y las tareas pueden cancelarse.

Esta es una primera implementación. Aún no se han verificado la calidad del
modelo, los turnos reales ni la presentación en dispositivos.

## Uso

- **Pídelo en el chat**: «Divide la planificación del viaje en tareas», «Ana,
  encárgate de investigar hoteles y avisa a Leo cuando termines». El contacto llama
  a `create_task_list` o `add_task`. En grupos cualquier contacto puede asignarse
  a sí mismo, a otro contacto o a una persona.
- **Abre Tareas**: el botón de lista de comprobación en la barra superior del chat
  (web; solo mientras el chat tiene una lista activa), **Tareas** en el menú de
  tres puntos (iOS), o **Tareas** en los detalles del chat (iOS y web, siempre
  disponible para que una persona pueda iniciar allí la primera lista). Crea una
  lista, añade tareas, pulsa el círculo para marcar una terminada y pulsa una
  tarea para editar título, estado (Por hacer, En curso, Terminada, Cancelada),
  responsable, notas, próximo paso, evidencia y qué espera. Las tareas de contactos
  también ofrecen **Pausar trabajo**, **Reanudar trabajo** y **Cancelar tarea**.
  **Cancelar lista** cancela la lista y todas las tareas sin terminar. En iOS,
  desliza una tarea para cancelarla. El editor es una hoja en ambos clientes;
  las explicaciones de investigación web, monitor de página y trabajo están tras
  botones de información, con una nota de una línea junto a cada campo sobre qué
  autoriza guardar.
- Cada fila muestra responsable, estado, qué espera (un reloj mientras está
  bloqueada) y el resultado registrado por el contacto. Las tareas de contactos
  en curso muestran una etiqueta **Trabajando** mientras el trabajo está activo.
  Las pausadas, bloqueadas y agotadas muestran su estado de ejecución y los turnos usados.

### Abrir Tareas

La mayoría de los chats nunca tienen tareas, por lo que las barras superiores de
chats y grupos web ya no muestran un botón Tareas permanente (2026-10-31). Aparece
cuando el chat tiene una lista activa. La página lee la caché compartida de sesión
del tablero (`useTasks`), la actualiza al abrir y cada 20 segundos mientras el chat
está visible, para que una lista creada por un contacto durante un turno vuelva a
mostrar el botón sin recargar. iOS ya mantiene Tareas en el menú de tres puntos,
no en la barra, y no cambia. Los detalles del chat conservan Tareas en ambos clientes.

## Ver el trabajo

Los contactos anuncian e informan sus tareas con sus propios mensajes. No hay un
remitente «Tareas» en el chat.

- Mientras el turno de trabajo de un contacto está en cola o en curso, el chat
  muestra una fila a su nombre con puntos animados: «Trabajando en “Reservar el
  hotel”» (chats privados y grupos, iOS y web). El subtítulo de cabecera dice lo
  mismo en privados y «Ana, Leo trabajando…» en grupos (en web tiene prioridad un
  contacto que escribe una respuesta normal; el subtítulo de grupo iOS nunca
  mostró escritura).
- Los turnos privados llevan `taskTitle` en `GET /contacts/:id/chat/turns`; las
  respuestas de instantáneas de grupo llevan `taskID` y `taskTitle`. Ambos llegan
  en los sondeos que los clientes ya realizan, sin caché nueva.
- Cuando un contacto crea o asigna tareas, el prompt le pide indicarlo en su propia
  respuesta (quién hace qué); después el turno de trabajo informa a nombre del
  contacto asignado. El prompt de trabajo de grupo le indica no mencionar nunca
  el aviso interno ni un remitente «Tareas». Es orientación del modelo, no una
  restricción aplicada.

## Turnos de trabajo de contactos

Los turnos de tarea conservan sus herramientas y presupuestos de turnos existentes.
La migración 0055 añade un intento de [investigación web](web-research.md) con una
consulta pública exacta guardada por una persona; asignar no concede búsqueda ni
MCP. Pueden leer/editar un documento de investigación ya guardado en su propio
chat, cuya procedencia sigue correspondiendo a la revisión 1. Los permisos más
amplios de herramientas externas son trabajo futuro. Los
[controles de trabajo persistente](persistent-work.md) exponen progreso,
presupuestos de turnos conservados y pausa/reanudación/cancelación; los turnos
en segundo plano mantienen las herramientas internas existentes.

Normalmente los contactos actúan solo cuando alguien escribe. Las tareas añaden
un disparador: una tarea asignada a un contacto le da su propio **turno de trabajo**
sin mensaje humano.

| Evento | Turno |
| --- | --- |
| Asignada por alguien más (persona u otro contacto), o reabierta | Ahora |
| Su último requisito termina o se cancela | Ahora (`unblocked`) |
| El contacto se la asigna a sí mismo | Revisión en 30 minutos |
| Sigue abierta después de un turno | Revisión proactiva cada 30 minutos |

`dispatchTasks` se ejecuta desde el Cron existente de cada minuto y justo después
de cada cambio de tarea. Una tarea con requisitos pendientes nunca inicia un turno.
Límites (`taskLimits` en `apps/api/src/tasks/data.ts`): seis turnos durante toda la
vida de una tarea, incluidas reasignación y reapertura, y 30 turnos de trabajo por
contacto en 24 horas móviles (`task_work`). Un chat ocupado reintenta al minuto
siguiente sin consumir presupuesto. Son valores predeterminados de implementación,
no decisiones de producto.

Los IDs de trabajo son `task-<taskID>-g<generation>-<n>`. La generación de ejecución
cambia al pausar, reanudar, bloquear, cancelar, reasignar o reabrir, y cuando una
persona completa o edita el objetivo/notas/dependencias. Las ediciones normales
de progreso de contactos conservan esa autorización. Las generaciones anteriores
no pueden iniciar otro paso de herramienta/modelo ni publicar respuestas. La fila
de presupuesto y próxima revisión se escriben en el mismo lote que el turno;
el estado actual, los requisitos y el presupuesto diario se comprueban dentro de
esa transacción. Ni reasignar ni reabrir devuelven trabajo registrado. La migración
0054 cuenta ciclos anteriores de asignación al conservar el consumo existente.

Carencias conocidas:

- Un turno fallido muestra el fallo sin **Reintentar respuesta** (los turnos llevan
  `taskID`); la próxima revisión vuelve a intentarlo.
- El disparador oculto de grupo sigue contando como mensaje más reciente para
  borradores en vuelo de otros contactos (protección de historial sin cambios),
  como antes.
- Las revisiones proactivas no siguen el horario de silencio de iniciativa
  (22:00–08:00), por lo que una revisión puede publicar y enviar push por la noche.

El despacho de grupos ahora comprueba el permiso de memoria compartida y el
consentimiento Contributor de cada miembro antes de añadir un disparador interno,
y usa Estándar para grupos aislados por conectores. La inferencia y publicación
siguen comprobando acceso actual. Los errores del proveedor y el trabajo ya
admitido pueden consumir un turno reservado.

## Alcance del turno

- **Chats privados**: un `chat_turn` en cola con `user_text` vacío y `task_id`,
  despachado como mensaje programado mediante el mismo bloqueo de atención, con
  tres rondas de herramientas (las programaciones mantienen dos). Es autónomo:
  sin MCP, miniapps, acciones nativas, generación de imágenes, cambios de
  programaciones ni publicación en grupos. Puede usar memoria, historial y
  herramientas de tareas y publica una actualización breve para la persona.
  Nunca se agrupa ni se reintenta manualmente; si la tarea terminó, se canceló o
  reasignó antes de ejecutar el turno, este termina sin mensaje. La lista de chats
  muestra «Trabajando en una tarea» mientras está en cola.
- **Grupos**: un mensaje disparador interno («Tarea asignada a Ana: Reservar el
  hotel», `task_id` establecido, sin miembro remitente) y una oportunidad de
  respuesta para el contacto asignado. Se oculta a las personas: lista de mensajes,
  vista previa del chat, no leídos, badges y push omiten filas `group_message` con
  `task_id`, y la respuesta de un contacto no puede citarlo. Los contactos aún lo
  ven en su contexto como disparador del turno. Nombra una persona responsable
  (creadora de tarea, creadora de lista o propietaria del grupo) como `requester_id`,
  por lo que se aplican las comprobaciones existentes de pertenencia, memoria
  compartida y consentimiento Contributor. `groupSourceAccess` lo admite
  estructuralmente (una tarea de las listas de este grupo), para que el contacto
  pueda marcar su tarea terminada y aún publicar o revisar su actualización dentro
  de la misma generación activa. El trabajo pausado, bloqueado, cancelado o
  reemplazado no puede publicar. En el primer borrador se decide si queda trabajo:
  si la tarea ya no está abierta o asignada al contacto, el turno termina sin
  mensaje. Las herramientas de tareas de grupo nunca inician turnos en línea;
  Cron recoge asignaciones nuevas dentro de un minuto para no forzar una revisión
  del borrador del contacto que asigna. El contacto asignado debe responder (como
  una apertura solicitada por una persona) salvo que llegue después un mensaje
  humano; su mensaje gasta energía y puede iniciar las respuestas acotadas habituales de bots.

Los prompts piden al contacto trabajar con la evidencia disponible, registrar el
progreso con `update_task` (en curso con próximo paso/evidencia, terminada con un
resultado breve o bloqueada con motivo cuando necesita información humana),
informar brevemente y no repetir actualizaciones anteriores. Es orientación del
modelo; nada impone la calidad del trabajo.

Para trabajos de escritura, los contactos ponen el ID del documento en las notas
de tarea para que los turnos editen ese [documento](documents.md).

## Herramientas del modelo

Se ofrecen en cada turno privado humano o de tarea (no programaciones ni resultados
de solicitudes a grupos) y en la fase de evidencia de cada borrador inicial de grupo
(no revisiones):

| Herramienta | Efecto |
| --- | --- |
| `list_tasks` | Listas activas con IDs, estado, responsable, requisitos y resultados, más miembros asignables |
| `create_task_list` | Una lista con hasta 50 tareas; `blockedBy` nombra tareas anteriores por posición (`"1"`) |
| `add_task` | Una tarea en una lista; `blockedBy` enumera IDs de tareas |
| `update_task` | Estado, responsable, resultado, notas, título, requisitos, próximo paso, evidencia o motivo/estado de bloqueo |
| `cancel_task_list` | Cancela la lista y sus tareas sin terminar |

Cada mutación guarda un recibo en `task_mutation`, con clave por turno (o respuesta
de grupo) y hash de llamada, para que repetir un paso de Workflow devuelva el
resultado registrado en vez de aplicarlo otra vez. El tablero actual (listas
activas) también forma parte del contexto del sistema.

## Reglas

- Las personas/contactos asignados deben ser miembros actuales: en privado, la
  persona o el contacto; en grupo, un miembro o contacto del grupo. Quienes dejan
  de ser miembros conservan sus tareas y aparecen como «Miembro anterior».
- Los requisitos deben ser tareas de la misma lista, como máximo diez y sin ciclos.
- Límites: 20 listas activas por chat, 50 tareas por lista, títulos de hasta 300
  caracteres (listas 200), notas y resultados hasta 2,000.
- Las ediciones humanas llevan la `version` de tarea; una edición desactualizada
  devuelve 409 y los clientes recargan el tablero. Las ediciones de contactos se
  aplican a la versión actual.
- Las listas se cancelan, nunca se eliminan; se quitan con su contacto o grupo.

## API

Autenticada con bearer, `no-store`. Privada: `/api/v1/contacts/:id/tasks` (tu propio
chat con ese contacto). Grupo: `/api/v1/groups/:id/tasks` (miembros). Las escrituras
se limitan a 60 por cuenta por minuto. Cada escritura devuelve el tablero entero.

| Método | Ruta | Cuerpo |
| --- | --- | --- |
| GET | `/` | Devuelve `{ lists, members }` |
| POST | `/lists` | `{ id (UUID), title, tasks?: [{ title, notes?, assignee?, blockedBy? }] }` |
| PATCH | `/lists/:listID` | `{ title? , status?: "canceled" }` |
| POST | `/lists/:listID/tasks` | `{ id (UUID), title, notes?, assignee?, blockedBy? }` |
| PATCH | `/items/:taskID` | `{ version, title?, notes?, status?, assignee?: {kind, id} \| null, result?, blockedBy?, workState?, nextStep?, evidence?, blockedReason? }` |

## Almacenamiento

La migración `0054_persistent_task_controls.sql` añade estado/generación de
ejecución, progreso/evidencia, tokens de edición protegidos y generaciones de
recibos; consulta [trabajo persistente](persistent-work.md) para compatibilidad y
verificación.

La migración `0046_tasks.sql` añade `task_list`, `task`, `task_dependency`,
`task_mutation` y `task_work`, y columnas `task_id` anulables en `chat_turn` y
`group_message`. Consulta [infraestructura](infrastructure.md#shared-task-lists-migration-0046).

## Caché

Consulta [caché](caching.md#task-boards). Ambos clientes conservan un tablero por
chat y lo revalidan cada cinco segundos mientras es visible.

## Verificación

### Recuperación de IDs de Workflow (29 de octubre de 2026)

Los IDs de recibos de tareas pueden contener dos puntos y superar el límite de
100 caracteres de IDs de Workflow de Cloudflare. Siguen siendo IDs internos de
recibo/turno. El despachador compartido de atención convierte un ID de Workflow
inválido a `chat-` más su digest SHA-256 hexadecimal completo antes de crear la
instancia. Los IDs válidos existentes se conservan. El turno en cola, reclamo de
atención y registro de limpieza se renombran en una transacción D1; no cambian
intentos, generaciones de tareas ni presupuestos consumidos. También repara
reclamos antiguos en cola cuando el Cron de recuperación de cada minuto reintenta
el despacho. El Workflow todavía comprueba la autorización actual de tarea antes
de trabajar; las generaciones invalidadas no pueden adquirir permisos nuevos
mediante recuperación. La limpieza omite IDs antiguos inválidos, que no pueden
referirse a instancias del proveedor, para que no retengan para siempre un bloqueo de vaciado.

El diagnóstico de producción de solo lectura encontró tres reclamos de atención
en cola de 405–702 minutos, todos con IDs inválidos derivados de tareas; una
consulta al proveedor devolvió instancia no encontrada. Pasaron TypeScript de API
y la preparación de las seis variantes SQL de normalización contra el esquema
migrado vacío completo. No se hicieron tests en ejecución, builds, inferencia del
proveedor, escrituras de producción ni release para esta corrección. Recuperar la
cola real todavía requiere un release automático autorizado y observación
posterior. iOS y web usan el mismo despachador corregido y sondeo en primer plano
existente; no hay caché nueva de cliente ni contrato nuevo de API.

La [API de Workers](https://developers.cloudflare.com/workflows/build/workers-api/)
de Cloudflare documenta longitud de ID y caracteres permitidos.

La verificación real del release del 30 de octubre reveló otro problema de tareas
antiguas: publicar intentaba marcar una generación detenida como completa sin
texto del asistente, violando la restricción CHECK existente de `chat_turn` y
reteniendo la atención durante reintentos de pasos. Un turno detenido sin respuesta
ahora termina como fallido con el código existente `GENERATION_INTERRUPTED`; una
respuesta entregada sigue terminando completa. Cambia el recibo de trabajo, no el
estado ni presupuesto de la tarea. Ambos clientes conservan su presentación
existente de tarea fallida sin reintento manual de respuesta. Los Workflows que
ya ejecutan código anterior terminan sus reintentos acotados antes de que
captura/recuperación libere la atención.

D1 rechaza SELECT compuestos con más de cinco términos (`too many terms in compound
SELECT`), a diferencia de SQLite local. El primer release añadió dos ramas `UNION ALL`
a `groupSourceAccess`, haciendo fallar en producción todas las respuestas de grupo
y **Reintentar respuesta**. Los avisos de tareas ahora comparten las ramas existentes
de autor humano y raíz humana. Después se prepararon todas las sentencias de un
turno completo de grupo con dos contactos (81) y todas las de tareas/documentos
(93) en el motor local D1 de workerd (`wrangler d1 execute --local`), que aplica los
límites de producción.

Solo estática: TypeScript de API/web, comprobación completa de tipos Swift para
simulador de iOS y preparación SQL de 43 sentencias de tareas capturadas (incluidas
las ramas nuevas de acceso de grupos) contra todas las migraciones con el límite
de profundidad de expresiones de D1. Sin verificar: comportamiento real del modelo
(crear listas sensatas, asignar e informar sin repetir), turnos de trabajo privados
y de grupo de extremo a extremo, traspaso de requisitos entre contactos, interacción
con energía, cadencia de revisión proactiva y ambas UIs en dispositivo o navegador.

Visibilidad de trabajo y disparadores ocultos (29 de octubre de 2026): TypeScript
de API y web, comprobación completa de tipos Swift para simulador de iOS y las
11 sentencias modificadas (lista de grupos, actividad, mensajes, no leídos,
respuestas de instantáneas, total de no leídos, tres consultas push, protección
de cita de respuesta y turnos privados), con el fragmento real del recibo,
preparadas en D1 de workerd local. No verificado en dispositivo/navegador ni contra
turnos de tareas reales.

## Investigación web con consulta exacta

La migración 0055 añade un campo PATCH `researchQuery` solo humano después de
asignar un contacto. Ambos editores explican transmisión pública, un intento para
toda la vida, revocación y reasignación; ambos tableros muestran uso y estado del
recibo. La herramienta específica de investigación de tareas recibe solo un título
y el servidor envía la consulta guardada. Consulta
[trabajo persistente](persistent-work.md#public-research-permission-0055) para
autorización, presupuestos diarios, protecciones de generación, retención y
verificación de caché.

## Colaboración: entregables y revisiones acotadas (0058)

Varios contactos pueden producir un entregable atribuido mediante tareas y
[documentos](documents.md) existentes:

- **Enlace al entregable.** `create_task_list`, `add_task` y `update_task` aceptan
  `documentID`, que debe ser un documento del mismo chat privado o grupo (`null`
  lo quita; eliminar el documento lo borra). Los tableros muestran
  **Entregable: <title>** y los contactos reciben el enlace en su contexto de
  trabajo, reemplazando la convención anterior de «ID del documento en notas».
  Las revisiones conservan atribución por autor.
- **Bucle de revisión.** Una revisión es una tarea bloqueada por la tarea que
  revisa. Cuando se ejecuta, su responsable la marca terminada (aprobación) o llama
  a `request_changes(taskID, feedback)` en la tarea revisada. Esto la reabre como
  En curso con `reviewFeedback`, incrementa `reviewRounds`, cambia su generación
  de ejecución y da ahora un turno al contacto responsable; la tarea revisora
  vuelve a esperar y recibe un turno `unblocked` cuando termina la corrección.
- **Finalización.** Como máximo dos rondas de revisión por tarea
  (`taskLimits.reviewRounds`); se rechaza la tercera y se indica al revisor que
  termine con la versión actual o bloquee su tarea para una persona. El trabajo
  reabierto sigue consumiendo los seis turnos totales y el presupuesto diario de
  su responsable, de modo que ningún bucle de borrador/revisión es ilimitado.
- **Autorización.** Solo el responsable de una tarea abierta de la misma lista que
  espera a la revisada puede pedir cambios (contactos mediante herramienta;
  las personas aún pueden reabrir directamente). La revisión debe hacerse cuando
  se solicita. Se indica a los contactos que nunca copien chats privados a
  documentos compartidos; el contexto del grupo sigue excluyendo conversaciones
  privadas de otros miembros salvo los permisos explícitos existentes.

Ambos tableros muestran **Ronda de revisión n/2** y, mientras la tarea está abierta,
los comentarios. No hay controles nuevos de cliente: las personas reabren,
reasignan o cancelan con el editor existente. `request_changes` usa los recibos
existentes de repetición (`task_mutation`). Solo comprobaciones estáticas;
ejecuciones con varios contactos, calidad de revisión del modelo y UI sin verificar.

## Monitores de páginas

La migración 0056 permite a una persona adjuntar una URL pública a la tarea de un
contacto. El código la comprueba a intervalos fijos y concede al contacto un turno
separado por cambio (3 al día, 20 por tarea) solo si cambia el texto y coincide con
las palabras clave opcionales. Consulta [monitores de páginas](monitors.md).

## Vaciar el chat que las contiene

[Vaciar chat](chat-lifecycle.md) elimina tableros, tareas, dependencias, recibos de
trabajo, investigación y monitores/comprobaciones, y elimina los Workflows de
respuesta. No pausa ni conserva tareas. Vaciar un grupo corresponde solo a su
propietario y afecta a todos los miembros. Archivar conserva el trabajo en curso.
