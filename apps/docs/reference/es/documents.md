# Documentos del chat

Los contactos y las personas pueden mantener **documentos Markdown** en cualquier
chat: planes, informes, notas y borradores. En un chat privado pertenecen al chat
de ese participante con el contacto; en un grupo cada miembro y contacto del grupo
puede leerlos y editarlos, por lo que varios contactos pueden escribir juntos un
documento. Los documentos se abren a pantalla completa como las miniapps, con un
visor Markdown y un editor.

La [investigación web](web-research.md) crea informes con fuentes en estos mismos
documentos cuando se solicita un entregable duradero. La investigación de contexto
conversacional utiliza sus hallazgos directamente en el chat y no crea un documento
ni una tarjeta. Ambos clientes etiquetan la tarjeta **Investigación web** y ofrecen
un panel de fuentes desplegable con la pregunta, la fecha de comprobación y los
enlaces citados/recuperados. La procedencia corresponde a la revisión 1 y sobrevive
a las ediciones posteriores. Los documentos existentes tienen `research: null`;
las APIs anteriores pueden omitirlo y ambos clientes lo aceptan. Actualizar nunca
inicia una búsqueda. Eliminar borra la procedencia e impide que el recibo de
investigación vuelva a crear el informe.

Esta es una primera implementación. Todavía no se han verificado la calidad de
redacción del modelo, la edición simultánea por varios contactos ni la presentación
en dispositivo/navegador.

## Uso

- **Pídelo en el chat**: «Redacta el plan del viaje como documento», «Ana y Leo,
  preparen juntos el borrador del informe». El contacto llama a `create_document`;
  aparece una tarjeta dentro de su burbuja de respuesta, como parte del mensaje de
  ese contacto (chats privados y grupos; en iOS, una respuesta con foto la conserva
  justo debajo de la foto, donde la burbuja de imagen no tiene espacio), y abre el
  documento.
- **Detalles del chat → Compartido en este chat → Documentos** muestra primero los
  documentos del chat y luego los archivos compartidos, con **Nuevo documento**.
- El visor muestra Markdown (encabezados, listas, citas, código, tablas y enlaces)
  con el mismo renderizador seguro de los mensajes: sin HTML en bruto ni imágenes
  remotas. Muestra la revisión, quién lo actualizó por última vez y las revisiones
  recientes con sus resúmenes. Se actualiza cada cinco segundos mientras está
  abierto, porque los contactos pueden estar editándolo.
- **Editar** (lápiz en web, menú ⋯ en iOS) abre un campo de título y un editor
  Markdown con un selector **Escribir/Vista previa** y un resumen opcional del
  cambio. **Eliminar** borra el documento y sus revisiones para todos en el chat.

## Colaboración y conflictos

Cada guardado compara e intercambia `revision` y almacena una revisión atribuida
(se conservan las últimas 50). Las personas guardan contra la revisión con la que
empezaron a editar; si alguien guardó primero, el editor muestra quién y ofrece
**Usar su versión** (descartar mi borrador) o **Conservar la mía** (sobrescribirla).
No se fusiona nada en silencio.

Se indica a los contactos que primero usen `read_document` y prefieran
`edit_document` con pequeños cambios `find`/`replace`. Se aplican al texto más
reciente, de modo que dos contactos que editan partes distintas conservan ambos
su trabajo; una edición cuyo texto `find` no existe o es ambiguo se rechaza con un
mensaje para volver a cargar. Una reescritura completa (`markdown` más
`baseRevision`) falla si el documento ha cambiado.

## Trabajo proactivo

Los documentos no tienen un bucle propio. La escritura continua pasa por las
[listas de tareas](tasks.md): las tareas enlazan el documento con `documentID`
(migración 0058; las tareas anteriores aún pueden llevarlo en notas), de modo que
la persona o contacto asignado edita ese documento en sus turnos de trabajo,
cuando terminan sus requisitos y durante revisiones periódicas. Quienes revisan
pueden devolver una tarea con `request_changes`, como máximo dos veces por tarea;
consulta [colaboración](tasks.md#collaboration-deliverables-and-bounded-reviews-0058).
Por ejemplo, «Leo: esquema» bloquea «Ana: escribir el borrador», que bloquea
«Leo: revisar».

## Herramientas del modelo

Se ofrecen con las herramientas de tareas: en cada turno humano privado o de
trabajo de tarea y en la fase de evidencia de cada borrador inicial de grupo.

| Herramienta | Efecto |
| --- | --- |
| `list_documents` | IDs, títulos, revisión, tamaño y último editor |
| `read_document` | Hasta 12,000 caracteres desde `offset`, más los resúmenes de revisiones recientes |
| `create_document` | Título y Markdown; la tarjeta aparece dentro de esta respuesta |
| `edit_document` | `edits: [{find, replace}]` (hasta 20) o `markdown` con `baseRevision`; `title` opcional; `summary` obligatorio |

Las mutaciones almacenan recibos en `document_mutation`, con clave por turno
(o respuesta de grupo) y llamada, para que los pasos de Workflow repetidos nunca
se apliquen dos veces. El índice de documentos del chat forma parte del contexto
del sistema. El texto del documento se trata como datos no confiables.

Límites: 30 documentos por chat, títulos de hasta 200 caracteres y cuerpos de
hasta 100,000 caracteres. Una llamada a herramienta del contacto lleva como máximo
30 KB de argumentos y las rondas de investigación de grupo generan como máximo
4,096 tokens, por lo que los contactos escriben documentos largos en varias ediciones.

## API

Autenticada con bearer, `no-store`. Privada: `/api/v1/contacts/:id/documents` (tu
propio chat con ese contacto). Grupo: `/api/v1/groups/:id/documents` (miembros;
cuerpos de solicitud de 256 KB). Las escrituras se limitan a 60 por cuenta por minuto.

| Método | Ruta | Comportamiento |
| --- | --- | --- |
| GET | `/` | Hasta 30 resúmenes: título, revisión, vista previa, `sourceID`, último editor |
| GET | `/:documentID` | Markdown completo y las últimas 20 revisiones |
| POST | `/` | `{ id (UUID), title, body? }` → `{ document }` (201) |
| PUT | `/:documentID` | `{ baseRevision, title?, body?, summary? }`; 409 con el `document` actual si quedó desactualizado |
| DELETE | `/:documentID` | Elimina el documento y sus revisiones (204) |

## Almacenamiento y caché

La migración `0047_documents.sql` añade `chat_document`, `chat_document_revision`
y `document_mutation`. Consulta [infraestructura](infrastructure.md#chat-documents-migration-0047)
y [caché](caching.md#chat-documents).

## Verificación

Solo estática: TypeScript de API/web, comprobación completa de tipos Swift para
el simulador de iOS y preparación SQL de 38 sentencias de documentos capturadas
contra todas las migraciones con el límite de profundidad de expresiones de D1.
Sin verificar: comportamiento del modelo, ediciones simultáneas de contactos,
manejo de conflictos en ambos editores, tarjetas dentro de respuestas de grupo y
visualización en un dispositivo o navegador.

## Vaciar el chat que los contiene

El [ciclo de vida del chat](chat-lifecycle.md) elimina los documentos del chat y
todas sus revisiones junto con los recibos de mutaciones y las tarjetas de origen.
Ambos clientes invalidan las cachés de documentos. Archivar conserva los documentos
y la edición colaborativa.
