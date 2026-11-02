# Aprendizaje de conversación

Los chats privados y grupos comparten aprendizaje conversacional local a cada audiencia mediante la
API. Cada agente aprende por separado sobre cada persona en cada conversación. Las respuestas
en iOS y web usan las mismas observaciones, ajustes de comportamiento y curiosidades
opcionales. Esto amplía la [memoria factual](memory.md), [personalidad](personality.md)
y [iniciativa](initiative.md) privada; no reescribe el personaje compartido,
mezcla personas, habilita contacto proactivo de grupo ni concede autoridad adicional a las herramientas.

## Revisión silenciosa

Un `ChatWorkflow` existente hace una revisión de mejor esfuerzo después de un intercambio humano
directo completado, después de mantener memoria factual/propia y antes de liberar la atención.
Continúa cuando se cierra la app. Las revisiones de grupo también cubren decisiones de respuesta completadas
que omiten intencionalmente hablar. Las programaciones, turnos de tareas, entregas privadas de resultados
de grupo, mensajes de iniciativa e intercambios de grupo disparados por bots no inician
revisiones. No hay modelo siempre en ejecución, barrido de historial inactivo, binding Workflow nuevo
ni Cron adicional de inferencia. Una conversación inactiva necesita otro intercambio humano para
reintentar una revisión diferida o acumular evidencia nueva.

La primera revisión necesita tres mensajes humanos elegibles. Las revisiones posteriores necesitan entrada
humana nueva y al menos una hora desde la última revisión exitosa; con menos de
cuatro mensajes nuevos se difieren hasta transcurridas seis horas. Cada inferencia intentada
tiene un enfriamiento persistido de quince minutos, incluidos fallos y repeticiones. Son valores
predeterminados acotados de implementación, no una cuota diaria de conversación ni rutina aprendida.
El intento se reclama por revisión antes de inferir; la atención exclusiva existente del agente
serializa su trabajo ordinario. Los fallos de mantenimiento nunca hacen fallar una respuesta guardada.

Cada revisión lee como máximo dieciséis mensajes humanos elegibles de los últimos 28 días
y las respuestas reales de este agente. Las ráfagas privadas incluyen mensajes humanos `MESSAGE_BATCHED`;
se excluyen turnos artificiales/autónomos. Los grupos suministran solo los mensajes de la persona
actual y las respuestas publicadas por el agente revisor a esos mensajes,
incluidas partes entregadas de ráfagas. Otras personas y bots no son fuentes de aprendizaje
para esa relación. El texto humano y del asistente se recorta a 850 bytes UTF-8 cada uno;
no se cargan archivos, resultados de herramientas ni páginas externas. El texto ya publicado y
las transcripciones de voz usan sus límites normales de origen. Hasta doce recuerdos factuales locales
existentes con citas humanas originales ayudan a retirar preguntas ya respondidas;
no se importan hechos ajenos/de audiencias compartidas a esta revisión.

Se usa el modelo seleccionado del trabajo actual, con límite de 6.000 tokens de completado.
El estado previo, con un máximo de 21 elementos, está acotado; el nuevo JSON del modelo se limita a 18.000 bytes,
y el prompt pide menos de 12.000. Las citas exactas de evidencia se validan contra
el texto humano/asistente suministrado o la evidencia validada del mismo elemento previo. Un evento
solo puede producir conclusiones tentativas; las etiquetas respaldadas necesitan fuentes humanas distintas.
Son observaciones falibles, nunca diagnósticos psicológicos ni prueba de sentimientos,
disponibilidad o rechazo. Los logs usan nombres genéricos de eventos sin texto de origen.

## Conocimiento y preguntas almacenados

La migración **0067** añade una fila `conversation_learning` por audiencia/agente/persona,
con JSON vinculado al origen y metadatos de revisión compare-and-set:

- Hasta ocho observaciones sobre intereses, modo de conversación, tono o preferencias.
- Hasta tres ajustes pequeños y reversibles al comportamiento propio del bot, incluida
  repetición, cada uno describiendo un comportamiento y cómo reevaluar su utilidad.
- Hasta diez preguntas opcionales con propósito, oportunidades adecuadas, situaciones que
  evitar y estado pendiente/preguntada/respondida/descartada. Las respuestas fundamentadas se conservan
  con la pregunta; los hechos duraderos de la persona siguen por la memoria factual ordinaria.

Las observaciones/preguntas vencen a los treinta días; los ajustes a los catorce.
Reformular evidencia sin cambios no renueva un elemento. Publicar realmente una pregunta
renueva su registro de treinta días. Los elementos vencidos se excluyen inmediatamente;
el Cron de minuto existente elimina físicamente elementos JSON vencidos de un máximo de cien
perfiles por ejecución, sin inferencia. Las marcas de agua sobreviven a un perfil vacío,
para que el vencimiento no haga reprocesar de inmediato historial antiguo.

La generación recibe hasta cinco observaciones, un ajuste y diez registros de preguntas,
sin citas de origen. Recibe instrucciones de responder primero la solicitud actual, preservar
su personaje y criterio y hacer como máximo una pregunta opcional pertinente cuando haya
espacio conversacional. La urgencia práctica, revelaciones sensibles, cierre, memoria factual
ordinaria y correcciones explícitas tienen prioridad. El aburrimiento/invitaciones sociales
pueden admitir una pregunta lúdica inesperada; las preguntas pendientes solas nunca justifican
contacto no solicitado. Importan el aporte y la brevedad útil, no la duración de interacción.

La generación privada, de grupo e iniciativa puede devolver metadatos internos `learningQuestion`
con una clave de pregunta existente y una cita exacta del mensaje
generado. La transacción de publicación la marca preguntada solo cuando esa cita existe
realmente en un mensaje publicado. Los borradores fallidos y colas de ráfaga no entregadas no cuentan;
repetir no añade evidencia ni vuelve a renovarla. Los metadatos nunca son prosa visible.
Las revisiones silenciosas posteriores concilian respuestas espontáneas, correcciones y rechazos.
Los registros preguntados/respondidos/descartados sobreviven a omisiones del revisor hasta vencer; una pregunta
retenida como preguntada no puede volver simplemente a pendiente. La equivalencia semántica, correspondencia de temas,
cuándo preguntar y si una respuesta resuelve una pregunta siguen siendo juicios del modelo.
El historial real reciente y la memoria factual deben suprimir repetición incluso si el modelo
omite metadatos o se difiere una revisión. No es garantía de naturalidad.

## Audiencia, consentimiento y ciclo de vida

No hay consultas entre chats ni exportación a memoria factual/propia compartida. Los contactos
compartidos siguen siendo un agente con su identidad configurada, pero los patrones aprendidos de interacción
permanecen locales a cada persona y audiencia. Una preferencia privada no se convierte silenciosamente
en pregunta grupal. La memoria factual compartida existente y las herramientas de historial privado explícitamente permitidas
conservan sus reglas independientes.

Cada lectura comprueba propiedad/pertenencia actual, pertenencia del agente, consentimiento de memoria
compartida, estado de vaciado y elegibilidad de modelo. Contributor no puede consumir un
perfil derivado de Estándar. Una revisión Contributor nueva empieza sin elementos derivados de Estándar
y usa solo mensajes de origen grupal elegibles. Las audiencias aisladas por conectores
siguen en Estándar y locales; introducir aislamiento borra el estado derivado anterior.
Las comprobaciones de permisos/aislamiento/época se ejecutan antes y después de inferencia y durante la
escritura protegida. Los IDs de origen deben seguir existiendo. Eliminar un mensaje de origen descarta los
perfiles derivados de su audiencia; cambiar consentimiento grupal, participación en aprendizaje, pertenencia al
grupo o eliminar un agente invalida conservadoramente el aprendizaje de grupo. Un miembro nuevo
también invalida la proyección grupal en lugar de ampliar una audiencia desactualizada.

Ambos clientes exponen **Aprendizaje de conversación** desde detalles de contacto/grupo. Cada persona
puede inspeccionar solo el aprendizaje sobre sí, separado por agente, incluidas evidencia,
etiquetas tentativas, estado de preguntas y respuestas. Puede corregir preferencias en chat,
cambiar **Aprender de mis mensajes** o **Restablecer lo aprendido sobre mí**. El interruptor es
independiente de la iniciativa privada y propiedad del personaje compartido; un propietario de grupo
no puede inspeccionar el aprendizaje de otra persona mediante estos endpoints.

`GET /contacts/:id/learning` y `GET /groups/:id/learning` devuelven
`{ enabled, profiles: [{ agentID, agentName, reviewedAt, items }] }`.
`PUT` acepta solo `{ enabled: boolean }`; `DELETE` restablece los perfiles derivados de esa persona
conservando el ajuste de habilitación. Ambas mutaciones avanzan la época de aprendizaje
y un límite inferior de secuencia de origen, para no reaprender inmediatamente mensajes anteriores.
No eliminan texto del chat ni memoria factual ordinaria. Los ajustes están habilitados por defecto,
usando los permisos existentes de conversación. La actualización no hace ningún barrido inmediato de historial;
el siguiente intercambio humano exitoso puede revisar la ventana reciente acotada.

La publicación privada/de grupo comprueba la época de aprendizaje capturada. Restablecer, deshabilitar o
cambiar la audiencia durante la generación impide publicar texto aprendido desactualizado o
continuar una ráfaga. Los turnos privados sin mensaje publicado terminan interrumpidos;
los turnos grupales terminan fallidos en lugar de retener la atención. La iniciativa privada descarta
borradores desactualizados bajo su política de revisión y protecciones de publicación existentes. Los checkpoints
heredados sin metadatos de aprendizaje siguen siendo compatibles porque no contienen
contexto aprendido nuevo. Los mensajes publicados mantienen su comportamiento normal de historial/entrega.
Vaciar chat elimina el aprendizaje incluso cuando se conservan recuerdos factuales. Eliminar cuenta/contacto/
grupo/miembro/agente actúa en cascada; las cachés de clientes se invalidan ante pérdida confirmada.

## Caché y verificación

La API fija `Cache-Control: no-store` en las respuestas de aprendizaje. iOS usa la
`NavigationSnapshotCache` existente de la sesión (ocho instantáneas por store de audiencia), muestra
resultados cargados y vacíos de inmediato y revalida al entrar/actualizar. Web usa un
mapa de ocho entradas por sesión con una ventana de frescura de treinta segundos, lecturas deduplicadas,
revalidación en segundo plano y Actualizar explícito. Las revisiones de mutación rechazan lecturas anteriores;
los fallos transitorios conservan datos utilizables. Ambos clientes descartan instantáneas al eliminar historial,
perder acceso o cambiar de cuenta. Ninguno escribe estas instantáneas en disco ni introduce
polling de historial. Consulta [comportamiento de caché](caching.md#conversation-learning).

Pasaron comprobaciones estáticas de tipos API/web, parsing Swift, las 67 migraciones, 23 variantes SQL
de aprendizaje y 80 variantes SQL de publicación de respuestas a profundidad de expresión 100, además de
espacios en blanco y sintaxis del script de regresión. El script opcional `node scripts/checks/conversation-learning.cjs` define escenarios SQLite ficticios
para validación de evidencia, carreras de restablecimiento, eliminación de origen, aislamiento,
límites de modelos, aprendizaje grupal atribuido y repetición de publicación de preguntas. No se
ha ejecutado. Para esta función no se realizaron tests, builds, inferencia real, migraciones remotas ni validación
en dispositivos.

Antes de afirmar calidad conversacional en vivo, valida oportunidades de auriculares/música,
intercambios solo de tareas, aburrimiento, cierre, respuestas espontáneas, preguntas ignoradas,
personalidades distintas de contactos, corrección y vencimiento, comportamiento independiente de grupo/privado,
publicación con restablecimiento pendiente y revocación de conector/modelo con datos
ficticios. Verifica navegación, actualización, recuperación sin conexión y cambio de cuenta de ambos clientes.
Consulta [configuración reproducible y reversión](infrastructure.md#conversation-learning-migration-0067).
