# Mensajes sucesivos de contactos

Una respuesta privada o una respuesta ordinaria de grupo puede contener uno o varios mensajes.
El modelo elige unidades conversacionales según la solicitud actual, la conversación y la
personalidad. Un mensaje sigue siendo válido; no hay una cantidad fija ni un
saludo obligatorio en tres partes. Cuando la profundidad solicitada alarga una respuesta, unas pocas ideas
separadas y completas pueden convertirse en mensajes distintos si eso mejora la legibilidad.
La división es ocasional, no un objetivo de longitud ni una razón para añadir contenido. Mantén
juntos el código, las listas, las explicaciones cohesionadas y las aclaraciones esenciales en lugar
de dividir mecánicamente oraciones o contar caracteres. El servidor valida
entre 1 y 8 mensajes no vacíos con un máximo de 20.000 caracteres Unicode, incluidos los separadores. Ocho es un límite de abuso y
latencia, no un objetivo.

## Entrega

El ChatWorkflow existente guarda un checkpoint de la respuesta preparada y publica cada
parte por separado. Cada parte de texto tiene un presupuesto de composición de 0,9 segundos más su
cantidad de caracteres Unicode a 12–16 caracteres por segundo, con 0,3 segundos por salto de párrafo
con línea en blanco (hasta cuatro). El total se limita a 15 segundos por mensaje
(60 segundos antes del 2026-10-30, lo que hacía que las respuestas largas esperaran minutos).
El ID del turno varía la velocidad de forma determinista; una repetición conserva la misma elección.
Por ejemplo, 100 caracteres tardan unos 7–9 segundos y 300 o más alcanzan el
límite de 15 segundos, antes de la sobrecarga de programación/red. Son decisiones de
ritmo del producto, no mediciones de velocidad humana de escritura.

Solo la primera parte privada de texto acredita el tiempo ya transcurrido con el indicador de escritura visible durante
la generación. Cada parte posterior inicia un plazo de composición nuevo después de publicarse
la anterior. Las respuestas de recuperación usan la misma ruta de entrega. Antes de cada
parte, el Workflow renueva Escribiendo y elimina una superposición anterior de Grabando; las partes de
grupo también comprueban que el mensaje precedente siga siendo el actual antes de iniciar la
espera. La publicación conserva sus comprobaciones atómicas existentes de acceso/interrupción.
Las notas de voz conservan su preparación independiente de 0,9–3 segundos y el indicador
Grabando; no heredan el presupuesto más largo de escritura de texto. La iniciativa privada
también usa el presupuesto de texto, con un lease de presencia de 90 segundos que cubre su espera máxima
de 60 segundos. La programación de Workflows y la latencia de red pueden aumentar estos intervalos.
El temporizado usa [Workflow sleep](https://developers.cloudflare.com/workflows/build/sleeping-and-retrying/) duradero,
no temporizadores de una app abierta. Ambos clientes consultan la conversación visible cada segundo;
los clientes lentos/sin conexión pueden recibir varias partes ya entregadas en su próxima actualización.
El historial del chat no devuelve texto sin enviar.

En conversaciones privadas, la migración `0042_reply_messages.sql` añade
`chat_turn.assistant_messages_json`. Contiene solo el prefijo entregado, con
IDs estables de partes y marcas temporales del servidor. `assistant_text` es el texto entregado
unido para búsqueda de historial, contexto del modelo y clientes anteriores. El turno sigue ejecutándose
y escribiendo hasta su última parte. Cada publicación comprueba el intento, la atención
exclusiva, el acceso aplicable y la validez de la programación. Una protección atómica cierra la
ráfaga con su prefijo entregado si existe un turno humano más nuevo antes de la siguiente parte;
el siguiente turno en cola procesa esa entrada. La agrupación no puede descartar texto publicado.
La recuperación y el Cron conservan un prefijo entregado y nunca lo regeneran. La publicación
usa la longitud del arreglo entregado para evitar anexados duplicados al reintentar pasos.

Las respuestas privadas conservan un recuento de no leídos, sonido y alerta push por turno después
de completarse (incluida una ráfaga acortada por interrupción). Las citas y reacciones en
cualquier parte privada siguen apuntando a la respuesta unida de ese turno. No son
reacciones independientes por parte ni destinos de cita separados. Esto coincide con ambos clientes y
el contrato existente de permisos del servidor. Las miniapps aparecen una vez junto a la primera
parte. Los clientes existentes muestran el texto unido; los clientes actualizados de iOS y web muestran
burbujas con marcas temporales independientes. Las filas antiguas sin el nuevo arreglo muestran una burbuja.

Las respuestas de grupo usan filas ordinarias de `group_message` con IDs estables. La primera conserva
el ID canónico de la respuesta; las siguientes usan `/part/<index>`. El espacio de respuesta y
la atención exclusiva siguen activos durante la ráfaga. Antes de cada parte adicional,
el servidor comprueba pertenencia, autorización de origen, consentimiento, energía disponible y
que la parte anterior siga siendo el mensaje más reciente del grupo. Cualquier mensaje intermedio
elimina la cola aún no enviada. Cada parte publicada cuesta un punto de energía y usa los límites existentes
de intercambio, recibos, recuentos de no leídos, reacciones, citas y outbox push. Las protecciones existentes
de oportunidades pendientes siguen limitando las continuaciones de bots por intercambio.
Las preguntas dirigidas cuya respuesta vuelve por privado usan un mensaje cohesionado, de modo que
la respuesta devuelta permanece completa. Las herramientas explícitas de publicación de grupo y la iniciativa
autónoma conservan sus contratos existentes de publicación única.

## Caché y despliegue

Los stores existentes pertenecientes a la sesión almacenan las partes entregadas dentro de su turno padre
en iOS y web. Los IDs estables mantienen estables las burbujas antiguas mientras el polling añade nuevas;
las protecciones de combinación por intento y hora de actualización rechazan respuestas desactualizadas. No se añaden descargas,
temporizadores de secuencia locales de la vista, retención en disco ni cachés paralelas. La paginación,
deduplicación de solicitudes, expulsión, aislamiento de cuentas e invalidación por pérdida de acceso
siguen siendo los de [caché](caching.md). La reapertura muestra de inmediato el prefijo entregado en caché
y revalida mediante el ciclo de sincronización existente. Los grupos reutilizan su
caché ordinaria de mensajes sin cambiar el contrato del cliente.

Usa los servicios y bindings existentes de D1/Workflow; no se necesitan secretos ni recursos
nuevos. Consulta [infraestructura](infrastructure.md#successive-contact-messages)
para la migración local, publicación automática y compatibilidad.

## Verificación

La validación estática cubre TypeScript de API/web, comprobación de tipos Swift y preparación SQL
contra el esquema vacío migrado (`node scripts/checks/reply-messages-sql.cjs`).
Para el ajuste de ritmo según longitud, solo se ejecutaron comprobaciones de TypeScript de la API y espacios en blanco.
Se inspeccionaron las rutas existentes de representación de partes entregadas e indicadores de escritura de iOS/web;
no cambió código del cliente ni el contrato de respuesta. Para este ajuste no se ejecutaron tests funcionales, builds, llamadas a modelos
ni verificaciones en dispositivo/navegador.
Con datos ficticios, verifica respuestas de uno y varios mensajes, cohesión de código/listas,
espaciado visible y escritura, navegación/reanudación desde segundo plano, un mensaje humano nuevo
entre partes, recibos de herramientas, publicación repetida después de interrupción,
actualización sin conexión, historial antiguo, citas/reacciones, miniapps, comportamiento de no leídos/push,
revocación de acceso y cambio de cuenta en ambos clientes. En grupos también verifica
hablantes intermedios, energía baja, el límite del intercambio y retornos privados dirigidos
completos. La calidad del modelo y la latencia real de programación requieren comprobaciones en vivo.

Un contacto puede elegir una cita opcional para el primer mensaje de su ráfaga; los mensajes
posteriores no la repiten. Las entradas privadas entregadas guardan referencias, resueltas
con el historial actual en las respuestas de la API. Consulta [respuestas](replies.md).
