# Monitores de páginas

Una persona puede adjuntar un **monitor de página** a una tarea asignada a un
contacto. El servidor comprueba la URL pública guardada a intervalos fijos solo
con código: obtiene, extrae texto, calcula el hash y las diferencias. No llama al
modelo mientras la página no cambia. Un cambio nuevo y relevante concede al
contacto asignado un turno de tarea que recibe las líneas modificadas, para que
pueda contar al chat qué cambió y por qué importa. La migración 0056 añade esto a
las tareas, D1, el Cron de cada minuto y `CHAT_WORKFLOW` existentes. No requiere
ningún servicio, binding ni secreto nuevo.

Este es el paso 3 de la hoja de ruta. Solo hay comprobaciones estáticas; no se
han verificado la obtención real, la detección de cambios en sitios reales, los
turnos de contactos ni la presentación en ambos clientes.

## Uso

1. Abre **Tareas**, asigna una tarea a un contacto y guarda.
2. Abre la tarea otra vez. En **Monitor de página**, introduce una dirección pública
   `http(s)`, elige **Cada hora**, **Cada 6 horas** (por defecto) o **Cada día**, añade
   opcionalmente palabras clave separadas por comas y guarda.
3. La primera comprobación almacena una referencia inicial. Las siguientes registran
   **Sin cambios**, **Vuelve una versión anterior**, **Cambió, sin coincidencias de
   palabras clave**, **Cambio relevante** o **Comprobación fallida** (con un código
   como `REDIRECT`, `HTTP_ERROR`, `TIMEOUT`, `UNSUPPORTED_TYPE`). La fila del tablero
   y el editor muestran las cinco comprobaciones más recientes, los turnos por
   cambios usados y si un cambio está esperando un turno.
4. Vacía la dirección y guarda para quitar el monitor. Cambiar la persona o contacto
   asignado lo elimina; guarda primero la asignación y después añade de nuevo un monitor.

Pausar, bloquear, finalizar o cancelar la tarea detiene las comprobaciones;
reanudarla o reabrirla las continúa. Un contacto que marca su tarea monitorizada
como terminada también detiene el monitoreo, por lo que se indica a los contactos
que mantengan esas tareas en curso hasta que se cumpla la condición de finalización
de las notas.

## Autorización

- Solo las personas pueden añadir, cambiar o quitar un monitor (campos PATCH de
  tarea versionados `monitorURL`, `monitorKeywords`, `monitorInterval`). Los
  contactos no pueden y la asignación no concede nada. Cada tarea comienza sin monitor.
- La URL es exactamente la que guardó la persona (sin fragmento). Debe ser
  `http`/`https` sin credenciales en un nombre de dominio: se rechazan IP literales,
  hosts `localhost`/`.local` y credenciales embebidas. El flag existente del Worker
  `global_fetch_strictly_public` también mantiene las obtenciones en internet
  público. No guardes URLs con tokens privados: la dirección es visible para
  todos quienes pueden ver la tarea y se envía al sitio de destino.
- Las comprobaciones se ejecutan solo mientras quien concedió el permiso conserva
  acceso: en chats privados es la persona del chat; en grupos debe seguir siendo
  miembro (cualquier miembro puede editar o quitar un monitor de grupo). Nunca se
  comprueban chats ni grupos aislados por conectores.
- Un cambio pendiente inicia un turno solo mientras siguen cumpliéndose las mismas
  condiciones (URL guardada, acceso de quien concedió el permiso, sin aislamiento).
- Una persona puede tener como máximo 20 monitores en tareas abiertas.
- La comprobación envía un `GET` con `User-Agent: WildcardMonitor/1.0` y sin cookies
  ni datos de cuenta. No autoriza ninguna otra acción externa, investigación web ni MCP.

## Detección de cambios

| Paso | Regla |
| --- | --- |
| Obtención | Tiempo límite de 10 segundos; no se siguen redirecciones (`REDIRECT`); falla si no es 2xx; solo tipos de texto, HTML, XML/RSS/Atom y JSON |
| Extracción | Primeros 2 MiB del cuerpo; se eliminan comentarios HTML, scripts, estilos, SVG, plantillas e iframes; se quitan etiquetas; se decodifican entidades; se compactan espacios en líneas; se conservan los primeros 64 KiB de texto |
| Comparación | SHA-256 de ese texto contra el hash almacenado |
| Repeticiones | Un hash entre las últimas ocho versiones se considera **Vuelve una versión anterior** (banners rotativos, páginas A/B); sin turno |
| Diferencias | Conjuntos de líneas: añadidas y eliminadas, como máximo 40 de cada tipo, 300 caracteres por línea, 3,000 caracteres en total |
| Relevancia | Con palabras clave, al menos una línea añadida/eliminada debe contener una de ellas (sin distinguir mayúsculas); de lo contrario cualquier cambio es relevante |

Las páginas cuyo texto visible cambia en cada carga (relojes, contadores, contenido
personalizado) producirán cambios; las palabras clave los restringen. No se detectan
cambios después de los primeros 64 KiB de texto extraído. No se ejecuta contenido
generado por JavaScript.

## Turnos del contacto y presupuestos

Un cambio relevante activa un flag pendiente. `dispatchTasks` admite el turno con
un presupuesto separado de los seis turnos de trabajo: 20 turnos por cambios durante
toda la vida de la tarea y 3 por tarea por día móvil, todavía contados dentro de
los 30 turnos de tarea diarios del contacto. El recibo del turno, el incremento del
contador y la limpieza del flag pendiente están en el mismo lote D1 que el turno,
volviendo a comprobar dentro de él el estado, la generación, los requisitos y los
presupuestos actuales. Varios cambios anteriores a un turno se combinan en uno,
que recibe hasta tres extractos de cambios recientes. Al alcanzar el límite total
se detienen las comprobaciones. Son valores predeterminados de la implementación.

Los IDs de trabajo son `task-<taskID>-g<generation>-m<n>`. Usan las protecciones de
generación de ejecución, herramientas y permisos existentes de los turnos de tarea
(privados: sin MCP, miniapps, acciones nativas, imágenes, programaciones ni
publicación en grupos; grupos: el aviso de tarea oculto). Las líneas cambiadas se
presentan como texto de página no confiable; se indica a los contactos que no
sigan las instrucciones que encuentren en ellas y que informen solo lo relevante.

Cada escritura de una comprobación exige la URL y la generación de ejecución con
las que comenzó, para que una URL revocada o reemplazada, o un trabajo pausado, no
reciban un resultado tardío. Cambiar la URL incrementa la generación de ejecución,
borra el cambio pendiente y elimina el texto de página almacenado; la comprobación
siguiente inicia una referencia nueva. Cada comprobación vencida se reclama con
una actualización condicional antes de obtener la página, de modo que ejecuciones
Cron simultáneas la obtienen una sola vez.

## Retención

`task_monitor_state` conserva el último texto extraído (hasta 64 KiB), el hash, los
últimos ocho hashes y las horas de comprobación de la URL actual de la tarea.
`task_monitor_check` conserva las últimas 20 comprobaciones por tarea con resultado,
estado HTTP, código de error y extracto del cambio. Los clientes reciben resultados
y horas, no extractos. Ambos se eliminan con la tarea (cascadas de contacto, grupo
y cuenta). Quitar un monitor elimina su texto almacenado, pero conserva el registro
de comprobaciones hasta que se elimina la tarea.

## API

`PATCH /contacts/:id/tasks/items/:taskID` y `/groups/:id/tasks/items/:taskID`
aceptan, junto con la `version` de la tarea: `monitorURL` (cadena de hasta 2,048
caracteres o `null`), `monitorKeywords` (hasta 300 o `null`) y `monitorInterval`
(`60`, `360`, `1440`). Cada tarea del tablero añade `monitorURL`, `monitorKeywords`,
`monitorInterval`, `monitorTurnsUsed`, `monitorTurnLimit`, `monitorPending` y
`monitorChecks` (las últimas cinco: `checkedAt`, `outcome`, `errorCode`, `httpStatus`).

## Caché

Sin caché nueva en los clientes: los campos del monitor viajan en la instantánea
existente del tablero de tareas, actualizada cada cinco segundos mientras es visible
y reemplazada con cada mutación. Los editores envían la versión capturada al abrirse.
Consulta [caché](caching.md#task-boards).

## Coste y cuotas

Las comprobaciones usan el Cron existente de cada minuto: como máximo cinco
obtenciones por ejecución (por debajo de las 50 subsolicitudes por invocación del
plan gratuito, compartidas con las demás tareas Cron), más algunas lecturas/escrituras
D1 por comprobación. Solo los cambios relevantes causan inferencia de Meta. Las
cuotas de Workers, D1 y Workflows siguen aplicándose; reutilizarlos no garantiza
funcionamiento gratuito.

## Verificación

Solo estática: TypeScript de API y web, comprobación completa de tipos Swift para
el simulador de iOS y las sentencias de `scripts/checks/persistent-task-sql.cjs`
(que ahora incluyen ambas selecciones del despachador y sus presupuestos de
admisión, comprobaciones de monitores y lecturas del tablero), preparadas tanto
contra SQLite con profundidad de expresiones 100 como en D1 de workerd local.
Sin verificar: obtención de páginas reales, calidad de extracción, ruido de las
diferencias, redirecciones, filtrado de palabras clave, reclamos Cron simultáneos,
presupuesto de turnos por cambios bajo concurrencia, revocar o reasignar durante
una obtención, pausar durante un turno por cambio, salida del grupo de quien concedió
el permiso, calidad del informe del contacto y ambos clientes en dispositivo/navegador.
Usa tareas ficticias y páginas que controles cuando se autorice.
