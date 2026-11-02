# Panel de superadministración

Los builds automáticos usan los [watch paths específicos por dependencia](infrastructure.md#build-watch-paths)
registrados en [workers-build-paths.json](workers-build-paths.json). Mantén la raíz
`/` e incluye la capa Nuxt compartida `packages/ui/*` junto con esta app y los
archivos raíz que intervienen en el build. Los builds de preview siguen desactivados.

`apps/admin` es una SPA Nuxt 4 para los operadores de Wildcard, servida por su propio
Worker, `wildcard-admin`, separada de la app web. Los superadministradores pueden:

- abrir o cerrar el registro de cuentas nuevas;
- listar y buscar todas las cuentas, con sus cantidades de contactos, agentes y
  grupos, fecha de incorporación y actividad más reciente aproximada;
- eliminar una cuenta y todos sus datos;
- activar o desactivar indicadores durante la ejecución, sin un release;
- ver las acciones administrativas recientes.

Su apariencia proviene de la capa del [sistema de diseño](design-system.md) en
`packages/ui`, compartida con la app web: tokens, Manrope, íconos Solar, onda al
pulsar y componentes `App*` (`AppTopBar`, `AppListGroup`, `AppSwitch`, `AppSheet`, …).
`apps/admin/app/assets/css/main.css` conserva solo la estructura administrativa,
la tabla de usuarios y las estadísticas del resumen. La navegación es una barra
lateral Material 3, que se convierte en una barra inferior por debajo de 720 px.
Las barras de página se alinean con la columna de contenido (`AppTopBar contained`),
y la eliminación de cuenta es un diálogo básico (`AppSheet` con ícono) que ignora
Escape, pulsaciones en el fondo y Cancelar mientras se ejecuta la eliminación.

## Modelo de acceso

- **Las mismas cuentas.** Los administradores inician sesión con su correo y
  contraseña habituales de Wildcard. El panel nunca ofrece registro.
- **Lista por ID de usuario.** El acceso se concede mediante la variable
  `SUPER_ADMIN_USER_IDS`, separada por comas, en `apps/api/wrangler.jsonc`. Se
  distribuye vacía, por lo que nadie tiene acceso hasta configurarla. Los correos
  no están verificados (consulta [autenticación](authentication.md)), por lo que
  nunca conceden acceso. Cambiar la lista requiere un commit revisado y un release
  de la API. Los IDs de usuario no son secretos.
- **Primer administrador.** Inicia sesión en el panel con la cuenta. El panel
  muestra «Not a super admin», el ID de esa cuenta y un botón para copiar. Agrega
  el ID a la variable, haz commit y push y espera el release automático de la API.
- **Entrypoint privado.** Las rutas administrativas se sirven mediante el entrypoint
  con nombre `AdminAPI` del Worker API (`src/admin/app.ts`). Solo un service binding
  que nombre ese entrypoint puede acceder; el origen público `wildcard-api` devuelve
  404 para `/api/v1/admin/*`. Cada solicitud administrativa sigue comprobando la
  sesión bearer y la lista de autorizados.
- **Proxy limitado.** El proxy del panel solo reenvía inicio de sesión, cierre de
  sesión y `/api/v1/admin/*`. Mantiene el token firmado en su propia cookie
  `__Host-wildcard_admin_session` (`HttpOnly`, `Secure`, `SameSite=Strict`) y rechaza
  cambios de estado entre sitios. Las páginas son `noindex`, no pueden incrustarse
  en marcos y cada respuesta usa `no-store`.
- **Los mismos límites.** El inicio de sesión comparte los límites por IP de la
  API, y la eliminación de cuentas se limita a 10 por minuto por administrador.

La cuenta de un superadministrador usa una sesión Wildcard normal: vence después
de siete días y se revoca al cerrar sesión. Los superadministradores no pueden
eliminarse desde el panel. Primero quita su ID de la lista de autorizados.

## API

Todos los endpoints requieren una sesión bearer de superadministración y solo son
accesibles mediante el binding `AdminAPI`.

| Método | Ruta | Comportamiento |
| --- | --- | --- |
| POST | `/api/v1/auth/sign-in/email`, `/api/v1/auth/sign-out` | Better Auth, mismos límites que la API pública |
| GET | `/api/v1/admin/session` | `{ user }`. 401 sin sesión; 403 `NOT_SUPER_ADMIN` con `userID` para cuentas fuera de la lista |
| GET | `/api/v1/admin/overview` | Totales (cuentas, nuevas en 7 días, contactos, grupos), estado del registro, últimos 20 eventos administrativos |
| GET | `/api/v1/admin/users?q=&before=` | 50 cuentas por página, más nuevas primero. `q` coincide con nombre o correo; `before` es el cursor `next` de la página anterior |
| DELETE | `/api/v1/admin/users/:id` | Cuerpo `{ "email": "<the account's email>" }`. 202 `{ deleted: true, cleanup: "pending" }`; eliminación D1 confirmada, limpieza externa en cola |
| GET | `/api/v1/admin/settings` | Cada ajuste declarado con su valor, valor predeterminado y último cambio |
| PUT | `/api/v1/admin/settings/:key` | Cuerpo `{ "value": true \| false }`. Guarda el valor y registra un evento |
| GET | `/api/v1/admin/lab/contacts` | Contactos propios del administrador solicitante `{ id, name, miniApps, labApps }` para el [laboratorio de miniapps](#mini-app-lab) |
| POST | `/api/v1/admin/lab/contacts/:id/mini-apps` | Cuerpo `{ apps: [{ title, spec }], replace?, timeZone? }`. Importa al chat propio del administrador; devuelve `{ results: [{ title, ok, id?, problems? }] }` |

Las filas de usuarios nunca incluyen hashes de contraseñas, tokens ni metadatos de
sesión. «Contacts» cuenta las conversaciones de la cuenta (filas `contact`). «Agents»
cuenta los contactos que creó (`contact_agent`), incluidos los compartidos. «Last seen»
es el `updated_at` de sesión más reciente. Las sesiones se actualizan como máximo
una vez al día, por lo que tiene una precisión aproximada de un día.

## Eliminación de una cuenta

El diálogo pide al operador volver a escribir el correo de la cuenta, y la API
lo comprueba de nuevo. Después, la API:

1. En un batch D1, registra un `admin_event` sin contenido y elimina la fila
   `user`. Las claves foráneas eliminan sesiones, credenciales, contactos, turnos y
   memorias privados, programaciones, tareas, documentos, miniapps, conectores,
   incorporación y membresías.
2. La migración 0069 registra los prefijos R2 `users/<id>/`, `contacts/<id>/` y
   `attachments/<id>/` de la cuenta, además de su Workflow de incorporación, en el
   outbox duradero `resource_cleanup` **dentro de esa transacción de eliminación**.
   Esto cubre checkpoints completados e incorporaciones sin contacto publicado.
   Los triggers existentes de contactos, grupos y turnos ponen en cola los prefijos
   de grupos propios, todos los intentos de chat y Workflows de iniciativa registrados,
   trabajos de generación y claves de multimedia generada.
3. Devuelve 202 `{ deleted: true, cleanup: "pending" }`. La cuenta desapareció y
   sus sesiones son inválidas. Una pasada de limpieza `waitUntil` y el Cron de cada
   minuto vacían el outbox con concurrencia acotada, espera incremental duradera y
   un barrido R2 final. Los fallos de servicios nunca descartan el plan de reintento.
   La aceptación no afirma un borrado externo inmediato; el panel indica que la
   limpieza está en cola y se reintenta.

La limpieza llama a Workflow **delete**, que detiene la ejecución y elimina los
checkpoints almacenados, en lugar de terminar solo las instancias activas. La
incorporación y la creación de contactos vuelven a comprobar su padre después del
despacho, incluidos resultados ambiguos de creación; si ganó la eliminación, se
pone otra vez en cola la instancia tardía. La generación de retratos comprueba antes
y después de cargar y pone de forma duradera en cola un objeto tardío. Los retratos
de generación no publicados también ponen en cola su prefijo previsto cuando se
elimina el trabajo.

**Efectos sobre otras personas.** Los grupos propios desaparecen para todos los
miembros. Los agentes creados por la cuenta desaparecen para todas las personas
con quienes se compartieron, incluidos sus chats privados. La migración 0069 elimina
mensajes que la persona escribió o solicitó en grupos de otros mientras su atribución
aún existe; ya no deja su texto, nombre o multimedia mediante `SET NULL`. Los mensajes
y grupos de otras personas permanecen. Se eliminan las listas compartidas que creó,
las tareas que creó, le asignaron o autorizó para investigación o monitoreo, y los
documentos que creó o editó por última vez; también se eliminan sus revisiones en
otros documentos. El diálogo de confirmación informa estos efectos. No pueden
retirarse las copias independientes ni el contenido que otra persona incorporó
posteriormente a su propio trabajo.

Los eventos de auditoría conservan solo IDs y cantidades, nunca el correo o nombre
del objetivo. Los registros de límites y uso pago sin contenido, los logs y backups
de plataforma y las acciones externas completadas mantienen su retención documentada;
consulta [ciclo de vida de chats](chat-lifecycle.md). Eliminar una cuenta nunca elimina
infraestructura Cloudflare compartida ni archivos de usuarios ajenos.

La migración 0069 vuelve a poner en cola prefijos de cuenta e instancias de incorporación
conocidos de eventos de auditoría `user.delete` anteriores cuya cuenta no existe.
No puede reconstruir atribución antigua ya borrada mediante `SET NULL`, IDs históricos
de Workflow no registrados ni prefijos de grupos previamente eliminados que nunca
se registraron de forma duradera.

### Corrección del proxy DELETE (30 de octubre de 2026)

Los logs de producción mostraron que `wildcard-admin` cancelaba la solicitud DELETE
porque nunca generaría una respuesta, sin una solicitud correspondiente a AdminAPI.
El adaptador Cloudflare de Nitro instalado solo almacena el cuerpo de POST/PUT/PATCH;
el lector de cuerpo sin procesar de H3 espera entonces en un flujo Node simulado
para DELETE con cuerpo. Ahora ambos proxies, administración y web, leen DELETE desde
`event.context.cloudflare.request` original, incluidas las solicitudes vacías. Los
otros métodos siguen usando el cuerpo almacenado por Nitro; el desarrollo local
conserva el lector Node real de H3. La confirmación por correo, las comprobaciones de
mismo origen y la lista permitida de service bindings siguen vigentes. Los errores
de lectura del cuerpo usan la respuesta de error JSON existente del proxy.

Los tipos de API/administración/web y la preparación SQL pueden validar contratos
estáticamente; no pueden demostrar una eliminación de extremo a extremo. Se agregaron
casos de regresión para admisión administrativa, confirmación, cascadas D1, fallos y
reintentos de R2/Workflow, incorporación y multimedia no publicadas, y creación de
generación concurrente con eliminación (incluidos reconocimientos perdidos). No se
ejecutaron para este cambio. No se reintentó la eliminación en producción ni se
eliminó ninguna cuenta durante el diagnóstico. Verifica con datos ficticios después
del release.

## Ajustes e indicadores de funciones durante la ejecución

Los ajustes viven en la tabla D1 `app_setting` (migración 0059). Cada clave se declara
en `apps/api/src/admin/settings.ts` con etiqueta, descripción y valor predeterminado;
una clave sin fila almacenada usa el predeterminado. Los valores son booleanos.
`readSetting` lee D1 en cada llamada, sin caché de isolate, por lo que un cambio se
aplica a la siguiente solicitud API sin un release.

| Clave | Predeterminado | Efecto |
| --- | --- | --- |
| `registration_enabled` | `true` | Al desactivarse, `POST /api/v1/auth/sign-up/email` devuelve 403 `REGISTRATION_CLOSED`, después de comprobar la admisión por IP. No afecta el inicio de sesión. iOS y web muestran «No se aceptan cuentas nuevas en este momento. Las cuentas existentes pueden seguir iniciando sesión». |
| `voice_messages_enabled` | `false` | Los contactos pueden responder con mensajes de voz de ElevenLabs y los detalles del contacto muestran Voz. Solo surte efecto si está configurada `ELEVENLABS_API_KEY`. Se entrega a clientes como `features.voiceMessages` en `GET /me`. Las personas siempre pueden enviar mensajes de voz. Consulta [mensajes de voz](voice.md). |
| `contributor_only` | `false` | Todas las cuentas se procesan con Muse Spark 1.3 Contributor, cualquiera sea su elección guardada. `user.chat_model` nunca se reescribe, por lo que la elección propia de cada cuenta vuelve a aplicarse al desactivar el indicador. `accountModel()` y las protecciones de consentimiento que comparaban `user.chat_model` en SQL (acceso a investigación, publicación de iniciativa, despacho de tareas) usan `effectiveModelSQL()`. Las respuestas de perfil informan `chatModel` como Contributor y `GET /me` envía `features.contributorOnly`; iOS y web muestran entonces la fila Modelo de chat como Contributor sin selector, y `PUT /api/v1/me/model` devuelve 409 `CONTRIBUTOR_ONLY`. Los Workflows ya iniciados conservan el modelo de sus checkpoints. Los chats y grupos aislados por MCP siguen usando Estándar y las comprobaciones de consentimiento Contributor siguen aplicándose (los envíos fallan entonces con una razón localizada, consulta [ajustes de modelo](model-settings.md#sharing-and-mcp)): el contenido o los grupos sin consentimiento Contributor se filtran o rechazan en lugar de enviarse con Estándar, salvo las respuestas a comentarios de Updates, que aún usan Estándar como respaldo para un contacto sin consentimiento (`home/comments.ts`). Pensado para pruebas y demos que reduzcan el costo de inferencia; anula las elecciones individuales de modelo, así que no lo actives para usuarios reales sin su consentimiento. Consulta [ajustes de modelo](model-settings.md). |

Para agregar un indicador, agrega una definición, léelo con `readSetting` donde
corresponda y documéntalo aquí. El panel lo enumera automáticamente. Un indicador
que cambie el comportamiento del cliente requiere una vía de entrega: `GET /me`
devuelve `features` (actualmente `voiceMessages` y `contributorOnly`), que ambos clientes
ya revalidan. `WEB_RESEARCH_ENABLED` y `SEMANTIC_MEMORY_ENABLED` siguen siendo variables
Wrangler que requieren un release.

## Caché del panel

`composables/useAdmin.ts` mantiene cachés en memoria pertenecientes a la sesión para
el resumen, los ajustes y la búsqueda actual de usuarios. Volver a una página muestra
los datos en caché de inmediato y los revalida en segundo plano. Un fallo transitorio
mantiene los datos en caché visibles; otros errores aparecen en un banner. Cada
caché tiene un contador de revisión que rechaza respuestas tardías después de una
solicitud más reciente, una mutación o un cierre de sesión. Eliminar una cuenta quita
su fila y actualiza el resumen. Guardar un ajuste reemplaza la lista con la respuesta
del servidor y actualiza el resumen. Cambiar la búsqueda descarta los resultados
anteriores. La lista de contactos del laboratorio usa la misma caché; una importación
la revalida junto con el resumen. El cierre de sesión y el vencimiento de sesión
borran todas las cachés. No se escribe nada en el almacenamiento del navegador.

## Laboratorio de miniapps

**Lab** (`/mini-apps`) importa un paquete de especificaciones de miniapps generadas
a uno de **tus propios** chats, para probarlas en un dispositivo desde Contacto →
Miniapps en lugar de pedírselas a un contacto individualmente. Existe para evaluar
y mejorar el generador de miniapps (`scripts/checks/mini-app-eval.mjs` escribe los paquetes).

- Solo se enumeran o escriben las filas `contact` propias del administrador solicitante;
  no hay forma de apuntar a otra cuenta.
- Cada app pasa por el mismo análisis y verificación sin conexión que `create_mini_app`
  (`prepareMiniApp`, en la zona horaria del navegador) y debe usar solo estado: se
  rechazan pasos `mcp` y acciones remotas, por lo que nada necesita revisión y las
  apps se habilitan al importar.
- El límite de 20 por chat sigue aplicándose y se vuelve a comprobar dentro de cada
  inserción. Usa dos contactos para conjuntos mayores. **Replace previous lab apps**
  elimina solo las apps `lab:%` de ese chat (con su estado guardado, por cascada) en
  el mismo batch.
- Las filas usan IDs `lab:<uuid>` y no tienen `turn_id`, por lo que ninguna burbuja
  muestra su tarjeta; aparecen en la lista de Miniapps (primero la primera entrada
  del paquete) y en Updates como cualquier app. Vaciar o eliminar el chat las elimina.
- Cada importación registra un evento administrativo `mini_app.lab_import` con cantidades.
  Límite: 10 importaciones por administrador por minuto, 1 MB por solicitud.
- Sin migración, binding ni secreto. Es una herramienta exclusiva de administración,
  por lo que iOS y la app web no cambian; muestran apps del laboratorio por las rutas
  existentes de miniapps.

## Desarrollo local

`wrangler dev` no puede servir un entrypoint con nombre por HTTP. Para usar el panel
localmente, agrega `ADMIN_LOCAL_ROUTES=true` al archivo ignorado `apps/api/.dev.vars`.
La app pública también monta entonces las rutas administrativas. Nunca lo configures
en `wrangler.jsonc`. Configura `SUPER_ADMIN_USER_IDS` también en `.dev.vars` para
las pruebas locales y luego:

```sh
npm run dev           # API on http://localhost:8787
npm run dev:admin     # panel on http://localhost:3001
npm run typecheck:admin
```

Los pasos de infraestructura, release y rollback están en
[infraestructura](infrastructure.md#admin-worker).

## Estado de verificación

La validación anterior del panel precede a la corrección del 30 de octubre descrita
arriba. Las comprobaciones estáticas actuales no demuestran la eliminación durante
la ejecución ni el borrado externo. Después del release automático, verifica con
una cuenta ficticia:

- una cuenta fuera de la lista ve su ID y recibe 403;
- `GET https://wildcard-api…/api/v1/admin/session` devuelve 404 en el origen público;
- cerrar el registro hace que registrarse devuelva 403 en iOS y web mientras iniciar
  sesión sigue funcionando;
- eliminar la cuenta ficticia elimina sus filas y objetos R2, y el evento aparece
  en Overview.
