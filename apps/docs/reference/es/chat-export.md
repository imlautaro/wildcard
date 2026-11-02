# Exportación de chats en JSON

Una persona puede descargar un chat privado o un grupo como una transcripción JSON legible.
En iOS y la web, la acción es **Exportar chat** en la pantalla de detalles del chat
(detalles del contacto o del grupo). Una confirmación explica qué contiene el archivo;
**Exportar JSON** (iOS) o **Descargar JSON** (web) inicia la exportación. La web guarda el archivo
mediante el navegador; iOS abre la hoja para compartir (Guardar en Archivos, AirDrop, Mail…).
No se envía nada a una IA. Esta función es independiente de la
[exportación de depuración](debug-export.md) de toda la cuenta, que conserva filas sin procesar y datos internos para depurar.

## Contenido (formato `wildcard-chat-export`, versión de esquema 1)

```json
{
  "format": "wildcard-chat-export", "schemaVersion": 1, "exportedAt": "2026-11-01T12:00:00.000Z",
  "chat": { "kind": "private", "id": "…", "name": "Ana" },
  "participants": [{ "kind": "user", "id": "…", "name": "Sam" }, { "kind": "contact", "id": "…", "name": "Ana" }],
  "notes": ["Times are ISO 8601 in UTC.", "…"],
  "messageCount": 2,
  "messages": [{
    "id": "…", "turnID": "…", "side": "user", "sentAt": "2026-11-01T11:58:00.000Z",
    "sender": { "kind": "user", "id": "…", "name": "Sam" }, "text": "Hi",
    "voice": null, "attachments": [], "replyTo": null,
    "reactions": [{ "emoji": "❤️", "by": { "kind": "contact", "id": "…", "name": "Ana" } }]
  }]
}
```

- `sender.kind` es `user` (una persona), `contact` (un contacto de IA, por ID de agente) o
  `system` (avisos de pertenencia al grupo, que también llevan `event`).
- Los nombres son los que lee la persona que exporta: se aplican sus alias privados de contactos.
- `voice` es `{ durationMs, transcript }`. El mensaje de voz de un contacto conserva su texto
  como transcripción. La transcripción de voz de una persona solo se incluye después de haberse revelado
  (`voice_transcribed_at`), igual que en las vistas del chat.
- `attachments` enumera `name`, `mimeType`, `size` y, para stickers, `sticker`.
  Nunca se incluyen los bytes de archivos, imágenes ni audio. Los álbumes enumeran todas las imágenes.
- Chats privados: cada turno produce el mensaje de la persona (`side: "user"`, ausente en
  turnos programados, igual que en las vistas del chat) y cada mensaje del contacto (`side: "assistant"`).
  `replyTo` es `{ messageID, side }`, donde `messageID` es un `turnID`. Las reacciones privadas
  apuntan al turno completo de respuesta y aparecen en su primer mensaje del contacto. El mensaje de una persona
  cuya respuesta falló tiene `status: "failed"` (no ocurre con mensajes agrupados que una respuesta posterior
  ya contestó y que las vistas del chat también muestran como completos). Los mensajes se ordenan por hora,
  tal como se muestran, porque una respuesta puede llegar después de un mensaje humano posterior.
- Grupos: mensajes desde el inicio del historial de este miembro, excluidos los mensajes de trabajo de tareas,
  ordenados por secuencia, exactamente como los muestra `GET /groups/:id/messages`. `replyTo`
  es `{ messageID }`. El archivo contiene los mensajes de todos los miembros que esta persona puede
  leer; la confirmación lo indica.
- Se excluyen: campos `*_json` sin procesar, IDs de Workflows, intentos de respuesta/códigos de error, claves
  de almacenamiento, memoria, tareas, documentos, miniapps, programaciones y bytes multimedia. Usa la
  exportación de depuración para los datos internos.

## API, autorización y límites

- `GET /api/v1/contacts/:id/chat/export`: comprobación de propiedad del router del chat privado.
- `GET /api/v1/groups/:id/export`: después del middleware de pertenencia al grupo.

Ambas exportaciones se construyen en `apps/api/src/chat/export.ts` con SQL definido por el servidor. El servidor
lee el historial en páginas de 100 filas por secuencia, más las reacciones de cada página, y devuelve
un documento `application/json`. Devuelve 409 mientras se vacía el chat o
si `history_revision` (o la pertenencia al grupo) cambió durante la exportación, 404 sin
acceso, 413 cuando los mensajes codificados superan los 20 MB (el documento se ensambla en
la memoria del Worker, de modo que los fallos devuelven un estado de error en lugar de un archivo truncado)
y 429 después de 6 exportaciones por cuenta por minuto (`admitAuthRequest`, clave
`chat-export`). Es una lectura en vivo, **no una instantánea atómica**: un mensaje puede
cambiar de estado mientras se ejecuta la exportación.

## Clientes y caché

Las exportaciones omiten las cachés de conversación por diseño: deben incluir historial no cargado y
no deben conservar una segunda copia de conversaciones privadas. No hay actualización automática,
reintento en segundo plano ni caché en disco; cada reintento empieza de nuevo y los fallos dejan intactas
las cachés de conversación.

- **Web** (`useChatExport`, `ChatExportAction.vue` dentro de `ChatLifecycleActions`):
  una exportación a la vez, perteneciente a la sesión; cerrar la hoja, salir de la página de detalles,
  cerrar sesión o cambiar de cuenta cancela la solicitud y descarta respuestas tardías. La
  respuesta se formatea en un Blob, se guarda como
  `wildcard-chat-<name>-<yyyy-mm-dd>.json` y se revoca su URL de objeto.
- **iOS** (`Chat/ChatExport.swift`, filas en `ContactEditorView` y
  `GroupMembersView`): la solicitud usa `AuthStore.withSession` con un tiempo de espera de 120 s,
  descarta respuestas después de cerrar sesión o cambiar de cuenta, valida el JSON, lo formatea
  (con claves ordenadas) y escribe un archivo en `tmp/ChatExports` con protección completa de archivos.
  El archivo se elimina cuando se cierra la hoja para compartir y antes de la siguiente
  exportación. Si se abandona la pantalla durante la exportación, la solicitud termina en segundo plano
  y su archivo permanece en `tmp/ChatExports` hasta la siguiente exportación o hasta que el sistema borra
  los archivos temporales.

## Configuración y verificación

Usa los servicios existentes de D1, autenticación de API, proxy de API web y red de iOS. No requiere
recursos, secretos, migraciones ni permisos nuevos. Publica únicamente mediante código
confirmado y enviado al remoto y despliegues automáticos; la reversión elimina las rutas y la UI sin datos
que migrar.

Verificado estáticamente el 2026-11-01: comprobaciones de tipos de API y web, `swiftc
-typecheck` de iOS y `EXPLAIN` de cada consulta de exportación en D1 local de workerd con todas
las migraciones aplicadas. Aún no verificado en ejecución (navegador o dispositivo): con datos
ficticios, exportar un chat privado de más de 100 turnos (varias páginas, idealmente miles) con voz, imágenes, un álbum, un sticker,
respuestas, reacciones y un turno programado; un grupo con avisos de pertenencia, un miembro
que se unió sin historial y trabajo de tareas; un chat vacío; un chat archivado. Comprobar
el 409 durante el vaciado, 413 en un chat muy grande, 429 tras exportaciones repetidas, cancelación
en web, salida de la pantalla, cierre de sesión durante la exportación, destinos de la hoja para compartir de iOS y
que el archivo temporal se elimine después de cerrar la hoja.
