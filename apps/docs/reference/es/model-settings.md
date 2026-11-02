# Ajustes de modelo de cuenta y AI Gateway

La [investigación web](web-research.md) conserva la selección Estándar/Contributor del turno humano
y las comprobaciones actuales de consentimiento, usando solicitudes directas a Meta Responses con
`store: false`. Actualmente no pasa por AI Gateway, por lo que las estimaciones del panel del gateway
omiten sus tokens y tarifas de búsqueda. La procedencia de documentos exitosos registra
los recuentos de tokens reportados y elementos de llamadas de búsqueda completadas; no son totales de facturación.

Solicitado el 27 de octubre de 2026: cerrar el registro de cuentas nuevas, permitir a cada cuenta
existente elegir Muse Spark 1.3 Estándar o Contributor desde Cuenta en iOS/web
y observar el gasto estimado de Spark en Cloudflare AI Gateway.

## Contrato de cuenta

`GET /api/v1/me` y las mutaciones de perfil devuelven `user.chatModel` como
`muse-spark-1.3` o `muse-spark-1.3-contributor`. La migración aditiva 0028 añade una
columna restringida `user.chat_model`, con Estándar por defecto para todas las cuentas.
No lee/exporta conversaciones ni crea/elimina cuentas.

`PUT /api/v1/me/model` acepta exactamente `chatModel` y opcionalmente
`contributorConsent`. Contributor requiere `contributorConsent: true` cada vez que
se guarda. Modelos no compatibles, campos desconocidos o falta de aceptación Contributor
devuelven 422; una sesión bearer ausente/inválida devuelve 401. El endpoint actualiza solo
la cuenta autenticada; no admite suministrar otro ID de cuenta. La selección Contributor
guardada registra la aceptación continuada hasta volver a Estándar.
Ninguna caché de cliente autoriza procesamiento ni concede permisos de uso compartido.

Ambos clientes muestran las mismas opciones y explicación: Contributor permite a Meta
usar mensajes, archivos, contexto y respuestas enviados para entrenar modelos; Estándar
no lo permite. Cambiar a Estándar afecta al procesamiento futuro, no a los datos ya enviados.
Las personas pueden volver a seleccionar Contributor con aceptación explícita. No hay
asignación administrativa por cuenta. La bandera administrativa `contributor_only`
([administración](admin.md#runtime-settings-and-feature-flags)) procesa todas las cuentas
con Contributor mientras está activa, sin cambiar ninguna elección guardada; al
desactivarse se aplica de nuevo la selección propia de cada cuenta. Mientras está activa, ambos
clientes muestran Modelo de chat como Contributor con una nota en lugar del selector.

Cada Workflow de respuesta privada/de grupo guarda en un checkpoint el modelo de cuenta al iniciar y
lo conserva durante reintentos y publicación. Las respuestas privadas, programaciones autónomas
y entregas privadas de resultados de grupo usan la cuenta de la conversación. Las respuestas de grupo
usan al autor/solicitante humano de origen, incluidos intercambios de bots derivados de
esa persona; no usan la preferencia del propietario del bot. Los solicitantes ausentes/eliminados
usan Estándar por defecto. La extracción de memoria de contacto usa la selección actual de la cuenta
de origen, incluso cuando un trabajo de otro participante actualiza esa memoria. La memoria
propia del agente y la extracción de grupo usan el modelo de su trabajo de respuesta. Todas las llamadas Spark,
incluidas extracción y validación de publicaciones de grupo, comparten la integración del gateway.

Los trabajos ya iniciados conservan el modelo del checkpoint; cambiar un ajuste no
los cancela ni regenera. Las versiones existentes del Worker pueden terminar bajo su código
anterior. Un trabajo de respuesta de grupo nuevo en un intercambio en curso lee la selección del solicitante
cuando inicia. No hay degradación ni alternativa automática para un modelo inválido
o acceso faltante al proveedor.

## Uso compartido y MCP

La selección de modelo y el consentimiento de memoria compartida son independientes. Seleccionar Estándar no
revoca un consentimiento previo de uso compartido Contributor ni borra recuerdos compartidos: otro
participante todavía puede procesar datos compartidos con Contributor cuando lo permiten los permisos
existentes. A la inversa, seleccionar Contributor nunca concede consentimiento en
nombre de un destinatario del contacto o participante del grupo. Las comprobaciones existentes de solicitudes, recuperación,
pertenencia, publicación y consentimiento siguen aplicándose a Contributor.
La memoria de contactos y personalidad enviada a Contributor debe pertenecer a la cuenta que procesa
o tener consentimiento Contributor explícito del contacto. Ser el creador del contacto
no concede por sí solo excepciones para trabajos de otra cuenta. La aceptación Contributor explícita del creador
en el flujo de invitación del contacto se registra ahora en su propia
fila del contacto; no se inventa ni rellena consentimiento histórico del creador. La recuperación de memoria
de grupo identifica por separado la cuenta humana que procesa y el contacto del propietario del agente
usado para localizar al agente compartido.
Los grupos sin el consentimiento requerido siguen rechazando/deteniendo respuestas Contributor;
las personas pueden elegir Estándar o actualizar explícitamente el consentimiento de ese grupo.

Los envíos rechazados por falta de consentimiento devuelven 403 con un `code` que ambos clientes
localizan en lugar del `error` inglés: `CONTACT_CONTRIBUTOR_CONSENT_REQUIRED`
(chat privado con un contacto compartido aceptado sin consentimiento Contributor; se corrige
con una invitación nueva aceptada con consentimiento) y `GROUP_CONTRIBUTOR_CONSENT_REQUIRED`
(mensaje de grupo cuando a cualquier miembro le falta). El cuerpo de grupo añade
`selfConsentMissing` y `membersMissing`, y el chat grupal ofrece **Miembros**,
donde cada persona da su propio consentimiento. Ambos cuerpos añaden `contributorOnly` y
el mensaje indica entonces que la bandera administrativa está activa. Una respuesta que falla más tarde
porque el consentimiento cambió durante el trabajo sigue mostrando el fallo genérico; los mensajes
proactivos omitidos no se notifican.

Los chats privados de contactos aislados por MCP siempre usan Estándar, independientemente de Cuenta,
y conservan su aislamiento permanente de memoria compartida. No deduzcas que conceder
acceso MCP permite procesamiento Contributor ni divulgación pública/en grupos.

## Aprovisionamiento del gateway

Sigue la [configuración de infraestructura](infrastructure.md#optional-ai-gateway-for-spark-spending)
para bindings, reemplazos de cuenta y publicaciones automáticas. El gateway es opcional
para instalaciones independientes. La configuración de producción versionada lo deshabilita
temporalmente con `AI_GATEWAY_ID=""` después de fallos del gateway el 27 de octubre de 2026.
Las solicitudes Spark usan la ruta directa existente a Meta; la selección de cuenta, Estándar para MCP,
comprobaciones de consentimiento y cachés de clientes no cambian. Las métricas de gasto del gateway no
cubren llamadas directas. Conserva el gateway y sus logs existentes.

Los Workflows de producción agotaron reintentos de generación con
`MODEL_TEMPORARILY_UNAVAILABLE`; los metadatos del gateway mostraban HTTP 502, cero tokens
y duración de 4–10 ms. Un diagnóstico mediante el binding AI remoto con texto
ficticio y una clave inválida de proveedor reprodujo el error 2006 del gateway, mientras que una solicitud directa
a Meta con la misma clave inválida devolvió el HTTP 401 esperado. Cambiar
el endpoint del gateway a cualquiera de las dos formas de ruta relativa no resolvió el error.
Estas comprobaciones localizan la ruta del gateway que falla; no establecen su causa
interna ni verifican inferencia autenticada. El diagnóstico no usó claves reales del proveedor ni contenido
de chats. Las solicitudes fallidas al modelo ahora solo registran transporte y estado
HTTP, nunca cuerpos de solicitud/respuesta ni credenciales.

Publica la omisión del gateway mediante el flujo normal de commit/push y despliegue automático.
Luego reintenta un turno fallido desde cualquier cliente y comprueba su paso de generación del Workflow.
Vuelve a habilitar `AI_GATEWAY_ID=wildcard` solo después de verificar por separado la ruta
del gateway, ambos modelos seleccionados, respuestas de herramientas y métricas sin payloads. Rehabilitarlo
también requiere una publicación automática versionada normal; no necesita migración de esquema.

En la cuenta Cloudflare de destino, abre **AI → AI Gateway → Create a custom gateway**.
Usa ID `wildcard`, exige autenticación, desactiva Collect Logs por defecto y desactiva
caché de respuestas, reintentos, límites de solicitudes y límites de gasto. Deja Workers AI en facturación
Estándar. No compres créditos ni configures Unified Billing para esta integración.
En **Custom providers**, crea `Meta` con slug `meta` y URL base
`https://api.meta.ai`. Si usas la API de administración, fija `enable: true`.
Las rutas del proveedor añaden `/v1/chat/completions`. La solicitud universal del binding
usa el proveedor `custom-meta` y ese endpoint oficial fijo.

Alternativamente, ejecuta `npm run infra:ai-gateway -- --create` con una credencial existente
con permisos AI Gateway Read/Edit de tu cuenta. Sin `--create`, el script
solo verifica; no modifica gateways/proveedores existentes. Rechaza
desvíos en la URL del proveedor y apunta a `wildcard` cuando el enrutamiento está deshabilitado; en otro caso, al
ID de gateway configurado. Informa errores de permisos sin imprimir credenciales.
Un ámbito OAuth de Wrangler insuficiente no significa que la cuenta haya cerrado sesión;
el panel puede aprovisionar sin crear ningún token de runtime.

El binding `AI` autentica automáticamente. Conserva `META_API_KEY` en los secretos cifrados
existentes de build/runtime; se reenvía a Meta mediante el intermediario Cloudflare
solicitado, no se guarda desde la UI Provider Keys del gateway. La emulación local
debe fijar `AI_GATEWAY_ID=` en `.dev.vars` ignorado para llamadas directas u optar
explícitamente por un gateway remoto aprovisionado. No se necesita un secreto nuevo de runtime.

## Gasto y retención

El gateway recibe el tráfico de inferencia para reenviarlo. Por solicitud,
`cf-aig-collect-log-payload: false` suprime los cuerpos sin procesar de solicitudes/respuestas
almacenados y conserva métricas de proveedor/modelo/estado/tokens/costo/duración. No se añaden nombres,
emails, IDs de cuentas o contactos ni metadatos personalizados de usuarios. Collect Logs
está desactivado por defecto como protección adicional para otros clientes. Los logs siguen
habilitados para los metadatos de esta integración con `collectLog: true`.

Se omite la caché de respuestas; se permite un intento de gateway. Continúan los reintentos acotados
existentes de Workflow y cada intento real al proveedor puede tener costo. Un
fallo del gateway no se reintenta directamente contra Meta. Este cambio no habilita protecciones, alternativas,
enrutamiento de modelos, búsqueda de proveedores ni funciones de caché.

Tarifas públicas comprobadas el 27 de octubre de 2026, en USD por millón de tokens:

| Modelo | Entrada | Entrada en caché | Salida |
| --- | ---: | ---: | ---: |
| Estándar | 1.25 | 0.15 | 4.25 |
| Contributor | 0.10 | 0.002 | 0.20 |

`cf-aig-custom-cost` suministra tarifas por token, incluidas lecturas de caché del proveedor.
Son costos estimados del proveedor, no un estado de facturación ni saldo de cuenta.
Requieren que el gateway interprete correctamente la respuesta de uso de Meta. Los créditos,
precios negociados, impuestos y cargos propios de logs/servicios de Cloudflare pueden diferir.
Actualiza `apps/api/src/chat/meta.ts` cuando cambien las tarifas. La ASR directa Muse Voice Transcribe
se factura por duración de audio y se excluye de los totales Spark del gateway.
Consulta [precios de Meta](https://dev.meta.ai/docs/pricing-rate-limits),
[costos personalizados](https://developers.cloudflare.com/ai-gateway/configuration/custom-costs/)
y [logs sin payloads](https://developers.cloudflare.com/ai-gateway/observability/logging/).

## Caché y verificación

El perfil de cuenta se mantiene en el store existente de memoria de la sesión, incluido
el modelo. iOS revalida al entrar a Cuenta; web revalida en segundo plano al
montar con una solicitud deduplicada, conservando datos en caché utilizables ante fallos. Los guardados
aplican la cuenta devuelta sincrónicamente. Web bloquea lecturas anteriores de perfil y
actualiza las banderas Contributor en listas/grupos en caché sin descartar borradores de
conversación ni IDs pendientes. iOS cancela lecturas anteriores de detalles de grupo, invalida instantáneas secundarias
de uso compartido y actualiza listas/invitaciones; los detalles de grupo revalidan al
reabrirse. Siguen vigentes las cachés acotadas, expulsión y reinicio por cambio de cuenta
existentes. No se guarda ninguna preferencia de modelo en almacenamiento de disco del cliente sin proteger.

Pasaron comprobaciones de tipos API/web, comprobación Swift completa del simulador iOS con los ajustes
de actores/macros del proyecto, los 28 scripts de migración sobre un esquema vacío en memoria,
compilación EXPLAIN de las tres nuevas sentencias SQL de cuenta/modelo, sintaxis del script
de aprovisionamiento y comprobaciones de diff. El seguimiento de consentimiento también pasó comprobación de tipos de la API
y compilación EXPLAIN de las cuatro sentencias SQL de memoria de personalidad. Esto no prueba comportamiento en ejecución. Tras una publicación autorizada, verifica que el registro devuelva 403 para clientes antiguos,
que siga funcionando el inicio de sesión existente, que las preferencias persistan entre dispositivos/cuentas y que una
persona no pueda cambiar otra cuenta. Comprueba ambos IDs de modelo en logs del gateway con
mensajes ficticios, turnos con herramientas, programaciones, respuestas grupales de bots y extracción;
confirma costos de tokens/lecturas de caché y ausencia de payloads de prompts/respuestas. Comprueba falta
de consentimiento compartido y pertenencia revocada, Estándar para MCP, cambios con trabajos en cola/en curso,
reapertura/estados sin conexión/vacíos, preservación de envíos pendientes y cambio de cuenta.
Durante esta implementación no se realizó inferencia ni verificación en dispositivo.


Las conversaciones aisladas por MCP también fuerzan Estándar para extracción local humana/de personalidad,
incluido mantenimiento de contactos iniciado por el trabajo de otra cuenta. Su memoria local
sigue disponible solo en el chat privado/grupo de origen y nunca se convierte en entrada compartida
para Contributor. Consulta [memoria local](memory.md#conversation-local-memory-with-mcp).

## Diseño de Cuenta

Cuenta muestra **Modelo de chat** como una fila con la elección actual (Estándar o
Contributor). Abre una hoja con ambas opciones y un resumen de una línea, el
interruptor de consentimiento Contributor al cambiar a Contributor y Guardar; la explicación completa de uso
de datos está detrás del botón de información de la hoja. Mismo comportamiento en iOS y web; consulta
[contactos](contacts.md#contact-details-layout) para el patrón compartido de ajustes.
