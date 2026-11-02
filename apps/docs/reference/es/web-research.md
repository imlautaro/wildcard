# Investigación web

Un contacto puede investigar un tema público desconocido para entender de qué habla
una persona y continuar la conversación. `research_web({ query, title })` ahora
entrega por defecto en la conversación: Meta Responses realiza la búsqueda acotada
y los hallazgos vuelven como evidencia para la respuesta ordinaria de Chat Completions.
No se crea documento, tarjeta de informe ni notificación separada. Pedir al contacto
que busque algo o se familiarice con ello no solicita por sí solo un entregable.

Cuando la persona pide realmente un informe guardado u otro texto duradero, el
contacto usa `research_web({ query, title, delivery: "document" })`. Ese modo guarda
el informe en los [documentos](documents.md) existentes del chat. La elección es
orientación semántica del modelo respaldada por un modo explícito de herramienta,
no un clasificador de palabras clave ni garantía universal sobre la intención
inferida. La investigación autónoma autorizada de tareas mantiene su contrato
de informe con consulta exacta.

Para entrega documental, iOS y web muestran **Investigación web** y el número de
fuentes citadas en la tarjeta. Ábrela para leer el informe y desplegar su panel de
fuentes: consulta, fecha de comprobación, enlaces y si cada fuente fue citada o solo
recuperada. La procedencia corresponde a la revisión 1; editar un informe no vuelve
a comprobar afirmaciones ni actualiza sus fuentes originales. Abrir un enlace es
una acción humana. Los documentos conservan sus editores habituales.

Las solicitudes humanas ordinarias permiten investigación acotada. El
[trabajo persistente de tareas](persistent-work.md#public-research-permission-0055)
también permite una consulta pública exacta autorizada en el editor, con controles
explícitos de pausa/revocación. Monitores, memoria semántica y permisos más amplios
siguen siendo trabajo futuro.

## Alcance y permisos

- Se ofrece en turnos humanos privados ordinarios y respuestas iniciales de grupo
  a un mensaje humano real, más turnos de tarea autorizados explícitamente
  (véase abajo). No en programaciones, iniciativa, disparadores ordinarios de bots,
  solicitudes dirigidas de grupo, revisiones de borradores ni recuperación de respuestas.
- Los chats privados y grupos aislados por conectores no pueden investigar, incluso
  después de quitar un conector. Este primer incremento mantiene sus datos fuera
  de la búsqueda pública. No cambian las reglas existentes de ejecución MCP y
  memoria local.
- Las consultas deben ser preguntas públicas autosuficientes. Los prompts prohíben
  enviar secretos, resultados de conectores, transcripciones privadas, memorias o
  detalles personales a búsqueda. Es orientación del modelo, no un clasificador
  semántico de prevención de fugas. La subsolicitud de búsqueda recibe solo la
  pregunta acotada e instrucciones fijas; no historial, adjuntos, memorias ni
  herramientas de conectores. Una síntesis opcional sin herramientas recibe
  además solo resultados públicos devueltos.
- La investigación usa el modo Spark Estándar/Contributor del turno, sujeto al
  acceso actual y consentimiento Contributor. Se comprueban propiedad, pertenencia
  actual al grupo, consentimiento de memoria compartida, consentimiento Contributor
  de todos los miembros, intento activo y atención antes de llamar al proveedor
  y durante publicación. Salir de Contributor impide que ese turno en vuelo
  publique un resultado Contributor.
- Los hallazgos/informes privados quedan en el chat de ese participante. Los de
  grupo están disponibles solo dentro de ese grupo, con consentimiento actual del
  autor/miembro de origen. Investigar no añade recuperación entre chats ni permisos
  de conectores. Los informes son evidencia no confiable y no autorizan escrituras externas.

## Presupuestos y recibos

Valores de implementación en `apps/api/src/research/model.ts`:

| Límite | Valor por defecto |
| --- | --- |
| Solicitudes de investigación | Una por mensaje humano, compartida entre contactos de grupo; una por vida de tarea autorizada |
| Límite de cuenta / instalación en 24 horas móviles | 10 / 100 reservas |
| Pregunta / título | 600 / 200 unidades de código UTF-16 |
| Llamadas al proveedor por reserva | Un POST de búsqueda, más como máximo un POST de síntesis sin herramientas si las citas no son utilizables |
| Salida por llamada al proveedor | 4,096 tokens incluido razonamiento |
| Llamadas a herramientas integradas | Como máximo 3 mediante `max_tool_calls` |
| Plazo compartido de operación / cuerpo por llamada | 60 segundos en total / 256 KiB cada uno |
| Informe guardado / índice de fuentes | 24,000 unidades UTF-16 / 20 fuentes |

Investigar consume una de las seis ejecuciones de herramienta existentes. No amplía
los presupuestos normales privados/de grupo. Su paso de grupo permite dos minutos
para la llamada al proveedor y trabajo D1 dentro del plazo de evidencia existente.

Un `INSERT SELECT` D1 protegido reserva atómicamente la solicitud y comprueba los
presupuestos móviles. La clave única es independiente de intento y consulta; las
respuestas de grupo comparten la clave del mensaje humano de origen. Los intentos
fallidos, pendientes e inciertos consumen su reserva. En la misma transacción se
registra un evento sin contenido `web_research_usage`, con ID aleatorio, clave de
cuenta con hash y fecha. Sobrevive a la eliminación del padre para que borrar un
chat/cuenta no devuelva presupuesto. Los eventos caducan para admisión tras 24 horas;
se purgan hasta 200 caducados en cada admisión posterior. Si no hay nuevas admisiones,
quedan almacenados hasta la siguiente. Esa tabla no conserva consultas, fuentes ni informes.

Ningún POST con coste tiene reintento de transporte. Un fallo después de reservar
puede dejar `pending`; los reintentos devuelven incertidumbre sin otra búsqueda
para ese mensaje. Tampoco se reintenta `failed`. Una respuesta completada con
fundamento se convierte en borrador `ready`. La entrega conversacional completa
ese recibo con protección de acceso actual, conserva los hallazgos normalizados y
los devuelve al contacto. La documental crea documento, revisión 1 y recibo
`complete` en una transacción. Cualquier resultado listo puede reanudar la entrega
sin otra llamada con coste. Solo la entrega documental está sujeta al límite de
lista de documentos, en admisión y publicación; una lista llena no impide investigar
para conversación. Si la lista se llena durante la investigación, liberar espacio
permite que otro reintento del mismo mensaje publique el borrador guardado. No
hay publicador de fondo independiente.

El modo de entrega es inmutable una vez reservado. Los recibos conversacionales
completados devuelven la misma evidencia guardada al repetirse, incluso a otro
contacto autorizado actual de la misma ronda humana de grupo, sin otra búsqueda
ni artefacto. Los documentales apuntan al documento original. Los reintentos no
sobrescriben ediciones ni convierten el modo. Eliminar el documento pone el puntero
a null; el mensaje original no puede recrearlo ni reclasificarlo como hallazgos
en línea. Denegar presupuesto no llama al proveedor. Los errores e incertidumbre
se devuelven al contacto para su respuesta habitual; no hay pantalla de trabajo
ni botón de reintento separados.

Los fallos se informan por separado de reservas pendientes o inciertas.
`RESEARCH_FAILED` explica cuándo el proveedor no completó una búsqueda o no devolvió
citas URL utilizables; en ninguno de los casos se guarda informe. Los recibos
anteriores `MODEL_RESEARCH_UNGROUNDED` no distinguen esas condiciones. Las nuevas
operaciones registran `MODEL_RESEARCH_NO_SEARCH` o `MODEL_RESEARCH_NO_CITATIONS`.
Las instrucciones piden explícitamente `web_search` incluso para preguntas conocidas
y estables históricamente. Meta solo permite selección automática de herramientas,
así que esa instrucción no garantiza búsqueda; la validación sigue rechazando
respuestas sin fundamento. Consulta [selección de herramientas Meta](https://dev.meta.ai/docs/tool-calling).
Un nuevo mensaje humano tiene intento independiente sujeto a límites diarios.
Una tarea fallida conserva solo su intento original para toda su vida. Nunca se
reintenta automáticamente una operación fallida/incierta, ni se registra o conserva
la respuesta en bruto del proveedor.

Diagnóstico del 29 de octubre: el agregado de recibos de producción contenía dos
fallos `MODEL_RESEARCH_UNGROUNDED`. Confirma rechazo por validación de fundamento,
no si faltaba una búsqueda completa o una cita. Los cambios de instrucciones y
reporte de errores siguen sin verificar con inferencia real.

No existe contrato de pausa/reanudación de una búsqueda HTTP en vuelo. Perder
acceso impide publicar; una solicitud ya enviada aún puede cobrarse. Desactiva
`WEB_RESEARCH_ENABLED` en un futuro release automático para dejar de ofrecer/iniciar
investigación nueva. No retira llamadas ni elimina informes. La investigación de
tareas comprueba además consulta exacta humana, quién autorizó y generación actual;
consulta [permisos de tareas](persistent-work.md#public-research-permission-0055).

## Fuentes, almacenamiento y coste

El parser exige un resultado Responses completado, al menos un `web_search_call`
completado, respuesta acotada y cita utilizable. Una cita puede ser una anotación
`url_citation` del proveedor o un enlace Markdown analizado cuya URL normalizada
coincide con un resultado de búsqueda completada de esa respuesta. Las URLs
explícitas sin formato también se reconocen como enlaces. Un informe puede mejorar
una URL HTTP recuperada con puerto predeterminado a HTTPS; se rechazan degradaciones
y mejoras con puerto no predeterminado. La coincidencia preserva hosts, rutas,
consultas y fragmentos; compartir dominio no basta. Código, URLs de imágenes y
anclas HTML en bruto no cuentan. Las URLs de resultados conservan su esquema
original en la procedencia. El prompt pide enlaces Markdown completos copiados
exactamente de resultados, no rutas canónicas ni páginas de inicio supuestas.
Los resultados sin enlace coincidente siguen solo recuperados. Si Meta omite
búsqueda, no devuelve citas, rechaza, trunca o agota tiempo, no se publica documento.
Se priorizan fuentes citadas sobre recuperadas. Cada sección recibe enlaces de
citas aceptadas; los mensajes de fase de comentario se excluyen del informe guardado.
El panel inmutable preserva títulos/URLs y la distinción citado/recuperado. No se
almacena aparte contenido de páginas ni fragmentos de búsqueda. Exactitud y
cobertura de citas dependen de Meta; citar no es verificación independiente.

Si hay resultados completos pero no se analizan citas utilizables, la operación
puede hacer una **síntesis Chat Completions sin herramientas** adicional. Recibe
solo la pregunta pública y hasta 20 URLs/títulos devueltos con fragmentos acotados,
no historial, memoria, notas de tarea ni borrador original sin fundamento. Antes de
admitir se comprueban acceso, generación de tarea y consentimiento de modelo.
Ambas llamadas comparten los 60 segundos y la reserva duradera; repetir nunca
vuelve a llamar a ninguna. Puede aumentar el coste de inferencia, pero nunca hace
otra búsqueda ni devuelve un intento. El fallo sigue fallido/incierto según los
recibos existentes.

El esquema de síntesis usa secciones con IDs numéricos de la lista de fuentes.
El servidor valida cada ID, rechaza enlaces del modelo y construye URLs desde
los resultados. Registra `synthesisCalls: 1` y uso combinado de tokens en procedencia
si está disponible. Resultados sin fragmentos solo permiten descubrir fuentes;
las instrucciones exigen explicitarlo. Un informe puede ser preliminar y necesitar
más trabajo. Se indica a contactos leer el informe guardado y sus límites antes
de describir el resultado. Esta alternativa no establece que una fuente respalde
todas las afirmaciones ni que se hayan leído las páginas.

Los renderizadores escapan HTML y suprimen imágenes Markdown remotas. El panel
acepta URLs HTTP(S) de dominio sin credenciales, rechazando IPs literales y nombres
localhost/locales. El Worker nunca obtiene esos enlaces. La validez del dominio
no garantiza confianza ni disponibilidad.

La migración `0055_task_research.sql` añade campos de permiso/contador a tareas,
vínculo único de tarea y generación de ejecución a cada recibo de investigación.
El consumo permanece en la tarea si se elimina turno original, recibo, informe o
cuenta que autorizó. Consulta/permiso/contador comparten la retención de tarea;
los recibos conservan las cascadas de padre existentes. Sin relleno histórico ni servicio nuevo.

La migración `0053_web_research.sql` añade `web_research`, `web_research_usage` y
`chat_document.research_json` anulable. Los borradores listos conservan
Markdown/procedencia normalizados hasta entrega o eliminación del padre. Publicar
un documento borra el cuerpo duplicado; la procedencia original queda con el
documento hasta eliminarlo, a través de ediciones. La finalización conversacional
conserva un cuerpo normalizado (hasta 24,000 caracteres/20 fuentes existentes) en
el recibo hasta eliminar turno privado padre, origen/respuesta de grupo, contacto,
agente o cuenta. Vaciar chat elimina hallazgos vinculados aunque se conserve memoria
factual. No hay copia privada adicional en disco del cliente, almacén global ni
conversión automática a memoria factual compartida. La retención de revisiones
sigue en 50. Los recibos conservan consulta/título/modelo, estado y código seguro
de fallo hasta eliminar su padre. No hay proceso nuevo de limpieza por retención.

Responses usa `store: false`, sin ID de respuesta anterior, solicitudes Meta
directas autenticadas y redirecciones manuales. Reutiliza `META_API_KEY`. Los logs
contienen solo `web_research_failed` y un código seguro, nunca payloads ni excepciones
del proveedor. Actualmente esta ruta no pasa por AI Gateway. La procedencia registra
tokens de entrada/salida y elementos de llamadas completas de búsqueda reportados,
que no equivalen a consultas facturables ni estimación de coste. Las llamadas
fallidas pueden incurrir en uso no registrado.

Comprobado el 29 de octubre de 2026: Meta lista búsqueda a $2.50 por 1,000 consultas
más tokens del modelo. Los topes de solicitudes/herramientas no son corte monetario.
Workflows Free incluye actualmente 3,000 pasos/día, 100,000 solicitudes/día compartidas
con Workers, 10 ms CPU por invocación y 1 GB-mes de almacenamiento. Tráfico y uso
D1/R2 existentes comparten cuotas de cuenta. No se crea servicio Cloudflare nuevo;
no se garantiza funcionamiento gratuito.

Fuentes: [búsqueda Meta](https://dev.meta.ai/docs/search-grounding),
[esquema Responses](https://dev.meta.ai/docs/api-reference/responses/schemas),
[precios Meta](https://dev.meta.ai/docs/pricing-rate-limits),
[precios Workflows](https://developers.cloudflare.com/workflows/reference/pricing/).

## Caché y validación

Se usan las cachés de sesión existentes de lista/detalle de documentos y sondeo
de chat. Los metadatos viajan con la instantánea: sin obtención separada de fuentes,
caché persistente ni búsqueda al abrir. Resultados vacíos en caché, revalidación
en segundo plano, deduplicación, rechazo de respuestas obsoletas, mutaciones,
límites LRU, pérdida de acceso confirmada y reinicio siguen la
[caché de documentos](caching.md#chat-documents). Los metadatos de fuentes duran
lo que el documento. Actualizar nunca repite una búsqueda.

Preparación estática: `node scripts/checks/web-research-sql.cjs` compila SQL y
aridades de bindings para protecciones privado/grupo, Estándar/Contributor y
sentencias contra esquema vacío con todas las migraciones al límite de profundidad
D1. No ejecuta comportamiento ni lee datos. También se aplican tipos API/web
TypeScript y Swift iOS.

Diagnóstico posterior del 29 de octubre: una solicitud real autorizada con código
de producción y pregunta pública RSS/Atom devolvió HTTP 200/completed, tres llamadas
de búsqueda completadas (9, 11 y 10 resultados) y siete URLs en la respuesta final,
pero matrices de anotaciones vacías. El parser de solo anotaciones la rechazó.
Solo se imprimieron conteos estructurales; no se guardó respuesta en bruto ni
publicó documento. Después se implementó compatibilidad Markdown/resultados;
no se ha verificado una segunda solicitud real ni publicación de extremo a extremo.

Más tarde ese día, el usuario autorizó hasta tres solicitudes RSS/Atom públicas
adicionales y comprobaciones offline. La primera pasó el parser anterior solo por
una fuente secundaria: el resultado RSS oficial usaba HTTP y el informe HTTPS,
y varios enlaces se sustituyeron por páginas de inicio o rutas RFC alternativas.
Repetirla con el nuevo comparador reconoce también la fuente RSS oficial. La
segunda pasó con prompt y comparador actualizados. La tercera con comparador final
falló correctamente: el modelo dio URLs oficiales IETF ausentes en todos los
resultados, con anotaciones vacías. Las citas afirmaban recuperación no establecida
por la evidencia. No trates este cambio como arreglo fiable de extremo a extremo
ni relajes coincidencias para aceptarlas. La salida pública se guardó temporalmente
fuera del repo para diagnóstico offline; se excluyeron credenciales, historial
privado y razonamiento cifrado. Ninguna llamada diagnóstica publicó documentos.

`node scripts/checks/research-response.cjs` cubre 23 casos offline: citas
estructuradas, Markdown/referencias/enlaces sin formato, mejoras HTTP, rechazo de
degradación/puerto, coincidencia exacta de ruta/consulta/fragmento, comentarios,
respuestas solo recuperadas, URLs oficiales supuestas ausentes, búsquedas incompletas,
código, imágenes, HTML y hosts inseguros. También pasa TypeScript API. No establece
publicación documental de producción.

El usuario autorizó después hasta tres solicitudes más para síntesis con fuentes
explícitas. Pasó una síntesis sobre la respuesta pública antes rechazada. Una
operación completa nueva usó dos llamadas (búsqueda y síntesis) y pasó con 20 fuentes,
15 citadas por IDs validados. El informe explicitó fragmentos vacíos, evidencia
faltante y estado preliminar. Otros seis casos offline cubren admisión de síntesis,
agregación de tokens, IDs válidos, inválidos/ausentes y enlaces del modelo. No se
creó informe en producción; publicación en base de datos y presentación iOS/web
siguen pendientes tras release.

La investigación Meta real, calidad de citas, cobro, repetición de resultados
inciertos, admisión concurrente de presupuestos, cambios de modelo/consentimiento
en ejecución y presentación requieren verificar funcionalmente con datos ficticios
tras un release autorizado. En ambos clientes verifica tarjeta → informe → fuentes →
atrás/reabrir, listas vacías, actualizar/recuperar sin conexión, ediciones simultáneas,
eliminación, pérdida de acceso y cambios de cuenta. Lo estático no establece esto.

## Hallazgos locales de conversación — migración 0068

`0068_conversational_research.sql` añade solo `delivery` al recibo. Su valor por
defecto es `document` para que recibos pending/ready/complete existentes conserven
sus contratos originales de informe/eliminación. Las solicitudes ordinarias nuevas
usan `conversation` por defecto en código; las de tarea siguen `document` y no
aceptan consulta del modelo ni cambio de entrega. La selección no añade llamadas,
devuelve presupuesto, cambia comprobaciones de fundamento, relaja consentimiento
ni amplía disponibilidad de herramientas. La salida interna sigue siendo un
briefing estructurado; el modelo conversacional la usa como evidencia sin reenviar
formato ni crear un artefacto no solicitado. La guía general de documentos también
distingue entregable pedido de contexto necesario para conversar.

Las respuestas posteriores pueden recibir los dos hallazgos conversacionales
completados más recientes de este mismo chat participante/agente o grupo actual.
Cada extracto tiene como máximo 5,500 caracteres Markdown (principio y final al
recortar), consulta pública, fecha original y hasta tres enlaces citados. El recorte
es explícito; el modelo debe conservar incertidumbre y no asumir evidencia omitida.
Las consultas privadas exigen identidad de contacto/usuario/agente y secuencia.
Los grupos exigen pertenencia actual de autor/espectador y consentimiento de memoria,
pertenencia del agente que responde, disponibilidad del compartido, aptitud actual
Contributor y secuencia de origen. Los ámbitos aislados por conectores no devuelven
ese contexto; Estándar excluye hallazgos Contributor. La evidencia nunca cruza
participantes privados ni fronteras privado/grupo, y fechas antiguas no establecen
hechos actuales. Es reutilización acotada, no aprendizaje permanente, conocimiento
completo ni comprobación independiente.

La API compartida da el mismo comportamiento a iOS/web con mensajes, enlaces
Markdown, sondeo, cachés de partes entregadas e indicador Escribiendo existentes.
La investigación conversacional no añade mutación de lista de documentos, insignia
de informe, endpoint cliente, cuenta atrás, notificación ni consulta de panel de
fuentes. Los informes explícitos conservan panel/editor/caché. Actualizar, navegar
y repetir nunca disparan automáticamente otra búsqueda con coste.

Verificación estática de este refinamiento: TypeScript API, espacios y preparación
de 29 variantes SQL/aridades contra 68 migraciones vacías con profundidad 100.
No se ejecutó arnés funcional, build, llamada de modelo, migración remota, release
ni sesión de dispositivo/navegador. Verifica con datos ficticios: referencias
desconocidas frente a informes explícitos, reutilización posterior, ausencia de
documento o briefing largo no solicitado, lista llena, compartición de grupo sin
búsqueda duplicada, cambios de consentimiento/modelo en ejecución, repetición
pending/failed/ready, informes antiguos eliminados, vaciado/eliminación, navegación
sin conexión y cambios de cuenta. Intención semántica y respuestas naturales
requieren evaluación con modelo real; lo estático no las establece.

## Investigación anunciada y respuestas fundamentadas (migración 0071)

**Se descartaban respuestas fundamentadas.** `web_search` de Meta puede abrir páginas
de resultados (`action.type: "open_page"`, URL en `action.url`, sin `results`) y el
modelo recibe contexto de página según `search_context_size`, pero la API devuelve
`snippet` vacío y a menudo sin anotaciones `url_citation` ni enlaces Markdown.
Por ello cada informe de una exportación de depuración de 2026-10-30 falló con
`MODEL_RESEARCH_NO_CITATIONS` y se sustituyó por síntesis de solo títulos, que
(correctamente) decía que no podía verificarse nada. Pruebas reales con Contributor
mostraron cifras reales en respuestas descartadas (por ejemplo rangos USCIS I-130
y fechas de Visa Bulletin).

El parser acepta ahora, por orden: anotaciones o enlaces Markdown coincidentes
(sin cambios); si no, páginas abiertas por el proveedor, acreditadas como citadas
con una línea «Páginas leídas para esta respuesta»; si no, tras búsquedas completas
con resultados, los primeros cinco resultados recibidos con una línea que indica
que no se abrieron individualmente. La procedencia registra `pagesOpened` y
`searchResultsCredited`. La síntesis de solo títulos queda para búsqueda sin
respuesta utilizable. La operación conserva como máximo tres llamadas integradas;
las instrucciones piden abrir las páginas más relevantes (oficiales primero) y
empezar con respuesta directa en unas 300 palabras, lo que redujo la latencia real
de unos 57 a 20 segundos. Son resúmenes de páginas recuperadas producidos por el
modelo, no verificación independiente.

**Anuncio.** `research_web` requiere `announcement`: un mensaje corto con la voz
del contacto que dice que está investigando. Solo una búsqueda nueva admitida que
no sea de tarea anuncia, justo antes de la solicitud con coste. En privados se
añade como primera burbuja del turno en curso; en grupos se publica `<reply>/part/0`
por el carril de publicación (espera acotada, energía y continuación como cualquier
burbuja). El resultado lleva `announcementDelivered` para no repetirlo en la respuesta final.

**Indicador Investigando.** Durante la solicitud se establecen
`agent_presence.researching_until` (tiempo límite más 30 segundos) y
`researching_topic`, y se limpian después. La presencia privada devuelve
`status: "typing"` con `isResearching: true`; lista de contactos y respuestas de
grupo exponen `replyActivity: "researching"`, y los resúmenes etiquetan al contacto
**Investigando...**. Los contactos de grupo reciben nombres y temas de miembros
que investigan ahora. iOS y web muestran **Investigando...** en cabeceras, vistas
previas e indicador entrante; los clientes antiguos muestran Escribiendo.

**Investigaciones divididas (migración 0072).** Cada investigador planificado de una
ronda profunda o de proyecto recibe su propio recibo y espacio de presupuesto;
para los demás sigue la compartición por mensaje. Los límites diarios son ahora
30 por cuenta y 300 globales. Consulta
[grupos](groups.md#research-depth-quick-deep-and-project-migration-0072).
