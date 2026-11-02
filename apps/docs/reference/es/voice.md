# Mensajes de voz

Las personas envían grabaciones a contactos y grupos, como WhatsApp. Los contactos
responden con su voz sintetizada (ElevenLabs). Se transcriben después de enviar,
nunca antes, y la transcripción se oculta del chat: mantén pulsado y elige
**Ver transcripción**.

Sustituye el dictado anterior (grabar, transcribir, editar, enviar). Las rutas
`/transcriptions` quedan solo para clientes antiguos.

## Enviar un mensaje de voz

Con borrador vacío y sin adjunto, el compositor muestra micrófono.

- **Mantén para grabar.** Pulsar inicia grabación (la primera pulsación puede
  mostrar solo el permiso). Soltar detiene y envía inmediatamente.
- **Desliza a la izquierda para cancelar.** Arrastrar unos 100 puntos/píxeles
  descarta mientras mantienes. La barra dice «‹ Desliza para cancelar».
- **Desliza arriba para bloquear.** Arrastrar unos 80 puntos/píxeles continúa sin
  manos. La barra bloqueada muestra **Eliminar** y **Detener**, que detiene y envía.
- A los 60 segundos para y envía automáticamente. Menos de medio segundo se
  descarta con «Mantén para grabar, suelta para enviar». Un toque rápido que suelta
  antes de estar listo cancela el inicio pendiente y muestra lo mismo; ambos
  entran sincrónicamente al estado de espera del micrófono al pulsar, para que
  soltar siempre lo observe.
- Temporizador y punto rojo pulsante durante grabación. Salir del chat, segundo
  plano iOS u ocultar pestaña web descarta una grabación activa.

El clip se convierte a WAV PCM mono de 16 bits a 16 kHz (formato del dictado
anterior) y envía con UUID del mensaje. La burbuja saliente aparece inmediatamente
con reloj. Fallar conserva clip/UUID para **Reintentar**, como texto/adjuntos.

## Burbujas de voz

Muestran reproducir/pausar, progreso, tiempo transcurrido al reproducir (duración
si no), hora y recibos habituales salientes. Solo reproduce uno; iniciar otro pausa
el actual. Continúa al desplazar, navegar y escuchar en segundo plano. Consulta
[reproducción de fondo y oído](#background-playback-and-ear-routing) para límites.

Las voces entrantes de grupo muestran además avatar del remitente a la izquierda,
con misma ubicación y agrupación de filas que texto por cliente. El avatar interno
sigue a la derecha; al reproducir solo ese se sustituye por velocidad.

El avatar tiene micrófono flotante abajo a la izquierda. Este y el cursor de
progreso son grises antes de escuchar y del color de leído después:

- Salientes usan `voice.listenedAt`, fijado cuando un contacto empieza a transcribir.
  En grupos sigue significando el primer contacto que escuchó.
- Entrantes usan `voice.ownListenedAt` por persona autenticada, fijado solo al
  empezar reproducción real. Abrir, descargar para forma de onda, buscar posición
  y reproducción fallida no marcan escuchado. Pausar/repetir conserva estado;
  reproducir tu propio clip no reconoce para destinatarios.

Leer y escuchar son distintos. Las marcas de lectura conservan significado
privado/grupo. Al reproducir velocidad sustituye avatar y badge. La migración
[0066](infrastructure.md#voice-playback-receipts-migration-0066) persiste escucha
entrante entre sesiones/dispositivos; clips existentes empiezan no escuchados por
no haberse registrado antes. Otra persona en grupo nunca marca tu clip recibido.

Mantener pulsado añade **Ver transcripción** al menú de reacciones/respuesta.
Se abre hoja iOS o diálogo web:

- «Transcribiendo…» si `voice.transcript` es `null`;
- «No se detectó voz» si cadena vacía;
- texto en otro caso. Los del contacto siempre tienen transcripción: el texto hablado.

Las filas muestran micrófono y **Mensaje de voz (0:05)** con duración real para
entrantes, salientes y pendientes; grupo conserva prefijo de remitente. El micrófono
usa mismo estado de escucha. Actividad tiene prioridad. Notificaciones/citas
mantienen **Mensaje de voz** sin transcripción.

## Cuándo responden con voz

Solo si se cumplen **todas**:

1. Flag superadmin `voice_messages_enabled` activo ([admin](admin.md)).
2. `ELEVENLABS_API_KEY` configurado en Worker API.
3. Participante activó **Mensajes de voz** para contacto en privado o creador en grupo.
4. Adecuado para hablar: 60–600 caracteres Unicode, sin código, enlaces, listas,
   tablas ni encabezados.
5. Único de voz en esa respuesta. En varias burbujas solo el primer apto se habla;
   muy cortos («¡ok!») y largos siguen texto.
6. Sin imagen generada.

El modelo sabe si está activo (`voiceInstruction` en `apps/api/src/voice/catalog.ts`):
con permiso sabe que se habla lo apto y redacta pedidos de voz en prosa de esa
longitud; sin permiso indica activarlo en detalles. Sin esto negaban enviar audio
en un mensaje que después se hablaba.

Umbrales en `apps/api/src/voice/speech.ts` (`voiceSuitable`). Fallar síntesis nunca
falla respuesta: publica texto.

Usa `POST https://api.elevenlabs.io/v1/text-to-speech/:voiceID`, modelo `eleven_v4`
y salida `mp3_44100_128`, según [inicio Text to Speech](https://elevenlabs.io/docs/eleven-api/quickstart).
Ambos reciben mismo audio del servidor. El cambio solo afecta síntesis nuevas;
no regenera guardadas ni muestras. La duración se deriva del bitrate constante
128 kbps. Síntesis v4 real, acceso, compatibilidad y calidad de escucha no verificados
para este cambio. Los fallos conservan alternativa textual.

## Entrega informal y acento de voz (0061)

Respuestas nuevas usan `voice_settings: { stability: 0.4, similarity_boost: 0.75 }`
con Eleven v4. El prompt favorece expresión espontánea, cláusulas cortas variadas
y tono contextual, manteniendo personalidad sin jerga, muletillas, risas ni
acotaciones forzadas. Sin inferencia extra de reescritura. Servidor antepone
`[casual, conversational delivery]` y acento elegido solo para entrega. Elimina
corchetes del mensaje al sintetizar para impedir etiquetas adicionales. Nunca
entran al texto guardado, transcripción, vista previa, notificaciones ni memoria.

**Acento de voz** opcional del agente compartido (`contact_agent.speech_accent`),
independiente de nacionalidad, identidad y lengua/país del oyente. El creador elige
en hoja **Voz** de detalles iOS/web **Acento predeterminado** (sin preferencia) o
preset de `shared/voice.ts`, incluido **Argentino**. Otros lo ven sin editar.
Aplica a nuevas respuestas privadas/grupo para todos. También guía expresión
regional natural en texto aunque voz apagada; argentino usa voseo sin jerga forzada,
cambiar idioma pedido ni inventar nacionalidad. Consulta
[estilo](conversation-style.md).

Los contactos nuevos generados individualmente y del círculo inicial inicializan
según país de generación si coincide preset; otros países usan predeterminado.
No rellena existentes. Sin sobrescritura, los generados usan idioma/país conservados
para regionalismo, incluido plan del círculo original; manuales sin región inferida.
Predeterminado quita sobrescritura hablada, no alternativa regional de generación.
No infiere por nombre, zona ni país de participante nuevo. Regenerar personalidad
conserva preferencia. Cambiar acento conserva voz ID, sin seleccionar, clonar,
remezclar ni crear voz. Sin permisos ni recursos nuevos.

Las etiquetas son experimentales, no acento garantizado ni parámetro `nationality`.
Dependen de voz, idioma y frase. Referencias:
[prompting v4](https://elevenlabs.io/docs/overview/capabilities/text-to-speech/best-practices#prompting-eleven-v4)
y [ajustes v4](https://github.com/elevenlabs/skills/blob/main/text-to-speech/references/voice-settings.md).
Escucha mensajes reales: muestras de catálogo pregrabadas no demuestran ajustes.
Mensajes existentes e identidades inmutables de caché no cambian. Fallar publica
texto, sin modelo alternativo ni intento extra.

Pendiente: aceptación v4 real de entrega/acento combinados, naturalidad/fidelidad
por voz, contenido serio/neutro/emocional, voseo/otros idiomas y controles creador/
miembro en dispositivos. Sin muestras pagadas para este cambio.

## Voces de contactos

Cada contacto tiene voz (`contact_agent.voice_id`) como identidad compartida:
todos oyen la misma y solo creador cambia.

- **Generados con IA** coinciden género/edad: `young` menores de 35,
  `middle_aged` 35–59, `old` desde 60. Determinista por contacto entre coincidencias,
  alternativa al grupo más cercano (mayores → mediana, jóvenes → mediana), luego
  solo género y luego cualquiera. Prefiere descripciones conversacionales,
  informales o relajadas si existen. Conserva voces guardadas. Grupos de edad
  disponibles dependen del catálogo combinado predeterminado/guardado.
- **Otros** (manuales/onboarding) obtienen al necesitar por primera vez, con
  género/edad de generación si hay y si no cualquiera.
- **Detalles**, con flag activo: interruptor **Mensajes de voz** propio de cada
  participante; activo por defecto para conversación del creador con generado IA,
  apagado en otros y quien se une. Fila **Voz** resume acento/voz («Acento
  predeterminado · Voz automática» si no hay). Abre selector de acento y, para
  creador, lista buscable con muestras. Participantes compartidos ven ambos de
  solo lectura. Explicaciones tras info.

Catálogo combina predeterminadas y colección guardada de la instalación con
`GET https://api.elevenlabs.io/v2/voices`, `voice_type=default` y `voice_type=saved`,
conservando `gender`, `age`, `accent`, `description`. Ambas paginan por `has_more` /
`next_page_token`, 100 por página. Deduplica ID (predeterminada gana) y ordena nombre.
20 segundos compartidos y 100 páginas por consulta limitan carga; páginas malformadas
/fallidas rechazan refresco, no guardan catálogo parcial. Colección guardada vacía
es válida. Memoria de isolate una hora, nunca disco. Seleccionadas se conservan;
asignaciones nuevas usan combinado. Mismas rutas y selector iOS/web.

Añade voces de marketplace a My Voices/colección de la cuenta/workspace cuyo
`ELEVENLABS_API_KEY` usa instalación. Estarán para todos los usuarios autorizados,
no solo operador. Voice Library API exige plan de pago apto; guardar no garantiza
síntesis ni compatibilidad. Consulta [API voces](https://elevenlabs.io/docs/api-reference/voices/search)
y [Voice Library](https://elevenlabs.io/docs/eleven-creative/voices/voice-library).
Tras cambiar colección deja vencer caché servidor y recarga cliente (actualización
explícita iOS, nueva sesión web); si no podría conservar anterior. Carga real,
paginación, muestras y selección de ambos sin verificar.

## API

Sesión bearer; `no-store` salvo indicación.

| Método | Ruta | Comportamiento |
| --- | --- | --- |
| GET | `/api/v1/me` | `features: { voiceMessages: boolean }` junto a `user` (flag **y** clave) |
| GET | `/api/v1/voices` | `{ voices: [{ id, name, gender, age, accent, description }] }`; 503 no disponible |
| GET | `/api/v1/voices/:voiceID/preview` | Muestra `audio/mpeg` proxy ElevenLabs; 404 desconocida |
| PUT | `/api/v1/contacts/:id/speech-accent` | `{ "speechAccent": "AR" }` o null; solo creador, compartido; `{ contact }` |
| PUT | `/api/v1/contacts/:id/voice` | `{ "voiceID": "<catalog id>" }`, creador (403 otros); `{ contact }` |
| PUT | `/api/v1/contacts/:id/voice-messages` | `{ "enabled": true }`, permiso de este participante; `{ contact }` |
| POST | `/api/v1/contacts/:id/chat/turns` | `{ id, text: "", voice: { data: "<base64 WAV>" } }` envía voz |
| GET | `/api/v1/contacts/:id/chat/turns/:turnID/attachment` | Audio humano `audio/wav`; `?side=assistant&part=<index>` para contacto `audio/mpeg` |
| POST | `/api/v1/groups/:id/messages` | `{ id, text: "", voice: { data: "<base64 WAV>" } }` |
| GET | `/api/v1/groups/:id/messages/:messageID/attachment` | Audio de mensaje de grupo |

Contactos añaden `voiceID` (cadena/null), `voiceName` (cadena/null) y
`voiceMessagesEnabled` (0/1 como `initiativeEnabled`).

`voice` opcional excluye `attachment`; `text` debe estar vacío. WAV PCM16 mono
16 kHz de 0.25–60 segundos (máximo 2 MiB). Mismo UUID/audio devuelve existente;
otro audio 409; inválido 400.

Objeto `voice` anulable en mensajes:

```json
{ "durationMs": 4200, "listenedAt": 1767000000000, "transcript": "See you at eight." }
```

- Privado: `turn.voice` de persona. `userText` es `""` y `attachment` es `null`.
- Contacto: `assistantMessages[i].voice`; `text` hablado y `attachment` `null`.
  `listenedAt` siempre `null`.
- Grupo: `message.voice` para ambos. Humano `text: ""`; contacto conserva voz en `text`.

`listenedAt` es `null` hasta que escucha un contacto; `transcript` `null` hasta
terminar y `""` sin habla. Un privado cuya transcripción falla termina `failed`
con `errorCode: "VOICE_TRANSCRIPTION_FAILED"` y admite ruta de reintento existente.

## Procesamiento

**Privados.** Workflow marca leído, espera un instante, fija `listened_at`
(micrófono azul), transcribe WAV con Muse Voice Transcribe y guarda como `user_text`
para memoria, búsqueda e historial. Luego «escucha» durante duración (hasta
60 segundos) antes de escribir. Modelo recibe transcripción marcada voz. Nunca
se agrupan con textos adyacentes.

**Grupos.** Se indica que texto de `voiceMessage` (también citas) es transcripción,
para responder en vez de negar poder escuchar; enviar audio es ajuste separado
(2026-10-30). Se transcribe una vez por el primer trabajo de respuesta tras paso
de lectura de ronda. El turno incompleto más antiguo posee transcripción; otro
preparador espera texto guardado o que termine predecesor para reutilizarlo.
Sin contactos nunca transcribe y muestra «Transcribiendo…» indefinidamente.
Respuestas de contacto usan mismas reglas y permiso de creador; solo respuestas
de un mensaje pueden hablarse.

## Almacenamiento, privacidad y coste

Audio en R2 privado existente, prefijos de adjuntos (`attachments/…`,
`group-attachments/…`), registrado en `chat_attachment_object` para borrar con
contacto/grupo/cuenta y Cron huérfanos. Sin claves en historial; mismos permisos
de descarga que adjuntos.

Audio humano va a Meta para transcribir. Texto elegido para voz va a ElevenLabs;
flag y permiso por contacto controlan. Políticas de retención/entrenamiento del
proveedor fuera de implementación. Cada voz es solicitud pagada ElevenLabs;
cada transcripción, solicitud Meta.

## Caché del cliente

Metadatos en almacenes de conversación de sesión existentes. Bytes:

- **iOS:** disco protegido, misma política de imágenes (protección completa,
  64 MiB por cuenta, siete días inactivos), clave cuenta/conversación/mensaje/lado/
  parte. Cambiar cuenta/salir limpia.
- **Web:** memoria, 32 MiB/sesión, expulsión menos usado recientemente; salir/
  cambiar cuenta descarta.

Descargas deduplicadas por clave; fallo muestra reintentar en burbuja. Clips
salientes aceptados alimentan caché.

## Configuración

`ELEVENLABS_API_KEY` es secreto **opcional**. Sin él, respuestas/selector apagados
(`features.voiceMessages` falso); personas envían voz con solo `META_API_KEY`.
`0060_voice_messages.sql` añade columnas. Consulta [infraestructura](infrastructure.md).

- Local: `ELEVENLABS_API_KEY=...` en `apps/api/.dev.vars` ignorado.
- Producción: secreto de build cifrado `ELEVENLABS_API_KEY` del proyecto API
  Workers Builds (release copia a ejecución), push y activar **Mensajes de voz
  de contactos** en admin.
- Reversión: aditiva. Antiguos muestran voz de contacto como texto y humana
  como burbuja vacía.

## iOS

La app (`apps/ios`) implementa igual en privados/grupos.

- **Captura.** `VoiceRecorder.swift` usa `AVAudioRecorder` a WAV PCM mono 16 bits
  16 kHz en directorio temporal `0700` y protección completa. `takeClip()` lee
  a memoria y borra inmediatamente; carpetas abandonadas se quitan tras 15 minutos
  al próximo abrir chat. Duración de chunks WAV `fmt ` y `data` (omite relleno).
  No transcribe antes de enviar; eliminadas llamadas cliente `/transcriptions`.
- **Permiso.** Primera pulsación pide micrófono y no graba (luego indicación de
  mantener/soltar). Denegado: «Acceso al micrófono desactivado…» bajo compositor;
  habilitar en Ajustes.
- **Sesión de audio.** Grabar `.record`; normal `.playback` con `.spokenAudio`,
  `.playAndRecord`/`.default` solo auricular superior: reproduce con silencio.
  Cada lado activa solo al usar y desactiva `.notifyOthersOnDeactivation`.
  Grabar detiene voz actual (`VoicePlayer.isRecording`); nunca reproduce grabando.
- **Interrupciones.** Desactivación por llamada/Siri/otra app descarta con
  «Se interrumpió la grabación. Graba de nuevo» y pausa sin reanudar. Desconectar
  auriculares pausa. Segundo plano/salir del chat descarta grabación, pero voz
  cargada sigue. Perder acceso, vaciar o cambiar cuenta detiene y limpia cachés.
- **Compositor.** `VoiceComposer.swift`: `VoiceRecordButton` con `DragGesture`
  distancia cero, soltar envía, 100 puntos izquierda cancela, 80 arriba bloquea;
  `VoiceRecordingBar` con punto rojo, tiempo, «‹ Desliza para cancelar» siguiendo
  dedo y **Eliminar** bloqueada. Micrófono pasa a **Detener**, que envía. Cancelar
  gesto por sistema cuenta soltar. A 60 segundos envía; <0.5 descarta e indica.
  VoiceOver activa para grabación bloqueada y otra vez para enviar.
- **Envío.** `ChatStore.send(voice:)` y `GroupChatStore.send(voice:)` muestran reloj
  y reproducen de memoria pendientes. Privado fallido conserva clip/cita en almacén
  (`failedVoice`) con **Reintentar** (mismo UUID hasta cambiar clip)/**Eliminar**
  arriba; micrófono desactivado hasta elegir. Grupos conservan incierto pendiente
  con **Reintentar envío** (mismo UUID); rechazado pasa a misma fila y reintenta
  con nuevo UUID. Almacenes con clip fallido no se expulsan de LRU de sesión.
- **Burbujas.** `VoiceMessageView` (`VoiceMessageView.swift`): reproducir/pausa,
  amplitud real en barras redondeadas, transcurrido/duración, hora y recibos.
  Botón sin círculo. Avatar interno a izquierda propio/derecha entrante, incluidos
  grupos/pendientes. Micrófono/cursor usan `MessageReceiptView.readColor` tras
  escucha. `VoicePlayer.shared` (`VoicePlayback.swift`) reproduce uno con
  `AVAudioPlayer`; desplazar no para. Citas dicen «Mensaje de voz».
- **Transcripción.** Popover largo añade **Ver transcripción** (VoiceOver también),
  abre `VoiceTranscriptSheet` que lee mensaje actual y actualiza al sondear.
- **Detalles.** Con `features.voiceMessages` de `GET /me` (refresco al abrir),
  `ContactEditorView` muestra `ContactVoiceRows`: permiso propio y fila **Voz**
  con `SearchablePicker` de acento y para creador (`canManage`) lista navegada
  con muestra por voz. Participantes ven nombre solo lectura.

### Caché iOS

- **Bytes** (`VoiceAudioCache.swift`): `NSCache` de 8 MiB delante de disco protegido
  en `Caches/PrivateAudio-v1`, mismo actor `ProtectedDiskCache`: protección completa,
  sin backups, nombres SHA-256, 64 MiB/cuenta con expulsión menos leído y siete
  días inactivos. Claves `contact/<id>/voice/<turnID>/user`,
  `contact/<id>/voice/<turnID>/assistant/<part>`, `group/<id>/voice/<messageID>` y
  `voices/<voiceID>/preview` dentro de carpeta de cuenta. Comparte lectura/descarga
  concurrente; no cachea fallo y muestra reintentar. Aceptados (también inciertos
  confirmados por historial) alimentan.
- **Ciclo de vida.** `PrivateImageCache` posee audio y reenvía activar/limpiar:
  salir, vencer sesión, cuenta, eliminación, contacto/historial 404 y perder grupo
  limpian junto a imágenes. Épocas de sesión rechazan tardías.
- **Metadatos** (`voice`, campos de contacto) en almacenes existentes con sus reglas.
- **Catálogo:** `ContactsStore.voiceCatalog` (`NavigationSnapshotCache`) una vez
  por sesión al abrir creador, deduplica, conserva si falla y descarta con shell.
  Deslizar recarga.

### Verificación iOS

Solo tipos estáticos. Pendiente dispositivo: permiso, mantener/deslizar/bloquear,
60 segundos, llamada durante grabar/reproducir, silencio, quitar auriculares,
caché tras reiniciar/offline, fallos de envío/descarga, hoja actualizada, cuenta
y muestras del selector.

## Web

`Permissions-Policy` permite micrófono propio (`microphone=(self)` en
`apps/web/nuxt.config.ts`). Hasta el 29 de octubre de 2026 era `microphone=()`,
rechazando sin preguntar aun permitido manualmente.

La app (`apps/web`) mantiene igual comportamiento privado/grupo.

- **Captura.** `useVoiceRecorder.ts`: `MediaRecorder` WebM/Opus, Ogg o MP4 según
  navegador, decodifica Web Audio y `OfflineAudioContext` a WAV mono PCM16 16 kHz.
  Base64 en cuerpo, nada de transcripción previa. Duración pendiente del WAV final.
- **Compositor.** `ChatComposer.vue` micrófono con vacío/sin adjunto. Ratón: clic
  inicia bloqueada y otro en Detener envía, sin gesto mantener/deslizar; <0.5 s
  indica «Haz clic para grabar y otra vez para enviar». Táctil/lápiz mantiene
  pointer events con captura: soltar envía, ~100 px izquierda cancela, ~80 arriba
  bloquea (indicación arriba del botón). Bloqueado muestra **Eliminar**/**Detener**.
  Soltar antes de listo (primero puede solo pedir permiso) no graba. Espacio/Enter
  inicia bloqueada para teclado/lector. 60 segundos, mínimo 0.5 e indicación
  mantener/soltar y descarte al ocultar/salir iguales. Permiso/decodificación fallida
  muestran error debajo.
- **Envío.** Almacenes privados/grupos conservan clip/UUID pendiente, muestran
  reloj y **Reintentar** mismo UUID/**Eliminar** tras fallo. Compositor desactivado
  pendiente como texto.
- **Burbujas.** `VoiceMessage.vue`: botón simple, barras reales sobre rango
  accesible por teclado, avatares propios izquierda/entrantes derecha (grupos/
  pendientes incluidos) y tiempo. Micrófono/cursor grises antes y `--read` después.
  Un `<audio>` compartido, continúa navegando/pestañas ocultas sujeto a restricciones.
  Muestras paran al ocultar/salir selector. Fallo de descarga o reproducción ofrece reintentar.
- **Transcripción.** Menú largo/clic derecho/reacción añade **Ver transcripción**,
  diálogo que actualiza por sondeo. Citas humanas «Mensaje de voz».
- **Detalles.** `features.voiceMessages` de `GET /me`: permiso propio y fila Voz,
  `AppSheet` con acento y lista/muestras para creador. Participantes solo lectura.

### Caché web

- **Bytes** (`useVoiceAudio.ts`): mapa de object URLs por cuenta/ruta (IDs inmutables,
  partes añaden `side`/`part`), 32 MiB por sesión con LRU, conserva actual. Comparte
  descargas; fallidas no se cachean y reintentan al reproducir. Aceptados alimentan;
  pendiente usa memoria bajo ruta final para continuar al sustituir burbuja.
  Muestras igual bajo `voices/:id/preview`. Salir, 401 y cuenta paran, revocan URLs
  y limpian. Nada a disco, `localStorage` ni IndexedDB; `no-store` evita HTTP.
- **Metadatos** (`voice`, contacto) en almacenes/listas existentes con sus reglas.
- **Catálogo** (`useVoices.ts`): una vez/sesión al abrir creador, deduplicado,
  reutilizado síncronamente; fallar refresco conserva y reset limpia. **Reintentar** recarga.
- **Funciones:** `features` de `GET /me` con usuario de sesión, refresca al abrir
  contacto y limpia con reset.

### Límites y verificación web

Solo estático (`npm run typecheck` en `apps/web`). Pendientes grabación, permisos,
gestos táctiles, reproducción/búsqueda y selector. Formatos `MediaRecorder` y
`decodeAudioData` varían: Chrome referencia; Safari MP4/AAC y Firefox Ogg/Opus
sin verificar. Safari puede bloquear tras descarga sin caché (autoplay); aparece
reintentar y siguiente toque usa caché. Sin `MediaRecorder`/`getUserMedia` o sin
HTTPS no muestra micrófono.

## Presentación y verificación de burbujas

Ambos decodifican WAV/MP3 real y calculan RMS en 37 ventanas iguales, normalizadas
a máxima y curva de potencia 0.65. Silencio queda mínimo. Barras 3–22 puntos/píxeles,
ancho máximo 2.2. Onda de alto 44, botón y avatar comparten centro vertical; duración
/metadatos debajo. Cursor circular ancho 12 sobre barras; toda pista alta 44 acepta
toque/arrastre (teclado web/VoiceOver iOS), no solo círculo. Buscar pausado conserva
pausa; antes de primer reproducir elige inicio sin sonar; durante reproduce busca
directamente. El gesto responder iOS excluye deslizador.

Analiza al entrar burbuja en ventana, compartiendo descarga/caché de cuenta.
Pendiente usa bytes locales. Antes de cargar o si falla decodificar muestra línea
mínima neutra, nunca amplitud inventada; reproducir/reintentar independientes.
Muestras inmutables por identidad, sin API/esquema, también mensajes viejos.
Reabrir usa muestras en caché o deriva desde bytes sin revalidar audio en cada render.

iOS conserva en `VoiceAudioCache` (256 KiB, 512 entradas), comparte análisis y
rechaza tras limpiar sesión. Decodifica fuera de actor principal en buffers de
8,192 fotogramas y archivo temporal protegido eliminado al acabar/cancelar;
interrumpidos se limpian tras 15 minutos al inicializar. Derivados solo memoria,
limpian con audio por sesión/cuenta/eliminar/acceso o bytes corruptos. Disco no cambia.

Web adjunta muestras/análisis a entrada existente y suma bytes numéricos a 32 MiB,
con misma expulsión/reset. Decodificación offline serializada evita buffers PCM
simultáneos y libera PCM tras reducir. Sin persistencia nueva. Ambos rechazan
más de 8 MiB, ocho canales o diez minutos (web duración decodificada). Fallos no
se guardan como muestras; volver a ventana o reproducir reintenta.

Pendiente comparar entrantes/salientes/pendientes en privados/grupos, fotos ausentes
/actualizadas, claro/oscuro, pantallas estrechas y texto grande; reproducir,
pausar/reanudar, reintentar, búsqueda puntero/teclado, recibos, reabrir offline,
acceso y cuenta. Comprueba voces humanas/contacto de grupo solas y consecutivas:
avatar izquierdo sigue agrupación normal y visible mientras interno muestra
velocidad. Compara silencio/picos reales WAV/MP3, buscar antes de empezar/pausado/
reproduciendo, arrastrar extremos y concordancia cursor/tiempo/sonido, que no
responda al deslizar y fallos/expulsión de memoria.

## Velocidad de reproducción

Al reproducir, avatar pasa a botón **1x**, **1.5x** o **2x**, ciclo inmediato
1x → 1.5x → 2x → 1x manteniendo posición. Pausar/parar/terminar devuelve avatar.
Privados/grupos y pendientes iguales con espacio fijo 44 puntos/píxeles y etiquetas
accesibles. Tasa compartida aplica siguientes y muestras; cambiar chat/parar no restablece.

Preferencia por cuenta en dispositivo/navegador, no identidad ni servidor. iOS
guarda número validado `voicePlaybackRate.v1.<userID>` en UserDefaults; web misma
clave localStorage. Solo 1, 1.5, 2; inválido/ausente 1x. Cambiar cuenta/salir para y
limpia memoria; entrar restaura cuenta. Sobrevive intencionalmente a salida,
no sincroniza entre dispositivos, navegadores ni pestañas; borrar almacenamiento
la quita. Si bloqueado solo sesión. Sin texto, audio ni posición guardados.

iOS habilita ajustar AVAudioPlayer antes de preparar y reaplica al reanudar.
Web HTMLMediaElement.playbackRate antes de reproducir y tras metadatos, preservando
tono. Progreso, búsqueda y etiquetas usan tiempo fuente. Sin regenerar, descargar,
proveedor, API ni migración.

Pendiente: ciclos a mitad sin reinicio, siguiente privado/grupo/local con tasa,
pausar/buscar, restaurar avatar al finalizar/error, reabrir/reiniciar, cuentas,
almacenamiento bloqueado, teclado/VoiceOver, disposición y gesto responder. Lo
estático no demuestra tiempos audibles ni tacto.

## Indicadores de actividad

Ambos muestran Grabando... al preparar voz y Escribiendo... texto. Inferencia
muestra Escribiendo... para todos desde 2026-10-30 y pasa a Grabando si será hablada.
Textos usan presupuesto de composición por longitud antes de cada burbuja; voz,
preparación corta. Texto después de voz borra explícitamente superposición Grabando
y muestra Escribiendo al esperar. Consulta [mensajes sucesivos](reply-messages.md).
La segunda línea de listas sustituye temporalmente vista previa/recibos por actividad,
conservando orden, fechas y no leídos. Grupos identifican cada contacto activo.
Reutiliza resúmenes de sesión, sondeo, deduplicación, páginas, aislamiento y expulsión
sin consultas por fila ni disco. Consulta [actividad](chats.md#reply-activity-indicators)
para frescura/fallos y dispositivo, y [0062](infrastructure.md#recording-presence-migration-0062)
para configurar/revertir.

## Limpieza de ciclo de vida

El [ciclo del chat](chat-lifecycle.md) incluye bytes humanos/sintetizados, pendientes,
reproductor, ondas/object URLs y cachés protegidas iOS. Archivar conserva historial.
La síntesis tardía comprueba origen y encola objetos inválidos para limpieza reintentable.

## Reproducción de fondo y salida al oído

En iOS un mensaje privado/grupo cargado, incluido pendiente local, sigue navegando,
bloqueado y en fondo. `VoicePlayer` posee `AVAudioPlayer` en memoria aparte de la
burbuja; declara `UIBackgroundModes = audio`. Cierre forzado, terminación SO o
reinicio termina; no resucita audio/proceso. Descargas pendientes no garantizan
completar en fondo. No reproduce siguiente automáticamente. Muestras solo primer
plano y paran al salir selector.

Publica título genérico **Mensaje de voz**, duración/posición/tasa a Now Playing.
Controles permiten reproducir/pausar, parar y buscar; a petición del usuario, foto
de remitente como carátula, no nombres/transcripciones. Pausar conserva clip/posición
para reanudar explícitamente, libera sesión/sensor y nunca reanuda tras llamada/
Siri/desconectar. Reemplazar, grabar, terminar, error de decodificación, perder
acceso conocido, vaciar o invalidar cuenta/sesión detiene y limpia controles.

En iPhone solo con salida integrada, reproducir/reanudar espera **300 ms** cancelables
antes de sonar, también tras descarga, no durante. Muestras, iPad y salidas externas
sin demora. Segundo toque, grabación, invalidación o reemplazo cancela inicio.
Fallos async restauran reintento y descartan bytes no reproducibles.

En iPhone integrado se usa proximidad `UIDevice` solo al reproducir mensajes.
Notificaciones de orientación impiden armar plano/desconocido. Cerca estable
**120 ms** cambia al auricular superior; lejos **350 ms** al altavoz, reduciendo
oscilación/ráfagas fuertes. iOS apaga pantalla y toques con sensor cubierto.
Detecta objetos, no oído; dedo/funda pueden interferir y exige verificación física.

Auricular requiere `.playAndRecord`/`.default` sin forzar altavoz; normal vuelve
`.playback`/`.spokenAudio`. No abre ni graba entrada para escuchar. Cada cambio
pausa al cambiar categoría, conserva posición/tasa y reanuda solo si ya sonaba.
Fallar pausa/detiene seguro, no altavoz fuerte. Auriculares/Bluetooth/USB/AirPlay/
coche conservan rutas de sistema: proximidad apagada y sin robar accesorio.
Desconectar pausa hasta reproducir explícito. Sensor/orientación se liberan al
pausar, acabar, error, grabar e invalidar. Una sesión auricular ya activa puede
terminar gesto cerca/lejos en fondo; altavoz de fondo no arma gesto nuevo, evitando bolsillo.

Web mantiene HTML audio entre navegación/ocultación. Media Session si disponible
ofrece título genérico, foto, reproducir/pausar, parar, buscar y posición/tasa.
Grabar para y bloquea hasta liberar micrófono. El navegador decide supervivencia
al bloquear/fondo; cerrar termina. No hay proximidad fiable ni selección de
receptor integrado, así que no salida al oído ni demora artificial. Sin permiso
ni solicitud de selección de salida nueva.

### Caché y verificación

Clip iOS activo queda en memoria, sin leer archivos completamente protegidos al
bloquear. No cambian caché por cuenta, retención, solicitudes compartidas ni rechazo
de obsoletas. Web fija object URL activo contra LRU. Posición, ruta, proximidad y
metadatos solo sesión y limpian con reproductor; persiste solo preferencia numérica
existente. Sin API, migración, servicio ni refresco de red en fondo. Los cambios
remotos de acceso se aplican cuando sincronizador los aprende; audio en memoria
no se reautoriza continuamente suspendido.

Tipos estáticos/plist/diff no establecen rutas ni tiempos audibles. Pendiente
iPhone: entrantes/salientes/pendientes privado/grupo; pausa en gracia; cerca al
iniciar/después, oscilación rápida, dedo con teléfono plano, funda, bajar/subir
bloqueado, ambas rutas en primer/fondo, conectar/desconectar auriculares/Bluetooth/
AirPlay, llamadas/Siri, buscar/cambiar tasa al oído, terminar, fallo descarga/ruta,
grabación, navegar/repetir offline, vaciar/eliminar/acceso/cuenta. Pantalla y tacto
deben recuperar tras pausa/fin/error. iPad altavoz/accesorios sin proximidad.
Safari/Chrome/Firefox: oculto/bloqueado, controles, denegación autoplay/reintento y
limpieza al cerrar.

### Foto del remitente en controles del sistema

La tarjeta ahora muestra foto en iOS y Media Session web compatible. Privado
entrante usa contacto; grupo usa avatar específico usuario/agente, no foto de
grupo. Propios/pendientes usan cuenta. Ausente/no disponible/fallida muestra avatar
neutro. Título sigue **Mensaje de voz**; publica foto a sistema, incluida pantalla
bloqueada y accesorios compatibles, no nombre/transcripción. Cambia reproducción,
no notificaciones APNs.

Usa caché privada versionada por cuenta y permisos/cargas/retención existentes.
iOS reutiliza avatar decodificado de 288 píxeles sincrónicamente o carga async
desde reproductor sin demorar sonido. Sobrevive navegación de burbuja; cancela
al parar/reemplazar y rechaza tardío por cancelación, identidad y época de sesión.
Retiene solo actual en memoria; pausa conserva para reanudar. Web usa misma ruta/
caché que burbuja y fija object URL contra LRU de 150 hasta parar/reemplazar.
Parar, grabar, finalizar, acceso conocido, vaciar o cuenta libera foto y metadatos.
Sin persistencia privada extra ni servicio; marcador genérico mientras carga/no puede.

El usuario informó el 29 de octubre de 2026 que reproducción de fondo y proximidad
funcionan bien en su dispositivo. La foto nueva aún necesita revisión: privados/
grupo, entrantes/salientes/pendientes, sin foto, caché/fuera, offline/fallo, bloqueo/
navegación inmediata, pausa/reanudar, reemplazo rápido durante carga, presión LRU
y vaciar/eliminar/acceso/cuenta durante solicitud. Lo estático no demuestra carátula
ni icono renderizados por sistema.

### Ámbito del fondo de micrófono web

El fondo de micrófono del avatar saliente se limita con clase raíz `VoiceMessage`.
No debe generar regla global `.outgoing`, que colorearía filas enteras de texto/
adjuntos. Solo CSS web; iOS, reproducción y escucha no cambian. Sin red, retención
ni invalidación nueva. Pendiente revisar texto/adjuntos/voz enviados y pendientes
en privado/grupo y ambos colores.

## Efectos textuales y aptitud para voz

Mensajes informales con emojis, banderas, repeticiones evidentes de letras o risas
escritas admitidas siguen texto aun con longitud apta. La API nunca los reescribe
ni pide otro modelo para hablarlos. Prosa conversacional simple usa permiso y reglas
existentes. Aplica privado/grupo iOS/web sin caché ni campo nuevo. El prompt de voz
describe audiencia actual en vez de asumir nota privada a una persona. Evaluación
ficticia de texto/prompts y aptitud local en
[evaluación de estilo](conversation-style-evaluation.md); sin afirmación acústica.
