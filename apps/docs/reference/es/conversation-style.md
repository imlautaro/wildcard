# Estilo natural de conversación

Las respuestas privadas, borradores/revisiones de grupos e iniciativa privada opcional usan indicaciones
compartidas del servidor en iOS y web. Los mensajes nuevos usan el comportamiento revisado después de
publicar la API; se conservan los mensajes guardados y las personalidades editadas por sus creadores.
No se añade servicio, migración, permiso ni campo de respuesta de cliente. La mayoría de
respuestas usa llamadas existentes; las respuestas grupales con preguntas o nombres visibles de miembros
pueden recibir una revisión adicional acotada de redacción, como se describe abajo. Este cambio sigue local hasta que se confirme, envíe y publique
automáticamente mediante el pipeline existente.

## Lenguaje regional

`personality/conversation.ts` lee solo códigos validados de idioma y país:

1. Un `contact_agent.speech_accent` seleccionado por el creador orienta la redacción regional en el
   idioma correspondiente, en texto y voz, incluso si la voz no está disponible o está desactivada.
2. Sin preferencia de acento, un contacto generado individualmente usa el país e idioma de su propio
   trabajo completado `contact_generation`.
3. Los contactos del primer círculo usan las preferencias originales de generación de
   `account_onboarding`, solo si su ID de agente aparece en el plan retenido de onboarding.
   Vaciar una conversación restablece la bandera de lista de chats pero conserva ese origen.
4. Los demás contactos no tienen región inferida; su identidad y conversación actual
   orientan el idioma. Nombres, zonas horarias y el país de un participante nuevo no seleccionan
   dialecto.

Una solicitud explícita actual de idioma, la identidad editada por el creador y el idioma
de la conversación tienen prioridad sobre el valor de generación. Una región orienta
vocabulario, gramática y formas de tratamiento cuando corresponde a ese idioma. No
establece ciudadanía, trasfondo ni experiencias físicas. El español argentino y
uruguayo recibe voseo natural y tratamiento plural apropiado, sin
pronombres obligatorios, modismos, insultos ni frases regionales prefijadas. Otros países
compatibles reciben una etiqueta de región validada en inglés para orientar al modelo.

La consulta nunca reenvía perfil de onboarding, ocupación, edad, género, nombre ni
JSON de generación. Estas señales describen los ajustes de generación originales del contacto;
no son hechos para revelar sobre su creador. Los contactos compartidos mantienen las mismas
preferencias entre audiencias. Elegir otro ID de voz no las cambia.
Seleccionar Acento predeterminado elimina la anulación del habla; los contactos generados siguen
conservando su redacción regional original como respaldo. También funciona para contactos
existentes con registros de generación retenidos, sin rellenarlos ni reescribirlos.

Los contactos nuevos de onboarding inicializan el campo existente de acento cuando un preset
coincide con su país, como ya hacen los contactos generados individualmente. Las descripciones nuevas de
identidad conservan explícitamente la preferencia de idioma y redacción regional.
Regenerar personalidad conserva las preferencias existentes de habla. La entrega de voz
sigue siendo de mejor esfuerzo; las muestras originales conservan sus acentos originales.

## Hábitos individuales de escritura y retroalimentación

El ID de cada contacto determina una combinación estable de preferencias de mayúsculas, puntuación, risa,
reconocimiento y énfasis. Los controles de personalidad habilitados restringen
esta combinación: los contactos serenos favorecen escritura convencional, los reservados
limitan el énfasis y los juguetones pueden usar más risas escritas. Con personalidad deshabilitada
sigue existiendo una combinación estable propia del contacto. Estas preferencias
se mantienen entre chats privados, grupos y reintentos; no son un conjunto rotativo
de efectos ni la obligación de usar cada rasgo. El idioma y la convención regional
reales determinan las palabras y risas adecuadas.

El texto casual puede comenzar en minúscula, tener puntuación ligera, omitir signos españoles de apertura,
repetir ocasionalmente signos de cierre o alargar una palabra, según los hábitos
del contacto y el momento. Son opcionales. No se insertan errores de ortografía
ni se posprocesa el texto generado. Código, enlaces, citas, notación técnica,
nombres, documentos solicitados y asuntos sensibles conservan claridad.
Las respuestas habladas usan cláusulas naturales y puntuación ordinaria, sin risas escritas,
ortografía alargada, emojis ni vacilaciones inventadas. Nunca se rellena una respuesta para
alcanzar el umbral de 60 caracteres de notas de voz.

Las últimas ocho respuestas propias no vacías de la audiencia actual aportan retroalimentación acotada.
Las menciones repetidas de nombres de participantes actuales (incluidos nombres de al menos
tres caracteres) producen una instrucción adicional para omitir vocativos innecesarios.
Son recuentos de menciones, no una afirmación de que se clasifica cada nombre como vocativo. Varias
contribuciones recientes largas activan una reevaluación de longitud en lugar de
imitar verbosidad previa. Estos recuentos son transitorios, no entran en memoria ni
aprendizaje y nunca transfieren texto privado ni sus medidas a un grupo.
Las menciones de nombres por pares en la misma ronda visible también desalientan copiar saludos
personalizados, en lugar de considerar a cada agente de forma aislada.
La iniciativa usa la misma guía y retroalimentación de longitud; su guía de nombres es general
y no se basa en un recuento de nombres de participantes.

Los mensajes privados ordinarios suelen necesitar una o dos oraciones breves; las contribuciones grupales
ordinarias a menudo necesitan una. La profundidad surge de la solicitud actual y del contenido útil
faltante: explicación solicitada, preguntas con varias partes, evidencia, razonamiento,
instrucciones o matices sensibles necesarios. Toda la ráfaga comparte este presupuesto.
Una verbosidad alta no exige párrafos extra. Una respuesta realmente más larga puede
usar unos pocos mensajes separados para ideas completas distintas si facilita la lectura.
Las respuestas breves permanecen cohesionadas; código, listas y aclaraciones esenciales no se
fragmentan. Cada parte de texto recibe su propia espera de composición administrada por el servidor y
estado Escribiendo en iOS y web; consulta [mensajes sucesivos](reply-messages.md). No se descarta trabajo útil mediante cortes rígidos de oraciones ni límites
inferiores de tokens de completado. Las identidades creativas influyen en ideas
y criterio; ni siquiera descripciones poéticas heredadas exigen lenguaje lírico ni
metáforas no relacionadas. La escritura creativa explícita puede seguir usando imágenes y extensión.

## Conversación recíproca (2026-10-31)

Los contactos tendían a mantener conversaciones entrevistando a la persona: en una
evaluación ficticia de charla casual, 21 de 24 respuestas privadas preguntaban algo y
"¿y tú?" se devolvía sin aportar nada desde el lado del contacto.
`reciprocityInstruction` (`personality/conversation.ts`, parte de
`conversationStyle`, por lo que aplica a respuestas privadas, grupos e iniciativa) pide
a los contactos aportar su propia parte en charla social o abierta: una opinión o
preferencia, una postura real sobre lo dicho, un desacuerdo ligero, una recomendación,
algo interesante dentro de sus intereses y especialidades, un dato curioso
o retomar un tema anterior. La mayoría de mensajes sociales debería terminar sin
pregunta; preguntar sobre la persona es ocasional y específico, nunca encadenado turno
tras turno, y "¿y tú?" recibe una respuesta real en vez de otra pregunta.
Esto respeta las reglas de [identidad encarnada](personality.md): compartir significa opiniones,
gustos, ideas y conocimiento, nunca eventos, rutinas ni experiencias físicas inventadas.

`questionStreak` cuenta cuántas de las últimas cuatro respuestas del contacto en la audiencia
actual contienen un signo de pregunta. Con dos o más, el prompt lo indica y pide no
preguntar este turno, incluidas curiosidades pendientes del aprendizaje, y aportar algo
en su lugar. `replyDeliveryInstruction` ahora prefiere observación, opinión o propuesta
a una pregunta en intercambios sociales abiertos, y el planificador de iniciativa prefiere aperturas
que comparten algo a preguntas de seguimiento. Sin cambios de cliente, esquema ni API.

Medido con `conversation-style-live-eval.mjs` (opción nueva `--model`, aquí
`muse-spark-1.3-contributor`), dos escenarios ficticios rioplatenses de charla casual, dos
repeticiones, comparando `--source-ref HEAD` con el árbol de trabajo: las respuestas con
pregunta pasaron de 21/24 a 8/23 (una ejecución terminó antes), y los contactos ofrecieron gustos,
recomendaciones y posturas ("Mi comodín para días así es fideos con huevo revuelto…",
"Para mí el capítulo del servicio completo es de lo mejor…"). Los saludos iniciales todavía
suelen preguntar cómo está la persona. El archivo de casos permanece fuera del repositorio como
los demás casos ficticios en vivo.

## Conversación grupal compartida

El clasificador de personalidad distingue al autor del disparador de la persona
a quien se dirige la respuesta. La interacción para todo el grupo no fuerza un destinatario individual principal;
los aportes dirigidos pueden seguir usando indicaciones específicas de destinatario. Las respuestas
privadas conservan su fallback de interlocutor. Las valoraciones de tono en caché no deciden quién
ha respondido desde que se crearon.

`groups/conversation.ts` construye un índice determinista de participación a partir del
historial reciente ya autorizado y respuestas anteriores de la ronda. Deduplica
IDs de mensaje, incluye personas y agentes y enumera aportes visibles
después del disparador para cada miembro actual. El contexto de ronda conserva burbujas
sucesivas, no solo el primer mensaje de cada respuesta, hasta 64 mensajes (ocho agentes
con hasta ocho burbujas cada uno), recortados a 800 bytes UTF-8 por mensaje. Nunca lee historial privado ni
amplía acceso. Una lista vacía no prueba silencio y un ID de mensaje no prueba
que se haya respondido una pregunta concreta. El estado interno de cola no es una respuesta.

El modelo de respuesta lee contenido real, citas, este índice y respuestas anteriores de
la ronda para decidir a quién se dirige, qué sigue sin responder, si su
aporte añade valor y si una pregunta es útil. Los comentarios a todo el grupo se
dirigen al espacio compartido. Las preguntas personales y correcciones pueden dirigirse a individuos.
No todos los miembros necesitan responder una pregunta factual ya resuelta; cada uno puede
aportar su propia perspectiva pertinente cuando se solicitó. Un miembro que habla
último no debería repetir una pregunta recíproca ya resuelta en el historial visible.
Esto se aplica a planificación, decisiones, opiniones y discusión, además de saludos.

Los filtros existentes de consentimiento, energía, atención exclusiva, respuestas obligatorias de apertura/tarea
y comprobaciones atómicas de publicación de borradores desactualizados siguen siendo autoritativos. Las revisiones
reconstruyen la participación visible actual antes de reevaluar un borrador desactualizado. No se añade nueva
programación de grupos inactivos ni obligación de responder. La participación dentro de una ronda puede
incluir una propuesta fundamentada, una perspectiva nueva o una pregunta conversacional específica,
con indicaciones ponderadas por iniciativa/curiosidad conservadas hasta la revisión final. Las decisiones semánticas siguen siendo
juicios falibles del modelo, no garantías deterministas del orden de cola.

## Entrega final y revisión opcional de redacción

La clasificación completa y suficientemente confiable de audiencia de la valoración de personalidad
existente se reutiliza como pista del disparador actual. Solo se representa la categoría
de audiencia, no su confianza ni causas privadas de relaciones. Con personalidad deshabilitada
o clasificaciones incompletas, la decisión queda al contexto visible actual.
Los mensajes posteriores pueden redirigir un aporte inicialmente grupal.

La finalización grupal elige un objeto interno `delivery` antes de escribir: audiencia compartida
o individual, IDs reales de destinatarios, razón para usar un nombre, profundidad y
necesidad de una pregunta no resuelta. Los IDs se comprueban contra la lista actual.
Este plan no es una traza de razonamiento y nunca entra en los mensajes publicados. Los metadatos
no prueban prosa conforme: la evaluación en vivo encontró una respuesta etiquetada grupal
que aun así terminaba con una pregunta automática singular.

Por eso, un borrador grupal no vacío con un signo de pregunta o un nombre visible de miembro puede
recibir una revisión adicional de redacción sin herramientas. Son posibles
disparadores de revisión, no una prohibición de preguntas, citas ni atribución. El revisor
conserva o revisa la redacción; no puede iniciar herramientas, repetir acciones, omitir una
respuesta obligatoria, eliminar una imagen preparada ni crear otra oportunidad de hablar.
La revisión ve una lista permitida de texto/citas/preguntas, no claves de almacenamiento de adjuntos ni
límites internos de aprendizaje. Los metadatos válidos de preguntas aprendidas permanecen ligados a la redacción
real publicada mediante el parser y la ruta de publicación existentes.

La revisión se guarda en checkpoint una vez por preparación de borrador, sin reintento de paso y con el
tiempo de espera de modelo existente de 45 segundos; un fallo de transporte o formato conserva el borrador
útil y registra un diagnóstico acotado. El acceso se comprueba antes de inferencia y otra vez
al publicar. La revisión existente de marca de agua del historial sigue siendo autoritativa si el tráfico
cambia mientras se ejecuta la llamada extra. Esto añade latencia variable y una llamada al modelo
para borradores marcados; es de mejor esfuerzo, no garantía sobre cada expresión.
Los checkpoints parseados heredados sin metadatos de entrega siguen aceptándose. Las solicitudes estrictas nuevas
los requieren, pero los metadatos se descartan de borradores publicables.

La guía de trabajo compartido también aplica al recopilar evidencia, para inspeccionar o reutilizar
un artefacto ya aportado por otro agente en lugar de reconstruirlo automáticamente.
La afirmación de un miembro sigue siendo evidencia atribuida, nunca un recibo de ejecución
ni autorización para realizar una acción nueva.

## Caché, publicación y verificación

No hay descarga nueva de cliente ni caché persistente. Las preferencias se leen durante
la preparación del contexto del servidor; los hábitos se calculan desde identidad y rasgos actuales.
Las ediciones afectan respuestas preparadas nuevas; un borrador ya guardado en checkpoint puede mantener su
contexto anterior. Los mensajes guardados antiguos no cambian. La mutación de acento sigue
actualizando los stores existentes de contactos de sesión, con la deduplicación,
actualización en segundo plano, rechazo de respuestas desactualizadas e invalidación de cuenta/acceso existentes.
La misma ayuda en las hojas Voz de iOS y web describe el efecto en la redacción.

Validación estática: TypeScript de API y web, parsing Swift, SQL EXPLAIN contra todas
las migraciones en una base efímera vacía y `git diff --check`. Las regresiones aisladas
opcionales están en `scripts/checks/conversation-style.cjs`; la evaluación en vivo con datos
ficticios usa `scripts/checks/conversation-style-live-eval.mjs`. Ejecuta cualquiera solo
con la autorización requerida por AGENTS.md. Consulta el [registro de evaluación](conversation-style-evaluation.md). El éxito estático no establece calidad
del modelo ni comportamiento en dispositivo.

Después de publicar, evalúa conversaciones ficticias privadas/grupales durante varios turnos
y con personalidades contrastantes. Cubre nombres innecesarios frente a destinatarios ambiguos;
gramática regional con voz activa/desactivada y acento cambiado; identidades creativas en
discusión práctica frente a escritura creativa solicitada; mensajes sociales breves
frente a explicaciones que necesitan profundidad; y escritura estable y distintiva sin que todos
los contactos adopten los mismos atajos. En grupos, varía orden de hablantes, respuestas humanas y
de bots, destinos citados, partes ya respondidas, mensajes nuevos tardíos e historial
parcial. Juzga preguntas recíprocas innecesarias, repetición y valor añadido, no
redacción exacta. Las notas de voz deben sonar conversacionales sin efectos escritos.

En ambos clientes comprueba reapertura/navegación atrás, chats cargados y vacíos, actualización
explícita, mutaciones fallidas de acento/recuperación sin conexión, revocación de acceso compartido y
cambio de cuenta. Los historiales existentes en caché deben seguir utilizables y las respuestas nuevas
deben usar el comportamiento actual del servidor. La [evaluación en vivo](conversation-style-evaluation.md) posterior
registra resultados del modelo ficticio; sigue pendiente la verificación en dispositivo/navegador y
no necesita chats de producción.

Comprobaciones estáticas completadas localmente el 30 de octubre de 2026: TypeScript de API/web, parsing
Swift de la vista editada de contacto, 19 sentencias SQL de contexto de personalidad/grupo y
28 de onboarding compiladas contra las 67 migraciones, sintaxis del harness y
`git diff --check`. El parsing Swift no es una comprobación completa de tipos de la aplicación. El harness nuevo
de regresión se escribió pero no se ejecutó; para este cambio no se hicieron tests, builds, inferencia real,
acceso a datos de producción, commit, push ni publicación.

La verificación inicial exclusivamente estática anterior precede a la evaluación correctiva con modelos
reales de la misma fecha. El [registro de evaluación](conversation-style-evaluation.md)
distingue fallos publicados, intentos intermedios y evidencia final. La nueva
corrección incluye 80 regresiones locales aprobadas; sigue sin commit ni
publicación al terminar esa evaluación.

Los metadatos de entrega grupal también permiten `followUp: conversation` para curiosidad opcional y
específica que avanza una conversación social abierta. Se distingue de
información faltante requerida para responder una tarea y de una pregunta recíproca
refleja. Consulta [participación conversacional](groups.md#conversational-participation).
