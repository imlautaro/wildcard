# Reacciones a mensajes

Los chats privados y grupos permiten 👍 ❤️ 😂 😮 😢 🙏 en texto, imágenes y PDFs.
Cada persona o agente puede tener una reacción en cada mensaje, incluido el propio.
Elegir otro emoji la reemplaza; elegir el mismo de nuevo la elimina.
Las reacciones persisten separadas del cuerpo del mensaje. No crean respuestas de texto,
mensajes sin leer, notificaciones push, rondas de respuesta de bots ni gastos de energía de grupo.

## Clientes

En iOS, mantén presionado un mensaje enviado para abrir el popover de emojis. Toca un indicador existente para
ver quién reaccionó y cambiar/eliminar tu reacción. La misma acción se expone a
servicios de accesibilidad. No se puede reaccionar a mensajes salientes aún no guardados.
Los contactos reaccionan por su cuenta según su personalidad; consulta
[emojis y reacciones](personality.md#emoji-and-reactions).
En la web, mantén presionado un mensaje, haz clic derecho o usa su botón de reacción accesible
con teclado. Ese botón y el de respuesta flotan junto al mensaje mientras el puntero
está en cualquier lugar de la fila de conversación del mensaje, o al enfocar con teclado (a la derecha
de mensajes entrantes, a la izquierda de los propios), de modo que no ocupan espacio en la
conversación y siguen accesibles cuando el puntero sale de la burbuja por arriba o
abajo. El menú oscurece toda la pantalla con una capa semitransparente que mantiene
iluminado el mensaje y muestra dos paneles flotantes centrados horizontalmente sobre él:
la barra de emojis arriba y las acciones (Responder, Información del mensaje, Ver transcripción, Eliminar
reacción y luego quién reaccionó) abajo. Si no hay espacio arriba, la barra de emojis pasa debajo
del mensaje y las acciones se apilan debajo; si no hay espacio abajo, las acciones se apilan
sobre la barra de emojis; si el mensaje es más alto que la pantalla, ambos paneles quedan visibles sobre
él. Presionar la capa (o el mensaje resaltado), Escape, desplazarse o cambiar el tamaño
cierra el menú. Mover el puntero cancela la pulsación larga, preservando el desplazamiento. Los indicadores muestran recuentos; abrir el menú muestra nombres de participantes. Ambos clientes usan el mismo conjunto de emojis,
selección, reemplazo, eliminación y comportamiento de reintento explícito.

## API y persistencia

- `GET /api/v1/contacts/:id/chat/reactions?messageIDs=<JSON array>`
- `PUT /api/v1/contacts/:id/chat/reactions`
- `GET /api/v1/groups/:id/reactions?messageIDs=<JSON array>`
- `PUT /api/v1/groups/:id/reactions`

GET acepta de 1 a 100 IDs por solicitud. Las respuestas contienen `reactions`, con `messageID`,
`side`, `actorID` (`user/<id>` o `agent/<id>`), el `name` visible actual y `emoji`.
Los IDs de turno privado tienen dos destinos separados: `side: "user"` y `side: "assistant"`.
Los IDs de mensajes de grupo usan `side: "group"`. Los turnos programados exponen solo su mensaje
real de asistente. Los turnos privados de solo reacción no tienen destino de asistente.
PUT acepta exactamente `{ "messageID": "...", "side": "user", "emoji": "👍" }`;
usa JSON `null` explícito para eliminar. La identidad humana autenticada proviene de
la sesión, nunca del cuerpo. Las operaciones PUT absolutas son idempotentes; no
alternan ciegamente al reintentar. Las escrituras exitosas devuelven `{ "saved": true }`.

La propiedad actual del contacto o pertenencia al grupo se comprueba en lecturas y dentro de
las escrituras. Los destinos deben pertenecer a esa conversación y existir realmente. Las escrituras humanas
se limitan a 120/cuenta/minuto, más el límite existente de escritura de grupos cuando corresponda.
La migración `0024_message_reactions.sql` crea la tabla D1, comprobaciones, índice de identidad
y claves foráneas en cascada. Eliminar un mensaje, actor o su conversación padre
elimina sus reacciones. Salir de un grupo elimina el acceso; las reacciones históricas siguen
públicas para los miembros actuales del grupo. Los modelos solo reciben reacciones de participantes
actualmente elegibles con consentimiento actual de memoria compartida/modelo.

## Agentes

`react_to_message` está disponible durante turnos ordinarios de modelo privados y de grupo.
Acepta `messageID`, `side`, `emoji` reales y `endTurn` opcional. El servidor
fija la identidad del agente y vuelve a comprobar el turno activo, lease de atención, conversación,
pertenencia y consentimiento. Las herramientas privadas no pueden reaccionar en el chat de otro participante;
las herramientas de grupo se limitan al grupo actual y al límite de secuencia del contexto.
Los agentes pueden reaccionar a mensajes propios anteriores y a mensajes de personas o bots.
Los IDs y reacciones de mensajes privados recientes y las reacciones recientes elegibles de grupo se
incluyen como contexto no confiable. Las herramientas de recuperación pueden proporcionar IDs de destinos anteriores.

En privado, una reacción exitosa no nula con `endTurn: true` termina sin
texto del asistente, indicador de no leídos ni push de respuesta. El mensaje humano permanece en el historial
y en el procesamiento de memoria. En grupos, la decisión final puede elegir `skip` después de una
reacción cuando lo permita la política existente. Las aperturas obligatorias solicitadas por personas
siguen requiriendo texto. La admisión por energía de grupo sigue aplicándose al iniciar un turno de modelo,
aunque una reacción no gaste energía por sí misma. Una reacción humana sola no
despierta agentes: la ven durante un turno posterior de conversación elegible. El uso
que el modelo hace de reacciones es discrecional; no hay emojis forzados ni un servicio nuevo de notificaciones.

## Caché y verificación

Las cachés de reacciones pertenecen a las entradas de conversación existentes de la sesión. Están
disponibles sincrónicamente al volver al chat, incluidas instantáneas vacías. El
sincronizador/poller existente en primer plano actualiza todos los IDs de mensajes retenidos, en
lotes de 100, después de actualizar historial o paginar; no vuelve a descargar cuerpos
de mensajes para obtener reacciones. Recortar historial también elimina filas de reacciones iOS. No
hay almacenamiento adicional en disco ni polling perteneciente a vistas. La vida de la caché sigue los
presupuestos existentes de conversación (ocho entradas iOS, veinte web); las escrituras de reacción en curso
o fallidas protegen una entrada de la expulsión hasta que se reintentan o se elimina explícitamente su
conversación/sesión.

Las solicitudes de actualización se deduplican. Una mutación incrementa una revisión antes y después de
la escritura para que una actualización superpuesta no pueda sobrescribirla. Ambos clientes aplican la
reacción propia optimistamente en cuanto se elige; una escritura fallida restaura
la reacción anterior de la persona y conserva la operación absoluta pendiente exacta para
Reintentar reacción a través de la navegación. Los fallos de permisos borran el estado de reacción;
eliminar la conversación, confirmar pérdida de acceso y cambiar de cuenta descarta cachés
y rechaza resultados tardíos. Los fallos transitorios de actualización mantienen indicadores utilizables y reintentan
en sincronizaciones posteriores en primer plano. Actualizar explícitamente el chat también actualiza
las reacciones. Los clientes en segundo plano/cerrados se ponen al día al volver; no existen APNs de reacciones.

La validación estática cubre TypeScript de API/web, Swift iOS y 128 variantes de preparación
SQL usando EXPLAIN contra un esquema SQLite vacío migrado con profundidad de expresiones
limitada a 100. La preparación SQL no valida el comportamiento en ejecución. Para este cambio no se ejecutaron tests funcionales,
build, ejecución en dispositivo, llamadas a proveedores ni migración remota.
Antes de verificar la publicación, usa cuentas ficticias en chats privados y grupos:
mantén presionados mensajes propios/ajenos de texto y adjuntos; selecciona/cambia/elimina; inspecciona recuentos
y nombres; deja que los bots reaccionen a personas y a mensajes propios anteriores; verifica finalización privada
solo con reacción; pagina y reacciona a mensajes antiguos; navega fuera y vuelve; reintenta
una escritura interrumpida; restaura conectividad; elimina pertenencia; cambia de cuenta. Comprueba
que no se cree marcador de texto, indicador de no leídos, bucle de bots ni push de respuesta. Valida
VoiceOver, controles de teclado web, desplazamiento móvil e interacción iOS de selección de texto/pulsación
larga físicamente. Las comprobaciones estáticas no establecen comportamiento visual ni del modelo.

## Etiqueta en la lista de chats

Desde la migración 0090, cada escritura de reacción guarda `created_at` (al fijar o cambiar emoji)
y los propietarios `contact_id` / `group_id`, y las listas de contactos/grupos devuelven la
reacción más nueva como `lastReaction`. Cuando es más reciente que el último mensaje, la lista de
chats muestra `You: reacted with 👍`, `Reacted with 👍` o, en grupos,
`<Name>: reacted with 👍`. Consulta [vistas previas de la lista de chats](chats.md#chat-list-previews).
