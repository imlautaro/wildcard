# Evaluación del estilo de conversación — 30 de octubre de 2026

La implementación de API publicada en `1feb2a0` reprodujo el problema reportado
con datos ficticios: cuatro de cinco respuestas en un grupo nuevo nombraban a la persona en
su saludo. Una también devolvía la pregunta social tratándola en singular. El
clasificador existente había identificado correctamente un mensaje dirigido a todo el grupo, pero esa
indicación no sobrevivía de forma fiable a la redacción final. Fue un fallo semántico
aunque las comprobaciones estáticas anteriores pasaron.

## Alcance y método

`scripts/checks/conversation-style-live-eval.mjs` empaqueta la respuesta privada real,
contexto/preparación/finalización de grupo, parsers y funciones de publicación protegida.
Todas las migraciones se ejecutan contra SQLite efímero con usuarios, contactos,
historiales, permisos y grupos ficticios. Los checkpoints de Workflow y transacciones por lotes
tienen adaptadores locales. El aprendizaje se deshabilita en estos fixtures para aislar las variables
de estilo. Los cambios finales de API se aplican por igual a iOS y web.

Solo las llamadas reales a Meta Chat Completions pueden salir del proceso. El modelo es Estándar
`muse-spark-1.3`, con las opciones de completado de producción. Las demás operaciones de red
están bloqueadas. Los escenarios con voz activa usan una configuración ElevenLabs ficticia solo para
activar el prompt real de voz; no se intenta síntesis de habla. Las claves se leen
mediante la configuración de desarrollo ignorada existente sin imprimirlas.
Los informes omiten encabezados de autorización y campos de razonamiento del proveedor.

La investigación usó 664 llamadas exitosas al proveedor en 74 ejecuciones de escenarios
y 22 escenarios distintos, incluidos la línea base, fallos intermedios y repeticiones
finales. Un intento inicial de red desde el sandbox falló sin respuesta del proveedor
y se excluye. La matriz final amplia completó 20 escenarios; luego se repitieron dos veces ocho casos
sensibles con revisión opcional de redacción y después se realizó otro saludo
con cinco agentes y voz activa contra la fuente actual. No se usó base de datos de producción,
conversación, cuenta de app, notificación ni despliegue.

Los casos, harnesses compilados, registros de solicitudes/uso y transcripciones sin procesar se guardan
fuera de Git. Cada ejecución registra commit de origen, hash del diff versionado y hash de fixtures.
Las cohortes del informe distinguen comportamiento intermedio y final, en lugar de
afirmar que todas las variantes intentadas pasaron. Se inspeccionó la salida real;
las etiquetas categóricas de entrega del modelo no se consideran aprobación semántica.

## Hallazgos sobre las seis preocupaciones

| Preocupación | Resultado observado |
| --- | --- |
| Nombres repetidos | El saludo nuevo publicado nombraba a la persona en 4/5 respuestas. Cinco rondas finales de saludo, con y sin voz, produjeron 24 mensajes sin menciones al nombre humano ni preguntas reflejas de vuelta. El silencio siguió siendo válido para otros espacios de respuesta. Las muestras privadas casuales también evitaron vocativos habituales. |
| Lenguaje regional | Las formas argentinas de singular y plural fueron naturales con voz desactivada y con el país de generación original como respaldo. Cambiar el acento explícito a México o España cambió las formas de tratamiento correspondientes; el plural español usó sus formas regionales específicas. El país no se convirtió en biografía ni cuota obligatoria de modismos. |
| Identidad poética | Un perfil poético heredado con alta verbosidad respondió directamente preguntas prácticas de producto, sin imágenes líricas no relacionadas. Una solicitud explícita posterior de una metáfora breve sí produjo una. |
| Conciencia del grupo | Solo el contacto al que se dirigía respondió el caso dirigido; los otros dos lo omitieron. Una respuesta factual suficiente detuvo explicaciones duplicadas. El último participante contestó su parte sin volver a preguntar después de respuestas humanas/de bots visibles. El caso de juego compartido conservó un artefacto que los contactos posteriores reutilizaron. |
| Longitud adaptable | Las contribuciones privadas casuales finales tuvieron 7–15 palabras. Una secuencia privada pasó de 4 palabras en una respuesta social a 182 en una explicación solicitada y luego 25 para el resumen de dos líneas pedido. Los saludos grupales fueron normalmente una oración breve; las explicaciones técnicas solicitadas conservaron ejemplos y detalle útil. |
| Escritura distintiva | El contacto reservado usó mayúsculas, puntuación convencionales y observaciones breves y secas. Los contactos expresivos usaron comienzos en minúscula o risas escritas en texto casual. Los patrones permanecieron reconocibles durante tres turnos. Seis respuestas casuales con voz activa que contenían efectos escritos no fueron aptas para síntesis y quedaron como texto; la prosa común sigue siendo apta para voz. |

La cohorte sensible final repetida realizó cinco revisiones opcionales de redacción:
cuatro revisaron la prosa y una conservó una pregunta legítima sobre el tema a
tratar. Ambas repeticiones de conversación dirigida mantuvieron disponible la respuesta
individual. El último saludo de confirmación no necesitó inferencia de revisión de redacción.
Esta es una muestra observada limitada, no una garantía de que todo mensaje futuro
tendrá el estilo correcto ni de que toda pregunta útil de grupo deba dirigirse en plural.

## Correcciones y límites

La redacción privada final ahora refuerza nombres poco frecuentes, profundidad útil y lenguaje
regional natural después de contextos largos o resultados de herramientas. Los grupos además reutilizan
la categoría de audiencia del disparador actual, consideran la repetición de nombres por pares, eligen
metadatos categóricos de entrega y aplican guía de trabajo compartido durante la recopilación
de evidencia. Un borrador grupal marcado puede recibir una revisión adicional de redacción sin herramientas;
su latencia y uso de modelo adicionales son intencionales y acotados. La revisión no puede
repetir herramientas ni crear participación nueva, y permanecen las protecciones normales de publicación.
Las revisiones opcionales fallidas guardan en checkpoint el borrador útil original en lugar de reintentar
la inferencia en una repetición.

La elegibilidad de habla ahora excluye emojis, banderas, efectos evidentes de letras repetidas y
patrones compatibles de risa escrita, preservando el mensaje exacto como texto en lugar
de sintetizar su ortografía. No reescribe mensajes ni cambia IDs de voces.
Las comprobaciones no establecen el acento ni sonido real de una voz ElevenLabs.

Resultados locales de regresión: pasaron 14 comprobaciones de estilo/parser/adecuación, 28 de personalidad,
16 de finalización/revisión de grupo y 22 de publicación (80 en total).
Las comprobaciones de finalización cubren repetición de revisión, revisión fallida tras una herramienta MCP
ejecutada, pérdida de acceso antes de inferencia y conservación de multimedia preparada sin
enviar su clave de almacenamiento a quien revisa. Se actualizaron dependencias antiguas de fixtures y estructuras
de mensajes a contratos actuales; el test de cadencia dirigida ahora identifica explícitamente
al destinatario previsto en lugar de depender de un fallback grupal eliminado.
No se relajó ninguna regla de autorización de producción para que pasaran esos tests.

Pasaron TypeScript de API/web, sintaxis del harness, SQL EXPLAIN para 19 sentencias contra las 67
migraciones a profundidad de expresión 100 y `git diff --check`. No se realizó build de aplicación,
sesión de simulador/navegador/dispositivo, test de durabilidad Cloudflare ni evaluación
acústica. La iteración correctiva sigue local hasta que se confirme,
envíe y publique automáticamente por separado. Los mensajes existentes no cambian.

## Reproducción

Ejecuta solo con autorización explícita para llamadas reales al proveedor. Conserva fixtures de diálogo
ficticios e informes generados fuera del repositorio. El JSON externo
contiene `humans` (IDs de fixture `owner`, `alice`, `bob`), hasta cinco `agents` con
descripciones de identidad en inglés y `scenarios`. Cada escenario aporta `id`,
`kind` (`private` o `group`), `inputs` y una rúbrica de evaluación en inglés. Los campos
opcionales cubren historial visible, agentes seleccionados, prompts de voz, acento, país de
generación y personalidad desactivada. Las entradas pueden seleccionar respondedores y mensajes
visibles intercalados; nada de esto concede acceso a cuentas reales.

```sh
node scripts/checks/conversation-style-live-eval.mjs \
  --cases /path/outside-repository/fictional-cases.json \
  --out /path/outside-repository/style-results \
  --call-limit 220
```

Usa `--source-ref 1feb2a0` para el código publicado anterior, `--only` para seleccionar IDs
de escenarios y `--repetitions 2` para fixtures nuevos repetidos. La fuente por defecto es el
árbol de trabajo. El límite de llamadas al proveedor se aplica por invocación. Las credenciales deben
permanecer en el entorno o variables ignoradas de desarrollo de la API, nunca en fixtures
ni argumentos de comandos.
