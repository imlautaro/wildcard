# Adjuntos del chat

En la web, las imágenes de chats privados y de grupo (incluidas las generadas por
contactos) conservan la composición original tanto en vistas previas optimistas
como en mensajes guardados. Pulsar una miniatura cargada abre la imagen completa
en un modal negro en la misma pestaña. El modal ofrece Cerrar, Escape,
Ampliar/Ajustar imagen, zoom con doble clic y desplazamiento al ampliar. Reutiliza
la URL de blob original de la miniatura en caché sin otra solicitud ni caché separada;
las imágenes pendientes reutilizan su URL de vista previa local. Cerrar restaura
el foco. Los cambios de origen/cuenta y la navegación cierran el visor. Los PDF
conservan su vista previa separada con blob temporal. iOS conserva su visor nativo
y gestos existentes. Verifica en navegador imágenes verticales/horizontales, pies,
imágenes generadas, ventanas pequeñas, foco de teclado, zoom, navegación atrás,
reapertura sin conexión y cambio de cuenta; la validación estática no confirma estos comportamientos.

El compositor tiene un clip a la izquierda de Mensaje. Elige Fototeca o Elegir
archivo, revisa la miniatura/nombre del borrador y quítalo o reemplázalo antes de
enviar. Un mensaje puede contener un adjunto, con o sin texto. Enviar lo mueve de
inmediato a una burbuja saliente optimista; las miniaturas usan bytes locales
mientras la solicitud está pendiente. Un reloj indica envío y las acciones de
vista previa esperan aceptación del servidor. El botón derecho envía cuando hay
un adjunto; el micrófono de [mensajes de voz](voice.md) lo reemplaza solo cuando
el compositor está vacío. Los envíos fallidos conservan borrador y adjunto, incluido
el identificador de solicitud para resultados de red inciertos. Las imágenes
cargan automáticamente como miniaturas de hasta 260 puntos de ancho y 360 de alto,
conservando la imagen completa ajustada a su relación de aspecto: toda la composición
permanece visible sin distorsión ni bordes recortados. Los marcadores de carga y
reintento conservan una disposición cuadrada. Se aplica a vistas optimistas y
mensajes guardados, con o sin pie. Si se envía texto, el pie aparece debajo de la
imagen dentro de la misma burbuja saliente. Los pies comparten la disposición de
mensajes de texto: un texto corto de una línea conserva hora y comprobaciones de
recibo en esa línea; uno largo o de varias líneas los pone debajo. Los mensajes
solo de imagen conservan la superposición de metadatos.

Las imágenes usan un contorno redondeado con una punta integrada abajo a la derecha
para mensajes salientes o abajo a la izquierda para entrantes de grupo, del color
de la burbuja, sustituyendo al círculo decorativo. Un borde de 2 puntos del mismo
color rodea la imagen, también con pie. La punta tiene un extremo redondeado. La
imagen tiene sus propias esquinas de 16 puntos (menores que la burbuja de 20),
dentro de un marco de 2 puntos del color de burbuja. Con pie, las dos esquinas
inferiores usan radio mínimo de 2 puntos donde se unen al texto. Se alinean al
mismo borde final que las burbujas salientes de texto. En mensajes solo de imagen,
una insignia oscura abajo a la derecha muestra hora y las mismas comprobaciones
de aceptación del servidor/lectura del agente que el texto. Usan `readAt` persistido,
permanecen atenuadas en cola y no certifican lectura humana ni entrega APNs. Pulsa
una imagen para abrir un visor negro a pantalla completa con pellizco/desplazamiento,
zoom con doble toque y Cerrar. Arrastra hacia abajo con zoom predeterminado para
cerrar: la imagen sigue el dedo y se cierra después de un arrastre suficiente o
un deslizamiento corto y rápido. Arrastres cortos o cancelados la devuelven a su
posición. Con zoom ampliado, arrastrar sigue desplazando la imagen; reduce el zoom
antes de deslizar para cerrar. Los documentos siguen abriéndose en Quick Look
nativo. Los fallos de carga muestran controles de reintento; la carga a pantalla
completa también permite reintentar y cerrar.

Los [stickers](stickers.md) son adjuntos de imagen con un marcador
`sticker: { id, emoji }`: se muestran como imagen transparente sin burbuja
([web](stickers.md#web)), cargan mediante la misma caché privada y nunca aparecen
en **Compartido en este chat**.

## Arrastrar y soltar

Ambos clientes aceptan una imagen o PDF arrastrado a un chat privado o grupo abierto,
con los mismos tipos, límite de 5 MB y estado habilitado que el clip (no durante
carga, indisponibilidad, vaciado, envío de un mensaje bloqueante, preparación de
otro adjunto o grabación de voz). El archivo se vuelve borrador para revisar antes
de enviar; soltar no envía nada.

- **Web** (`ChatComposer`): suelta en cualquier parte de la página del chat, por
  ejemplo desde Finder. Una superposición discontinua «Suelta para adjuntar» cubre
  la ventana mientras hay archivos encima. Se intercepta todo archivo soltado
  para que el navegador nunca lo abra en lugar del chat; se ignoran mientras un
  diálogo (selector de stickers, visor de imágenes) está abierto. Pueden soltarse
  varios archivos, hasta los 10 adjuntos del compositor; los no compatibles muestran
  el aviso habitual de tipo/tamaño y se conservan los demás. Arrastrar texto mantiene
  el comportamiento predeterminado del navegador.
- **iOS/iPadOS** (`ChatView`, `GroupChatView` mediante `DraftAttachment.load(dropped:)`):
  suelta desde Archivos u otra app en multitarea de iPad, o desde Finder al ejecutar
  la app de iPad en un Mac con Apple silicon. Un mensaje lleva un adjunto, así que
  se usa el primer elemento compatible, reemplazando al borrador actual como Elegir
  archivo, e ignorando los demás. El archivo del proveedor se copia a una carpeta
  temporal privada, se valida y se elimina.

Aún sin verificar (solo comprobaciones estáticas): soltar desde Finder en Chrome,
Safari y Firefox, parpadeo de superposición sobre burbujas en Safari, soltar en
grupo, soltar desde Archivos en iPad y la app de iPad en Mac.

## Formatos y límites

Esta implementación acepta JPEG, PNG, GIF, WebP y PDF, hasta 5 MiB por archivo.
Son límites de la app, menores que los del proveedor Meta. El selector de Archivos
conserva bytes; Fototeca convierte a JPEG con lado largo máximo de 2048 puntos
renderizado a escala 1 y fondo blanco para la transparencia. La representación de
foto seleccionada también debe caber en 5 MiB antes de convertir. No se ofrecen
captura de cámara, varios adjuntos, documentos Word/Excel, video ni entrada de
archivos de audio. Los [mensajes de voz](voice.md) grabados usan un campo de cuerpo
`voice` separado, no adjuntos. Los [stickers](stickers.md) se envían con un campo
`sticker: { id }` separado; el servidor almacena una copia PNG como adjunto ordinario
con `sticker: { id, emoji }`, para que historial, rutas de adjuntos y caché funcionen
como fotos, pero los clientes lo dibujan sin burbuja, no abren el visor de fotos
y lo excluyen de **Compartido en este chat**.

La API valida base64, lista permitida MIME, firmas de archivo, nombre y tamaño
antes de almacenar; es validación de formato, no análisis de malware ni un parser
completo. El modelo puede rechazar contenido mal formado aunque su firma sea
válida. El manejo de PDF de Meta incluye texto de las primeras 100 páginas y
contenido visual de las primeras 50; documentos mayores son parciales. Consulta
[manejo de archivos de Meta](https://dev.meta.ai/docs/file-handling) y
[comprensión de imágenes](https://dev.meta.ai/docs/image-understanding).

## API y almacenamiento

`POST /api/v1/contacts/:id/chat/turns` acepta los campos existentes y
`attachment: { name, mimeType, data }` opcional, donde `data` es base64 estándar.
`text` vacío solo es válido con adjunto. El JSON total se limita a 7 MiB + 32 KiB;
los bytes decodificados deben caber en 5 MiB. Omite `attachment` para envíos solo
de texto. Usa el mismo UUID y contenido para recuperar un envío incierto. Los
reintentos idénticos devuelven el turno existente; distinto texto o metadatos/digest
del archivo devuelven 409.

Las respuestas de turno incluyen `attachment: { name, mimeType, size }` opcional,
sin clave de objeto ni bytes base64. `GET /api/v1/contacts/:id/chat/turns/:turnID/attachment`
requiere la sesión bearer del propietario y devuelve bytes privados no cacheables
con disposición de adjunto. No hay URLs públicas ni accesibles para obtención del
proveedor. Miniaturas e imágenes completas comparten la
[caché de imágenes recientes](caching.md#recent-chat-images-and-avatars) por cuenta:
miniaturas decodificadas en memoria y originales protegidos en disco, con límite
de 64 MiB por cuenta y caducidad tras siete días de inactividad en disco. Las
imágenes recientes en caché sobreviven navegación y reinicios de app después de
restaurar la sesión. Un acierto a pantalla completa reutiliza el original sin
descargar; un fallo necesita acceso de red autenticado. Las imágenes salientes
aceptadas alimentan la caché; las vistas optimistas no aceptadas siguen como estado
local de vista. La decodificación ocurre fuera del actor principal con reducción
ImageIO (miniaturas de 520 píxeles, hasta 4096 en el visor completo); se aplica
orientación. Las animadas muestran su primer fotograma. Quick Look usa un archivo
temporal protegido eliminado al cerrar o salir de la vista; archivos abandonados
por un fallo de proceso pueden quedar en el directorio temporal del SO hasta su limpieza.

La migración `0012_chat_attachments.sql` añade metadatos de turno y un registro
duradero de objetos. Los bytes usan el binding R2 privado existente `CONTACT_PHOTOS`
bajo un prefijo `attachments/` separado. Cada solicitud escribe un objeto inmutable
nuevo antes de aceptar atómicamente el turno en D1. El registro sigue las cargas
aunque falle la aceptación. El Cron de cada minuto elimina hasta 20 objetos sin
referencia mayores de 24 horas por invocación, incluidos archivos tras eliminar
contactos. Los referenciados se conservan con la conversación. Eliminar un contacto
revoca el acceso inmediatamente; la limpieza física R2 se difiere. Los fallos de
limpieza se reintentan en invocaciones Cron posteriores.

El Workflow lee el archivo de R2 y envía un bloque en línea `image_url` o `file`
a Meta Chat Completions sin añadir almacenamiento en Files API del proveedor.
Incluye como máximo un archivo por solicitud de modelo: el actual o el adjunto
más reciente dentro del presupuesto existente de ocho turnos/12 KB para preguntas
posteriores. Los demás archivos históricos se representan solo por nombre. La
búsqueda y extracción de memoria usan texto de mensajes; no indexan, extraen ni
recuerdan bytes de adjuntos. Un mensaje solo con adjunto usa un prompt neutral de
descripción/resumen para inferencia. Las instrucciones embebidas no autorizan
herramientas de programación ni reemplazan reglas del sistema.

Los archivos enviados a inferencia usan el modelo Meta configurado y su política
de datos. La configuración Contributor del propietario también se aplica a
adjuntos; esta función no concede consentimiento nuevo ni autoriza subir datos
privados de otras personas.

## Configuración y verificación

No hacen falta servicios, secretos ni permisos públicos de bucket adicionales.
Sigue [infraestructura](infrastructure.md) para aprovisionar D1 y el bucket R2
privado existente en una cuenta independiente. Aplica 0012 localmente con el
comando normal de migración. La migración/release de producción debe pasar por
commit, push y pipeline automático; instala la app iOS actualizada por separado.

Verifica con archivos ficticios: formatos compatibles, envíos solo adjunto/texto
más archivo, quitar/reemplazar, archivos inválidos o grandes, reintento sin conexión
sin turno duplicado, imágenes en línea, apertura/zoom/rotación/cierre a pantalla
completa, reintento de imagen tras fallo de red, Quick Look, una pregunta posterior
y denegación desde otra cuenta. Confirma que eliminar bloquea de inmediato la
descarga y Cron limpia R2 después. El agente no ejecutó estas comprobaciones de
extremo a extremo ni inferencia real de archivos de Meta.

El esquema es aditivo. Los clientes antiguos leen respuestas de turnos pero no
muestran ni envían adjuntos. Al revertir código, conserva 0012, el registro y los
objetos R2; eliminar metadatos pierde referencias. Restaura código compatible y
limpieza Cron antes de considerar eliminar datos.

## Acceso a contactos compartidos

Los adjuntos siguen siendo privados de la conversación del participante aunque
su agente sea compartido. La recuperación de memoria compartida no expone bytes,
historial ni endpoints de adjuntos de otros participantes. Los miembros nuevos
empiezan con historial vacío. Consulta [compartición](sharing.md).

## Adjuntos de grupos

Los mensajes de grupo usan los mismos formatos, validación de 5 MiB, bucket
privado, registro de objetos, vistas previas y caché de imágenes. Descargar exige
pertenencia actual al grupo; el historial omite claves de objeto. Cron conserva
objetos referenciados por turnos privados o mensajes de grupo. Cada contacto puede
analizar el archivo actual (o el de grupo más reciente apto) dentro de su turno
exclusivo de atención. Consulta [medios de grupo](groups.md#group-photos-attachments-and-voice)
para rutas, consentimiento del origen, visibilidad y limpieza.

Las imágenes generadas por contactos usan el mismo registro privado R2 y límite
de 5 MB. Las de grupo son mensajes ordinarios; los adjuntos privados del asistente
están en los metadatos entregados y usan el endpoint con comprobación de propiedad
y `?side=assistant`. La UI entrante de imagen/pie, citas y cachés coincide en iOS y
web. Consulta [imágenes generadas](generated-images.md).

Un [álbum](generated-images.md#albums) generado (dos o tres imágenes en un mensaje)
conserva `attachment` como primera imagen y añade `attachments` con todas.
`GET /api/v1/contacts/:id/chat/turns/:turn/attachment?side=assistant&image=N` y
`GET /api/v1/groups/:id/messages/:message/attachment?image=N` devuelven la imagen N
(0–2); sin `image` devuelven la primera o única como antes. Las cargas humanas
siguen siendo adjuntos únicos. Citar un álbum lo muestra como foto (su primera imagen).

## Compartido en este chat

Los detalles muestran una sección **Compartido en este chat** de estilo WhatsApp
con dos pestañas: **Multimedia** (cuadrícula de tres columnas de miniaturas
cuadradas) y **Documentos** (archivos con nombre, tamaño, remitente en grupos y
fecha). En iOS es una sección de detalles de contacto (**Editar contacto**/**Contacto**)
y grupo con selector segmentado; en web es la misma sección en `/contacts/:id/edit`
y `/groups/:id/members`. Pulsar una miniatura abre el visor completo; un archivo
se abre igual que en chat (Quick Look en iOS, pestaña blob temporal en web). Los
privados muestran tus adjuntos y las imágenes generadas del contacto, pero solo
del chat privado propio con él. Los grupos muestran adjuntos de todos los miembros
en el historial. Documentos enumera primero los [documentos Markdown](documents.md)
del chat con **Nuevo documento**, y luego los archivos compartidos.

| Método | Ruta | Comportamiento |
| --- | --- | --- |
| GET | `/api/v1/contacts/:id/chat/media?kind=image\|file&before=` | Más nuevos primero, de ambos lados; `side` es `user` o `assistant` |
| GET | `/api/v1/groups/:id/media?kind=image\|file&before=` | Más nuevos primero, con `senderName`, `userID`, `agentID`; exige pertenencia |

Una página cubre hasta 30 mensajes de imágenes y 60 de archivos. Cada elemento
tiene `messageID`, `sequence`, `createdAt`, `name`, `mimeType` y `size`. Cada imagen
de un álbum generado es un elemento separado con índice `image` (0–2) para la
consulta `image` de la ruta; los adjuntos únicos lo omiten. La página sigue contando
mensajes, de modo que una de álbumes puede tener más de 30 elementos. `nextBefore`
es el cursor de secuencia siguiente o `null`. Se reutilizan las rutas de descarga,
así que las miniaturas comparten las claves de caché de chat y no descargan bytes
dos veces. Sin migración: las consultas usan índices históricos existentes
`(contact_id, sequence)` y `(group_id, sequence)` y filtran el tipo MIME almacenado.
Consulta [caché](caching.md#chat-details-media).

Ancho de banda y memoria: no hay endpoint de miniaturas, así que la cuadrícula
descarga originales (hasta 5 MB cada uno) por cada página visible; por eso se
limitan a 30 mensajes. Web carga las imágenes de cada página al renderizar; iOS
las carga al aparecer las celdas dentro de una fila de formulario, así que podría
cargar toda la página a la vez. Los bytes van a las cachés acotadas existentes
([imágenes recientes](caching.md#recent-chat-images-and-avatars)). Un servidor de
miniaturas reduciría esto y no está implementado.

Validación: TypeScript de API y web y comprobación completa de tipos Swift para
simulador de iOS. Aún no comprobado en navegador/dispositivo: cuadrícula en pantallas
estrechas, paginación, apertura desde detalles e invalidación tras dejar un grupo.

La generación usa avatares actuales para selfies solicitadas y miembros nombrados,
y puede recuperar fotos enviadas por personas o contactos en este mismo chat como
referencias de escena/edición. Las descripciones visuales internas son solo de
servidor y no aparecen en pies, historial público ni cuadrículas. iOS y web usan
la API compartida y el visor/caché de imágenes entregadas existente; no cambian
formatos del cliente. Consulta [referencias y descripciones](generated-images.md#internal-image-descriptions-and-retrieval)
para alcance, indexado diferido de historial antiguo, límites, retención y verificación.

## Limpieza del historial

[Vaciar/eliminar](chat-lifecycle.md) registra claves inmutables de imágenes/PDF/voz
y medios generados para eliminarlas de R2 de forma duradera, con un barrido final
diferido para cargas en vuelo. Se invalidan índices de origen y cachés de medios,
imágenes y audio de clientes. Archivar conserva archivos. Sigue pendiente verificar
fallos y reintentos de R2 en vivo.
