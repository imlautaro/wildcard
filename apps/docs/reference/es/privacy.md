# Privacidad: qué pueden compartir los contactos y dónde

Esta guía es la referencia única sobre cómo se mueve la información entre chats privados,
contactos compartidos, grupos, contactos vinculados y Para ti. Cubre la auditoría del
2026-11-01, las reglas que aplica la API, los dos controles de usuario y cómo se
verificaron. Las guías de funciones conservan sus detalles; esta página explica cómo se relacionan.

## Las reglas en una pantalla

Un contacto nunca comparte una conversación completa. Comparte **hechos** que extrajo
(`contact_memory`, `group_memory`, cada uno con una cita de origen), además de lo que una persona
le pide explícitamente enviar o publicar. Las transcripciones sin procesar, archivos y programaciones solo cruzan los
límites de un chat mediante una concesión explícita por grupo ("Hablar de mis chats privados").

| Qué | Audiencia predeterminada | Nunca llega a |
| --- | --- | --- |
| Hechos de tu chat privado con el contacto X | Tus chats con X; grupos donde **tú** y X son miembros; chats privados de personas con quienes compartes X | Grupos en los que no estás; tus otros contactos (salvo con "Los contactos comparten entre sí"); Para ti cuando el chat es privado |
| Hechos de lo que dijiste en el grupo G | El propio G; chats privados con X de personas que son miembros de G (desde cuando podían leer) | Otros grupos; chats privados de personas fuera de G |
| Tus mensajes privados sin procesar | Solo tu chat | Cualquier otro lugar, salvo que concedas a un contacto en un grupo "Hablar de mis chats privados" |
| Chats de conectores (MCP) y sus hechos | Solo ese chat | Grupos, participantes compartidos, contactos vinculados, Para ti |
| Tarjetas y comentarios de Para ti | Solo tú | Otras personas |

Dos controles cambian esto, ambos en iOS y la web:

- **Mantener este chat privado** (detalles del contacto, por persona y contacto, desactivado por defecto).
  Tus hechos de ese chat permanecen allí: no aparecen en grupos, chats de otros participantes
  con un contacto compartido, ni se reúnen con los de tus otros contactos ni llegan a Para ti. El chat
  no puede vincularse ni autorizarse con "Hablar de mis chats privados" (activarlo
  elimina concesiones existentes). Cada participante de un contacto compartido decide sobre su propio chat.
- **Los contactos comparten entre sí** (cuenta → Privacidad, desactivado por defecto). En tus chats
  privados, cada contacto puede recordar lo que contaste a tus otros contactos y preguntarles
  (`ask_linked_contact` / `tell_linked_contact`), como si todos los pares estuvieran vinculados. Reúne
  solo **tus propios** hechos y solo en **tus chats privados**. Los grupos y otras personas no ven
  nada nuevo. Los chats privados mediante el control anterior y los chats de conectores no aportan ni reciben.

Cuenta → Privacidad → **Cómo funciona la privacidad** muestra las mismas reglas en lenguaje simple.

Estos ajustes no bloquean las acciones que una persona pide explícitamente: publicar en un grupo
(`send_group_message`), retransmitir a un participante de un contacto compartido (`send_private_message`),
programar para otro participante o añadir un tema a Para ti. La persona lo decidió.

## Auditoría (2026-11-01)

Cada fila es un escenario que permite el producto, qué fluye, la protección en el código y el resultado.
Las filas "Corregido" eran fugas reales antes de este cambio; los tests de regresión las cubren.

| # | Escenario | Qué puede fluir | Protección | Estado |
| --- | --- | --- | --- | --- |
| 1 | Contacto A ↔ contacto B de la misma persona (privado) | Nada por defecto. Con vínculo o "Los contactos comparten entre sí": hechos y respuestas bajo demanda | Rama de agrupación de `readMemories` (`chat/memory.ts` `memoryAudience`), `readLinks` (`contacts/links.ts`) | Por diseño; nueva opción voluntaria |
| 2 | Contacto compartido X: propietario U ↔ participante V | Hechos de U en el chat de V y viceversa (consentidos al invitar/aceptar). Nunca transcripciones, archivos ni programaciones | Rama del mismo agente de `readMemories`; `keep_private` por participante | Por diseño; ahora controlable por persona |
| 3 | Hechos privados de V en un grupo donde V **no** está (U añadió X al grupo G2) | Antes: sí, los hechos de todos los participantes llegaban a cualquier grupo con X | `readMemories` con `groupID`: el origen debe ser miembro de ese grupo | **Corregido** |
| 4 | Hechos del grupo G2 en el chat privado de V con X compartido (V no está en G2) | Antes: sí | `groupMemories(..., { readerID })` requiere pertenencia del lector e inicio permitido del historial | **Corregido** |
| 5 | Hechos del grupo G1 en el grupo G2 (X en ambos) | Antes: sí, incluido `search_group_memories` | `groupMemories(..., { groupID })` | **Corregido** |
| 6 | Tus hechos privados en un grupo donde estás | Sí, salvo que ese chat sea privado. Texto sin procesar solo con "Hablar de mis chats privados" | `readMemories` + `groups/private-sharing.ts` | Por diseño; ahora controlable |
| 7 | Lo que dijiste en un grupo, en tu chat privado con X | Sí (estabas allí) | Pertenencia del lector en `groupMemories` | Por diseño |
| 8 | Historial de grupo sin procesar en un chat privado | Solo grupos donde están tú y X, desde tu inicio permitido del historial | `groups/retrieval.ts` (`sharedGroups`, `searchGroupMessages`) | Por diseño (verificado sin cambios) |
| 9 | Grupo → mensaje privado (`message_privately`) | Un mensaje a un miembro que ya tiene un chat con X; no se consultan recuerdos privados | `groups/private-messages.ts` | Por diseño |
| 10 | Privado → publicación de grupo (`send_group_message`, `ask_agent_in_group`) | Solo a solicitud explícita de la persona, autorizada por separado | `docs/group-requests.md` | Por diseño |
| 11 | Retransmisión a un participante de un contacto compartido | Solo el texto/imagen solicitado, a petición explícita | `chat/private-relay.ts` | Por diseño |
| 12 | Contactos vinculados | El contacto vinculado responde desde sus hechos sobre esta persona, su chat con ella y grupos donde están ambos | `contacts/links.ts`; chats privados excluidos | Por diseño; ahora se excluyen chats privados |
| 13 | Para ti | Solo filas propias de la persona (`home/signals.ts`), nunca hechos de otras personas; visible solo para ella | `readSignals`; excluye chats privados y de conectores; las revisiones omiten chats privados (`home/review.ts`) | Por diseño; ahora se excluyen chats privados |
| 14 | Comentarios de Para ti → chat privado | Solo comentarios en publicaciones escritas por ese mismo contacto | `home/comments.ts` `updatesDiscussion` | Por diseño |
| 15 | Memoria propia del agente (personalidad) | Preferencias propias del contacto entre todas sus audiencias | `chat/agent-memory.ts`; la extracción excluye hechos humanos | Riesgo residual (ver abajo) |
| 16 | Continuidad de personalidad/relación | Solo tono, nunca causas ni hechos | Instrucciones de `personality/director.ts` | Por diseño |
| 17 | Aprendizaje de conversación | Por audiencia; nunca se exporta | `chat/learning.ts` | Por diseño |
| 18 | Resultados de investigación web | Solo la misma conversación | `research/context.ts` | Por diseño |
| 19 | Fotos y búsqueda de imágenes | Solo la misma conversación | `photos/chat-images.ts` | Por diseño; la búsqueda de grupo ignora el inicio de historial permitido de un contacto (menor, pendiente) |
| 20 | Chats de conectores (MCP) | Solo memoria local; excluida de uso compartido, vínculos, grupos y Para ti | Comprobaciones `mcp_private_contact` / `mcp_private_group` | Por diseño |
| 21 | Historial de grupos para incorporaciones tardías | Legible desde la incorporación salvo "Puede ver mensajes anteriores" | `groups/history-access.ts` | Por diseño |
| 22 | Exportación de chat/depuración | Solo lo que esa cuenta puede leer (chat propio; pertenencia al grupo e inicio permitido de historial) | `chat/export.ts` (un cambio paralelo sin commit), `routes/debug-export.ts` | Por diseño |

### Riesgos residuales y asuntos abiertos

- **La memoria de personalidad se comparte entre audiencias.** Las preferencias propias de un contacto (por ejemplo,
  "mi color favorito es azul") lo acompañan a cada chat y grupo. La extracción recibe instrucciones de
  excluir hechos humanos, secretos y valoraciones de relaciones, pero depende del modelo y
  puede fallar. Un chat privado no traslada la memoria de personalidad a un store local (los chats de conectores sí).
- **Los hechos los extrae el modelo.** Un hecho puede estar redactado con un alcance más amplio que la cita de origen.
  La cita de origen lo acompaña.
- **Las respuestas ya enviadas no se retiran.** Cambiar un ajuste afecta la siguiente lectura; no
  retira mensajes, notificaciones ni solicitudes al proveedor que ya ocurrieron.
- **`memory_shared` permanece activo** una vez que un contacto se compartió o añadió a un grupo. Con estas reglas
  ya no expone nada por sí mismo (cada lectura comprueba además la audiencia), por lo que se deja
  como está.
- **La búsqueda de imágenes de grupo** (`search_chat_images` en un grupo) no aplica el límite del contacto
  "añadido sin mensajes anteriores". Menor; no se cambia aquí.

## API

| Método | Ruta | Cuerpo | Respuesta |
| --- | --- | --- | --- |
| PUT | `/api/v1/me/privacy` | `{ "contactsShare": boolean }` | `{ user }` con `contactsShare` |
| PUT | `/api/v1/contacts/:id/privacy` | `{ "keepPrivate": boolean }` | `{ contact }` con `keepPrivate` (0/1) |

`GET /me` y todas las respuestas de contactos incluyen los campos. `GET /contacts/:id/links` añade
`allContacts` (true mientras "Los contactos comparten entre sí" está activo); sus `links` enumeran solo
los vínculos explícitos, que permanecen si se desactiva el ajuste. Solo pueden cambiar
las filas propias de la sesión; el ID de contacto de otro participante devuelve 404.

La migración `0093_privacy_controls.sql` añade `user.contacts_share` y `contact.keep_private`
(ambos `0`), más un trigger que elimina las concesiones `group_private_sharing` del chat cuando
se vuelve privado (el trigger de eliminación existente completa respuestas de grupo pendientes). Las cuentas
existentes conservan el comportamiento actual salvo las tres fugas corregidas.

## Clientes y caché

- **Web**: Cuenta → Privacidad (interruptor + hoja "Cómo funciona la privacidad"), detalles del contacto →
  "Mantener este chat privado", un aviso en Contactos vinculados y la hoja "Hablar de mis chats privados"
  explica por qué no está disponible un contacto. `useSession.savePrivacy` y
  `useChats.setKeepPrivate` aplican la respuesta del servidor y descartan todas las instantáneas de contactos
  vinculados (`invalidateContactLinks`).
- **iOS**: las mismas filas en `AccountView` (`PrivacyGuide.swift` contiene el texto compartido) y
  `ContactEditorView`; `ContactsStore.setKeepPrivate` y el interruptor de cuenta borran
  `linkSnapshots`. Los detalles de grupo revalidan en segundo plano como antes; los interruptores en caché
  nunca autorizan nada.
- Los textos de consentimiento para creación de grupos, invitaciones, añadir contactos e invitaciones de
  contactos compartidos describen ahora estas reglas.

## Verificación

- `npm run test:memory-isolation` (apps/api, D1 local de workerd, datos ficticios): 7 tests,
  incluidos cuatro nuevos: un grupo solo recibe hechos de sus miembros y recuerdos de su propio grupo;
  un chat privado solo recuerda grupos a los que pertenece su persona; "Mantener este chat privado" (ruta API,
  trigger, otro participante, grupos, volver a desactivarlo); "Los contactos comparten entre sí"
  (agrupación, atribución, vínculos implícitos, sin llegar a grupos ni otras personas, con exclusión de chats privados y
  de conectores). Revertir el ámbito de memoria de grupo hace fallar los dos primeros con
  mensajes `LEAK:`; revertir solo la comprobación de pertenencia al grupo en `readMemories` hace fallar el primero
  con el hecho del miembro del contacto compartido.
- `npm run test:lifecycle`: 48 de 48. Pasan TypeScript de API, `typecheck:lifecycle`, web
  `npm run typecheck` y el `swiftc -typecheck` estático de iOS.
- No verificado: comportamiento del modelo en vivo (si un contacto expresa bien hechos agrupados, si
  ofrece hechos de grupos en los chats adecuados), representación de las filas nuevas en dispositivo/navegador.
