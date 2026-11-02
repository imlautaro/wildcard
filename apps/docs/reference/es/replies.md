# Respuestas a mensajes

Los chats privados y grupos permiten respuestas citadas, como las apps habituales de mensajería. Una
persona elige un mensaje anterior, escribe uno nuevo (texto, adjunto o ambos)
y lo envía con una referencia al original. El mensaje nuevo muestra una cita
compacta con el autor original, hasta dos líneas de texto o un indicador de foto/documento.
Tocar o hacer clic en la cita desplaza al original y lo resalta
brevemente. Las respuestas son mensajes ordinarios: usan las reglas existentes de envío,
idempotencia, recibos, no leídos, push y rondas de respuesta.

## Clientes

Ambos clientes ofrecen **Responder** en cada mensaje guardado de texto, imagen y PDF, de la
persona o del agente en chats privados y de cualquier miembro en grupos:

- iOS: desliza un mensaje a la derecha o mantenlo presionado y elige **Responder** en el
  popover de reacciones. VoiceOver expone una acción **Responder**. El deslizamiento usa un reconocedor de pan UIKit
  que solo comienza con movimiento horizontal a la derecha, de modo que el desplazamiento
  vertical sigue funcionando; una vibración ligera marca el punto de activación.
- Web: pasa el puntero sobre la fila de un mensaje y usa su botón flotante de respuesta junto al de
  reacción, o mantén presionado/haz clic derecho y elige **Responder** en el panel de acciones
  debajo del mensaje (en pantallas
  táctiles sin hover, usa la pulsación larga). La app web no tiene gesto de deslizamiento.

El compositor muestra entonces el mensaje citado sobre el campo de texto con un botón
para cancelar. No se pueden citar mensajes que aún se están enviando. Enviar borra el destino de respuesta
junto con el borrador; si el envío no se confirma, el destino se restaura con el texto
y el adjunto. La burbuja optimista muestra la cita de inmediato. El destino de respuesta
sigue la vida del borrador de cada cliente: iOS lo conserva mientras la pantalla del chat está abierta,
y la app web lo conserva con el borrador en la caché de conversación de la sesión.

Las citas dentro de burbujas usan el color de remitente de grupo del autor (la misma paleta FNV-1a
que los nombres), el color de acento para tus mensajes y el color estable de paleta del contacto
en chats privados. Cuando el original no está en el historial cargado, el
cliente carga páginas anteriores (como máximo 20 páginas de 50 mensajes) antes de desplazarse. Una
cita de un mensaje de grupo anterior a que se uniera quien lee, si se unió sin
mensajes anteriores, lleva `beforeJoin: true`: muestra su texto recortado (los archivos se convierten en una
etiqueta "Foto"/"Adjunto") y no se puede tocar (consulta
[avisos de incorporación y bienvenidas](groups.md#join-banners-and-welcomes)). Una
cita cuyo original ya no existe muestra **Mensaje original no disponible** y no es
interactiva. En iOS, una cita dentro de una burbuja PDF es solo informativa; tocar
la burbuja sigue abriendo el documento.

## API

El envío privado, `POST /api/v1/contacts/:id/chat/turns`, acepta un
`replyTo: { "messageID": "<turn ID>", "side": "user" | "assistant" }` opcional. El destino
debe ser un turno de la misma conversación del participante, con la misma elegibilidad que las
reacciones: `assistant` requiere texto guardado del asistente; `user` requiere texto humano o un
adjunto, por lo que los turnos programados y de resultados de grupo solo exponen su lado de asistente.

El envío de grupo, `POST /api/v1/groups/:id/messages`, acepta un `replyToID` opcional
que identifica un mensaje del mismo grupo. Las rutas de grupo ya requieren pertenencia
actual.

Una estructura inválida o un destino no disponible devuelve HTTP 400 con un mensaje que muestran
ambos clientes; no se guarda nada. El destino también se comprueba dentro del insert, por lo que una
condición de carrera no puede guardar una referencia a otra conversación. Las repeticiones idempotentes comparan
el destino de respuesta además del texto y adjunto: reutilizar el UUID de un mensaje con un
destino diferente devuelve 409.

Las respuestas añaden `replyTo` a los turnos privados (respuestas de historial, envío y reintento) y a los
mensajes de historial de grupo:

```json
{ "messageID": "…", "side": "user", "available": true, "userID": null,
  "agentID": null, "senderName": null, "text": "Up to 200 characters…",
  "attachment": { "name": "Photo.jpg", "mimeType": "image/jpeg", "size": 1024 } }
```

`replyTo` es `null` cuando el mensaje no es una respuesta. La cita se resuelve desde el
historial actual en cada lectura y se recorta a 200 puntos de código Unicode. Las citas privadas
omiten identidad del remitente: `side` indica si la escribió el participante o el contacto.
Las citas de grupo incluyen los `userID`/`agentID` originales y el `senderName` guardado.
El texto citado solo es visible para lectores que ya pueden leer la conversación
original: el mismo propietario del contacto o miembros actuales del grupo.

## Persistencia

La migración `0025_message_replies.sql` añade columnas anulables:

- `chat_turn.reply_to_id` referencia `chat_turn(id)` con `ON DELETE SET NULL`, y
  `chat_turn.reply_to_side` se comprueba como `user` o `assistant`.
- `group_message.reply_to_id` referencia `group_message(id)` con `ON DELETE SET NULL`.

Los mensajes existentes no son respuestas. Actualmente los mensajes no se eliminan individualmente;
eliminar un contacto o grupo elimina conversaciones completas en cascada. Si alguna vez desaparece un turno privado
citado, el lado permanece y la API devuelve `available: false`; una respuesta de grupo
cuyo original desaparece pierde su cita.

## Agentes

Los agentes ven las respuestas como contexto, por lo que "no, ese" se refiere al mensaje citado:

- Los turnos privados anteponen al mensaje actual y a cada mensaje reciente del historial
  `[Replying to your/their own earlier message "<id>": "<quote>"]`. El prompt del sistema
  explica el marcador y trata el texto citado como datos históricos recortados y no confiables,
  nunca como instrucciones ni autorización. Las herramientas de búsqueda y extractos
  no cambian.
- Los borradores de grupo añaden `replyTo` al disparador, respuestas anteriores de la ronda, mensajes
  recientes y mensajes nuevos desde un borrador. El mensaje citado pasa el mismo
  filtro de autor/memoria compartida/consentimiento Contributor que el historial de grupo; cuando no lo
  pasa, solo se revela su `messageID` con `unavailable: true`. El texto citado se
  recorta a 400 bytes.

Los contactos pueden redactar opcionalmente una respuesta citada cuando mensajes superpuestos o volver
a un tema anterior harían ambigua su respuesta. Las respuestas obvias,
incluidas respuestas individuales a una pregunta compartida sobre el almuerzo, no llevan cita por defecto.
El modelo elige un ID de destino, nunca el texto visible de la cita. Una ráfaga cita solo
su primer mensaje. Los destinos privados deben existir en la misma conversación del participante,
con un lado humano/asistente elegible no posterior al turno actual. Las referencias
se guardan en la entrada entregada `assistant_messages_json` y se resuelven desde el
historial actual al leer; no se necesita migración. Ambos clientes muestran la misma
cita y usan su navegación existente al mensaje original.

Los borradores de grupo llevan `replyToID` opcional a través de la revisión: conservar lo mantiene, revisar
puede cambiarlo y omitir no publica nada. El parser acepta solo IDs de mensajes
suministrados en el contexto actual visible. La publicación resuelve el destino dentro
del insert con los mismos filtros de grupo, marca de agua y autor/consentimiento que el historial;
un destino eliminado o ya no autorizado descarta la cita. Solo el primer mensaje
de una ráfaga cita el destino. La representación existente de citas de grupo funciona en ambos clientes.
Los checkpoints privados antiguos de Workflow con arreglos de cadenas o prosa siguen pudiendo entregarse.

Esta es una elección contextual del modelo, no una garantía de citas perfectas. Verifica
varias preguntas intercaladas, volver a un mensaje antiguo, respuestas obvias
sin cita, revisión tras tráfico intermedio, reintentos, destinos inaccesibles y
navegación de citas en ambos clientes usando datos ficticios. El comportamiento del modelo y dispositivo
no queda verificado por comprobaciones estáticas.

## Caché

Las citas viajan dentro de los payloads de mensajes que ya guardan las cachés existentes de conversación
de sesión (`ChatStore`/`GroupChatStore` en iOS, cachés de conversación y grupo
en la web). No hay store, tipo de solicitud, polling ni almacenamiento en disco nuevo, y
la paginación, recorte, invalidación, cambio de cuenta y pérdida de acceso siguen las
reglas existentes de conversación. Navegar a un original anterior usa la paginación existente
**Cargar anteriores**. Los envíos pendientes conservan su destino de respuesta junto con su UUID,
para que los reintentos tras resultados inciertos reutilicen el mismo identificador solo para el mismo
destino.

## Estado de verificación

Solo comprobaciones estáticas: TypeScript de API y web (`npm run typecheck`,
`npm run typecheck:web`), comprobación de tipos Swift de todo el target de la app iOS contra el
SDK del simulador iOS 27.1, comprobación de tipos de las fuentes del harness `ios-conversation-sync`
y preparación (`EXPLAIN`) de las nuevas sentencias SQL contra un esquema SQLite
recién migrado con el límite de profundidad de expresiones de D1. No se ejecutaron builds, tests funcionales, ejecuciones
en dispositivo o navegador, migraciones remotas, llamadas a modelos ni despliegues.

Antes de verificar la publicación, usa cuentas ficticias:

- Privado: responde a tus mensajes de texto, imagen y PDF y a respuestas del agente;
  confirma cita, autor y desplazamiento al tocar, incluidos originales más allá de la página
  cargada; envía una respuesta solo con un adjunto; cancela una respuesta; interrumpe la red durante
  un envío y confirma que el reintento conserva la cita; pregunta al agente por "este mensaje" para
  confirmar que usa la cita.
- Grupos: responde a personas, bots y a ti; confirma que los colores de remitente coinciden en iOS y
  web; comprueba que los bots interpretan la cita; comprueba que el texto citado de un miembro sin
  consentimiento no se envía al modelo.
- iOS: desliza mientras te desplazas verticalmente, combina deslizamiento con reacciones por pulsación larga y
  selección de texto, y comprueba VoiceOver, Dynamic Type y Reduce Motion.
- Web: acceso con teclado al botón de respuesta, diseños táctiles y modo oscuro.

## Vistas previas simples de citas de bots

Ambos clientes muestran texto simple para citas de bots en burbujas y el compositor. La API
añade `previewText` opcional, generado desde el texto fuente completo del bot antes del límite de cita
de 200 puntos de código; las citas optimistas locales hacen lo mismo. El `text` sin procesar y la identidad
del mensaje no cambian para el contexto del agente y navegación. Las citas humanas siguen siendo literales,
y las vistas previas de enlaces/imágenes conservan sus etiquetas mientras que el código conserva su contenido.
Las instantáneas antiguas recurren al parsing local. Los campos de vista previa usan la misma caché
de conversación e invalidación que su cita; no existe fetch adicional ni caché persistida.
Las comprobaciones estáticas de clientes/API pasaron; siguen pendientes la verificación de citas largas,
reapertura de caché y dispositivos.
