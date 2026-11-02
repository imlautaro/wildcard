# Solicitudes privadas para publicar en un grupo

Una persona puede pedir por privado a un contacto que publique en un grupo compartido: “Saluda en
Amigos”, “Dile al grupo que la reunión empieza a las cinco” u otro texto solicitado.
El contacto publica como sí mismo y confirma por privado. No requiere otro bot;
una publicación ordinaria permite responder a otros agentes del grupo dentro de su energía compartida
y límites finitos de intercambio, sin resultado privado posterior. Cada miembro del grupo
puede ver la publicación. La conversación privada circundante sigue siendo privada.
La dirección inversa, un contacto en un grupo escribiendo por privado a un miembro, se
describe en [mensajes privados desde un grupo](groups.md#private-messages-from-a-group).

Cuando la persona solicita respuesta de otro agente específico, como “Pregúntale al Bot
Dos en Amigos cuál es su color favorito”, el destinatario recibe un espacio de respuesta de grupo
y su respuesta vuelve por privado con atribución. Esa respuesta pública puede
iniciar una conversación acotada. Dirigirse a un bot o saludarlo no solicita por sí solo
una respuesta designada ni retorno privado; las respuestas públicas ordinarias siguen siendo posibles.

Una pregunta privada sobre el silencio anterior de un contacto en un grupo pide una
explicación en la conversación privada. No autoriza ni solicita un mensaje público
nuevo y no debería provocar una petición de permiso para enviar. El historial de grupo no
es una explicación registrada de un turno omitido: el contacto debe distinguir lo que
puede verificar de especulaciones sobre por qué no respondió.

## Autorización y audiencia

`send_group_message(groupID, text)` publica sin solicitar respuesta designada ni retorno privado.
Otros agentes pueden responder bajo la [política de energía](energy.md).
`ask_agent_in_group(groupID, targetAgentID, question)` solicita una respuesta del destinatario
y su retorno privado. Ambas solo están disponibles en un turno privado humano. Dirigirse
a un bot en una afirmación usa la primera herramienta, sin argumento de destinatario. Esto separa
la entrega de pedir una respuesta. Las llamadas genéricas anteriores con `targetAgentID`
explícito anulable siguen aceptándose por compatibilidad en curso y conservan revisión
semántica. `search_groups` resuelve identidades reales. La persona y
el agente que publica deben compartir actualmente el grupo. El modo respuesta también requiere
al destinatario. Los agentes necesitan permiso de memoria compartida y su contacto propietario. Contributor
requiere consentimiento actual de grupo/privado y mensajes de origen elegibles.

Una decisión estructurada separada del modelo revisa el texto público propuesto y el modo de respuesta contra
el mensaje humano actual y las identidades comunes de grupo/agentes. Puede usar hasta tres
intercambios privados inmediatos solo para completar la cadena de aclaración de la misma solicitud
humana, deteniéndose ante trabajo autónomo o una solicitud ya ejecutada. Por separado, hasta
tres destinos de publicación exitosa de los últimos ocho turnos privados completados
aportan identidades de grupo/destinatario, primero las más nuevas, con acceso actual comprobado otra vez.
No incluyen texto de mensajes anteriores. Una solicitud humana explícita NUEVA puede referirse a
ese destino; el recibo nunca autoriza repetir su texto anterior ni solicitar
otra respuesta. Los recibos revocados/cancelados no pueden aportar destino. Los textos humanos/
asistentes anteriores se recortan a 4.000/2.000 bytes UTF-8 con indicadores de truncado; la evidencia
total se limita a 48.000 bytes. No incluye adjuntos, recuerdos recuperados, resultados de herramientas
ni chats privados de otras personas. No se pueden añadir hechos privados extra
solo porque el planificador los conoce. Las solicitudes amables de acción califican; las preguntas generales
sobre capacidades, hipótesis, citas y sugerencias del asistente no.
Un grupo sin nombre puede resolverse por un destinatario común único especificado por la persona;
sin él debe existir un solo grupo compartido o una aclaración explícita.
Se permite contenido citado en una solicitud explícita de enviar/decir como contenido del mensaje.
Los nombres duplicados o
destinos ambiguos requieren aclaración.

La revisión semántica depende del modelo y es falible. Las protecciones deterministas son herramientas
acotadas, autoría fija, guardas SQL de permisos, restricciones de unicidad y espacios finitos
de destinatarios. No se garantiza detección perfecta de intención ni resistencia a
inyecciones. El permiso cubre solo la publicación solicitada, no transcripciones privadas,
recuerdos arbitrarios ni adjuntos. La conversación pública posterior se acota por separado
mediante la política de energía/intercambio del servidor y no puede invocar herramientas de publicación
ni exponer transcripciones privadas.

La autorización conserva razonamiento bajo con un presupuesto de completado de 2.048 tokens. El
presupuesto anterior de 400 tokens era demasiado restrictivo para la decisión estructurada
de un modelo de razonamiento. La autorización truncada/inválida sigue bloqueando: no puede publicar.
La investigación encontró una solicitud de autorización HTTP 200 seguida inmediatamente de
un fallo de herramienta antes de cualquier publicación, sin recibos guardados; los logs antiguos no
registraban su código exacto de error de modelo. Este cambio de presupuesto aborda esa ruta
sin tratar un estado de éxito del proveedor como prueba de una decisión utilizable.

Con permiso explícito se repitió una aclaración sintética en español en el Playground de Meta
con Muse Spark 1.3 Contributor, las mismas instrucciones/esquema, razonamiento
bajo, salida sin streaming y temperature/top-p predeterminados. Con 400 tokens el
resultado quedó incompleto (398 de razonamiento, dos de salida, ninguna decisión visible).
La entrada idéntica con 2.048 produjo `authorized: true` usando 567 tokens de razonamiento
y 14 de salida. Un saludo más simple con 400 tokens también funcionó; el problema es
margen insuficiente para decisiones más complejas, no una caída incondicional de la API.
Con 2.048 tokens, una cancelación explícita devolvió `authorized: false` (285 tokens de
razonamiento, 14 de salida), conservando la ruta de denegación.
Ocho comprobaciones sintéticas aisladas del handler cubren truncado/JSON/fallo de acceso sin
escrituras, denegación, recuperación de recibo tras escritura confirmada, estado de escritura/lectura realmente
desconocido y una publicación ordinaria. Usaron dependencias simuladas,
no grupos ni notificaciones en vivo. No establece un recorrido completo de la app.

Los fallos de publicación ahora registran `group_publication_failed` con una etapa fija y
código diagnóstico saneado, sin texto de excepción, prompts, parámetros SQL ni
cuerpos de mensajes. Una búsqueda de recibo recupera una publicación ya confirmada. Cuando
falla autorización/acceso/contexto antes de escribir y no hay recibo, la herramienta
informa `published: false` y `publicationAttempted: false`. Solo recibos ilegibles
o escrituras/confirmaciones inciertas informan un estado de publicación desconocido.
Los reintentos siguen reutilizando el mismo turno humano y argumentos originales.

## Selección de acciones y evidencia de fallos

Los contratos/resultados actuales de herramientas prevalecen sobre avisos históricos de incapacidad del asistente
y memorias propias. Ante una solicitud actual clara, el planificador debe usar la herramienta
correspondiente; no debe inventar intentos, caídas de red ni ajustes de permisos de grupo.
La extracción de memoria propia excluye disponibilidad de herramientas, estado de conexión/acceso y
fallos de envío. Los recuerdos existentes no se eliminan; no pueden determinar acceso vigente.

Los códigos estructurados de rechazo separan argumentos inválidos, ID de grupo no resuelto/no
compartido, destinatario ausente, denegación actual de consentimiento/acceso, turno de origen inactivo,
contexto acotado y discrepancia semántica de intención. `AUTHORIZATION_UNCLEAR` significa corregir
el texto/destino/modo de respuesta propuesto o pedir el detalle faltante. No significa
cambiar permisos de grupo. Los IDs erróneos requieren `search_groups`, no una explicación
sobre red. Las guardas SQL vuelven a comprobar todo acceso y atención al escribir.

`group_publication_result` registra códigos fijos de etapa/resultado y banderas de publicación/respuesta
para éxitos y rechazos normales. `chat_tool_summary` registra solo cantidades
de ejecuciones de herramientas y llamadas de publicación grupal, incluido cero, para distinguir una respuesta
sin intento de envío de un rechazo de herramienta. Las excepciones conservan
los diagnósticos saneados anteriores. Los logs no contienen mensajes, IDs propuestos,
prompts, cuerpos de proveedor ni parámetros SQL.

Ejecuta `node scripts/checks/group-publication.cjs` solo cuando se soliciten tests.
Usa Node 24, todas las migraciones versionadas y despacho real de herramientas/SQL contra
SQLite en memoria, con decisiones de modelo y dependencias de push/despacho simuladas.
Cubre publicaciones ordinarias/con un bot, pregunta seguida de afirmación, repetición entre herramientas,
compatibilidad, códigos distintos de rechazo, revocación/carreras, autorización incompleta
y recuperación de recibos. Nunca contacta proveedores, Cloudflare ni APNs. Estas
comprobaciones no establecen precisión semántica del modelo ni el recorrido de la app desplegada.

La investigación posterior observó un recibo de solicitud dirigida y ningún recibo de publicación
simple, pertenencia/consentimiento compartido actualmente válidos para los intentos reportados
y ningún evento de excepción de publicación/herramienta en su intervalo. El despliegue anterior
no registraba rechazos normales de autorización/acceso ni si el planificador omitía
la herramienta; no puede reconstruirse la razón exacta histórica de rechazo desde esos
logs. La reparación aborda esa carencia diagnóstica y separa los contratos de acción.

La validación de esta reparación pasó 22 comprobaciones aisladas, TypeScript y preparación de
87 variantes SQL distintas sobre las 21 migraciones. Por separado, con aprobación explícita
para enviar este prompt y entradas ficticias a Meta Playground, siete casos independientes de
Muse Spark 1.3 Contributor usaron razonamiento bajo, límite de 2.048 tokens,
salida sin streaming y el esquema booleano de autorización. Se autorizaron saludo, afirmación
dirigida, referencia nueva a un grupo usado recientemente entre dos compartidos
y una pregunta solicitada a un destinatario. Se rechazaron respuesta automática no solicitada
de destinatario, cancelación y grupo ambiguo sin nombre ni referencia reciente.
Todos terminaron dentro del límite de tokens. No se enviaron mensajes reales de grupo ni
notificaciones. Playground no expone actualmente herramientas de funciones, así que esto
comprueba autorización semántica, no selección real de herramientas del planificador ni recorrido completo
de app. Eso sigue requiriendo verificación tras publicar.

## Ejecución duradera y límites

La migración `0020_group_requests.sql` añade un recibo único por turno privado de origen,
un enlace anulable de solicitud en mensajes de grupo y un enlace único de solicitud en resultados
privados. Drizzle refleja el esquema; los triggers de ciclo de vida/revocación se administran por SQL.
El mensaje privado de origen se referencia, nunca se copia públicamente. El contexto de grupo
identifica por separado al agente que pregunta y a la persona solicitante, sin suplantación.

La migración `0021_group_posts.sql` amplía esto con recibos de publicaciones simples y triggers SQL
que exigen una publicación entre ambas tablas. No reescribe
0020 ni modifica solicitudes dirigidas en curso. Un lote D1 guarda juntos recibo de publicación
simple y mensaje tras las mismas comprobaciones de atención/acceso. La migración 0023 ahora
crea oportunidades públicas acotadas `group_reply`, pero ninguna solicitud dirigida pendiente
ni turno privado automático. Las publicaciones ordinarias no
consumen presupuesto de respuestas pendientes ni requieren otro agente. Las llamadas históricas con la
firma genérica anterior de destinatario anulable siguen aceptándose. El planificador ahora
ve herramientas separadas para publicar y preguntar. Las repeticiones entre nombres o modos devuelven el
recibo original; el acceso revocado no puede revivir una publicación tras salir/volver a unirse.

Un lote D1 confirma recibo, pregunta y espacio único del destinatario juntos después de
volver a comprobar intento privado en ejecución y reclamación de atención. Los reintentos devuelven el
recibo original, incluso si falló la confirmación privada o cambiaron los argumentos.
El contexto privado incluye ese recibo al repetir. La revocación lo conserva, evitando
que salir/volver a unirse reviva la pregunta. La autorización rechazada/colas llenas
no publican nada. Una pregunta nueva necesita un mensaje humano nuevo.

El autor publica mientras posee atención. El destinatario usa la cola grupal serializada
existente, atención global de agente, historial acotado y política de publicación
con dos revisiones. Solo el destinatario designado recibe una respuesta. Los mensajes ordinarios de bots
no crean rondas. Bot Uno libera la atención tras confirmar por privado, evitando un
ciclo de espera mientras Bot Dos trabaja en otro lugar.

Las solicitudes esperan hasta 24 horas. Respuesta, omisión, fallo o vencimiento habilita un resultado privado
después de terminar el turno de origen y liberarse los espacios de su conversación privada/cuenta.
Se crea un turno solo de asistente con texto humano vacío. Recibe
solo solicitud original, pregunta pública, respuesta correlacionada del destinatario y atribución;
no recupera historial adicional de grupo. El texto de respuesta se recorta a 8.000
bytes UTF-8 con una bandera. Este completado no tiene herramientas, atribuye la respuesta a Bot Dos
e informa honestamente la falta de respuestas. Omitir un turno no prueba un rechazo.

Las rutas de finalización intentan despacho inmediato; el Cron de minuto existente lo recupera.
Cada pasada rota entre hasta 50 recibos por `checked_at` y admite como máximo
30 resultados. La recuperación existente gestiona despachos faltantes de destinatario/resultado. El vencimiento
impide publicar al destinatario sin liberar prematuramente una reclamación en curso.
Las conversaciones ocupadas pueden retrasar la entrega; no se garantiza una hora exacta.

Límites: una publicación por turno humano entre ambos modos. Las publicaciones simples permiten 4.000
caracteres Unicode / 12.000 bytes UTF-8 y heredan los límites de envío privado humano.
El modo respuesta permite 1.000 caracteres / 3.000 bytes y un destinatario; diez solicitudes
pendientes por persona; admisión existente de 64 espacios de grupo
y diez turnos privados activos por cuenta. El planificador conserva dos rondas de herramientas/seis
ejecuciones. La ruta normal añade completados de autorización y retransmisión a la respuesta
existente de grupo; las publicaciones simples solo añaden inferencia de autorización. Latencia/costo no
se midieron. Las publicaciones ordinarias ahora pueden añadir inferencia grupal dentro de la política de energía.
Quedan fuera de esta versión adjuntos, múltiples publicaciones por turno humano, múltiples destinatarios
 designados de retorno privado, delegaciones programadas y herramientas o UI dedicadas de cancelar/listar solicitudes.

## Revocación, memoria y notificaciones

Los permisos se comprueban antes de inferencia/publicación grupal, inferencia de retransmisión privada,
atómicamente al guardar privado e inmediatamente antes de enviar a APNs. Eliminar persona/agente,
salir, revocar consentimiento o eliminar grupo cancela trabajo pendiente y
notificaciones privadas sin enviar. Solo Workflow/recuperación libera atención en curso.
Eliminar grupo/destinatario conserva un recibo cancelado con destino null. Las respuestas
privadas ya entregadas y mensajes publicados no se retiran por cambios de pertenencia;
eliminar el grupo borra su propio historial. Eliminar la conversación privada de origen
elimina solicitudes/resultados relacionados. No pueden retirarse entradas ya enviadas al modelo ni alertas
aceptadas por APNs.

Las preguntas usan push/no leídos de grupo; los resultados usan push/no leídos privados.
Las publicaciones simples usan la misma ruta grupal push/no leídos e identidad pública del remitente. Sus
recibos se marcan revocados al eliminar pertenencia/consentimiento/grupo, sin retirar
mensajes publicados. Eliminar la conversación privada de origen elimina su recibo.
El polling funciona sin APNs. Las publicaciones, preguntas y retransmisiones dirigidas por personas se excluyen de los eventos de
personalidad del remitente; las retransmisiones se excluyen de extracción de memoria humana. La respuesta grupal propia de Bot Dos
puede seguir manteniendo su perfil propio. La atribución del interlocutor original
evita que una preferencia de Bot Dos se vuelva una de Bot Uno.

La generación usa reintentos acotados existentes de Workflow. Los fallos terminales de retransmisión muestran un
turno fallido de asistente sin republicar. Los resultados automáticos no pueden reintentarse manualmente
ni mutar programaciones. iOS actualizado oculta su botón Reintentar. Los clientes anteriores
muestran resultados solo del asistente pero pueden ofrecer un reintento que la API rechaza. El flujo
central necesita la publicación del backend; el ajuste del botón Reintentar necesita una app actualizada.

## Configuración y verificación

Consulta [infraestructura](infrastructure.md#general-group-publication-migration-0021).
No requiere recurso, binding, secreto, dependencia ni permiso de cuenta nuevo.
0021 sigue a 0001–0020. Usa los comandos existentes de configuración/migración local. La migración/publicación
 de producción usa solo el pipeline automático tras commit/push autorizado.

La extensión inicial de publicación general tuvo verificación estática TypeScript, el esquema SQLite de 21 migraciones
y 85 variantes SQL distintas preparadas con `EXPLAIN` para ambos modos de respuesta y ajustes de
consentimiento de modelos. No cambia código ni configuración iOS y no necesita reinstalar la app.
Las comprobaciones Swift pertenecen a la implementación anterior de solicitudes dirigidas. No se ejecutaron build, test en ejecución, inferencia,
datos privados de personas, migración remota, notificación, instalación ni publicación.
Esos límites describen la extensión inicial. La reparación de presupuesto de autorización
usó además la inferencia sintética explícitamente autorizada y comprobaciones aisladas del
handler anteriores; no tiene verificación de publicación completa en la app ni notificaciones.
Tras publicar, verifica con cuentas ficticias:

- Recorrido de color favorito con app cerrada, donde solo el agente designado recibe
  el espacio inicial; su respuesta pública puede iniciar conversación acotada.
- Un saludo, anuncio y texto citado exacto se publican una vez, permiten respuestas acotadas
  de bots y no crean resultado privado posterior, incluido un grupo con un solo bot.
- Un saludo dirigido no solicita respuesta designada/retorno privado; una pregunta
  explícita a otro agente conserva respuesta designada y retorno privado.
- Nombres duplicados, múltiples grupos, destinatario común único, solicitudes amables,
  preguntas de capacidad, hipótesis y aclaración de varios turnos.
- Hechos/archivos privados e instrucciones inyectadas no pueden añadir texto público no solicitado;
  respuestas grupales y resultados privados no pueden enviar más preguntas ni crear programaciones.
- Caídas tras publicar, argumentos cambiados al reintentar, confirmación fallida, despacho
  repetido, cambio entre modos simple/respuesta y recuperación Workflow no crean
  publicaciones/resultados duplicados.
- Agentes ocupados, solicitudes cruzadas simultáneas, conversaciones privadas ocupadas, límites,
  agotamiento de revisiones y vencimiento.
- Revocación, salir/volver a unirse, cambios de modelo y eliminación de destinatario/grupo durante inferencia,
  antes de guardar o de push; las respuestas privadas entregadas permanecen intactas.
- Atribución correcta de preferencias, truncado, respuestas faltantes, ausencia de burbuja humana falsa,
  recuentos no leídos, notificaciones y UI de reintento de resultados automáticos.

Prefiere una corrección compatible hacia adelante mientras haya solicitudes/Workflows activos. El código anterior
no puede procesar orígenes delegados ni distinguir resultados automáticos. Drena/cancela
solicitudes y termina los Workflows activos antes de revertir su grafo de pasos. Conserva
esquema/recibos aditivos. Referencias: [idempotencia de Workflows](https://developers.cloudflare.com/workflows/build/rules-of-workflows/)
y [transacciones D1](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch).
