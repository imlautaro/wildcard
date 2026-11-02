# Ciclo de vida del chat y limpieza de recursos

Tanto iOS como web ofrecen Archivar/Desarchivar, Vaciar chat y Eliminar contacto.
En iOS, usa las acciones al deslizar una fila del chat o su menú contextual. En web, haz clic derecho en una
fila para Detalles del contacto/grupo, Archivar/Desarchivar, Vaciar chat… (una hoja con la misma
opción de memoria y confirmación) y, en contactos, Eliminar contacto…, o abre los detalles
desde el título del chat y desplázate al final para estas acciones; las filas
no tienen botón Administrar. Los detalles de grupo también colocan Archivar/Desarchivar y
Vaciar chat, solo para propietarios, junto a las acciones existentes Eliminar grupo/Salir del grupo.
Vaciar chat ofrece **conservar memoria** o **eliminar también la memoria aprendida aquí**, con
una confirmación destructiva explícita. Un chat privado también ofrece eliminar el contacto y
sus datos. La acción Eliminar del editor existente usa la misma cascada del servidor.

Abre **Archivados** desde el menú de tres puntos arriba a la izquierda de Chats en iOS.
El encabezado de la lista web tiene un botón con icono de archivo inmediatamente a la izquierda de
Cuenta; alterna Archivados, con un botón Volver a Chats en el encabezado de archivados.
Ningún cliente muestra una fila Archivados en la lista principal de chats. iOS apila Archivados
en la pila compartida de navegación, de modo que abrir un chat y volver regresa allí.
Ambos accesos reutilizan los stores de listas de sesión, paginación y reglas de actualización
descritos abajo; cambiar el acceso no añade caché ni solicitud independiente.
La verificación en dispositivo/navegador debe cubrir abrir detalles de contacto/grupo, actualizaciones
del estado de archivo, confirmaciones de vaciado con ambas opciones de memoria, eliminación, abrir Archivados, archivos vacíos,
volver desde un chat, desarchivar una fila y volver a Chats.

## Alcance y permisos

| Acción | Ámbito | Efecto |
| --- | --- | --- |
| Archivar / Desarchivar | Un participante, privado o grupo | Mueve la fila entre Chats y Archivados. No marca mensajes leídos, silencia notificaciones ni cancela trabajo. Los mensajes nuevos permanecen archivados. |
| Vaciar chat privado | Fila de contacto del participante autenticado | Elimina su historial y trabajo/recursos del chat, conservando contacto, personalidad, pertenencia compartida, foto y preferencias de conversación. |
| Vaciar grupo | Propietario del grupo, para todos | Elimina historial compartido y trabajo/recursos del chat, conservando grupo, foto, pertenencia, permisos y preferencia de archivo de cada miembro. |
| Eliminar contacto como creador | Todo el agente compartido | Elimina el chat privado de cada participante, recuerdos/personalidad del agente, invitaciones, pertenencias compartidas, mensajes/multimedia de grupo de su autoría, miniapps de grupo atribuidas al agente y tareas asignadas. Los grupos y mensajes de otros autores permanecen. |
| Eliminar contacto como miembro | Pertenencia de ese participante | Elimina acceso, historial privado, programaciones y recuerdos privados aportados. Los chats de otras personas y el agente compartido permanecen. |

Un chat privado vacío tras vaciarlo sale del inicio una vez eliminados sus Workflows
en ejecución (incluido el marcador de onboarding). Sigue accesible desde
Contactos. Un chat privado archivado vacío permanece en Archivados. Un grupo vacío permanece
en su lista actual. Las marcas temporales de archivo pertenecen al servidor y sobreviven a reinstalaciones o
inicio de sesión en otro dispositivo. No son preferencias locales de vista.

## Opciones de memoria

Conservar memoria retiene solo hechos humanos ya extraídos y preferencias propias del agente
cuyas fuentes pertenecen a la conversación vaciada. `retained_contact_memory` y
`retained_group_memory` conservan clave acotada, tipo, contenido, atribución y hora de
actualización (como máximo 64 claves conservadas por categoría y ámbito atribuido). No conservan texto de transcripción, citas de origen, bytes de adjuntos, descripciones
de imágenes, entradas de búsqueda de historial ni embeddings. Estas filas no son una copia
oculta del chat. Los recuerdos nuevos fundamentados sustituyen valores conservados; retractaciones explícitas
privadas de memoria también eliminan valores conservados.

Las lecturas vuelven a comprobar agente/pertenencia actual, ajuste de memoria compartida, aislamiento MCP
y permisos Contributor. Las instantáneas de grupo también retienen el consentimiento Contributor
del origen; una concesión actual no puede mejorar un origen que carecía de ella. Eliminar
un participante o agente elimina sus filas de grupo retenidas. Eliminar contacto,
grupo o cuenta elimina también conocimiento retenido en cascada.

Eliminar también memoria elimina instantáneas conservadas y deja que las cascadas de origen eliminen hechos
actuales, memorias propias, vectores semánticos, eventos de extracción y observaciones de
relación basadas en fuentes de esta conversación. Conserva la personalidad
configurada y recuerdos fundamentados en chats de otras personas u otros grupos. Vaciar
una conversación no puede retirar información que alguien repitió por su cuenta en
otra. Conservar memoria no preserva observaciones transitorias de relación
ni compromisos incompletos representados como recursos de tareas.

## API

| Método | Ruta | Cuerpo / resultado |
| --- | --- | --- |
| PUT | `/api/v1/contacts/:id/archive` | `{ "archived": true }`, o false; 204 |
| PUT | `/api/v1/groups/:id/archive` | Igual; requiere pertenencia actual al grupo |
| POST | `/api/v1/contacts/:id/clear` | `{ "clearMemory": false, "historyRevision": 0 }`; 202 |
| POST | `/api/v1/groups/:id/clear` | Igual; requiere propiedad del grupo |
| DELETE | `/api/v1/contacts/:id` | Semántica existente de creador/miembro; 204 |

Las respuestas de vaciado contienen `{ cleared: true, cleanup: "pending" | "complete" }`.
La aceptación significa que se confirmó la eliminación del historial D1; la limpieza externa puede seguir
pendiente. El servidor admite como máximo seis solicitudes de vaciado por cuenta por minuto.

Los resúmenes de contacto/grupo exponen `archivedAt`, `historyRevision` y `clearing`.
Las páginas de historial llevan `historyRevision`. Vaciar compara la revisión mostrada y
la incrementa atómicamente con la eliminación. Repetir una solicitud de una revisión anterior
no puede borrar historial nuevo. Una revisión futura incompatible devuelve 409. Los vaciados
simultáneos no pueden competir con distintas opciones de conservar/eliminar memoria dentro de la transacción.

Cada envío humano incluye la revisión capturada con su envío pendiente.
La publicación la vuelve a comprobar después de subir adjuntos. Un envío desactualizado/sin conexión
se rechaza con 409 en lugar de recrear mensajes antiguos. Los clientes anteriores sin este
campo funcionan en revisión cero y deben actualizarse antes de enviar a un chat vaciado.
Las lecturas de historial rechazan un vaciado concurrente con sus consultas; los clientes rechazan épocas anteriores
y paginación de épocas mezcladas en lugar de combinar mensajes antiguos con historial nuevo.

## Cascada y limpieza externa duradera

La migración `0063_chat_lifecycle.sql` añade estado de archivo/revisión, instantáneas de memoria
retenida, registro de Workflows y outbox `resource_cleanup`. Los triggers D1 insertan
trabajos de limpieza en la **misma transacción** que elimina filas de origen. Las filas de outbox no tienen
clave foránea padre: una solicitud R2 o Workflow fallida no puede borrar el plan de reintento.

Vaciar elimina mensajes y reacciones, citas, recibos de lectura/entrega,
trabajos push, propuestas/recibos de ejecución nativos, concesiones nativas remotas
(chats privados), imágenes generadas, descripciones de búsqueda de imágenes, resultados de investigación,
tableros de tareas/dependencias/trabajo/monitores/comprobaciones, documentos Markdown/revisiones, miniapps/
estado/acciones, programaciones, iniciativas y visitas de conversación. Los recibos de mutación
de herramientas sin claves foráneas padre se eliminan explícitamente por prefijo de origen.
Vaciar grupo también elimina solicitudes/publicaciones de grupo y sus turnos privados de resultados
en cola. La migración 0064 asocia esos Workflows/multimedia de resultados tanto con el chat
privado como con el grupo de origen mediante `resource_cleanup_scope`; cualquier ámbito puede impulsar
el mismo trabajo y ninguno declara completitud prematuramente. Los enlaces solo se eliminan en cascada desde
el propio trabajo, de modo que borrar filas de origen no elimina una dependencia pendiente. Los conectores de cuenta y opciones existentes de integración no se eliminan solo
por vaciar la conversación.

El registro de Workflows sigue intentos privados/de grupo e instancias proactivas de
iniciativa, incluidas instancias terminales cuyos checkpoints pueden contener texto.
El despacho comprueba registro antes y después de crear. Si una eliminación gana esa
carrera, vuelve a poner la instancia tardía en cola. La limpieza usa la
[API de eliminación de instancias](https://developers.cloudflare.com/workflows/build/workers-api/#delete)
del binding para detener la ejecución y eliminar checkpoints. Libera las reclamaciones de atención coincidentes
solo cuando la eliminación tiene éxito o se confirma que la instancia no existe. La migración 0064
también preserva limpieza después de perder una confirmación de creación y protege las actualizaciones
de backoff contra revisiones nuevas del trabajo. Los productores de recursos
privados/de grupo no pueden insertar en un chat mientras se eliminan sus Workflows
antiguos. `clearing` pasa a cero cuando se vacían sus trabajos de Workflow, permitiendo trabajo nuevo;
la limpieza R2 puede continuar por separado.

La limpieza R2 usa claves inmutables referenciadas y prefijos acotados. Las subidas de audio e imágenes
generados/privados/de grupo registran su ámbito antes de escribir y vuelven a comprobar
su origen después de esperas de proveedor/almacenamiento. Los resultados tardíos inválidos vuelven a poner
su clave en cola. Los trabajos de objetos comprueban referencias de mensajes vivas antes de eliminar. Los barridos de prefijos
empiezan por la primera clave que sobrevive, para que eliminar una página nunca salte entradas.
Tras la primera pasada inmediata de eliminación, los trabajos de objetos/prefijos permanecen para un barrido final
cinco minutos después; cubre subidas ya en curso incluso si se pierde su
respuesta. El registro sobrevive hasta esa pasada. El recolector existente de huérfanos a las 24 horas
sigue siendo respaldo para subidas interrumpidas/antiguas sin ámbito. Los fallos de reemplazo de fotos
antiguas de perfil también usan el outbox duradero.

El Cron de minuto y el `waitUntil` de mutaciones procesan como máximo 40 trabajos por pasada, cuatro a la
vez, priorizando Workflows. Los fallos siguen en cola con backoff exponencial
acotado (hasta una hora); nunca se declaran completados ni se descartan tras cierto
número de reintentos. Una revisión de trabajo evita que una pasada antigua confirme una solicitud nueva de limpieza
creada por una escritura tardía. Los trabajos exitosos normales se eliminan
después de su pasada final. Los logs contienen un evento y tipo de recurso, no contenido de archivos
ni respuestas de proveedores.

Eliminar un contacto generado también elimina su plan/Workflow de generación. Eliminar
un contacto de onboarding elimina su identidad del plan guardado del círculo y pone
los checkpoints almacenados del Workflow original de onboarding en cola para eliminación. Los demás
contactos del onboarding y las preferencias guardadas propias de la cuenta permanecen.

Eliminar una cuenta añade la [migración 0069](admin.md#deleting-an-account): los prefijos R2 de la
cuenta y checkpoints de onboarding se ponen en cola transaccionalmente, incluidos trabajos
sin contacto publicado. Los mensajes escritos/solicitados por la cuenta en grupos ajenos supervivientes
se eliminan antes de que la clave foránea de su autor quede null, junto con su multimedia
acotada, memoria basada en fuentes y Workflows de respuesta. Los tableros/tareas/documentos/
revisiones compartidos atribuidos a la cuenta también tienen limpieza explícita cuando la atribución es
polimórfica y no una clave foránea. Las comprobaciones de despacho/subida de generación cierran
carreras de creación y retratos tardíos. La propiedad existente de grupos compartidos y contenido de otras
personas permanecen; consulta la guía de administración para ámbito destructivo, registros operativos
retenidos y límites de recuperación histórica. La aceptación administrativa devuelve
limpieza pendiente, sin afirmar que Workflows o R2 estén ya vacíos.

## Comportamiento y límites de caché

Ambos clientes mantienen el estado de archivo en las listas existentes de chats de sesión, sin una
segunda caché de archivo. Los resultados cargados/vacíos se representan sincrónicamente; siguen vigentes la actualización,
deduplicación y paginación existentes. Los contactos archivados
usan el mismo límite de páginas cargadas que los chats regulares; Cargar chats anteriores completa las páginas
posteriores. El directorio sigue conteniendo todos los contactos. Los totales no leídos incluyen mensajes
archivados; archivar es independiente del estado de notificación/lectura.

Vaciar/eliminar purga conversación, envíos pendientes, reacciones e instantáneas de tareas,
documentos, miniapps, multimedia y funciones nativas privadas correspondientes. Detiene reproducción de voz
y borra cachés existentes de imágenes/audio de la cuenta, incluidos bytes protegidos de disco iOS
y URLs de objeto web. Las revisiones de historial cambiadas desde otro dispositivo
hacen la misma invalidación antes de que el historial antiguo se proyecte a la lista. Las vistas
abiertas se vuelven a vincular a stores nuevos. Los cambios de cuenta y generaciones de mutación/lectura rechazan
respuestas tardías. No se persisten localmente transcripciones ni datos específicos de archivo.

La limpieza en la nube es eventualmente consistente con servicios externos. No puede retirar
notificaciones ya entregadas, copias/capturas ya descargadas en otros lugares,
retención del proveedor ni acciones ya confirmadas en otro servicio (por ejemplo,
un mensaje MCP enviado, evento Calendar, Reminder o alarma del sistema en un teléfono sin conexión).
El trabajo pendiente del servidor perteneciente a la app se cancela; vaciar historial no deshace esas
acciones externas completadas. Los registros sin contenido de uso de pago/límites y auditoría
administrativa conservan intencionalmente sus reglas existentes de retención para evitar que
vaciar reembolse uso. Las copias de seguridad y logs de plataforma siguen la retención de sus
proveedores. Esta función no promete borrado instantáneo en sistemas fuera de control.

## Estado de validación y verificación manual

La [suite de integración local](chat-lifecycle-testing.md) ahora pasa 38 casos de regresión
mediante rutas reales y bindings locales D1/R2/Workflow, con fallos inyectados,
reintentos, subidas tardías, confirmaciones perdidas de creación, permisos y actualizaciones
de migraciones. La migración 0064 corrige los seis defectos reproducidos documentados allí. No
se realizó eliminación en producción, llamada de pago a proveedor, ejecución en simulador/dispositivo ni comprobación
UI en navegador. El runtime local no establece comportamiento de producción. Antes
de aceptar la publicación, usa solo cuentas y archivos ficticios para la verificación restante
de nube/dispositivos:

- archivar privado/grupo, mensajes nuevos que permanecen archivados, desarchivar, paginación,
  resultados vacíos, reapertura/navegación atrás, actualización sin conexión y cambio de cuenta;
- vaciar con/sin memoria; otros participantes conservan historial privado; se deniega a no
  propietarios del grupo y todos los miembros observan el vaciado del propietario;
- envíos simultáneos/sin conexión, repetición de una respuesta de vaciado perdida después de mensajes nuevos,
  reintentos, Workflows pausados/completados, trabajos de iniciativa y atención del agente;
- filas de origen, índices FTS/vector/imagen, monitores de tareas, recibos de herramientas, registro de
  almacenamiento, objetos privados/de grupo/generados/de voz y versiones obsoletas de avatar;
- fallos inyectados Workflow/R2, reintento/backoff Cron, subidas retrasadas, páginas grandes de prefijos
  y vaciado de cola tras el barrido final de cinco minutos;
- visores abiertos de multimedia/audio, borradores, cachés secundarias y pérdida de permisos en iOS/web,
  incluido un segundo dispositivo que recibe la revisión de historial modificada.
