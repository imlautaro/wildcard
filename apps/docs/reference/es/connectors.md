# Conexiones MCP

Wildcard consume herramientas de servidores MCP remotos en chats privados iniciados
por personas y grupos autorizados explícitamente. Es una primera implementación,
no compatibilidad universal. Usa SDK TypeScript oficial MCP 1.32.2 en Worker, D1 y
Workflows existentes; no migra contactos a Agents SDK ni añade Durable Objects.

## Conectar y autorizar

En iOS/web abre **Cuenta → Conexiones**. Introduce nombre, endpoint público HTTPS
Streamable HTTP y autenticación (público, token Bearer u OAuth). Acepta aviso de
privacidad y conecta. Descubrir público/Bearer inicializa y lista herramientas,
no ejecuta ninguna. Todas empiezan desactivadas. Revisa descripción y esquema de
entrada y elige **Permitir sin volver a preguntar** para permiso continuo en ese
conector de cuenta. Aplica a cada contacto/grupo autorizado. Incluye escrituras
y envíos si implementados; las anotaciones MCP no prueban seguridad. Conecta solo
servidores confiables y herramientas comprendidas.

**Activar todas las herramientas** aprueba todo catálogo cargado con una confirmación,
incluidas ocultas por búsqueda. Muestra servidor/conteo y acceso continuo de
lectura/escritura/envío. Desactivado si vacío/todo activado o OAuth pendiente.
Solo permisos, no ejecución. Nuevas/cambiadas necesitan aprobación tras descubrir
/reauthorizar.

Ambos envían un `PATCH /me/mcp/:connectionID` con
`{ fingerprints: string[], allowed: true }`. La API exige conjunto completo exacto
de huellas actuales (1–256 SHA-256 únicos), propiedad y autorización OAuth y guarda
todo en actualización condicional. Catálogo obsoleto/mutación concurrente da 409
sin aprobar parcialmente; actualiza y revisa. PATCH individual sigue. Cuerpos de
gestión hasta 20,000 bytes para 256 huellas.

Después abre **Conexiones** del contacto y activa conector de cuenta. Hasta cuatro
asignados, sin repetir login/copiar credencial. Accede a herramientas activadas de
esa cuenta. El contacto privado de otro participante no lista/usa el tuyo. Configurar
cuenta solo no aísla ni concede a contactos. Eliminar contacto conserva conectores;
desconectar uno revoca asignaciones privadas/grupo y borra credenciales cifradas.

En **Detalles del grupo → Conexiones**, propietario del bot que lo añadió concede
explícitamente sus asignados a ese bot en ese grupo. Confirma que todo humano puede
pedir lecturas, cambios o envíos y respuestas pueden exponer datos a todos, incluidos
futuros. Propietarios de grupo no conceden conectores ajenos. Ni migración ni asignar
privado habilita grupo. El acceso privado se requiere siempre; revocarlo quita
permisos de grupo asociados. Quitar bot/miembro/desconectar bloquea futuras llamadas.
Las admitidas pueden finalizar. Mensajes/recibos previos permanecen.

Solo mensaje humano directo del grupo inicia ejecución externa. No continuaciones
bot, delegación privado→grupo, programaciones ni revisiones. El bot usa cuenta del
propietario aunque lo pida otro miembro. Se vuelven a comprobar pertenencia,
propiedad/autor de incorporación de bot, asignación privada, permiso grupal,
generación y esquema intacto antes de ejecutar. Otro mensaje humano bloquea nuevas
admisiones del disparador viejo. Los dueños de grupo deben conceder solo lo que
pretendan compartir con humanos actuales/futuros.

Actualizar conexiones recarga configuración guardada sin contactar servidor.
Actualizar herramientas descubre otra vez. Solo conserva autorización si nombre,
descripción completa, esquemas entrada/salida y anotaciones coinciden con huella.
Cambiar exige aprobar; ejecutar redescubre y rechaza incluso antes de refrescar
manualmente. Desactivar/desconectar bloquea futuras admisiones, no ya admitidas.
Desconectar borra token cifrado/configuración; reconecta para sustituir. Revocar
en proveedor también impide futuro acceso.

## Biblioteca de conectores

**Cuenta → Conexiones → Explorar biblioteca de conectores** lista servidores
oficiales por categoría, logo, descripción de una línea, búsqueda y **Conectado**
si ya usa URL. Elegir abre formulario rellenado; endpoint y modo bloqueados,
nombre editable; no cambia consentimiento, login OAuth ni aprobaciones.
**Añadir servidor personalizado** conserva formulario manual. Un preset no concede
y API no lo confía: recibe URL como cualquier servidor.

Catálogo en `apps/api/src/mcp/presets.ts`, servido como `presets` en `GET /me/mcp`
con URLs normalizadas como guardadas (por ejemplo `/` final), mediante instantánea
de sesión de ambos. APIs antiguas sin `presets` dan biblioteca vacía. Presets
`ownClient` (Gmail, Google Calendar, Google Drive) rellenan issuer/scopes y abren
avanzado para Client ID/secreto; **Configurar OAuth** los restaura por URL. GitHub
usa PAT Bearer de permisos finos porque OAuth no registra automáticamente clientes;
el token es obligatorio antes de **Conectar**. `note` de cada preset explica.

Logos de colección Iconify `logos` (`@iconify-json/logos` 1.2.16 fijado en apps/web).
Web empaqueta exactamente mapa `apps/web/app/utils/connectorLogos.ts` en cliente
(`nuxt.config.ts`, sin API Iconify). iOS usa imagesets vectoriales en
`apps/ios/Wildcard/Assets.xcassets/ConnectorLogos/`, generados del mismo mapa con
`node scripts/export-connector-logos.mjs`. Ambos sobre blanco fijo para legibilidad
oscura; sin logo usa enlace. Para añadir: `presets.ts`, nombre `logos:` verificado
en `node_modules/@iconify-json/logos/icons.json` al mapa, exportar y publicar ambos.
Marcas sin logo utilizable se excluyeron.

Criterios probados en Mac de desarrollo el 2026-10-30 con mismo descubrimiento SDK
que `prepareConfig`: Streamable HTTP; endpoint admitido por `endpoint()` sin redirigir;
OAuth RFC 9728 con recurso que coincide, issuer igual, S256 y Client ID Metadata
Documents o Dynamic Client Registration. Públicos Cloudflare Docs, Microsoft Learn,
AWS Knowledge, Hugging Face, Exa y Google listaron herramientas con esquemas aptos.
Sin verificar: catálogos OAuth (requieren sesión), aceptación real DCR de redirect
Wildcard, 20 segundos/DNS desde Workers y GitHub Bearer. Excluidos entonces:
Atlassian/Pipedrive sin metadatos; Asana, HubSpot, Box, Slack, PagerDuty, Dovetail
requieren registrado; Mercado Libre/HeyGen redirigen; Calendly, Zoom, Trello,
Microsoft sin endpoint en URL probada; Firecrawl patrón ilimitado `(…)+`;
Webflow, Wix, Mixpanel, Sanity solo logos anchos ilegibles en fila. Los proveedores
cambian sin aviso; es punto de partida curado, no aval ni garantía.

## Privacidad y comportamiento del modelo

Conceder al contacto marca permanentemente aislada su conversación privada,
incluido historial. Respuestas usan `muse-spark-1.3` Estándar pese a Contributor
de instalación. Resultados y respuestas permanecen privados. Hechos humanos y
persona/preferencias del asistente se extraen con Estándar a memoria local.
Se excluyen de recuperación compartida, incluida vía creador-contacto de grupos.
Se conservan datos existentes, no eliminan. Marcador sobrevive desconectar para
no reintroducir histórico en memoria compartida/inferencia Contributor. Otros
participantes del agente no cambian.

No hay herramientas de publicación/delegación grupal ni crear/editar programaciones
en este privado aislado, para no exportar historial de conectores. Las existentes
se listan/cancelan y ejecutan instrucciones previas con Estándar sin MCP.
Restricciones intencionadas del primer release que deben explicarse antes de
conectar. Respuestas en vuelo impiden crear conexión. Sin garantía frente a copiar
manualmente a otra conversación.

Catálogos/resultados son evidencia no confiable. Backend filtra y comprueba;
modelo no habilita. No vuelve seguras herramientas arbitrarias: servidor confiable
y permiso continuo explícito son esenciales. Puede cambiar conducta sin esquema.
Solo bloques textuales y objeto JSON `structuredContent` (si cabe con texto en
24 KB sin desplazar texto que cabe) entran al modelo para diseñar
[miniapps](mini-apps.md) desde forma real. No recursos, binarios, enlaces embebidos,
sampling, elicitation, roots ni prompts. Lo pasado intencionadamente sale al servidor.

Con permiso grupal, `mcp_private_group` marca permanentemente todo el grupo.
Trabajos nuevos/HTTP usan Estándar aun revocado. Todo historial/memoria se excluye
de búsquedas entre grupos/privados y recuperación compartida humana/propia.
Estándar conserva hechos/persona en almacenes de grupo accesibles allí a sus
miembros/agentes, que aún leen historial. Aislamiento privado independiente.
Resultados privados de delegaciones no se convierten en memorias propias del
agente. Evita trasladar salida a otra audiencia. Trabajos Contributor en vuelo
no ganan MCP y conservan filtros de consentimiento.

## Ejecución, reintentos y límites

Bucles privados y de grupo humano autorizado exponen `list_mcp_tools` y
`call_mcp_tool` con hasta seis ejecuciones internas/externas. Privados con conector
(como todos directos) exponen `create_mini_app`/`list_mini_apps`. Respuestas no
programadas permiten tres rondas habilitadas (listar, inspeccionar, crear) y final;
programadas dos. Grupos hasta seis rondas de investigación en tres minutos de
admisión y decisión separada JSON estricto sin herramientas. `finish_group_research`
termina sin consumir ni publicar. Pasos modelo/herramienta tienen checkpoints
independientes y decisiones inválidas/truncadas una recuperación solo-final.
Nunca reejecuta para formato; al agotar debe revelar evidencia faltante. Consulta
[límites de grupos](groups.md#reply-rounds-and-exclusive-attention). Valida argumentos
contra JSON Schema aprobado. Reserva D1 antes de remoto. No reutiliza espacio de
turno para otra acción ni reenvía argumentos canónicos idénticos por herramienta/
conexión en ese turno. Recibos completos se reutilizan y registro sobrevive cambiar
intento. Grupo usa registro por respuesta vinculado a generación de permiso/OAuth;
rechaza espacios reutilizados/acciones inciertas al repetir. Revisiones sin externas,
no repiten efectos.

Detenerse tras reservar o timeout externo da desconocido y no se repite. Una reserva
incierta bloquea más remoto en el turno incluso con otros argumentos; error remoto
explícito también incierto conservadoramente. Sacrifica disponibilidad para no
duplicar escrituras, sin garantía exactamente una vez del proveedor. Otro turno
humano puede autorizar. Distintos argumentos pueden ser equivalentes semánticos;
registro no infiere proveedor. Comprueba servicio antes de repetir incierta.
También verifica permiso antes de reutilizar recibo.

Hasta dieciséis conectores/cuenta, cuatro/contacto, 256 herramientas/servidor,
ocho páginas, 16 KB/esquema, 1,000 nodos, profundidad 16, argumentos 16 KB, contexto
catálogo/resultado textual 24 KB, catálogo guardado 256 KB, transporte agregado
1 MiB/sesión y plazo 20 segundos incluidos DNS/inicializar/operar. Gestión
30/cuenta/minuto, además de presupuestos de chat/Workflow. Sin reintentos de
acciones ni reconexiones automáticas.

Esquemas usan @cfworker/json-schema (2020-12), intérprete sin eval/new Function.
Referencias locales raíz (`#/$defs/<name>`, `#/definitions/<name>`, de pydantic,
zod, Google) se expanden antes de validar; subesquema compartido y hermanos de
`$ref` combinan semántica 2020-12 (raíz `$ref` con `description` conserva tipo objeto).
Los límites 1,000/profundidad16 aplican al grafo expandido contando cada reutilización.
Referencias remotas, punteros anidados, ausentes/cíclicas, `$dynamicRef`/`$recursiveRef`,
patternProperties, dialectos no soportados y excesos se rechazan seguro. Patrones
anclados finitos hasta 256 caracteres solo si preflight limita ancho a 256 y
combinaciones alternativas a 64. Admite literales, clases, escapes simples, grupos/
alternativas, repeticiones exactas y `{m,n}` de caracteres individuales (n ≤ 256).
Cada variable multiplica presupuesto global de 1,024 opciones: `[A-Za-z0-9._:-]{1,128}`
y grupos IPv4 `\d{1,3}` pasan; solapados `a{0,64}a{0,64}` no. Abiertas (`+`, `*`,
`{m,}`), grupos cuantificados, lookarounds, retroreferencias y escapes de propiedades
Unicode se rechazan. Permite fecha/mes y UUID sin retroceso arbitrario. Visita
subesquemas reales: propiedades llamadas pattern o datos enum/const/$ref no se
confunden. Solo entrada condiciona catálogo: salida sigue en huella pero fuera
del subconjunto no rechaza; resultados estructurados siguen evidencia no confiable
acotada (sesiones de llamada nunca validaban porque no listan primero). Una entrada
incompatible impide reemplazo completo; `node scripts/checks/mcp-schema.cjs` cubre
offline. Errores precisos sin tokens ni cuerpos de excepciones. HTTPS con DNS público,
puerto normal, sin credenciales, consulta ni fragmento. Rechaza redirecciones y
peticiones fuera del endpoint. DoH Cloudflare comprueba direcciones públicas;
rechaza local/reservado/IP literal. No fija resolución: producción debe conservar
egress público sin bindings VPC/red privada. No expongas Wrangler local a no
confiables. Añadir salida privada exige proxy saliente que imponga límites antes
de habilitar URLs arbitrarias.

## Infraestructura y retención

Requiere Worker/D1/Better Auth y Meta Estándar existentes. Aplica
`0026_mcp_connections.sql`, luego `0027_mcp_oauth.sql` y posteriores, incluida
`0029_account_connectors.sql` para propiedad y permisos explícitos privado/grupo.
Sin recurso Cloudflare ni secreto nuevo. OAuth puede requerir proyecto del
proveedor, APIs, preview y cliente registrado. `MCP_WEB_ORIGIN` debe ser origen
web exacto; callback usa `BETTER_AUTH_URL` HTTPS público. Catálogo/aprobaciones en
`mcp_connector`; aislamiento persistente en `mcp_private_contact`. Tokens Bearer
AES-256-GCM con IVs aleatorios, clave HKDF de `BETTER_AUTH_SECRET` e identificadores
autenticados conexión/usuario/ámbito inmutable. Migración conserva antiguo ID de
contacto como ámbito opaco sin FK para mantener cifrado/flujos válidos tras borrado;
los nuevos usan aleatorio. Nunca devuelve tokens por API, URL, modelo ni logs.
Protege backups D1 y secreto separados. Rotarlo exige reconectar Bearer/OAuth salvo
migración explícita de recifrado; no lo rotes casualmente.

Argumentos/resultados textuales acotados en D1 privado `mcp_execution` y grupal
`mcp_group_execution`, con turno/respuesta para repetición duradera; pueden contener
datos externos sensibles. Desconectar no borra recibos ni mensajes. Eliminar
contacto/grupo/cuenta de origen elimina en cascada. Conectores sobreviven contacto,
no cuenta. ID conexión del registro sin FK intencionadamente para no borrar prevención
de duplicados al desconectar. Logs fijos, nunca excepciones remotas, tokens ni argumentos.

Instalación independiente usa `npm ci`, auth y D1 existentes. Sin IDs específicos
de cuenta MCP en código. Desarrollo solo endpoints sintéticos públicos, nunca
tokens de producción en código/fixtures. Producción/staging con D1, secretos auth
y tokens separados. Script automático migra antes de publicar commit/push.
Nunca deploy manual.

Revertir a código anterior es inseguro si hay datos privados: no comprende aislamiento.
Desactiva admisiones conservando Estándar, filtros y registro o corrige adelante.
No borres tablas/marcadores ni reviertas filtros. Fronteras de red y restricciones
forman parte del contrato de despliegue.

## Caché del cliente

Configuraciones nuevas hasta dieciséis. Migración conserva cuentas antiguas con
más para no perder permisos/credenciales; no añaden hasta bajar y snapshot completo
puede superar 4 MB. Revisa staging y elimina redundantes explícitamente; no es
seguro fusionar/borrar automáticamente.

Ambos conservan snapshot de cuenta solo sesión, incluido vacío, con hasta dieciséis
catálogos de 256 KB (~4 MB JSON antes de framework). Tokens Bearer/secreto OAuth
solo formulario y borrados al salir y después de autorizar. iOS
`ContactsStore.mcpSnapshots` / `NavigationSnapshotCache`; web `useMcpConnections`
por `account`. Listas de acceso iOS `mcpAccessSnapshots`, web `useMcpAccess`, hasta
ocho cada una. Privado hasta dieciséis nombres/IDs, grupo hasta 32 pares bot/
conector (ocho bots × cuatro), sin esquemas, tokens ni historial. Sin caché de
credenciales/catálogos en disco. Web sessionStorage solo retiene IDs de flujo/
contacto/conexión/usuario para ida/vuelta (`account` sustituye contacto en nuevos),
nunca código, verifier, token o secreto. Completar quita entrada y prueba de un uso
del historial. Reiniciar sesión/cuenta también quita pendientes.

Entradas cargadas aparecen inmediatamente y entrada/actualización revalida
metadatos guardados; iOS también al activar pantalla. Deduplica; mutación invalida
lecturas previas y carga autoridad. Cambios de cuenta invalidan accesos y revocar
contacto listas de grupo. Reentrar muestra caché mientras revalida. Aprobación
masiva usa misma mutación conservando contenido y recarga permisos una vez, sin
caché/reintento extra. Transitorios conservan; pérdida de acceso, cuenta, quitar
contacto o expulsión invalidan y tardíos no restauran. Caché nunca concede backend.
Descubrimiento sigue nextCursor opaco hasta ocho páginas en mismo tiempo/bytes,
rechaza cursores repetidos/grandes, nombres duplicados e incompletos. Solo guarda
snapshot validado completo; fallar conserva anterior/permisos. UI recibe completo,
no páginas de red. Ambos muestran cargadas/activas y filtran nombre/descripción
local con Buscar herramientas; estado transitorio sin solicitud ni permiso.
list_mcp_tools del modelo permite query/offset y nextOffset al llenar 24 KB para
alcanzar posteriores. No reintenta mutación al salir; refresca antes de repetir tras fallo.

Verifica vacío, parcialmente/todo activo, cancelar/confirmar con búsqueda, 256,
rechazo obsoleto, recuperación offline, reabrir/atrás, perder autorización y cuenta.
Conteos deben actualizar juntos sin ejecutar herramientas al conceder. UI/ejecución
masiva pendiente; lo estático no establece dispositivo.

## Compatibilidad y verificación pendiente

Implementados código de autorización OAuth con S256 PKCE, clientes registrados
públicos/confidenciales, descubrimiento issuer/scopes, Client ID Metadata Documents,
DCR si admitido y refresh tokens. No implicit, device-code, client-credentials,
endpoints con consultas, SSE antiguo solo, stdio, cabeceras personalizadas,
catálogos mayores ni resultados no textuales. Lo estático/presets no establece
interoperabilidad real concreta.

Pasaron tipos API/web y Swift completo simulador. Dieciséis SQL con EXPLAIN contra
esquema vacío completo, profundidad 100; compilación local, no migración D1 real.
Sin tests funcionales, builds, deploy, migración real, conexión externa, herramientas
ni inferencia pagada. Antes de release, servicios/datos sintéticos:

- Ambos: público/Bearer, vacío, revisión, aprobar/desactivar/detectar cambios,
  refrescar, desconectar, token inválido/errores.
- Transporte: inicializar, cabeceras de sesión, JSON/SSE sobre Streamable HTTP,
  redirigir, DNS privado, flujos grandes/lentos y cancelación.
- Autorización: dos usuarios/agente, miembro eliminado, cambios durante descubrir,
  revocar antes/durante llamada.
- Recuperación: escritura y fallo antes de persistir, Workflow concurrente,
  IDs/orden cambiados, argumentos iguales con claves reordenadas, desconocido y
  origen eliminado. Ninguna escritura duplicada.
- Privacidad: texto nunca a Contributor, memoria compartida/propia, recuperación
  creador-contacto de grupo, programaciones ni publicación privada a grupo, aun
  desconectado/cuenta cambiada. Datos antiguos siguen aislados al revertir.
- UI: navegación, vacíos/offline, mutaciones, respuestas antiguas tras refrescar/
  quitar, gestos, accesibilidad y navegación iOS física.

Referencias: [cliente SDK MCP](https://ts.sdk.modelcontextprotocol.io/client),
[MCP Cloudflare](https://developers.cloudflare.com/agents/model-context-protocol/).

## Configuración y ciclo OAuth

Elige **OAuth** y URL MCP. Descubre servidor desde RFC 9728 (incluida URL en
WWW-Authenticate), prioriza scopes del desafío, luego los del recurso, y elige
Client ID Metadata Documents o DCR anunciados. No pide todos de un servidor
general. Sin anuncio omite scope, aplicando valores/consentimiento del proveedor.
Con varios issuers elige primero determinísticamente; metadatos deben coincidir.
MCP configurado sigue frontera de confianza y debe elegirse con cuidado.

**Ajustes OAuth avanzados (opcionales)** contiene issuer/scopes y Client ID/secreto
estáticos. Vacíos para automático. Issuer obligatorio solo con prerregistrado o
sin anuncio. Nunca envía estáticos a issuer autoelegido. Sin clientes de documento
ni DCR da error específico de cliente manual. Google exige propio y presets abren
avanzado. Revisa issuer/scopes guardados antes de reautorizar. Configuración cifrada;
solo issuer/scopes públicos y estado se muestran. Reautorizar reutiliza guardado;
enviar formulario redescubre/reemplaza y borra aprobaciones. Rotar clave deja
desconectar/reconfigurar.

Instalación independiente: `BETTER_AUTH_URL` HTTPS y `MCP_WEB_ORIGIN` exacto
versionados por entorno. Registra:

```text
https://YOUR_API_HOST/api/v1/mcp/oauth/callback
```

UI muestra URI real API. Regístralo como redirect de **Aplicación web**: backend
es confidencial para ambos. No registres finalización web ni esquema nativo en
Google. Proyectos/clientes/secretos distintos staging/producción. Público/Bearer
funciona HTTP local; OAuth exige API HTTPS pública, cookies seguras válidas y
origen web HTTPS. No aprovisiona túnel/proyecto Google/app OAuth/conexión automáticamente.
Workers Builds aplica migraciones al hacer commit/push autorizado; sin deploy manual.

**Presets Google:** elige **Gmail**, **Google Calendar** o **Google Drive** en
[biblioteca](#connector-library) para endpoint oficial, issuer
`https://accounts.google.com` y scopes (`gmail.readonly gmail.compose`;
`calendar.calendarlist.readonly calendar.events`; `drive.readonly drive.file`).
Antes de 2026-10-30 Gmail rechazaba catálogo tras autorizar por `$ref` local;
la compatibilidad anterior lo admite. Proporciona Client ID Web y secreto propios;
no tiene DCR aquí. Son preview: cuenta Workspace y proyecto Cloud aprobados en
Google Workspace Developer Preview Program (solicitud revisada, no instantánea).
Sin ello autorizar/descubrir puede funcionar y todas las llamadas fallar por permiso,
y MCP API faltar en biblioteca. La nota lo explica. Activa Gmail API y Gmail MCP
API, configura consentimiento/audiencia/usuarios de prueba/scopes y marca cliente
**Use this client for an AI-powered agent**. Revisa requisitos actuales antes de
publicar, verificación de scopes restringidos y políticas. Puedes reducir scopes;
permiso de herramienta no concede scopes no autorizados. Menos herramientas tampoco
reduce concesión OAuth. Google incluye `access_type=offline` y `prompt=consent`
para refresh; otros issuers no. Consentimiento proveedor separado de herramientas.

`mcp_oauth` cifrada guarda metadatos fijados, cliente, access/refresh y caducidad;
`mcp_oauth_flow` guarda verifier PKCE cifrado, URL autorización y finalmente código
breve. State, ticket lanzamiento, secreto navegador y prueba final aleatorios
256 bits; búsquedas con hash. Flujo diez minutos vinculado a sesión exacta/conexión,
eliminado al completar/reemplazar o limpieza Cron acotada. Eliminar sesión elimina
flujos. Modelo nunca ve tokens, secretos, códigos ni verifiers.

Lanzamiento de navegador de un uso fija cookie host-only Secure/HttpOnly/SameSite=Lax
antes de redirigir. Callback exige cookie y state vigente, verifica parámetro
issuer si hay, consume vínculo atómicamente y devuelve prueba nueva de un uso.
No intercambia código ni instala tokens por sí solo. Finalizar exige misma sesión,
prueba, ID flujo, propiedad y generación actual. No vincula externo a otro usuario
ni termina en otra app/sesión. Denegación vuelve por mismo camino sin tokens.
Cookie incorrecta/ausente, estado inválido, repetición y caducidad deniegan seguro.

Callback HTTPS finaliza formulario del proveedor con HTTP 200 y página pequeña.
Nonce CSP nuevo solo permite script/estilos fijos; bloquea demás fuentes, formularios,
frames y base. Quita código/state de historial antes de reemplazar por destino
fijo app/web. Enlace escapado **Continuar a Wildcard** si falla automático, incluidas
restricciones iOS de gesto con esquema. Sin código, verifier ni tokens en página;
solo prueba breve actual. no-store/no-referrer y nosniff; no se cachea.

Esta frontera documental evita heredar `form-action` del proveedor al redirigir
HTTP a web/esquema. Centralita permite origen API registrado, no web separada ni
esquema nativo. API no debe dar 302 desde callback a ninguno. No debilites CSP ni
registres finalización web como callback proveedor. Cookies/state/issuer/prueba/
sesión/generación sin cambios.

En web navega a ruta fija de finalización con fragmento solo ID/prueba. Pestaña
inicial exige IDs sessionStorage y usuario coincidentes; elimina fragmento,
finaliza con proxy autenticado same-origin, descubre herramientas y vuelve a
Conexiones. Si descubrir falla, autorización puede seguir conectada y refrescar
herramientas después. Página completa evita bloqueo de popups.

En iOS ASWebAuthenticationSession abre API y recibe `wildcard://mcp/oauth-complete`.
Valida esquema, host, ruta/flujo exactos, rechaza cambio de cuenta/cancelación y
finaliza con bearer existente. Callback solo prueba, nunca código/token proveedor.
`Config/Info.plist` registra `wildcard`, no URI de proveedor. Perder estado/cambiar
dispositivo exige reiniciar. Cancelar no instala token y vence pendiente.
Reautorizar reemplaza generación pendiente.

Reautorizar borra intencionalmente aprobaciones/tokens locales antes de navegar.
Después refresca y aprueba cada una otra vez, también al cambiar cuenta externa.
OAuth/herramientas no anulan Estándar/aislamiento permanente. Registro guarda
generación OAuth: turno no reutiliza ni ejecuta más bajo otra. Admitidas pueden
terminar; proveedor no participa en transacciones D1. Son fronteras de admisión,
no garantías de cancelación.

Antes de usar token próximo a vencer, compare-and-set D1 obtiene concesión de
refresco por conexión. Solo poseedor guarda token rotado; concurrente recibe
reintentar después antes de externo. Refresco fallido/ambiguo o concesión obsoleta
requiere reautorizar, no repetir permiso posiblemente consumido. Sin refresh
funciona hasta caducar. 401 borra credencial coincidente sin repetir MCP;
respuesta vieja no borra token nuevo. 403 es fallo de permiso, no ampliar scopes.
Revocación proveedor se aplica al fallar; offline no se detecta sin contactar.

Desconectar borra configuración/tokens OAuth y flujos, no concesión completa en
proveedor ni historial/recibos. Revoca en ajustes de cuenta proveedor. Puede afectar
otras conexiones; no se solicita silenciosamente. Cambiar `BETTER_AUTH_SECRET`,
host callback, origen web o esquema exige actualizar registro/configuración y
reiniciar flujos. No reviertas a código sin generaciones ni aislamiento.

## Transporte OAuth y límites de verificación

Descubrimiento sin credenciales. URL de metadatos WWW-Authenticate puede estar
en otro HTTPS público según RFC 9728, pero recurso declarado debe coincidir origen
MCP y ruta compatible antes de confiar issuer. Sobrescritura debe coincidir lista
anunciada; antiguos sin metadatos admiten issuer explícito. Descubre solo well-known
SDK del issuer y coincide metadato. Intercambio/refresco solo envían secretos a
endpoint token exacto fijado; registro solo al fijado. Todo HTTPS/DNS público,
sin redirecciones, 64 KB y diez segundos con DNS, nunca bearer Wildcard. MCP manda
access solo a configurado. Siguen advertencias egress/rebinding: URLs arbitrarias
nunca deben ganar bindings privados.

URLs de autorización/callback/prueba son sensibles transitorias, nunca logs de
app. Infra/proxy deben evitar consultas completas en rutas OAuth; callback estándar
usa consulta aunque tokens nunca URLs. Respuestas públicas no-store/no-referrer,
CSP restrictiva y anti-frame. Lanzamiento/callback 60/IP/minuto; gestión 30/cuenta/minuto.

Validación actual: tipos API/web/Swift, sintaxis Info.plist, 38 SQL EXPLAIN con
migraciones hasta 0027 y profundidad 100. No funcional OAuth. Sin tests/builds,
flujo navegador/dispositivo, registro real, Google conectado, inferencia pagada,
migración real ni deploy. Antes de release verifica proveedor sintético: PKCE,
DCR, estático confidencial, metadatos ausentes/issuer incorrecto, DNS privado/
redirigir, cookie mala, state/prueba caducados/repetidos, sesión incorrecta, cuenta,
denegación, cancelar, cifrado, carreras de concesión, rotación/fallo, desconectar
y callback obsoleto. Luego Gmail de prueba consentido en ambos, scopes restringidos,
refresh offline, catálogo/permisos. Demos ficticias.

Fuentes: [Gmail MCP](https://developers.google.com/workspace/gmail/api/guides/configure-mcp-server),
[autenticación Apple](https://developer.apple.com/documentation/authenticationservices/authenticating-a-user-through-a-web-service)
y declaraciones/implementación `client/auth` del SDK fijado.

API y web configuran `observability.redact_query_string = true` (esquema Wrangler
fijado), conservando logs/trazas sin consultas en URLs capturadas. Verifícalo en
release automático y aplica equivalente a proxies/exportaciones.

## Configuración automática y Centralita

`/api/v1/mcp/oauth/client-metadata` público identifica con esa URL HTTPS exacta como
client_id y solo callback configurado. Sin usuario/sesión/credenciales. Solo si
servidor anuncia `client_id_metadata_document_supported`; si no usa registro
anunciado. Estático avanzado tiene prioridad. Proveedor obtiene JSON sin sesión.
Reutiliza Worker/config sin secreto/binding/migración/esquema nuevo.

El 27 de octubre de 2026 inspección sin credenciales del endpoint dado
`https://centralita-api.imlautaro.workers.dev/mcp` devolvió 401 con metadatos y
`centralita:read centralita:write`. Declara recurso exacto, issuer mismo origen,
`/oauth/register`, S256 y clientes públicos (`none`), suficiente para automático
sin pedir issuer/scopes/ID. Solo público inspeccionado: sin registrar cliente,
conectar cuenta ni datos Centralita. Flujo completo/herramientas sin verificar.

Pasaron API/web, Swift completo simulador, diff y comprobación SQL de 38. Sin
builds/tests/deploy. Verifica CIMD/DCR completo, precedencia scopes, metadatos
incorrectos/ausentes, avanzados, error manual, reautorizar/cancelar y retornos de
ambos antes de afirmar interoperabilidad real.

Protocolo: [descubrimiento, scopes y registro MCP](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization).

## Resolver problemas de conexión

Ambos muestran errores API con referencia aleatoria. Distinguen probe endpoint,
metadatos recurso/autorización, registro, solicitud de autorización, configuración,
flujo e intercambio. Fallo del resolver distinto de host no público. Nunca omiten
seguridad DNS ni amplían permisos. Error UI transitorio fuera de snapshots.

Busca `mcp_connection_failure` y referencia en Workers Logs. Solo etapa fija,
código permitido, referencia y DNS acotado (resolver, familia, motivo fijo y HTTP
opcional); nunca excepción remota, URLs, IDs cuenta/contacto, códigos, pruebas,
credenciales ni cuerpos. Redacción de consulta debe seguir. Un fallo de red no
implica ajustes manuales; avanzado solo si proveedor requiere.

API habilita `global_fetch_strictly_public`, necesario para otro Worker misma
zona, incluida Centralita. Sin él Cloudflare puede rechazar antes del handler.
Conserva egress público. Consulta [fetch entre Workers](https://developers.cloudflare.com/workers/runtime-apis/fetch/).
La investigación del 27 confirmó metadatos válidos y flag ausente, no capturó
excepción oculta ni OAuth completo. Valida tras publicación antes de dar por
resuelto. No se registró cliente ni accedió cuenta externa.

### Seguridad DNS y compatibilidad de ejecución

Workers rechaza `redirect: 'error'` al construir antes de red. MCP usa
`redirect: 'manual'` y rechaza todo 3xx antes del SDK, incluso mismo origen.
DNS también manual y rechaza HTTP no exitoso. Cubre probe, descubrir, registrar,
intercambiar/refrescar y MCP; nunca reenvía credenciales a destino redirigido.

Reintento de producción del 27 falló en ambos resolvers antes de I/O por ese
modo. Se quitó alternativa Google temporal al identificar defecto; sin dependencia
Google DNS. El flag de ruta pública sigue como requisito separado.

Consulta A/AAAA simultáneos al HTTPS fijo Cloudflare dentro de diez segundos
OAuth/veinte MCP. Cada respuesta hasta 16 KB debe identificar pregunta/tipo.
IPs literales se validan antes de clasificar. Ambas familias terminan bien; una
ausente vale si otra pública. Ambas se resuelven para no ocultar respuesta privada
por fallo de otra. NXDOMAIN, conjunto vacío completo, IP inválida/privada,
malformado/truncado y fallo resolver/transporte bloquean. Sin alternativa ni apertura ante fallo.

Cloudflare recibe solo hostname/tipo públicos, sin ruta MCP, usuarios, credenciales,
códigos ni tokens. Diagnósticos fijos resolver/familia/motivo y HTTP opcional.
Por solicitud sin caché en API/clientes; permisos/snapshots nunca evitan chequeo.
Sin cuenta/binding/secreto/migración. Mantén DoH accesible y
`global_fetch_strictly_public` activo.

Referencias: [DNS JSON Cloudflare](https://developers.cloudflare.com/1.1.1.1/encryption/dns-over-https/make-api-requests/dns-json/)
y [redirect-mode Workers](https://github.com/cloudflare/workerd/blob/main/src/workerd/api/http.c%2B%2B).

## Sobrescritura de modelo de cuenta

Cuenta elige Estándar/Contributor para ordinarios. Privados/grupos aislados MCP
fuerzan Estándar y memoria local sin exportar pese a preferencia. Consulta
[modelos](model-settings.md); cambiar no concede MCP.

## Migración de conectores de cuenta y verificación

0029 copia cada conexión con mismo ID, cifrado, catálogo, aprobaciones y modo a
cuenta, concediendo solo contacto original. No fusiona nombres/endpoints, crea
permisos grupales ni llama proveedor. Conserva OAuth, tokens, generaciones,
bloqueos y flujos al reenlazar FKs. IDs web antiguos solo compatibles de retorno;
finalizar usa endpoint de cuenta autenticada y vuelve a Cuenta. Nativos viejos
requieren actualizar: endpoints de contacto gestionan permisos, no OAuth/esquemas.
Coordina API/web/iOS; migrar antes de publicar puede dejar endpoints viejos
brevemente indisponibles. No revertir tablas a 0028: arreglo adelante con aislamiento/
permisos/registros o backup autorizado con código coincidente en recuperación
coordinada. No publiques filtros antiguos.

Tipos estáticos y SQL solo validan. Verifica migración con backups protegidos de
staging, incluido OAuth/refresh activo y cifrado; sin migración producción ni
acción real en este cambio. Pendiente: configurar una vez/asignar dos, compartir
grupo, petición de otro, rechazar permisos no propietarios y disparadores bot,
revocar contacto/grupo/herramienta/OAuth durante llamada, repetir inciertas,
cuenta offline, borrar contactos conservando conectores y Estándar/aislamiento
tras revocar. Usa herramientas/datos ficticios.

## Retención de memoria local

MCP aísla dónde recordar, no desactiva memoria. Hechos privados siguen perfil;
preferencias locales bot y hechos humanos de grupo usan almacenes `0030`.
Desconectar/revocar conserva marcador, Estándar, memoria/historial sin exportar.
Confirmación en ambos explica frontera. Recuperar/extraer acotado y mejor esfuerzo;
resultados no se convierten automáticamente en hechos. Consulta
[memoria local](memory.md#conversation-local-memory-with-mcp).

Antes de release autorizado, verifica con ficticios recuerdo fuera de historial,
separación por clave igual entre grupos/otro privado, Estándar con Cuenta
Contributor, revocar, extracción aislada y quitar miembro/bot/origen. Pendiente;
regresión opcional de memoria no ejecutada.

## Recuperación tras trabajo MCP

Fallar respuesta final no prueba fallar acción. Recuperación grupal usa evidencia
autorizada con checkpoints sin herramientas de nuevo; privada carece explícitamente
de recibos del paso original y debe admitir incertidumbre. No evita revocación,
generaciones OAuth/permisos, reservas ni aislamiento. Nunca crea otra acción.
Modelo totalmente caído puede dejar error contextual con reintento manual.
Consulta [grupo](groups.md#failed-replies-and-response-recovery) y
[privado](chats.md#failed-replies-and-response-recovery).

## Lecturas de Updates

[Updates](updates.md#connectors-in-for-you) lee conectores propios para tarjetas
(como cambio de divisas o gasto mensual) sin turno. Usa cualquiera de cuenta,
solo herramientas aprobadas aquí clasificadas lectura (`readOnlyHint` sin
`destructiveHint` o verbo de lectura sin verbos de escritura), redescubre y valida
huella por llamada, nunca escribe. Procesa con Estándar pese a cuenta. Nuevos
descubrimientos guardan `readOnlyHint` como `readOnly`, sin conceder por sí solo.
`add_to_updates` no se ofrece en privados aislados.
