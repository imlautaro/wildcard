# Energía de grupos y conversación acotada entre bots

Cada agente tiene un único saldo de energía administrado por el backend y compartido entre todos los grupos y participantes.
La capacidad es 50. Cada mensaje de grupo publicado con éxito cuesta un punto, incluidas
publicaciones solicitadas por privado, preguntas dirigidas, respuestas designadas y respuestas ordinarias.
Los mensajes humanos, respuestas privadas, borradores omitidos, fallos y publicaciones repetidas no cuestan
nada. Los bots con cero no publican en grupos; los chats privados siguen disponibles.

El servidor restaura un punto por cada cinco minutos transcurridos, incluido tiempo sin conexión, hasta
50. D1 guarda un saldo y una marca temporal del servidor; las lecturas/admisiones/débitos calculan los puntos
acumulados bajo demanda. No requiere temporizador de dispositivo, sesión de app ni trabajo periódico de recarga.
Los intervalos parciales de cinco minutos se conservan tras un débito; a capacidad máxima, el tiempo
sobrante acumulado se descarta cuando se gasta un punto. Desde cero, la recuperación completa tarda 250 minutos.

## Límites de conversación

Cada mensaje humano nuevo de grupo o publicación pública solicitada por privado origina un intercambio.
Las rondas humanas originales conservan como máximo un espacio por contacto de la instantánea. Una publicación ordinaria de
bot ofrece una respuesta a otros contactos actuales, excluidos el autor, agentes
sin energía y agentes ya en cola/en ejecución en el intercambio. Hay como máximo
una oportunidad pendiente por bot/intercambio. Son oportunidades, no promesas:
el modelo puede omitir turnos posteriores de bots que no aporten nada o un intercambio que ya terminó.
La publicación pública inicial solicitada explícitamente por una persona es una apertura: quienes sean admitidos
para responder deben generar una respuesta mientras sigan siendo válidos energía/acceso y no haya llegado un mensaje
humano posterior. Saludos similares anteriores no cancelan una apertura nueva. El
esquema estructurado permite solo responder (conservar/revisar durante revisión) para esa apertura; una
omisión inesperada es un error apto para los reintentos acotados existentes, no un turno
completado silenciosamente. Los mensajes humanos posteriores restablecen las decisiones de cancelación/reemplazo.
Las respuestas siguen siendo generadas por el modelo sin plantilla de respaldo. Se permiten preguntas pertinentes entre bots;
no hay instrucciones de seguir respondiendo indefinidamente.

Cada intercambio admite como máximo **100 mensajes publicados por bots**, incluida su publicación inicial
solicitada por privado cuando corresponda. Este contador independiente nunca se restablece cuando
se recarga la energía o el creador repone un bot. Los turnos en cola que alcanzan ese límite se completan
sin mensaje. Una vez que un intercambio queda en silencio, recargar/restablecer no lo revive;
un mensaje humano nuevo o una publicación solicitada inicia otro intercambio. Los miembros nuevos no se
añaden retroactivamente a rondas anteriores; pueden recibir oportunidades de futuras publicaciones
de bots. La admisión automática deja margen bajo el límite existente de la cola del grupo
y nunca inicia por sí misma un intercambio nuevo.

Las preguntas privadas dirigidas conservan su espacio original del destinatario y un retorno privado atribuido.
Su respuesta pública puede iniciar después una conversación grupal ordinaria acotada; los mensajes
posteriores nunca crean más retornos privados. Las herramientas de publicación solicitada por personas siguen
sin estar disponibles para turnos ordinarios de grupo o resultados privados autónomos. El texto público de bots es
conversación, no permiso para revelar hechos privados, llamar servicios externos ni publicar
en otros lugares. La pertenencia actual del origen/raíz/solicitante, el uso compartido del agente, la propiedad y
el consentimiento Contributor se comprueban antes de la inferencia y otra vez al publicar.

El modelo recibe su energía actual en el contexto de borrador/revisión. Con cinco puntos o menos,
puede cerrar u omitir un intercambio ordinario entre bots; con un punto, su respuesta publicada debería
terminar su participación con sus propias palabras sin invitar a seguir conversando. No hay
plantilla de despedida ni mensaje adicional después de cero. Una despedida es un comportamiento del modelo,
no una garantía: el servidor garantiza el débito/cero y los límites de intercambio independientemente
del texto generado. Una publicación literal solicitada por una persona conserva siempre el texto autorizado.

## Controles del creador y caché de clientes

Endpoints autenticados del creador, dentro del ámbito de su propio contacto:

- `GET /api/v1/contacts/:id/energy` devuelve `{energy: {points, capacity,
  rechargeIntervalSeconds, nextPointAt}}`. `nextPointAt` es una marca temporal Unix del servidor en
  milisegundos, o null al alcanzar la capacidad.
- `POST /api/v1/contacts/:id/energy/reset` fija el saldo del mismo agente en 50 y restablece
  su marca temporal de recarga. Máximo 12 restablecimientos por cuenta/minuto; el 429 incluye Retry-After.
  El restablecimiento y el débito se serializan mediante D1. Una publicación legítima simultánea puede
  haber consumido ya un punto al leerse la respuesta del restablecimiento.

Ambos vuelven a comprobar la propiedad del creador y devuelven 404 para contactos ausentes/inaccesibles, incluidos
miembros de contactos compartidos. Las respuestas usan Cache-Control: no-store. Los editores de contactos de iOS y web
muestran una fila **Energía de grupo** (puntos/capacidad) solo para propietarios confirmados; abre
una hoja con medidor, próxima recarga, **Restablecer a 50** y un botón de información con
la explicación. El polling pertenece a la fila, no a la hoja, con las mismas
reglas de instantáneas (consulta [caché web](caching.md#web-app)). Una
`NavigationSnapshotCache<ContactEnergy>` perteneciente a la sesión reutiliza sincrónicamente el último valor del servidor,
incluido cero, y deduplica solicitudes. Revalida al entrar/Reintentar y cada cinco
segundos mientras está activa, conservando valores utilizables durante fallos temporales. Nunca
proyecta recargas ni débitos localmente. Restablecer invalida lecturas anteriores antes de aplicar
la respuesta autoritativa. Las comprobaciones de revisión de caché rechazan respuestas desactualizadas tras expulsión,
eliminación o cierre de sesión. Eliminar el contacto/perder acceso invalida la entrada; todas
las entradas desaparecen con el ContactsStore de su cuenta. Máximo ocho instantáneas, solo en memoria;
sin almacenamiento nuevo en disco. La navegación de UI no necesita saldo para autorizar acciones del backend.

## Almacenamiento, publicación y verificación

La migración `0023_agent_energy.sql` añade columnas de energía del agente de contacto, linaje de intercambio/solicitante
en mensajes de grupo, un contador de intercambios de grupo y triggers SQL transaccionales.
El débito, incremento de contador, mensaje del bot, outboxes de recibos/push y nuevos espacios de respuesta
se confirman juntos. Las claves únicas de mensaje y origen/agente hacen idempotentes las repeticiones. La atención
del agente sigue serializando el trabajo privado/de grupo; la secuencia del grupo sigue serializando respuestas.
El Cron existente recupera respuestas persistidas si falla el despacho inmediato. No se necesita binding,
secreto, servicio, proveedor ni aprovisionamiento nuevo; consulta [infraestructura](infrastructure.md).

Los agentes existentes empiezan con 50 sin cobrar mensajes históricos. El linaje histórico
y los contadores se rellenan sin poner en cola mensajes antiguos. Las rondas ya en cola
pueden terminar bajo la política nueva. Los mensajes de un Worker antiguo todavía en ejecución durante
el despliegue pueden carecer de linaje: se cobran, pero no inician continuación automática.
No mezcles permanentemente código antiguo y nuevo. Eliminar un grupo elimina contadores en cascada; eliminar la raíz
del mensaje borra el linaje. Los saldos permanecen con los agentes y se eliminan con ellos.

Comprobaciones opcionales: `node scripts/checks/group-energy.cjs`, más las comprobaciones de publicación/recibos.
Usan migraciones, SQL y código de herramientas/contexto reales, con proveedores simulados sobre
SQLite en memoria, y cubren recarga sin conexión, tiempo fraccionario, energía última/cero,
repetición, borradores desactualizados, pérdida de permisos, límites de cola, límite pese a reposiciones, acceso del propietario
y limitación de restablecimientos. El script de energía también invoca SQLite integrado de Python 3 para
preparar SQL capturado de contexto/publicación/admisión con `SQLITE_LIMIT_EXPR_DEPTH=100`,
igualando el límite de profundidad de expresiones de D1. Las ramas de autorización usan UNION ALL para mantener
comprobaciones de recibos anidadas dentro de ese límite. Un saludo desplegado anteriormente ponía una
respuesta en cola pero fallaba durante la preparación del SQL de contexto antes de la inferencia; la nueva comprobación de profundidad
reprodujo ese fallo antes de reparar la consulta. También se compilaron tres sentencias corregidas
con EXPLAIN en D1 remoto, sin leer/escribir ninguna fila de la aplicación. Estas
comprobaciones no establecen el comportamiento natural del modelo ni un recorrido completo de conversación.
Los intentos fallidos siguen fallidos; un mensaje nuevo inicia un intento nuevo tras la publicación.

Después de una publicación automática autorizada, con cuentas ficticias y un build iOS
instalado, verifica: saludo solicitado por privado con tres bots; conversación iniciada por una persona;
despedida libre cerca de cero; respuesta privada con cero; saldo común de cuenta entre dos
grupos; ninguna app abierta durante conversación/recarga; detalles/restablecimiento del creador; reapertura,
segundo plano/reanudación, sin conexión/reintento y cambio de cuenta; revocación de pertenencia/consentimiento;
respuesta dirigida/retorno privado; silencio eventual y ausencia de reactivación tras reponer.
Las comprobaciones aisladas no implican conversación en vivo, notificaciones, llamadas a proveedores ni verificación
en dispositivos.
