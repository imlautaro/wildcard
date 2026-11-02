# Mensajes programados de contactos

Los contactos pueden crear mensajes únicos y de intervalo fijo mediante el bucle
existente de herramientas Muse. Un mensaje lleva la zona horaria IANA del dispositivo;
los clientes antiguos pueden omitirla, en cuyo caso el contacto debe resolver la zona
antes de programar horas locales. No se requiere ejecución del dispositivo en segundo plano.

## Comportamiento para la persona

Pide a un contacto que escriba en una fecha/hora futura o cada diez minutos. El
contacto llama a `create_schedule` y confirma solo un resultado guardado con éxito.
Una hora local ambigua o ya pasada exige aclaración, en lugar de mover la solicitud
a mañana en silencio. El modelo recibe la hora UTC y local actuales. La conversión
de fechas está asistida por el modelo; el servidor valida el formato ISO con
zona explícita, el instante futuro, la zona compatible y el intervalo acotado.
No verifica de forma independiente que el modelo haya interpretado correctamente
el lenguaje natural de la persona. La confirmación debe nombrar la fecha, hora,
zona y repetición resueltas.

Usa `list_schedules`, `update_schedule` y `cancel_schedule` para consultar, editar
y cancelar por chat. Editar reemplaza la especificación completa de una programación
activa y requiere su revisión actual. Las programaciones canceladas/completadas no
se editan; crea otra. También puedes cancelar desde **Programaciones** en el menú
de tres puntos del chat (iOS), incluso mientras el contacto genera: cada programación
es una fila compacta (instrucción, repetición y próxima hora, estado), y puedes
cancelarla deslizando o manteniendo pulsado (VoiceOver: acción Cancelar programación).
La explicación de funcionamiento está tras el botón de información de la barra.
Desliza hacia abajo para actualizar la lista. La creación y los cambios de tiempo
se hacen por chat; no hay formulario separado. La lista se actualiza cada cinco
segundos mientras la pantalla está abierta y la app activa. Una programación única
desaparece cuando su respuesta se guarda con éxito en la conversación, independientemente
de la entrega push. Los trabajos únicos en cola, en curso y fallidos siguen visibles
para no confundir fallos con envíos exitosos. Los registros permanecen almacenados
para historial y comprobaciones de cancelación/push.

Cada programación pertenece al contacto y usuario actuales. Sin destinatario, ese
usuario es el único que la recibe. Para [contactos compartidos](sharing.md), cada
participante tiene programaciones independientes; una programación puede entregar
a otro participante (consulta [más abajo](#messages-for-another-participant)). El
trabajo programado usa la misma cola exclusiva del agente que los mensajes humanos;
otro participante no puede consultar ni cambiar estas programaciones. Eliminar
contactos/cuentas elimina en cascada sus programaciones, recibos, turnos y
notificaciones pendientes. Cerrar sesión quita la inscripción push del dispositivo
según las reglas de sesión existentes, pero no cancela programaciones guardadas.
La generación puede continuar en la nube sin sesión activa de dispositivo.

## Ejecución y recuperación

`contact_schedule` es la fuente de verdad. El Cron existente `* * * * *` llama a
`dispatchSchedules`, selecciona como máximo 50 programaciones vencidas e inserta
condicionalmente un `chat_turn` en cola. La inserción copia la instrucción y revisión,
usa un mensaje de usuario vacío y registra la ocurrencia programada. Un trigger de
base de datos avanza la recurrencia o marca una programación única como `completed`
en la misma transacción. Aquí `completed` significa **despachada**, no entregada con
éxito; la conversación muestra los resultados de generación. iOS etiqueta las
programaciones completadas visibles como **Despachada · pendiente o fallida; revisa
la conversación**.

La inserción condicional comprueba el cursor/revisión original, un turno activo
por conversación de participante y como máximo diez turnos activos por usuario.
Un índice único por programación, revisión y ocurrencia impide además trabajos
duplicados. Un fallo al despachar el Workflow sigue siendo recuperable mediante
la bandeja de salida/Cron existente del chat. No se necesita una llamada externa
de programación del plano de control para crear o cancelar una programación.

La recurrencia se ancla a la primera ejecución solicitada. Cuando un contacto está
ocupado o el servicio se recupera tarde, los intervalos perdidos se combinan en
la última ocurrencia vencida. Los intervalos anteriores no se emiten en ráfaga.
Los trabajos únicos siguen vencidos hasta despacharse, cancelarse o eliminarse su
contacto. Los fallos únicos son visibles en el chat; no crean automáticamente otra
ocurrencia programada. Los fallos de generación recurrente no detienen intervalos
posteriores. Siguen aplicándose los reintentos existentes de pasos de Workflow.
Los turnos programados no se reintentan manualmente, para evitar repetir una
ocurrencia obsoleta/cancelada.

Cada ocurrencia ejecuta el `ChatWorkflow` existente con conversación y memoria
actuales y distingue la instrucción de tarea de una solicitud humana nueva. El
mensaje programado se guarda como mensaje del asistente, contribuye a los no leídos
y usa la bandeja APNs existente. No puede modificar programaciones, y su instrucción
se excluye de la extracción de hechos de usuario para memoria. Las respuestas
programadas completadas siguen siendo buscables como historial del asistente.
Los turnos humanos ordinarios conservan su comportamiento.

## Cancelación, ediciones e idempotencia

Actualizar o cancelar una programación invalida atómicamente los turnos pendientes/en
curso y elimina entradas APNs no enviadas. Las escrituras de respuesta finales, el
encolado push, la consulta de alertas y la última comprobación antes de solicitar
APNs verifican revisión y estado de cancelación actuales. Así se descartan resultados
del modelo en vuelo después de cancelar. Los mensajes ya publicados siguen en el
historial. Una solicitud APNs ya en vuelo o aceptada no puede retirarse, y hay una
carrera inevitable entre la comprobación final de base de datos y esa solicitud externa.

Las mutaciones de programaciones del modelo guardan recibos en el mismo lote D1
que la mutación. Las claves tienen ámbito por turno humano de origen y acción/destino.
El destino de una creación es su primer instante de ejecución, intervalo y destinatario,
por lo que un mensaje humano puede crear varias programaciones (por ejemplo, dos
mensajes a distintas horas), mientras una llamada regenerada para la misma hora y
destinatario repite su primer resultado. Hay como máximo una edición/cancelación
por programación/acción en ese mensaje. Las repeticiones devuelven el resultado
original incluso si cambian los argumentos regenerados, sin aplicar otro cambio.
Antes, una segunda creación en el mismo mensaje se rechazaba y el contacto lo
comunicaba como «solo una programación a la vez». Una solicitud actualizada del
usuario debe ser otro mensaje. Solo un turno humano actualmente en curso puede
crear un recibo. Las rondas existentes de herramientas (tres para turnos humanos,
dos para programados) y seis ejecuciones acotan las operaciones desde el chat.

## Mensajes para otro participante

En un contacto compartido, pide: «Envía a Ana “Estoy saliendo” a las 6 p. m. y
“Ya llegué” a las 7 p. m.». El contacto resuelve a Ana con `list_message_recipients`
y llama a `create_schedule` una vez por mensaje con `recipientUserID`. Con un
destinatario, `instruction` es el texto exacto entregado, máximo 1,000 caracteres
(el límite de instrucción de programación). Antes de guardar, la misma autorización
semántica acotada de un [mensaje privado](sharing.md#private-messages-between-shared-contact-participants)
inmediato comprueba la solicitud humana actual, destinatario, texto, hora y
repetición. Las ediciones vuelven a ejecutarla.

A la hora debida, `dispatchSchedules` entrega sin inferencia, después de esperar,
como cualquier programación, que el chat del propietario esté inactivo (un turno
nuevo terminaría una respuesta en curso). Un lote D1 con clave por ocurrencia
(`schedule-<id>-<revision>-<due>`) inserta:

- un turno completo solo de asistente en el chat del propietario, que despacha la
  ocurrencia mediante el trigger existente e indica que el mensaje se entregó al
  destinatario o, de no ser así, que no se envió nada;
- el mensaje del destinatario, `Message from "<owner>":` más el texto, con el mismo
  recibo `private_contact_message`, comprobaciones de aptitud (compartición actual,
  aislamiento por conectores, consentimiento Contributor) y límites de 12 al día
  que un envío inmediato;
- filas de bandeja push para ambos.

Un despacho repetido no hace nada. La nota al propietario es texto del servidor en
inglés. El texto entregado nunca se regenera a la hora programada, por lo que no
puede apartarse de lo autorizado ni acabar en el chat del propietario. Los mensajes
programados son solo texto. Se permiten intervalos recurrentes y cuentan para los
límites diarios; una ocurrencia que supera el límite se comunica en el chat del
propietario. Una programación única entregada sale de la lista de API cuando existe
su recibo; una no entregada sigue visible como despachada. Si el destinatario deja
el contacto compartido o elimina su cuenta, los triggers cancelan sus programaciones
activas (migración 0089). El destinatario no ve ni cambia las programaciones del propietario.

iOS muestra «Para <name>» en estas filas de **Programaciones**. La app web aún no
tiene pantalla de programaciones ([limitaciones web](web.md)); quienes usan web
las crean y cancelan por chat.

## Límites y tiempos

- Cinco programaciones activas por contacto; veinte por usuario, aplicados al insertar.
- La primera ejecución única debe ser futura y dentro de 366 días.
- Intervalos fijos: 600–2,592,000 segundos (diez minutos a treinta días).
- Instrucciones: 1–1,000 caracteres. No se aceptan URLs externas/destinos de
  proveedores como configuración de enrutamiento.
- No se admiten recurrencias de calendario como cada día a una hora local a través
  de cambios de horario de verano. Los intervalos transcurridos fijos no se ajustan
  por horario de verano ni viajes del dispositivo.
- Las listas de API omiten trabajos únicos guardados con éxito y devuelven hasta
  100 programaciones, primero activas y después las más nuevas. Las herramientas
  del modelo conservan historial completado y devuelven como máximo 20, con
  instrucciones recortadas a 300 caracteres. El límite activo garantiza que quepan
  las programaciones activas. Aún no hay paginación histórica completa.
- API de cancelación: sesenta solicitudes por usuario por minuto.
- La ejecución usa sondeo por minuto más capacidad, generación, reintentos y
  latencia APNs. Es programación aproximada, no un servicio de alarmas exactas.
- Los mensajes recurrentes continúan hasta cancelarlos explícitamente o eliminar
  el contacto/cuenta. Consumen llamadas al modelo y recursos Cloudflare existentes.

## API e instalación

Los endpoints autenticados heredan las comprobaciones de propiedad del contacto:

- `GET /api/v1/contacts/:id/schedules` devuelve `{ schedules: [...] }` con
  `id`, `instruction`, `timeZone`, `nextAt` (milisegundos Unix), `intervalSeconds`,
  `status`, `revision`, `createdAt`, `updatedAt`, `recipientUserID` (anulable) y
  `recipientName` (anulable).
- `DELETE /api/v1/contacts/:id/schedules/:scheduleID` cancela y devuelve
  `{ schedule: ... }`; repetir la cancelación tiene éxito para una programación
  existente. Las inexistentes o de otra propiedad devuelven 404.
- `POST /api/v1/contacts/:id/chat/turns` ahora acepta `timeZone` opcional junto a
  `id` y `text`. Los turnos públicos añaden `scheduleID` y `errorCode` anulables.

Aplica la migración `0011_contact_schedules.sql` mediante la configuración local
existente o un release automático autorizado. Se reutilizan D1, `CHAT_WORKFLOW`,
el Cron de cada minuto, la clave Meta y la configuración APNs opcional. No hace
falta ningún servicio, secreto, permiso de cuenta, dependencia ni binding Wrangler
nuevo. Consulta [configuración de infraestructura](infrastructure.md#scheduled-contact-messages).
Instala la app iOS actualizada para enviar la zona del dispositivo, mostrar mensajes
autónomos sin una burbuja de usuario vacía y gestionar programaciones.

La implementación registra validación estática TypeScript, Swift y SQL. No se han
ejercitado tests en ejecución, llamadas reales del modelo a herramientas,
programación en segundo plano ni entrega APNs para este cambio. Tras un release
autorizado, verifica con contenido ficticio: creación única/periódica, confirmación
de zona, cancelación por chat/UI durante la generación, ediciones, entrega con app
cerrada y aislamiento de propiedad. No registres textos de mensajes, tokens de
dispositivo ni secretos.

La pantalla iOS conserva sus metadatos cargados en una caché de sesión acotada,
los muestra inmediatamente al regresar y revalida en segundo plano. Consulta
[caché de navegación](caching.md#group-navigation-and-secondary-screens) para
deduplicación, invalidación por mutación/acceso y verificación.
