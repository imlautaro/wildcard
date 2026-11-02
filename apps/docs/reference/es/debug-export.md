# Exportación de depuración en JSON

En la web, abre **Mi cuenta → Exportar JSON de depuración → Descargar JSON**. Esta
función exclusiva de la web se solicitó explícitamente para descargas del navegador; iOS no incorpora una nueva
UI de exportación. La descarga nunca llama a un proveedor de IA ni comparte el archivo externamente.

El JSON `wildcard-debug-export` versión 1 contiene identidad/modelo de la cuenta, contactos
e identidad/personalidad de los agentes, todos los turnos privados disponibles y mensajes de
grupos de los que la persona es miembro actual (incluidos chats archivados), intentos/estados/códigos de error de respuestas e
IDs de Workflows, reservas de publicación de grupos, intercambios, recibos y reacciones.
También incluye la memoria factual/retenida local de la persona, estado de aprendizaje e
iniciativa, programaciones, ajustes de consentimiento/aislamiento, comprobaciones de tareas/trabajo/monitores, documentos
y revisiones, recibos/resultados de investigación, definiciones/estado/acciones de miniapps y
uso por persona, y el estado, temas y tarjetas del feed de [Novedades](updates.md).
Los IDs enlazan conjuntos de datos; el texto de usuario/asistente de un turno privado se guarda junto en
`chat_turn`, mientras que los mensajes de grupo y trabajos de respuesta son conjuntos de datos separados. Los campos
`*_json` guardados siguen siendo cadenas JSON; los metadatos multimedia permanecen en esos campos.
Los campos temporales de la base de datos usan milisegundos Unix. Los campos de secuencia ordenan sus
respectivas tablas de mensajes. La exportación incluye recuentos de conjuntos de datos y fechas de inicio/finalización.
Los conjuntos vacíos se incluyen como arreglos vacíos.

Se excluyen datos de autenticación/sesión, credenciales de conectores, chats privados de otras personas,
memoria global del agente, memoria retenida de grupos y dirección de relaciones, contexto nativo
del dispositivo, embeddings, bytes de archivos multimedia, historial eliminado, logs de infraestructura
y solicitudes sin procesar a modelos. Se excluyen los ajustes privados de archivo/aprendizaje de los miembros de grupos;
solo se incluyen los de la persona que exporta.
El texto de las conversaciones, metadatos de adjuntos, documentos y resultados de herramientas pueden
contener información sensible. Revisa el archivo descargado antes de compartirlo con
una IA u otra persona. El archivo es una descarga local sin cifrar administrada por el
navegador y la persona, fuera de la caché de la app. No es un formato de copia de seguridad/restauración.

## Autorización, consistencia y caché

`GET /api/v1/me/debug-export` devuelve un manifiesto, ID de cuenta, nombres de conjuntos de datos y
revisiones actuales del historial de contactos/grupos. `?dataset=<name>&cursor=<rowid>` devuelve
hasta 25 filas incluidas explícitamente en una lista permitida y un `nextCursor` anulable. Los nombres de conjuntos de datos
seleccionan SQL definido por el servidor; el cursor es un entero seguro no negativo validado. Todas
las páginas requieren la sesión bearer existente y vuelven a comprobar la propiedad del contacto o la pertenencia
actual al grupo. No se confía en ningún ID de cuenta ni ámbito suministrado por quien llama. La autenticación
y la cookie httpOnly y el service binding del proxy web existente se mantienen sin cambios.

El cliente recorre las páginas secuencialmente y ensambla un archivo JSON. Retiene hasta
100 MB de partes JSON codificadas en memoria; las copias finales del Blob/navegador pueden aumentar temporalmente
el uso de memoria. Superar ese límite o el fallo de cualquier página descarta la exportación
sin guardar un archivo parcial. No hay un límite silencioso de filas. Cancelar, cerrar la hoja,
navegar fuera de la cuenta/desmontar la vista, la expiración de sesión y el cambio de cuenta cancelan la solicitud,
descartan las partes y rechazan respuestas tardías. Se deduplican los clics simultáneos.
La URL temporal de descarga se revoca después de iniciar la descarga del navegador.

Las exportaciones omiten intencionalmente las cachés de navegación: deben recuperar todo el historial
disponible, incluidas páginas no cargadas, y no deben retener una segunda caché de historial
privado. No hay caché en disco, actualización automática ni reintento en segundo plano. Cada reintento
manual empieza de nuevo; los fallos dejan intactas las cachés ordinarias de conversación.
Antes de guardar, el cliente vuelve a obtener el manifiesto y rechaza cambios en el acceso o
las revisiones de historial. Es una exportación en vivo de varias solicitudes, **no una instantánea atómica de la base
de datos**: los mensajes/estados pueden cambiar durante su ejecución y eliminar o revocar
inmediatamente después de la comprobación final no puede retirar bytes ya descargados.

## Configuración y verificación

Usa D1, autenticación de API y el service binding de API web existentes. No se necesitan
recursos, secretos, migraciones, objetos R2 ni permisos de proveedores nuevos.
Ejecuta API y web localmente como se describe en `web.md`. Publica únicamente mediante código
confirmado, enviado al remoto y despliegues automáticos. La reversión elimina la UI/ruta;
no hay migración de datos que revertir y las descargas existentes siguen siendo independientes.

Verificación estática: comprobaciones de tipos de API/web y preparación de cada consulta de conjunto de datos
contra el esquema completo de migraciones. El comportamiento del navegador/en ejecución sigue sin verificarse.
Con datos ficticios, verifica una conversación privada de más de 25 turnos, un grupo de más de
25 mensajes, chats archivados/vacíos, documentos/tareas vinculados, JSON/recuentos válidos y
que las cuentas no puedan exportar conversaciones privadas ajenas. Comprueba cancelación,
navegación/reapertura, solicitudes fallidas/sin conexión y reintento, error de límite de tamaño, eliminación del grupo/vaciado
del historial durante la exportación, expiración de sesión y cambio de cuenta. Confirma
que las cachés normales de páginas sobrevivan a los fallos de exportación y que no se descargue nada después de cancelar.

Desde la migración 0071, la exportación también incluye el plan de cada respuesta de grupo (`plan_rank`,
`plan_role`, `plan_angle`, `plan_tools`, `draft_ready_at`) y las filas del coordinador `group_round`,
para que un informe muestre a quién se eligió para hablar y por qué otros permanecieron en silencio.
