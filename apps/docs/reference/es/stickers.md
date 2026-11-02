# Stickers

Los stickers son imágenes con fondo transparente y un emoji que indica cuándo
usarlas, como en WhatsApp. Las personas mantienen una **biblioteca de stickers**
que pueden usar en todos los chats privados y grupos; los contactos tienen su
propia biblioteca y también envían stickers. iOS y web ofrecen el mismo comportamiento.

## Conceptos

- **Sticker**: PNG de hasta 512 × 512 píxeles y 300 KB con transparencia real, más
  un emoji (un solo grafema). El emoji indica al contacto cuándo encaja.
- **Biblioteca personal**: `owner_kind = 'user'`, hasta 120 stickers, global entre chats.
- **Biblioteca del contacto**: `owner_kind = 'agent'`. Dos clases de entradas:
  - Stickers `avatar`: creados por el contacto desde su foto de perfil (hasta 12).
    Compartidos por todo el agente.
  - Stickers `saved`: guardados de una persona («robados»), hasta 30 por persona.
    **Limitados a la conversación de esa persona** (`scope_user_id`): otros
    participantes de un contacto compartido nunca ven los obtenidos de otro chat.
- Un sticker en un mensaje es un adjunto de imagen ordinario con
  `sticker: { id, emoji }`. Sus bytes se **copian** al mensaje (clave `attachments/…`),
  por lo que eliminarlo de la biblioteca conserva mensajes antiguos y vaciar un
  chat nunca toca la biblioteca.

## Crear un sticker (recorte)

`POST /api/v1/stickers/cutout` recibe JPEG o PNG (hasta 5 MB, máximo 2048 px por lado,
6 MP) y devuelve PNG transparente como **vista previa**; no almacena nada. Flujo:
**Crear sticker** → elegir foto → vista previa sobre damero → elegir emoji →
**Guardar** (`POST /api/v1/stickers`).

Funcionamiento del recorte (`apps/api/src/stickers/cutout.ts`):

1. **SAM 3.1** de Meta (`sam-3.1` mediante `https://api.meta.ai/v1/responses`, con
   `META_API_KEY` existente) segmenta `person` (o el sintagma nominal `subject`
   opcional). Si no coincide nada y no se dio sujeto, Muse Spark nombra el sujeto
   principal (un sintagma nominal) y SAM reintenta.
2. Gana la máscara de mayor tamaño y confianza. Se muestrea bilinealmente en las
   coordenadas de origen y pasa al canal alfa; se recorta con margen del 6% y se
   reduce como máximo a 512 px.
3. El resultado es PNG de paleta de 256 colores con alfa (≈100–200 KB). Muse Image
   no devuelve transparencia y Workers no tiene Canvas, así que la composición es
   JS puro (`jpeg-js`, `upng-js`, `@meta-sam/parser`).

Medido el 2026-11-01 con un retrato ficticio generado: ~3 s totales, 512 × 512,
≈120 KB. Se limita a 6 recortes por minuto por cuenta. Errores: 422 `NO_SUBJECT`,
422 imagen no compatible, 502/503 cuando SAM no está disponible.

## API

Todas las rutas requieren la sesión bearer firmada.

| Método | Ruta | Comportamiento |
| --- | --- | --- |
| GET | `/api/v1/stickers` | `{ stickers: Sticker[], limit }`, más nuevos primero |
| POST | `/api/v1/stickers/cutout?subject=` | Cuerpo `image/jpeg` o `image/png` en bruto; devuelve `image/png` (cabeceras `X-Sticker-Width/Height`) |
| POST | `/api/v1/stickers` | `{ emoji, data }` (`data` = PNG base64); 201 `{ sticker }`, 409 biblioteca llena, 422 si no es PNG transparente ≤ 512 px / 300 KB |
| PATCH | `/api/v1/stickers/:id` | `{ emoji }` |
| DELETE | `/api/v1/stickers/:id` | Elimina sticker y objeto |
| GET | `/api/v1/stickers/:id/image` | PNG privado, `no-store`; caché por `id` + `digest` |
| POST | `/api/v1/stickers/save` | `{ contactID, turnID, part? }` guarda el sticker de un mensaje de contacto en biblioteca (deduplicado por digest) |
| GET | `/api/v1/contacts/:id/stickers` | Stickers del contacto visibles para ti: sus avatares y los que guardó de ti |
| GET | `/api/v1/contacts/:id/stickers/:stickerID/image` | PNG |
| POST | `/api/v1/contacts/:id/stickers/:stickerID/save` | Copia un sticker del contacto a tu biblioteca |

`Sticker` es `{ id, emoji, width, height, size, source: 'upload'|'avatar'|'saved', digest, createdAt }`.
Eliminar o editar nunca cambia mensajes enviados.

### Envío

`POST /api/v1/contacts/:id/chat/turns` y `POST /api/v1/groups/:id/messages` aceptan
`sticker: { id }` en lugar de `attachment`/`voice`, con `text` vacío. El servidor lo
resuelve desde la biblioteca del remitente y almacena una copia como adjunto.
Historial y respuestas exponen `attachment: { name, mimeType, size, sticker: { id, emoji } }`
(nunca clave de objeto). `GET …/chat/turns/:id/attachment` (y `?side=assistant`)
sirve bytes como cualquier adjunto, reutilizando la caché de imágenes existente.
Se excluyen de **Compartido en este chat → Multimedia**. La vista previa de un
mensaje solo de sticker es `Sticker 😂`. Los contactos los envían solo en privados
(consulta [limitaciones](#limitations)).

## Contactos y stickers

El contacto decide en una respuesta privada con tres herramientas
(`apps/api/src/stickers/tools.ts`):

- `send_sticker { stickerID }`: envía uno de su biblioteca como mensaje propio
  después del texto (o solo, con `"messages": []`). El texto del mensaje es el
  emoji, para que listas y notificaciones se lean naturalmente.
- `save_sticker { messageID }`: guarda el que envió la persona («roba»), limitado
  a esa conversación. Puede enviarlo inmediatamente.
- `create_sticker_of_yourself { emoji, expression }`: Muse Image edita la foto de
  perfil con la expresión solicitada y la cadena de recorte crea el sticker.
  Solo existe si la foto muestra **un personaje principal con rostro claro**:
  cuentan persona real, dibujo, personaje pixel-art/de videojuego, robot o mascota
  con ojos; no paisajes, logos, varios personajes ni rostro oculto o diminuto.
  Muse Spark lo comprueba una vez por versión de foto (`sticker_photo_check`);
  la expresión conserva su estilo artístico. Comprobado el 2026-11-01 con avatares
  ficticios (foto, pixel art, robot). Un «no» se confía solo seis horas (0092 borró
  veredictos de la primera comprobación más estricta). Hasta 3 creaciones por
  minuto por contacto. Cuesta una llamada de visión, una edición y una solicitud SAM.

El modelo ve `[Sticker 😂]` en el historial; nunca se le envían los bytes.
Programaciones, tareas e iniciativa no ofrecen herramientas de stickers.

### Hábitos y regla de reciprocidad

Como Emoji, las personalidades tienen un rasgo **Stickers** (1–10, «Rara vez»–«A
menudo», `shared/personality.ts`) con las mismas reglas de compatibilidad: clientes
antiguos que lo omiten conservan el valor, los perfiles previos lo infieren de
Emoji, Humor, Expresión y Formalidad. Sin personalidad configurada se obtiene un
nivel estable 2–7 desde el ID. `personality/expression.ts` (`stickerHabits`) sortea
una sugerencia por turno con semilla del ID:

- **La persona envió sticker**: devolver uno es el valor por defecto (probabilidad
  0.5 + 0.045 × nivel, máximo 95%) si alguno encaja con el ánimo; si no, palabras
  o reacción.
- **Protección de bucle**: si el mensaje anterior del contacto era sticker **y**
  la persona respondió con otro, termina el intercambio. El prompt prohíbe otro
  y no se ofrece `send_sticker`, aplicándolo también en servidor.
- **En otro caso**, tasa personal (aproximadamente 0.5% en nivel 1 hasta 40% en 10),
  reflejando un poco cuánto los usa la persona y ajustada según las últimas ocho
  respuestas propias para no saturar ni olvidarlos.
- El momento prevalece: no en respuestas tristes, tensas, serias o técnicas.

Estas tasas suponen que el modelo sigue la sugerencia; no se ha medido el comportamiento real.

## Limitaciones

- Los contactos envían, guardan y crean solo en **privados**. En grupos las personas
  pueden enviar y todos los ven, pero los contactos no envían ni guardan.
- Los creados desde perfil son ilustraciones generadas del avatar, no fotografías
  (consulta [imágenes generadas](generated-images.md)).
- Sin stickers animados. Solo se crean PNG.

## Privacidad

Lo guardado de una persona permanece limitado a su conversación. Los stickers
propios de avatar son de todo el agente, igual que su foto. Los objetos viven en
`users/<user>/stickers/` y `contacts/<owner>/<agent>/stickers/`, cubiertos por
barridos de limpieza de cuenta/agente; eliminarlos también elimina filas (triggers
0091). Los stickers enviados al proveedor se limitan al recorte (la foto subida
va a SAM y, cuando «person» no encuentra nada, a Muse Spark); no concede nuevo
consentimiento de datos Contributor.

## Infraestructura y reversión

`0091_stickers.sql` añade `sticker` y `sticker_photo_check`. Sin bindings ni secretos
nuevos: SAM, Muse Image y Muse Spark usan `META_API_KEY`; los objetos, el bucket
privado `CONTACT_PHOTOS`. Dependencias npm nuevas de `apps/api`: `@meta-sam/parser`,
`jpeg-js`, `upng-js` (y `@types/upng-js`). La disponibilidad de `sam-3.1` para una
clave Meta dada **no está verificada fuera de la medición anterior**. Esquema
aditivo: clientes antiguos leen como PNG ordinario sin pie, pero no crean stickers.
Al revertir conserva migración y objetos; eliminar tablas pierde bibliotecas.

## Web

Código: `ChatComposer.vue` (botón), `StickerPicker.vue`, `CreateStickerDialog.vue`,
`StickerEmojiPicker.vue`, `StickerImage.vue`, `useStickers.ts` (caché),
`utils/stickers.ts` (preparación, validación emoji, rutas) y las ramas en
`MessageAttachment.vue`, `MessageReactions.vue`, `pages/chats/[id].vue` y
`pages/groups/[id]/index.vue`.

### UI

- **Botón de sticker.** En privados y grupos, a la derecha del campo y a la izquierda
  de enviar/micrófono. Desactivado si el compositor está desactivado o enviando;
  oculto durante grabación.
- **Selector.** Un `AppSheet`: hoja inferior en pantallas estrechas y diálogo centrado
  en otras (un componente, no popover), sobre `<dialog>`: mantiene foco dentro,
  Escape/fondo cierra y devuelve foco al botón.
  - **Mis stickers**: primera celda **Crear sticker** (desactivada si llena), luego
    biblioteca por más nuevos con conteo (`n of 120`). Pulsar envía de inmediato
    y cierra. **...**, pulsación larga táctil o menú contextual de ratón abre
    acciones: **Cambiar emoji** (64 emojis y campo de uno cualquiera) y **Eliminar**
    (línea de confirmación). Escape o **Atrás** vuelve a cuadrícula antes de que
    otro Escape cierre.
  - Pestaña **Nombre del contacto** (solo privados): sus stickers
    (`GET /contacts/:id/stickers`). Pulsar = **Guardar en mis stickers**; muestra
    **Guardar**, indicador al guardar y **Guardado** si existe el mismo digest.
  - Vacíos por pestaña, carga para lista nunca cargada, error con **Reintentar**
    (lista ya cargada sigue visible con advertencia) y aviso de error de acción
    (llena, límite de frecuencia, indisponible) usando mensaje API.
- **Diálogo Crear sticker.** Foto (JPEG, PNG, WebP o HEIC decodificable) → navegador
  aplica orientación EXIF (`createImageBitmap` con `imageOrientation: 'from-image'`),
  reduce lado largo a 1536 px, aplana transparencia en blanco y codifica JPEG
  (calidad 0.9, bajando hasta menos de 5 MB) → `POST /stickers/cutout` → PNG sobre
  damero → emoji (exactamente un grafema y, como API, pictograma, bandera o tecla)
  → **Guardar** (`POST /stickers` con PNG base64). En 422 `NO_SUBJECT` muestra
  mensaje API y **¿Qué quieres recortar?** opcional (2-40 letras, cifras, espacios
  o guiones, como API) con **Reintentar**. Un 429 desactiva **Reintentar**/**Guardar**
  por los segundos `Retry-After` y lo indica; 409 (llena), 502/503 y 422 muestran
  mensaje y conservan vista/origen para reintentar. **Elegir otra foto** y
  **Cancelar** abortan la solicitud.
- **Mensajes.** `attachment.sticker` se muestra como imagen transparente sin
  fondo/marco/punta (máximo 160 px, conserva aspecto, `object-fit: contain`);
  hora/recibo debajo en píldora pequeña. Citas, respuestas, reacciones, selección
  y resaltado al saltar a cita funcionan igual (el resaltado es brillo alrededor).
  Vistas previas y citas dicen `Sticker` más emoji. No aparecen en **Compartido en este chat**.
- **Guardar sticker.** En privados, el menú de un sticker de contacto tiene
  **Guardar sticker** (`POST /stickers/save` con `{ contactID, turnID, part }`,
  `part` = índice de `assistantMessages`, por lo que se pide imagen con
  `?side=assistant&part=N` para partes posteriores a la primera). Una línea sobre
  el compositor confirma o informa error. Los propios y de grupo no tienen Guardar.

### Envío

`useConversation.send` y `useGroupConversation.send` reciben cuarto argumento,
`StickerChoice { id, emoji, path }`, y envían `sticker: { id }` con `text` vacío sin
adjunto ni voz. El registro pendiente conserva UUID y ID de sticker, para que
burbuja optimista, marcas Enviado/Recibido, Reintentar (mismo UUID) y Eliminar se
comporten como [adjuntos](attachments.md); reutiliza la ruta de imagen de biblioteca
sin solicitud. Un fallo ofrece **Reintentar** y **Eliminar** (sin texto que editar).
Un 404 privado se muestra «Este sticker ya no está en tu biblioteca», porque la
ruta del chat se interpretaría como contacto ausente.

### Caché

Listas de biblioteca/contactos pertenecen a sesión y solo memoria (`useStickers`):
reutilización síncrona al reabrir (vacíos incluidos), revalidación de fondo de
30 segundos, deduplicación, rechazo de obsoletas por revisión, actualizaciones de
mutación y reinicio completo al cerrar sesión/cambiar cuenta. Claves de imagen:
cuenta + ruta con digest. Detalles en [caché](caching.md#stickers).

### Limitaciones (web)

- El navegador debe decodificar: HEIC solo en Safari; otros dicen «No se pudo leer esta imagen».
- Selector hoja/diálogo, no popover anclado; sin arrastrar/soltar ni pegar imágenes,
  reordenar o buscar.
- Los mensajes no abren visor completo.
- 160 px es máximo CSS; no se amplían pequeños.
- Los contactos no envían/guardan en grupos (servidor); solo aparece biblioteca propia.
- El editor de personalidad enumera **Stickers** al iterar rasgos compartidos
  (17); web no fija un conteo.

### Lista de verificación manual (no realizada)

Hasta ahora solo validación estática: `npm run typecheck` en `apps/web`. Nada de
lo siguiente se observó en navegador.

1. Posición a la derecha del campo, izquierda de enviar/micrófono en privado/grupo;
   ausente en otras pantallas y desactivado al enviar.
2. Selector como hoja bajo 600 px y diálogo por encima; Escape, fondo y cerrar
   cierran; devuelve foco y Tab queda dentro.
3. Mis stickers: vacío; pulsar envía con imagen en caché inmediata; reintentar sin
   conexión reenvía una vez el mismo mensaje; cambiar emoji/eliminar (el mensaje
   enviado conserva imagen).
4. Contacto: vacío; pulsar guarda; **Guardado** persiste al reabrir; duplicado no
   añade otro; 409 muestra biblioteca llena.
5. Crear: JPEG, PNG, WebP, EXIF rotado, foto >6 MP, HEIC Safari; NO_SUBJECT con/sin
   sujeto; cuenta atrás 429; cancelar recorte/guardado; damero; rechaza «ab», dos
   emojis o una cifra.
6. Propios y de contacto en privados/grupos, temas claro/oscuro, cita, reacción y
   salto; sticker como parte posterior; **Guardar sticker** entrante; ninguno en
   Compartido en este chat.
7. Caché: reabrir instantáneo; cambiar cuenta con selector abierto lo cierra sin
   stickers obsoletos; cerrar/abrir sesión; borrar sticker de envío pendiente.
8. Personalidad: Temperamento muestra 17 deslizadores incluido Stickers, guarda
   y recarga.

## iOS

Código (`apps/ios/Wildcard`): `Stickers/StickerPickerView.swift` (hoja, pestañas,
editor emoji), `StickerCreateView.swift` (flujo, `StickerSourceImage`,
`StickerCreateModel`, damero), `StickerEmoji.swift` (lista, validación, selector),
`StickerImageView.swift` (imagen en caché y mensaje sin burbuja),
`StickerStore.swift` (caché), `StickerAPI.swift` (modelos/rutas), más ramas de
`Chat/ChatView.swift`, `Chat/ChatStore.swift`, `Chat/ChatAttachment.swift`,
`Chat/MessageReactions.swift`, `Chat/MessageReplies.swift`, `Groups/GroupViews.swift`,
`Groups/GroupsAPI.swift`, `Images/PrivateImageCache.swift` y `Auth/AuthAPI.swift`.

### UI

- **Botón.** Círculo de cristal `face.smiling`, mismos 44 pt y estilo que adjuntar,
  entre campo y micrófono/enviar en privados/grupos. Desactivado durante carga,
  indisponibilidad, vaciado o envío (en grupos también con mensaje pendiente),
  oculto durante grabación.
- **Selector.** **Hoja con alturas media y grande**, no panel en línea: compositor
  en `safeAreaBar` con teclado y transcript/información/selectores existentes son
  hojas; un panel tendría que reemplazar teclado y redimensionar historial.
  `NavigationStack` titulada **Stickers** con **Cerrar**; **Crear sticker** navega al flujo.
  - **Mis stickers**: primera celda **Crear sticker** (dice **Biblioteca llena** y
    se desactiva a 120), luego más nuevos primero. Pulsar envía y cierra. Mantener
    abre **Cambiar emoji** (hoja con selector) y **Eliminar** (confirma que mensajes
    enviados conservan sticker). Vacío: solo crear y una indicación.
  - Pestaña **Nombre del contacto**, **solo privados** (selector segmentado arriba;
    grupos sin pestañas): `GET /contacts/:id/stickers`. Pulsar = **Guardar en mis
    stickers**; celda con más, indicador al guardar y marca cuando hay el mismo
    digest (API también deduplica).
  - Listas nunca cargadas muestran indicador; fallo inicial **Reintentar**;
    listas cargadas siguen visibles ante revalidación fallida (errores de acciones
    como llena, 429 o indisponible aparecen en rojo arriba). Deslizar actualiza pestaña.
- **Crear sticker.** `PhotosPicker` (solo imágenes, sin permiso de biblioteca) →
  `StickerSourceImage` decodifica con ImageIO (`CGImageSourceCreateThumbnailAtIndex`,
  EXIF aplicado, lado largo máximo 1536 px sin ampliar), aplana blanco y codifica
  JPEG 0.9 (baja a 0.75 y 0.6 si supera 5 MB) → `POST /stickers/cutout` (JPEG bruto,
  `Content-Type: image/jpeg`, `?subject=` opcional) → PNG sobre damero → selector
  de 64 emojis y campo de cualquiera (exactamente un grafema pictograma, bandera
  o tecla como API) → **Guardar** (`POST /stickers` con `{ emoji, data }`, PNG base64).
  Fallos:
  - 422 `NO_SUBJECT` muestra API, campo opcional **¿Qué quieres recortar?** (2-40
    letras, cifras, espacios o guiones) y **Reintentar** con la misma foto y sujeto
    si existe. **Elegir otra foto** siempre disponible.
  - 429 lee `Retry-After`, desactiva Reintentar/Guardar con cuenta atrás (60 s sin
    cabecera); 409 llena, 413/415/422 y 5xx muestran API o «Los stickers no están
    disponibles ahora» y conservan foto/vista para reintentar.
  - Salir, elegir foto o guardar incrementa contador de generación y cancela la
    tarea, descartando respuestas tardías. JPEG y PNG solo viven en
    `StickerCreateModel`, liberados al restablecer, guardar y desaparecer pantalla.
- **Mensajes.** Un adjunto con `sticker` se dibuja como imagen transparente sin
  fondo/marco/punta (`StickerMessageView`: máximo 160 pt escalados con Dynamic
  Type, ajustado a aspecto); hora/recibo debajo y cita en burbuja pequeña encima.
  Deslizar para responder, saltar a cita, reacciones y menú largo funcionan igual.
  No abre visor y no aparece en **Compartido en este chat** (servidor). Citas:
  `Sticker` más emoji.
- **Guardar sticker.** En privados, el menú largo (popover de reacciones) de un
  sticker **del contacto** ofrece **Guardar sticker** (`POST /stickers/save` con
  `{ contactID, turnID, part }`, `part` = índice de `assistantMessages`). Una línea
  sobre compositor confirma («Guardado en tus stickers.») o muestra error. Los
  propios y de grupo no ofrecen esta acción.

### Envío

`ChatStore.send(sticker:)` y `GroupChatStore.send(_:sticker:)` envían
`sticker: { id }` con texto vacío y sin adjunto/voz, conservando cita opcional
(y publicación Para ti en privado). El UUID se mantiene ante fallos (`submission`
privado, `pending` grupo): volver a elegir el mismo sticker reutiliza UUID en
privado; grupos muestran **Reintentar envío**. La burbuja optimista usa imagen de
biblioteca en caché mientras `isSending`; al aceptar, `PrivateImageCache.copy`
cambia la clave a la del adjunto, sin recarga. Un 404 privado (eliminado en otro
dispositivo) dice «Este sticker ya no está en tu biblioteca».

Los del contacto son mensajes del asistente separados después del texto, con
imagen `?side=assistant&part=N`. `CachedImageResource.assistantAttachment` añadió
`part` (clave sin cambios para 0); sin él todos obtendrían parte 0.

Vistas previas: servidor envía `Sticker 😂` para los propios. El cliente también
compone vista local si conversación en caché es más nueva que fila de lista
(`ContactsStore.messagePreview`, `GroupChatStore.preview`), ahora `Sticker` más
emoji y no `Attachment: Sticker.png`. El de contacto muestra su emoji (texto).

### Caché

Solo memoria y propiedad de sesión (`StickerStore` de `ContactsStore`); reglas
en [caché](caching.md#stickers). Resumen:

- Un `NavigationSnapshot<StickerLibrary>` para biblioteca y
  `NavigationSnapshotCache<[Sticker]>` (ocho contactos, menos usados recientemente)
  para pestañas. Reabrir dibuja listas en caché síncronamente, incluidas vacías,
  y revalida al abrir y deslizar.
- `NavigationSnapshot` deduplica/rechaza obsoletas; cada mutación (`create`,
  `changeEmoji`, `delete`, `save`, `saveMessageSticker`) usa `replace` del valor y
  cancela/ignora cargas anteriores.
- Imágenes con `PrivateImageCache`, claves `sticker/<id>/<digest>` y
  `contact/<contact>/sticker/<id>/<digest>`, particionada por cuenta. Mensajes
  conservan claves de adjunto.
- Otra cuenta recibe nuevo `ContactsStore` (`ContentView` aplica `.id(auth.user?.id)`),
  sin cruzar listas/conjunto ocupado; quitar contacto elimina su pestaña
  (`forget(contactID:)`). Vaciar chat conserva bibliotecas, que nunca toca.

### Limitaciones

- Contactos envían/guardan/crean solo en privados (servidor); grupos ofrecen solo
  biblioteca propia.
- La hoja no es panel en línea y no tiene búsqueda, reordenado ni arrastrar/soltar.
  El icono es SF Symbol `face.smiling` (sin símbolo específico verificado).
- 160 pt es máximo; los pequeños no se amplían. Sin animados.
- Fotos devuelve la representación elegida (`.compatible`); si ImageIO no la
  decodifica, muestra «No se pudo preparar esta foto».
- Los ausentes de biblioteca siguen en mensajes antiguos, que poseen copia;
  nunca aparecen en selector.
- Stickers es el rasgo 17; versiones iOS anteriores reciben 17 cuando validan 16,
  por lo que no guardan personalidad hasta actualizar (como Emoji, consulta
  [personalidad](personality.md)).

### Lista de verificación manual (no realizada)

Solo validación estática (`swiftc -typecheck` con flags de aislamiento del proyecto).
Nada se observó en dispositivo ni simulador.

1. Botón derecho del campo e izquierdo de micrófono/enviar en privado/grupo,
   mismo tamaño que clip, oculto grabando y desactivado enviando.
2. Hoja con alturas media/grande; Cerrar y deslizar cierran; teclado se oculta.
3. Biblioteca vacía muestra crear e indicación; pulsar envía/cierra, imagen
   inmediata sin recargar al completar; envío offline/reintento (privado: mismo
   sticker; grupo: Reintentar envío) entrega una vez; menú cambia emoji/elimina
   conservando enviado; llena desactiva Crear.
4. Contacto ausente en grupos; vacíos/errores; pulsar guarda y marca persiste;
   duplicados no añaden otro; 409 muestra llena.
5. JPEG, PNG transparente, HEIC, rotada y enorme; NO_SUBJECT con/sin sujeto;
   cuenta atrás 429; salir durante recorte/guardar sin resultado tardío; emoji
   inválido («ab», dos o cifra) mantiene Guardar desactivado; damero claro/oscuro;
   no se restablece pantalla mientras aparece selector Fotos.
6. Propios/contacto en privados/grupos con cita, reacción, salto y parte posterior;
   Guardar entrante; sin burbuja/marco/punta, Dynamic Type; pulsar no abre nada;
   ninguno en Compartido en este chat.
7. Reabrir instantáneo, otro dispositivo añade y deslizar actualiza, cerrar/abrir
   sesión, cambiar cuenta, eliminar de envío pendiente («ya no está en tu biblioteca»).
8. Lista: `Sticker 😂` propio antes/después de actualizar.
9. Temperamento muestra 17 incluido Stickers; guarda y recarga.
