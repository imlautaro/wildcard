# Validación de regresión del ciclo de vida

El 29 de octubre de 2026, `npm run test:lifecycle` pasó **38 tests, cero fallos**.
`npm run typecheck:lifecycle` también pasó para la aplicación y el Worker de fixtures.
La suite usa las rutas reales de Hono, sesiones ficticias firmadas, todas las migraciones D1
ordenadas y el código real de limpieza/despacho/memoria dentro de workerd local mediante
Miniflare. Los bindings de D1, R2 y Workflow son implementaciones locales; los tests no
sustituyen SQL por respuestas prefabricadas ni reemplazan una eliminación exitosa de Workflow por una
operación vacía. Las instancias de fixture dormidas, pausadas y completadas ejecutan un checkpoint
antes de que se elimine su estado almacenado.

El 30 de octubre de 2026 se añadieron tres casos adicionales de regresión de limpieza de cuentas,
que cubren las comprobaciones de lista de administradores/email y la respuesta pendiente de la ruta real de administración,
eliminación de datos compartidos/privados, recuperación de fallos de R2/Workflow, assets de generación
no publicados y creación de onboarding/generación simultánea con la eliminación de cuenta (con y
sin pérdida de confirmación). El fixture expone AdminAPI solo con un superadministrador
ficticio fijo y no usa credenciales de producción. Los tipos de fixture/aplicación
y la sintaxis JavaScript pasan comprobaciones estáticas; estos casos nuevos en ejecución
**no se han ejecutado**. El resultado de 38 tests anterior es histórico y no valida
la migración 0069. La corrección del cuerpo DELETE de Nuxt también necesita verificación mediante
el adaptador desplegado o una ejecución local del adaptador de producción explícitamente autorizada.

## Reproducir

Desde la raíz del repositorio, con la versión compatible de Node.js y npm:

```sh
npm ci
npm run typecheck:lifecycle
npm run test:lifecycle
```

La validación usó Node.js 26.13.0 y las versiones fijadas Miniflare 5.20261023.0-beta y esbuild
0.28.2, ya suministradas por las herramientas Wrangler del proyecto. Son
dependencias explícitas de desarrollo de la API para que el ejecutor no dependa de una resolución
incidental de paquetes transitivos. No requiere inicio de sesión de Cloudflare, secreto del proyecto, clave de proveedor,
cuenta real ni base de datos persistente.

El ejecutor empaqueta `apps/api/tests/lifecycle.worker.ts` en memoria y crea
directorios temporales únicos de persistencia de D1/R2/Workflow bajo la carpeta temporal
del sistema operativo. Una segunda base temporal comprueba la actualización desde la migración 0063.
Las identidades ficticias usan `example.test`; un secreto de firma fijo exclusivamente local crea
sesiones de fixture. Las solicitudes fetch externas devuelven 503. `finally` y el desmontaje de tests
destruyen el runtime y eliminan el almacenamiento temporal. El Worker de fixture no aparece
en ninguna configuración Wrangler y nunca es un punto de entrada de producción.
Un sandbox puede requerir permiso para escuchar en un puerto de loopback; eso no requiere
acceso remoto a Cloudflare.

## Bugs reproducidos y corregidos

| Regresión | Comportamiento reproducido | Corrección |
| --- | --- | --- |
| Historial privado programado | Vaciar devolvía 500 y revertía porque `chat_turn.schedule_id` todavía referenciaba una programación eliminada antes en el lote D1. | Eliminar los turnos privados antes que las programaciones en el mismo lote atómico. |
| Propiedad de imágenes generadas | Un vaciado solo de contenido generado se declaraba completo aunque el trabajo retrasado de eliminación de objetos pertenecía al ID del turno eliminado. | La migración 0064 captura el ámbito de conversación antes de las cascadas, usa las claves de adjuntos guardadas y repara los ámbitos recuperables en cola desde el registro de subidas. |
| Pérdida de confirmación de creación de Workflow | Un vaciado agotaba el trabajo original; luego una creación remota exitosa cuya respuesta se perdía dejaba una instancia no registrada en ejecución. | Volver a comprobar el registro también en la ruta de fallo; volver a poner en cola y eliminar instancias tardías, incluidos trabajos de iniciativa. Conservar el ámbito original de conversación cuando falla la eliminación tardía. |
| Un fallo sobrescribe un encolado más reciente | Una eliminación fallida antigua aplicaba backoff a una revisión nueva de la solicitud de limpieza del recurso. | Comparar la revisión del trabajo tanto al actualizar fallos como al confirmar éxitos. |
| Resultados privados derivados de grupos | Vaciar un grupo borraba una fila de resultado privado, pero declaraba la operación completa mientras seguía pendiente la limpieza de Workflow/multimedia privados de ese resultado. | Los enlaces duraderos `resource_cleanup_scope` asocian trabajos con ambas conversaciones. La limpieza por ámbito, el estado pendiente y los bloqueos de vaciado usan todos los ámbitos asociados; eliminar trabajos elimina los enlaces en cascada. |
| Memoria de grupo aislada | Habilitar aislamiento en un grupo con recuerdos extraídos fallaba con “9 columns but 10 values” después de añadir embeddings a la tabla compartida. | Recrear el trigger de aislamiento con columnas explícitas, manteniendo la exclusión de embeddings en la memoria local. |

La migración `0064_lifecycle_cleanup_guards.sql` es aditiva. La migración publicada 0063
y la migración anterior de memoria permanecen sin cambios. Estas correcciones se aplican a
iOS y web mediante su contrato API existente; no hay soluciones exclusivas de cliente
ni relajación de permisos.

## Comportamiento ejercitado

- Vaciado privado/de grupo conservando o eliminando memoria; lecturas posteriores reales de
  memoria, consentimiento de memoria compartida y Contributor, aislamiento de conectores, eliminación de
  autores, límites de retención y preservación de conversaciones no relacionadas.
- Eliminación por creador frente a miembro, autorización de propietario/miembro/persona ajena al grupo,
  aislamiento/reversión del archivado y preservación de marcas de lectura.
- Cascadas por mensajes, FTS, hechos/memoria propia y embeddings, índices/recibos de imágenes
  generadas, programaciones, tareas/dependencias/trabajo, monitores/comprobaciones, investigación,
  documentos Markdown/revisiones, miniapps/estado/acciones, recibos de mutación, recibos de
  ejecución MCP, propuestas/concesiones nativas y entregas push.
- Objetos registrados de imagen/voz/generación, escrituras tardías tras el primer barrido,
  objetos aún referenciados, fallos de eliminación R2, fallos de listado de prefijos y un
  prefijo de 205 objetos que exige varias páginas sin omitir claves.
- Fallos de eliminación de Workflow seguidos de recuperación; bloqueos de atención/vaciado;
  instancias dormidas, pausadas y completadas con checkpoints; checkpoints de generación privada/de grupo;
  limpieza de identidad guardada de onboarding y retratos obsoletos.
- Éxito/fallo de revisiones antiguas de limpieza en competencia con encolados más recientes; backoff limitado
  después de 50 fallos sin descartar el trabajo; repetición de vaciado duplicada después de nuevo
  historial; envíos desactualizados; vaciados simultáneos con distintas opciones de memoria.
- Despacho privado/de grupo y creación de iniciativa en competencia con eliminación del origen, incluida
  pérdida de confirmaciones, fallo al eliminar la instancia tardía y recuperación posterior
  bajo su conversación original.
- Multimedia/Workflows privados derivados de grupos y vaciados simultáneos que mantienen/liberan
  ambos bloqueos de conversación. Las aserciones de vaciado de cola incluyen enlaces de limpieza y
  `PRAGMA foreign_key_check`.
- Actualización de un outbox 0063 poblado a 0064 sin restablecer recuentos de reintentos,
  números de revisión ni plazos de reintento.

Los fallos se inyectan solo en el Worker de fixture como proxies de bindings alrededor de llamadas locales
reales de R2/Workflow. Los logs esperados `resource_cleanup_deferred` e
`initiative_dispatch_deferred` durante casos de fallo no indican un fallo de la suite.
Para evitar esperar cinco minutos/una hora, el ejecutor primero verifica los
plazos de reintento guardados y luego hace vencer explícitamente los trabajos de fixture para la siguiente
pasada de limpieza. Comprueba el consumidor de limpieza de producción en lugar de duplicar
su lógica de eliminación en el test.

## Límites

Esta es evidencia ejecutable de integración local, no verificación de servicios Cloudflare
en ejecución global. Cloudflare describe
[los Workflows locales como emulados](https://developers.cloudflare.com/workflows/build/local-development/)
y documenta [tests con Miniflare](https://developers.cloudflare.com/workers/testing/miniflare/).
La suite no hace llamadas de pago a modelos, entrega APNs, ejecuta alarmas nativas, controla
UI de iOS/Nuxt ni ejercita fallos de proveedor/red contra producción. Invoca
la misma función de limpieza que usa el Cron, con trabajos vencidos controlados; no espera
la programación real del Cron en la nube. El comportamiento de caché/visores de dispositivo/navegador, la consistencia
Workflows/R2 de producción y los restos existentes en producción requieren una verificación
separada. No se leyeron, modificaron ni eliminaron datos reales para estos tests.
