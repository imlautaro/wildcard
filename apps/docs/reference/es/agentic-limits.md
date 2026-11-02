# Límites de ejecución de agentes

Actualizado el 29 de octubre de 2026 con controles de tareas persistentes e
investigación de tareas mediante consultas exactas. Son valores predeterminados de
la implementación, no garantías de calidad del modelo ni un límite de gasto financiero.

| Trabajo | Límite de ejecución existente | Límite de investigación |
| --- | --- | --- |
| Respuesta privada a una persona | Tres rondas de herramientas, seis ejecuciones; una ronda opcional de reparación de miniapp, manteniendo seis ejecuciones | Una operación de investigación acotada comparte los seis espacios |
| Respuesta privada programada | Dos rondas, seis ejecuciones; sin acciones externas | Sin investigación web |
| Trabajo de tarea privada | Tres rondas, seis ejecuciones; sin MCP, acciones nativas ni publicación en grupos | Un intento de investigación durante toda la vida de la tarea con una consulta pública guardada por una persona; se comprueba la generación actual entre pasos del modelo y de herramientas |
| Borrador inicial de grupo | Seis rondas de evidencia, seis ejecuciones, plazo de evidencia de 180 segundos | Los disparadores humanos pueden investigar; una reserva para toda la ronda de origen |
| Tarea de grupo asignada | Presupuestos existentes de tareas/evidencia; comprobaciones del origen y la generación actuales | El mismo permiso humano para una consulta exacta y una reserva durante toda su vida |
| Revisiones de grupo / disparadores ordinarios de bots | Reglas existentes y restringidas de revisión/respuesta | Sin capacidad nueva de investigación |
| Despacho de tareas | Seis turnos de trabajo durante toda la vida de la tarea, 30 por contacto por día móvil; revisiones cada 30 minutos | Los controles persistentes conservan el consumo y exponen estados de pausa/bloqueo |
| Iniciativa | Revisión acotada del modelo y cadencia de silencio existentes | Sin herramientas de investigación |
| Bucle de revisión (`request_changes`) | Reabre un requisito finalizado como máximo dos veces por tarea; el trabajo reabierto consume los turnos de trabajo normales de su responsable | Sin capacidad nueva |
| Turno por cambio del monitor de página | Herramientas de turnos de tarea; 20 durante toda la vida de la tarea, 3 por tarea por día, dentro de los 30 turnos diarios de tarea del contacto | Sin investigación nueva; las comprobaciones en sí no llaman a ningún modelo |

El plazo de evidencia de grupo controla la admisión de pasos nuevos; un paso ya
admitido puede terminar después. La preparación de inferencia privada conserva el
tiempo límite de Workflow de ocho minutos y sus reintentos. Estos no son
presupuestos de tokens por trabajo.

Se mantienen los recibos existentes de mutaciones de tareas/documentos, los
registros de reservas MCP, los recibos de imágenes, la atención del agente y las
protecciones de publicación. Un recibo nuevo de investigación reserva antes de
sus POST con coste e impide reintentar resultados inciertos. Una reserva puede
cubrir un POST de búsqueda y un POST de síntesis sin herramientas cuando la
respuesta de búsqueda contiene resultados pero no citas utilizables. La síntesis
vuelve a comprobar el acceso actual, recibe solo la consulta pública y los
resultados devueltos, y utiliza IDs de fuente validados en lugar de URLs redactadas
por el modelo. Ambas llamadas comparten el plazo de 60 segundos; cada una admite
4,096 tokens de salida. Esto aumenta el coste potencial de inferencia por intento.
Su registro separado y atómico de uso sobrevive a la eliminación del contenido y
aplica 10 solicitudes por cuenta y 100 por instalación por día móvil. Consulta
[presupuestos y retención de investigación](web-research.md#budgets-and-receipts).

Siguen disponibles la cancelación de tareas/listas y las comprobaciones de
propiedad/pertenencia actuales. Los [controles de trabajo persistente](persistent-work.md)
añaden pausa/reanudación humana, próximos pasos/evidencia registrados y un motivo
de bloqueo. Una generación de ejecución impide que el trabajo detenido continúe
después de reanudar; no interrumpe un paso ya iniciado. La investigación tiene un
plazo del proveedor de 60 segundos, sin reintentos HTTP, comprobaciones de acceso
actual y un flag de función versionado para admisiones futuras. Perder el acceso
impide publicar; el trabajo ya enviado al proveedor aún puede cobrarse. No se
introducen permisos de escritura externa. El presupuesto de turnos de trabajo es
duradero; no es un presupuesto exacto de tokens o dinero.

La base del trabajo persistente usa los títulos de las tareas como objetivos, las
notas como condiciones de finalización, nextStep/evidence/result para el progreso
y un blockedReason explícito. La investigación pública de tareas ahora tiene un
permiso humano de consulta exacta, un contador para toda su vida y un recibo de
consumo anterior a la admisión. Las herramientas de fondo más amplias todavía
requieren permisos y recibos separados por trabajo. El trabajo de tareas no debe
heredar permisos humanos arbitrarios del chat. Los límites de investigación por
cuenta/instalación no sustituyen esos controles.

Los [monitores de páginas](monitors.md) (0056) son la primera lectura saliente en
segundo plano que el Worker realiza en nombre de una persona: un `GET` de una URL
pública guardada por una persona, como máximo cinco por ejecución de Cron, sin
redirecciones, cookies ni datos de cuenta. No conceden escritura ni ninguna otra
acción externa.

La [clasificación semántica de memoria](memory.md#semantic-ranking-migration-0057)
(0057, desactivada por defecto) reordena memorias ya autorizadas; no concede acceso
ni herramientas nuevos.

La verificación sigue siendo estática hasta que se autoricen comprobaciones
reales: TypeScript, Swift y la preparación SQL no prueban el comportamiento ante
repeticiones, la revocación real de consentimiento, el coste, la calidad de la
investigación ni la presentación en los clientes. Este incremento local no incluye
tests en ejecución, builds, inferencia real, migraciones remotas ni despliegue.
