# Trabajo persistente de tareas

Las tareas ya continúan mediante D1, el Cron de cada minuto y `CHAT_WORKFLOW`
después de cerrar la app. La migración 0054 añade progreso explícito y controles
de ejecución a esa misma tarea, chat privado o grupo. No requiere un servicio
nuevo. Este incremento es una base para el paso 2 de la hoja de ruta. La migración
0055 añade una búsqueda web pública explícitamente autorizada por tarea; siguen
pendientes los permisos más amplios para herramientas externas.

## Estado y progreso

- El título de la tarea es el objetivo; usa las notas para describir las condiciones
  de finalización.
- `nextStep`, `evidence` y `result` conservan el progreso entre turnos de trabajo.
  La evidencia es texto plano acotado, como IDs de mensajes/documentos de origen,
  observaciones fechadas o URLs. Es material de trabajo atribuido, no una verdad
  verificada de forma independiente ni permiso para actuar. Cada campo es opcional
  y está limitado a 2,000 caracteres. El tablero compartido del modelo recorta los
  campos de progreso a 300 caracteres; el disparador de trabajo asignado incluye
  su próximo paso y evidencia completos.
- El estado de tarea sigue siendo Por hacer, En curso, Terminada o Cancelada.
  Por separado, `workState` es `active`, `paused` o `blocked`. Una tarea bloqueada
  requiere `blockedReason`; su responsable puede registrar que la falta de
  información/permiso impide avanzar. Solo una persona puede pausar o reanudar.
  Reanudar borra el motivo de bloqueo.
- Los requisitos de dependencia siguen separados: completar/cancelar el último
  requisito hace que el trabajo activo quede listo, pero nunca reanuda trabajo
  pausado o bloqueado explícitamente.
- Ambos clientes muestran los turnos usados, el próximo paso y el motivo de
  bloqueo en el tablero; la evidencia se edita en el editor de tarea. El editor
  ofrece Pausar trabajo, Reanudar trabajo y Cancelar tarea. Reanudar queda
  desactivado cuando se agota el presupuesto de trabajo.

La ruta PATCH acepta `workState`, `nextStep`, `evidence` y `blockedReason` junto
con los campos existentes y requiere la versión de la tarea editada. Los contactos
pueden usar `update_task` para registrar progreso o bloquear su propio trabajo,
pero no reanudarlo. Los controles humanos se autentican con el mismo ámbito de
tareas privadas/de grupo. Un token de edición optimista protege las escrituras
posteriores de programación/dependencias para que una comprobación de versión
perdedora no modifique esas filas después de ganar otra edición.

## Presupuestos y autorización de ejecución

El valor por defecto es seis turnos de trabajo durante toda la vida de una tarea,
más 30 por contacto por día móvil. Son límites de implementación, no decisiones de
producto ni topes monetarios. Pausar/reanudar, reasignar, editar el progreso y
reabrir nunca devuelven turnos. 0054 conserva el mayor entre el contador almacenado
y todos los recibos de trabajo existentes, incluidos ciclos anteriores de
asignación. Las tareas existentes pasan a generación 1 mientras los recibos
anteriores a los controles conservan generación 0: los intentos antiguos en cola
o en curso se detienen con las protecciones nuevas y la siguiente revisión
programada usa el presupuesto restante. Las tareas que ya superan seis muestran
agotamiento y no reciben turnos nuevos. Un turno reservado sigue consumido si
cambia el acceso o falla. Crear otra tarea no es una vía admitida para que los
contactos eludan este límite.

Cada reserva almacena una generación de ejecución. Pausar, reanudar, bloquear,
cancelar, reasignar y reabrir la cambian. Que una persona complete o edite el
objetivo/notas/dependencias también invalida el trabajo anterior. Las ediciones
de progreso de contactos y la finalización de su propia tarea conservan la
generación para que pueda comunicar el resultado. Los IDs de trabajo usan el ID
de tarea, la generación y un contador de turnos conservado monótonamente.

El despachador vuelve a comprobar el estado de tarea/lista, generación,
responsable, requisitos, contador y registro diario dentro de la transacción de
inserción del turno. El recibo, contador y próxima revisión se registran en el
mismo lote. La admisión de grupo comprueba el consentimiento de memoria compartida
y Contributor antes de crear su aviso interno. Los grupos aislados por conectores
conservan Estándar sin conceder MCP en segundo plano.

Los turnos privados comprueban la generación actual antes de la preparación, cada
llamada al modelo de respuesta, cada admisión de herramienta y la escritura
atómica de respuesta. Los grupos usan el acceso actual al origen antes de preparar,
en cada solicitud al modelo de evidencia/decisión, cada herramienta y la escritura
final. El mantenimiento de memoria compartida y la admisión al índice de imágenes
de grupo también vuelven a comprobar el acceso actual. Una generación detenida no
puede volver a ser válida después de reanudar. Los mensajes entregados permanecen
en el historial. El indicador de chat en cola/en curso puede persistir brevemente
hasta que su Workflow observa la generación inválida y sale.

Pausar/cancelar es cooperativo: una solicitud al modelo o herramienta admitida justo
antes del cambio puede terminar, cobrarse y guardar resultados internos. Se rechazan
nuevas admisiones y respuestas no publicadas. Estos controles no abortan trabajo del
proveedor ni deshacen ediciones de documentos ya iniciadas. Siguen los límites y
recibos existentes de respuestas/herramientas; este cambio no introduce un presupuesto
exacto de tokens por trabajo ni crea checkpoints independientes para cada ronda
privada del modelo.

## Herramientas y permisos

El trabajo autónomo conserva herramientas acotadas de recuperación interna, tareas
y documentos. Los contactos pueden leer informes guardados y registrar entregables
en su propio chat. Los turnos de tarea obtienen investigación web solo mediante
el permiso de consulta exacta descrito a continuación. No obtienen MCP, miniapps,
imágenes generadas, acciones nativas, mutaciones de programaciones ni publicación
en otra conversación. Los disparadores de tareas de grupo excluyen explícitamente
MCP, creación de imágenes/apps y capacidades de mensajes privados; la admisión de
ejecución también comprueba la autorización actual del origen para checkpoints
anteriores. La asignación no implica nuevos accesos de memoria entre chats ni
permisos de escritura externa.

## Permiso de investigación pública (0055)

En cualquiera de los editores de tareas, asigna un contacto y guarda; después
introduce una **Consulta pública exacta** en **Investigación web pública** y guarda.
El editor explica que permite una búsqueda con la app cerrada. Vacía la consulta
y guarda para revocarla. La asignación por sí sola no concede acceso a investigación.
Cambiar el responsable borra la consulta y quién la autorizó; guarda esa asignación
antes de autorizar otra consulta. Solo las personas pueden concederla o cambiarla,
a través del PATCH versionado existente (`researchQuery`). Los permisos están
ausentes por defecto en todas las tareas existentes y nuevas, incluidas las creadas
por contactos. Los miembros del grupo compartido pueden editarlos/revocarlos;
los permisos son visibles en ese grupo.

La herramienta `research_web` específica de tareas acepta solo un título de informe.
El servidor lee la consulta pública exacta de D1, de modo que las notas de tarea,
memoria, mensajes y datos de conectores redactados por el modelo no pueden añadirse
a la búsqueda. La persona debe proporcionar información pública; esto no es un
clasificador semántico de texto confidencial que introduzca. Los chats/grupos
con aislamiento por conectores, programaciones, iniciativa y revisiones de
borradores siguen sin ser aptos. La consulta guardada no autoriza ninguna otra
acción externa.

Hay una reserva durante toda la vida de la tarea, separada de sus seis turnos de
trabajo. El recibo de investigación, el registro de cuenta/instalación y el contador
de tarea se guardan en un único lote antes de llamar a Meta. El límite de cuenta
se carga a la persona que guardó la consulta (10 por día móvil); el de instalación
sigue siendo 100. Son valores predeterminados de implementación, no topes monetarios.
Los recibos fallidos, inciertos o eliminados nunca devuelven el contador de tarea.
Pausar/reanudar, reabrir, reasignar, cambiar la consulta y eliminar el informe no
permiten otra búsqueda con coste. Un informe terminado puede leerse con las
herramientas existentes de documentos. Los contactos no deben crear tareas
sustitutas para eludir presupuestos.

La admisión comprueba generación de ejecución, responsable actual, lista activa,
requisitos, pertenencia/memoria compartida y consentimiento Contributor actuales
de quien autorizó, solicitante actual del origen, propiedad del contacto y atención
del agente. Cambiar/revocar una consulta incrementa la generación de ejecución y
programa el trabajo activo apto; el trabajo pausado o bloqueado todavía necesita
reanudación humana. Se vuelve a comprobar antes de enviar y al publicar. Las
solicitudes ya admitidas pueden terminar y costar dinero después de pausar/revocar.
Un borrador listo pertenece a su generación registrada y no puede publicarlo otra
posterior. La misma generación puede finalizar la publicación en otro turno de
trabajo sin volver a buscar. La publicación conserva la transacción atómica
existente de documento/revisión/recibo. No se añade un publicador independiente
ni un endpoint de reintento.

Ambos tableros y editores muestran **intentos de investigación web usados** y el
estado del recibo: **Pendiente o incierto**, **Borrador guardado**, **Detenido antes
de publicar**, **Informe guardado** o **Fallido**. Un borrador listo de una generación
invalidada aparece como detenido. Un recibo pendiente no prueba que una solicitud
se haya enviado o completado en el proveedor; el proceso podría haberse detenido
después de reservar. **Informe guardado** describe la publicación original aunque
luego se haya eliminado. El informe aparece en la lista existente de Documentos
con su procedencia original.

## Monitores de páginas (0056)

Una persona puede guardar una URL pública en una tarea de un contacto; el código
la comprueba e inicia un turno por cambio de un presupuesto separado solo para
contenido nuevo y relevante. Los monitores siguen las mismas reglas de autorización
solo humana, borrado al reasignar y generaciones que la investigación. Consulta
[monitores de páginas](monitors.md).

## Aprovisionamiento, caché y verificación

Aplica 0054 después de 0053 y luego 0055 mediante el proceso existente de
migración/release; consulta [infraestructura](infrastructure.md#persistent-task-controls-migration-0054).
Ambos clientes reutilizan su tablero de tareas propiedad de la sesión y su
revalidación en primer plano cada cinco segundos. Cada mutación devuelve un tablero
completo y sigue las reglas existentes de conflictos, respuestas tardías, pérdida
de acceso y reinicio de cuenta. Ambos editores envían la versión capturada al
empezar a editar; el sondeo en primer plano no puede reemplazarla en silencio por
una más nueva ni renovar un permiso. Cierra y vuelve a abrir tras un conflicto
para editar la tarea actualizada. El progreso permanece en D1 con la tarea y se
elimina mediante las cascadas existentes de contacto/grupo/cuenta; no hay un nuevo
almacén privado en disco del cliente. Consulta [caché](caching.md#task-boards).

La validación estática puede comprobar TypeScript de API/web, tipos Swift y
preparación SQL contra el esquema migrado vacío completo con profundidad de
expresiones 100. No puede establecer la calidad real del modelo, el comportamiento
ante repetición ni la presentación del cliente. Antes de aprobar funcionalmente,
usa tareas ficticias para verificar trabajo con apps cerradas, interrupción y
reanudación, despacho simultáneo, sexto turno, reasignar/reabrir sin devoluciones,
requisitos, pausa humana durante inferencia y entre mensajes, recuperación por
falta de información, listas canceladas, revocación de consentimiento, ediciones
desactualizadas, navegación sin conexión y cambios de cuenta en ambos clientes.
Para investigación, cubre también denegación por defecto, transmisión de consulta
exacta, permisos solo humanos, salida del grupo de quien autorizó, reserva
simultánea para toda la vida, repetición fallida/incierta, borradores obsoletos
tras reanudar, eliminación de informe/turno sin devolución y ambos límites diarios.
Los tests en ejecución, builds, inferencia del proveedor y migraciones/releases
remotos requieren su propio alcance autorizado.

Referencias de Cloudflare comprobadas el 29 de octubre de 2026:
[reglas de repetición/idempotencia de Workflow](https://developers.cloudflare.com/workflows/build/rules-of-workflows/),
[transacciones en lote D1](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch)
y [precios de Workflows](https://developers.cloudflare.com/workflows/reference/pricing/).
Los servicios existentes siguen consumiendo las cuotas de sus cuentas; reutilizarlos
no garantiza funcionamiento gratuito. La inferencia de Meta es independiente.
