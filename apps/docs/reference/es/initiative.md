# Iniciativa de conversación

Los contactos privados pueden continuar un intercambio, iniciar otra conversación
más tarde, presentarse cuando son nuevos y escribir primero tras un período de
silencio. La API compartida sirve a iOS y web con D1, Cron Trigger de cada minuto
y `ChatWorkflow` existentes. No hay modelo siempre activo ni servicio nuevo. La
migración **0065** añade iniciativa adaptativa a 0032–0033; **0094** añade
[mensajes de bienvenida](#welcome-messages) y
[reconexión](#re-engagement-after-silence) y relaja las condiciones ambientales
([contacto proactivo](#proactive-outreach-migration-0094)).

## Episodios y oportunidades adaptativas

Una respuesta terminada a una solicitud humana directa inicia un episodio de
continuación. Su primera revisión vence en 30 segundos; personalidad e historial
de respuestas pueden diferirla antes de inferir. Un mensaje humano nuevo o adjunto
invalida inmediatamente el episodio y borrador anteriores, igual que un mensaje
que el contacto escribe en privado tras un
[comentario en Para ti](updates.md#private-messages-from-comments) (que tampoco
inicia uno). Programaciones, trabajo autónomo de tareas, resultados de grupos y
mensajes proactivos no inician episodios. No se rellena historial ni reinician
planes detenidos al actualizar.

Una continuación puede esperar, enviar una idea siguiente útil o detener el
intercambio actual. Detenerlo puede crear en cambio una **oportunidad ambiental**
posterior: conversación nueva, saludo o seguimiento relevante. Desde 0094 exige
que no haya mensaje proactivo sin responder, pausa explícita ni límite en la
solicitud de origen; ya no requiere clasificación social previa. Los chats usados
solo para tareas pueden recibir seguimientos de tareas pero no saludos, y un
saludo ignorado en las últimas 24 horas suprime solo saludos. Una despedida termina
el intercambio; pedir explícitamente detener contacto no solicitado también pausa
iniciativa futura. Las oportunidades ambientales caducan siete días después de la
última entrada humana. Publicar un mensaje ambiental termina ese episodio; el
contacto posterior viene de [reconexión](#re-engagement-after-silence). El modelo
también puede detenerse sin enviar o esperar otra oportunidad flexible.

Las continuaciones conservan seis evaluaciones en como máximo 24 horas. Pasar a
modo ambiental tiene otras seis evaluaciones en el horizonte de siete días; los
cambios de modo conservan revisión monótonamente creciente para no reutilizar IDs
Workflow. Diferir tras reclamar y los errores consumen evaluaciones como antes.
Cron excluye agentes ocupados y concesiones activas de escritura de seis segundos
antes de reclamar filas, por lo que normalmente esperan sin consumir las seis.
Si horas de silencio o atención ocupada agotan la continuación, Cron solo puede
promover a ese presupuesto ambiental finito un origen ya clasificado social y
sin envíos proactivos. Un origen desconocido o sin clasificar no adquiere así permiso ambiental.

## Aprender de esta conversación

En una revisión, el servidor lee como máximo 160 turnos terminados de los 28 días
anteriores del chat privado de ese participante. Considera fechas y observaciones
categóricas; también incluye el origen actual si esperó más en cola, pero una
entrada tan antigua no entrena ventanas de actividad. Los metadatos se usan
localmente; el modelo recibe doce turnos recientes de texto acotados, contacto
previo atribuido, evidencia agregada de actividad, persona y memorias aptas. No
recibe toda la muestra estadística ni rasgos numéricos. Los agentes compartidos
no combinan tiempos ni receptividad de distintos participantes. Los chats aislados
por conectores conservan su frontera local y procesamiento Estándar.

La llamada existente de planificación también clasifica la última solicitud humana
completada:

- Participación social, tarea/pregunta práctica, límite o incertidumbre.
- Si responde realmente al mensaje espontáneo anterior, cambia de tema sin
  reconocerlo, es ambiguo o no hay contacto proactivo al que responder.
- Una solicitud explícita de pausar o reanudar contacto espontáneo, si existe.

La retroalimentación se guarda una vez por turno de origen, con ID del contacto
previo real cuando corresponde. El servidor vincula la primera solicitud humana
completada después del contacto, o una que cite explícitamente ese mensaje del
bot; una tarea aleatoria posterior no cuenta como respuesta positiva. Una cita a
otro mensaje no se reatribuye en silencio al último contacto. Las etiquetas son
juicios falibles del modelo, no hechos sobre sentimientos. Los casos dudosos no
cuentan como interacción positiva ni reanudación explícita. Leer, visitar o escribir
sin enviar nunca cuenta como respuesta conversacional.

Los mensajes humanos consecutivos `MESSAGE_BATCHED` justo anteriores al origen
se incluyen en el contexto de la solicitud, para que un reconocimiento breve
seguido de una tarea separada no se considere automáticamente ignorar el saludo.

Un saludo sin responder durante menos de 24 horas suprime más saludos (0094;
antes saludos y seguimientos sociales, sin caducidad). Una tarea ajena no levanta
la supresión; una interacción social real posterior puede hacerlo. Dos solicitudes
prácticas recientes clasificadas suprimen saludos y charla social, pero permiten
seguimientos de tareas. Dentro de un episodio ambiental, nunca sigue otro mensaje
ambiental sin entrada humana; los episodios de reconexión permiten hasta tres
mensajes espontáneos sin respuesta en total. Para otros contactos, la receptividad
medida exige al menos tres resultados conocidos entre como máximo veinte mensajes
proactivos recientes. El contacto sin responder mayor de 24 horas puede reducir
la estimación; las respuestas ambiguas siguen desconocidas.

Los mensajes proactivos nuevos guardan su tipo. Los históricos sin clasificar
mantienen tipo desconocido en vez de etiquetarse retroactivamente como saludo.

Las estimaciones de actividad deduplican cada día/hora civil, ponderan más los
días recientes, suavizan horas adyacentes y dan peso extra a respuestas realmente
comprometidas. Una ventana aprendida necesita actividad en al menos tres días
distintos. Solo contribuyen muestras con la zona del turno actual, para no mezclar
zonas de viajes. Antes de suficiente evidencia, el bot usa oportunidades diurnas
variadas sin afirmar conocer una rutina. Guían cuándo conversar; no establecen que
alguien esté despierto, en casa o disponible.

## Ritmo y cantidad según personalidad

Las personalidades habilitadas conservan su director de actuación y guía expresiva.
Iniciativa y paciencia también afectan separación mínima y cantidad de contacto:

- Los contactos empiezan con ganas: receptividad desconocida permite el máximo
  global de tres continuaciones sin respuesta (0094). Solo tareas o receptividad
  baja medida (menos del 35%) permite una; iniciativa baja, mucha paciencia o
  receptividad moderada (menos del 65%) permite dos.
- El mínimo de continuación por personalidad ahora es 20–101 segundos en lugar
  de 30–480, manteniendo un mínimo de 30 para la primera. Rasgos neutros dan
  60 segundos; baja iniciativa y mucha paciencia dejan más espacio. Continuaciones
  posteriores sin respuesta conservan separaciones de al menos dos y diez minutos.
- El historial pobre sigue triplicando la separación. El mínimo ambiental ronda
  1.1–5.2 horas según iniciativa/paciencia, más seis horas con baja receptividad
  medida. El mínimo de transición/revisión sigue esa separación adaptativa en
  lugar de imponer otras seis horas. Ventanas, silencio, decisiones del modelo,
  Cron y carga de cola pueden retrasar más la entrega.
- Las ventanas se eligen mediante sorteo ponderado determinista con semilla de
  origen/revisión y variación de minutos. Repetir conserva la elección; las
  oportunidades posteriores varían. Los retrasos ordinarios de revisión también
  reciben espacio adicional.

Una personalidad desactivada usa cadencia neutra y sigue adaptándose a las
respuestas. Calidez, reserva, humor y verbosidad siguen la dirección existente;
no se impone saludo fijo ni cuota diaria. Los recordatorios explícitos a hora fija
siguen en herramientas de programación y no reciben variación de este planificador.
No se introducen trabajos de cumpleaños, iniciativa de grupos ni acciones externas proactivas.

## Límites de entrega y control

No se entrega mensaje espontáneo entre **22:00 y 08:00** de la zona del último
turno humano, excepto dentro de 30 minutos del último mensaje de la persona en
este chat (conversación activa, 0094) y para una bienvenida de contacto creado en
los últimos 30 minutos. Es frontera de entrega, no promesa de escribir a las 08:00.
Zonas ausentes/inválidas suspenden el episodio sin adivinar. Cron comprueba hasta
diez filas vencidas por minuto; inferencia, atención y carga pueden demorar. Se
publican como máximo seis mensajes espontáneos por contacto y treinta por cuenta
(bienvenidas incluidas; antes de 0094 eran tres y doce) en 24 horas móviles. Los
mensajes privados originados en grupos mantienen presupuesto separado y no
entrenan iniciativa.

Antes de publicar, la transacción atómica comprueba de nuevo origen/revisión/ancla,
desactivación actual, estado archivo/vaciado, modelo, consentimiento, aislamiento
MCP, evidencia de lectura/escritura, revisión de personalidad, atención y
presupuestos móviles. Historial nuevo impide publicar el borrador anterior.
Cambios de lectura/escritura o perfil descartan el borrador y programan otra
evaluación acotada. Abrir o dejar abierto el chat ya no suprime iniciativa ni
invalida borradores: solo actividad reciente real en el compositor obtiene una
pausa de cortesía. La misma marca de escritura se comprueba en contexto, antes
de Escribiendo y en SQL atómico de publicación/retroalimentación, incluidos varios
dispositivos. Visitas pasivas no cuentan como escritura. Presencia, pausas,
turnos ordinarios completados y bandeja APNs reutilizan vías existentes. El
planificador puede proponer una imagen contextual con pie incluso sin solicitarla,
mediante [imágenes generadas](generated-images.md#contextual-framing-and-spontaneous-images-0079).
No puede usar herramientas de recuperación, conectores, acciones nativas, publicación
de grupo ni mutaciones de programaciones. Las imágenes obedecen todas las condiciones
de iniciativa textual y consumen un espacio ordinario, con un intento de imagen
por episodio de origen como máximo (0079). Se retiene el pie si no hay imagen.
El texto nunca prueba que ocurrió una acción externa.

**Detalles del contacto → Iniciativa de conversación** controla solo el chat privado
de este participante, incluso con agente compartido. Ambos clientes explican
ritmo adaptativo, bienvenidas, reconexión, silencio y límite sin responder.
Desactivar cancela el plan actual y bienvenida pendiente. Reactivar no inicia
inmediatamente un episodio; lo hará el siguiente intercambio humano o barrido de
reconexión posterior. Una pausa conversacional explícita se almacena en este
contacto; un saludo casual o tarea ajena no la cancela. Reanudar explícitamente o
desactivar/reactivar iniciativa la borra. Las respuestas humanas directas siguen
disponibles mientras se pausa.

Archivar elimina el plan pendiente; desarchivar no lo reinicia. Vaciar chat quita
plan, aprendizaje vinculado al origen y pausa junto al historial, incluso si se
conserva memoria factual. Eliminar contacto/cuenta elimina en cascada. Estas
etiquetas no se extraen a memorias compartidas. Las históricas quedan vinculadas
a turnos hasta eliminar historial, pero solo la muestra acotada de 28 días influye
en adaptación. La pausa explícita sigue hasta restablecer.

## Caché y configuración

La activación usa caché de contactos de sesión y respuestas de mutación existentes.
Los historiales usan los mismos almacenes acotados, sondeo, vistas previas,
no leídos y bandeja APNs iOS; push de navegador sigue no disponible. No hay caché
de tiempo, cuenta atrás, endpoint extra de sondeo ni persistencia privada en disco.
Los planes D1 mantienen una fila por contacto; los checkpoints conservan contexto
acotado según política existente de plataforma. Se aplican invalidaciones de
cuenta/acceso y respuestas tardías existentes. Consulta
[caché](caching.md#conversation-initiative).

Aplica todas las migraciones hasta 0065 con el comando local existente o pipeline
automático de producción. Aprovisionamiento reproducible, verificación de origen
y precauciones de reversión en [infraestructura](infrastructure.md#conversation-initiative).

## Verificación

Comprobaciones estáticas: TypeScript API/web, análisis de editor Swift,
`git diff --check` y `python3 scripts/checks/initiative-sql-compile.py`. El script
prepara las variantes SQL reales Estándar/Contributor contra esquema vacío con
65 migraciones y profundidad de expresiones 100. No realiza fixtures funcionales,
inferencia, red ni acceso a credenciales o producción.

El arnés opcional `node scripts/checks/initiative.cjs` se actualizó para el contrato
actual de esquema/decisión, incluidos saludos sin respuesta seguidos de tareas
ajenas, transición/repetición ambiental, pausa/reanudación explícita e invalidación
al actualizar. **No se ha ejecutado para este cambio**. Éxito estático no es pase
funcional. Tests, builds, inferencia real e interacción cliente requieren alcance
de validación autorizado por separado.

Clasificación y propuestas opcionales de imagen (o [álbum](generated-images.md#albums))
comparten la llamada existente del planificador (4,400 tokens de finalización
incluido razonamiento, tiempo límite actual); no añaden otra inferencia. La fase
ambiental nueva puede añadir seis evaluaciones acotadas por origen social, por lo
que hay que medir coste y ritmo antes de afirmar calidad.

Con datos ficticios verifica envíos de 06:00 seguidos de respuestas de 10:00 varios
días (conservando silencio), ventanas cambiantes, arranque sin datos, viajes/horario
de verano, fronteras de silencio, personalidades reservadas/proactivas, solo tareas,
respuestas ambiguas/comprometidas y saludos ignorados. Ejercita nuevos mensajes/
lectura/escritura, cambios de personalidad, consentimiento/aislamiento,
archivo/vaciado, cuentas y presupuestos durante inferencia. Verifica fallo/repetición,
concesiones, inferencia fallida, caducidad de siete días y presupuestos terminales.
En ambos clientes verifica reabrir/atrás, vacíos/sin conexión, fallo al cambiar
ajuste, pérdida de acceso y actualización normal de historial/lista/badges; APNs
requiere iPhone configurado. Calidad semántica real, calibración coste/ritmo y
dispositivos siguen pendientes.

## Validación de cadencia más rápida

Los seis escenarios antes ejecutados para 0033 establecieron la cadencia anterior
con modelo simulado. No validan 0065, clasificación adaptativa, ventanas actuales
ni clientes actuales. Las evaluaciones anteriores de modelo real también preceden
este comportamiento. Conserva la distinción al informar validación.

## Integración de aprendizaje conversacional (migración 0067)

El planificador recibe [aprendizaje conversacional](conversation-learning.md) apto
de esta audiencia privada agente/persona: preferencias observadas, un ajuste de
comportamiento y curiosidades opcionales. Desde 0094 una curiosidad pendiente
puede motivar empezar conversación, pero no anula pausa, patrón solo de tareas,
supresión por no responder, silencio, consentimiento ni presupuesto. Publicar una
pregunta registra atómicamente su estado de preguntada. Restablecer/desactivar
avanza una época que rechaza borradores obsoletos. La iniciativa no dispara por
sí misma revisiones de aprendizaje ni habilita iniciativa de grupos.

## Refinamiento de actividad conversacional

El planificador considera explícitamente una idea breve siguiente después de
saludar o de un intercambio social abierto sin necesitar otra pregunta humana
ni recibo de lectura. Aún decide si hay algo que valga la pena decir. Interacción
desconocida/baja, tareas completadas, límites y contacto sin respuesta mantienen
sus supresiones y presupuestos; oportunidades más cortas no conceden más mensajes.
Los planes detenidos, fechas ya elegidas e historial no se reinician ni reescriben.
Los planes recién evaluados usan mínimos nuevos. Las estadísticas del contacto
compartido quedan aisladas por participante privado. Ambos clientes usan la misma
API y ayuda coincidente. Los grupos usan dirección conversacional separada dentro
de ronda, no este planificador privado ni su ajuste de desactivación.

Para el refinamiento, el alcance fue tipos estáticos API/web, análisis de editor
Swift, preparación SQL contra 67 migraciones vacías y espacios. El comprobador SQL
sustituye ahora un entero estático por la época de aprendizaje validada añadida en
0067; no evalúa TypeScript. No se ejecutó arnés funcional, build, inferencia ni
sesión de dispositivo/navegador. Comprueba abierto pasivo frente a escribir,
entrada/lectura/perfil nuevos durante inferencia, cadencia de personalidad,
transición ambiental, silencio, detener/desactivar y repetición con datos ficticios
antes de afirmar comportamiento en ejecución o calidad semántica.

## Contacto proactivo (migración 0094)

La promesa de marketing es que los contactos escriben primero. Antes de 0094 un
episodio solo empezaba tras responder un mensaje humano, el contacto ambiental
requería un intercambio social clasificado, ignorar un saludo bloqueaba indefinidamente
el contacto social y el prompt tendía al silencio. 0094 invierte el valor por defecto:
los contactos empiezan rápidos e insistentes y luego reducen solos el ritmo según
quedan mensajes sin respuesta.

### Mensajes de bienvenida

Un contacto creado por [generación](contact-generation.md) o publicado por
[onboarding](onboarding.md) se presenta una vez antes de que escriba la persona.
La generación publica el contacto con `contact.welcome_due_at` en ahora e inicia
la bienvenida inmediatamente (`startWelcome`), de modo que llega tras la llamada
al modelo y pausa de escritura, normalmente segundos. Onboarding programa el
primer círculo por orden del plan a intervalos de 20–30 segundos tras publicarlo
(70–85 s y solo Cron antes de 2026-11-02, que dejaba el quinto 5–6 minutos atrás);
el Workflow duerme hasta cada vencimiento e inicia él mismo la bienvenida. Los
contactos hechos por el antiguo `POST /contacts` de solo nombre (ya no usado por
clientes) y los unidos mediante [compartición](sharing.md) no envían bienvenida.

`dispatchContactWelcomes` (Cron por minuto) es alternativa para bienvenidas no
iniciadas por Workflow; el reclamo atómico impide enviarla por ambos. Cada reclamo
toma concesión de diez minutos, con hasta tres intentos (`welcome_attempts`);
registra `welcome-<contact>-<attempt>` en `chat_workflow_instance` e inicia el trabajo
`welcome` de `ChatWorkflow` (`apps/api/src/chat/welcome.ts`). Usa la última zona
conocida de la persona en cualquier chat y luego su feed Updates. Un contacto de
menos de 30 minutos saluda incluso en silencio porque la persona acaba de crearlo;
una bienvenida pendiente más antigua espera a las 08:00 sin consumir intento.
Sin zona conocida, solo envía dentro de dos horas desde creación. Usa únicamente
dirección del personaje, hábitos expresivos, idioma/región configurados y persona;
se excluyen deliberadamente memorias y motivo de creación.

La bienvenida es una burbuja breve tras pausa de escritura: saludo abierto con el
nombre del contacto y personalidad solo en cómo lo dice. El prompt prohíbe describir
gustos, intereses o personalidad, explicar por qué se añadió, temas, rompehielos,
ofrecimientos de ayuda y frases de onboarding; como máximo una pregunta informal
(«¿cómo va?») si encaja. Versiones anteriores (dos burbujas juntas con algo sobre
el contacto) resultaron forzadas en las pruebas.

El `initiative_source_id` de bienvenida se refiere a sí mismo, por lo que cuenta
como contacto espontáneo en presupuestos y adaptación. Si se ignora, los saludos
se suprimen por 24 horas y la [reconexión](#re-engagement-after-silence) puede seguir
con una idea diferente. Cualquier mensaje, desactivar iniciativa, archivar o vaciar
cancela una bienvenida pendiente (triggers 0094). Publicar comprueba atómicamente
contacto, ajuste, chat vacío y reclamo; modelo y consentimiento se comprueban al
crear contexto, no otra vez al publicar. Un intento fallido deja la presencia a
su caducidad normal.

### Reconexión después del silencio

Cada diez minutos `dispatchInitiatives` barre chats privados con iniciativa activa,
sin pausa ni episodio vigente y, en los últimos 30 días, mensaje humano o bienvenida,
con zona conocida. El origen es el último mensaje humano o la bienvenida si nunca
escribió. El silencio base antes de reconectar, medido desde el último mensaje de
cualquier lado, es **3 horas** sin mensajes espontáneos pendientes, **12 horas** tras
uno y **48 horas** tras dos (`reengagementQuiet`). Después de tres espontáneos
sin responder (bienvenida incluida), se espera a la persona.

`reengagementFactor` adapta la base por chat: receptividad no medida o buena
(al menos 60% de contactos medidos respondidos) la conserva, 35–60% la duplica y
menos del 35% la multiplica por cuatro; iniciativa 8 o más es 25% más rápida y 3 o
menos 50% más lenta. `contact.reengaged_at` separa barridos de chat al menos dos
horas y un episodio que termina sin mensaje difiere el siguiente seis horas, para
no preguntar repetidamente a un modelo que elige silencio. Silencio y barrido usan
la zona del origen, con alternativa a la última zona de la persona en cualquier
chat o feed Updates (una bienvenida podría no tenerla). Una persona nueva sin
zona conocida en ningún lugar no recibe seguimiento a una bienvenida ignorada
hasta escribir o abrir Updates.

El barrido abre una fila ambiental `conversation_initiative` con `reengage = 1`,
el origen descrito, último turno como ancla, revisión con semilla de fecha (IDs
Workflow nunca reutilizados) y caducidad propia de tres días en lugar de siete
del origen. La primera revisión se sortea desde ventanas aprendidas dentro de
48 horas, empezando inmediatamente, sin mínimo ambiental normal. Evaluación,
silencio, separaciones por personalidad, presupuestos, consentimiento, comprobaciones
de lectura/escritura y publicación atómica son los de cualquier episodio. El
planificador ve `reconnect-after-silence`, si la persona escribió, horas desde el
último mensaje y número sin responder, y recibe la instrucción de nunca mencionar
el silencio. Un episodio originado en bienvenida nunca la clasifica ni cambia el
permiso de pausa. Un mensaje humano nuevo elimina la fila como antes.

### Saludo inicial

Un mensaje espontáneo tras horas de silencio empieza con un saludo breve («hola»,
«buen día», «buenas tardes», «buenas noches» o equivalente en su idioma) antes del
tema, en vez de continuar como si hubieran pasado segundos (pedido 2026-11-02).
El planificador recibe `timing.openWithSalutation`, verdadero para episodios
ambientales y de reconexión si el último mensaje de cualquier lado tiene al menos
**3 horas** (`salutationGap`, ajustable); nunca lo reciben continuaciones y, cuando
es falso, se indica no empezar saludando. El modelo elige según hora local y
carácter y varía si ya saludó ese día en su mensaje anterior.

El saludo es solo el inicio: el mensaje conserva tipo `check-in` o `continuation`,
por lo que se permite si los saludos están suprimidos o el chat es solo de tareas.
Solo un mensaje que no hace más que saludar es `greeting`. En un A/B real con
Contributor (reconexión tras 20 h y 6 h, 16 llamadas por prompt), el anterior abrió
0/16 con saludo y el nuevo 16/16, con los mismos tipos.

### Planificador y política

- Enviar ambientalmente es el valor por defecto si está permitido y encaja algo
  específico: seguimiento de algo mencionado, idea u opinión ligada a intereses,
  curiosidad pendiente o saludo oportuno. Siguen prohibidos noticias inventadas,
  experiencias sin conexión, culpa y afirmaciones de acciones externas.
- `adaptivePolicy` ya no exige clasificación social para contacto ambiental;
  la solicitud de origen no debe ser límite. Los chats solo de tareas reciben
  seguimientos (`check-in`/`continuation`), nunca saludos.
- Cada evaluación registra `initiative_decision` (modo, reconexión, acción, tipo,
  interacción, si se permitía enviar y si publicó); cada fila de barrido registra
  `initiative_reengagement` (con silencio aplicado); las bienvenidas registran
  `welcome_decision`. Los logs nunca contienen texto de mensajes.

### Coste y validación

La reconexión añade como máximo una evaluación del planificador por chat apto cada
dos horas, seis tras un episodio que acabó en silencio (hasta seis revisiones
dentro del episodio si espera), y cada bienvenida una finalización. El alcance
fue estático: TypeScript API, `python3 scripts/checks/initiative-sql-compile.py`
(también cubre `welcome.ts`), `scripts/checks/onboarding-sql-compile.py` y migración
más fixtures en D1 local de workerd para inserción autorreferencial de bienvenida,
triggers de cancelación, reclamo inmediato, selección de barrido (incluidos chats
solo con bienvenida) y upsert. No se ejercitó inferencia real, Workflow, cliente
ni dispositivo; el arnés opcional `scripts/checks/initiative.cjs` no se ha actualizado
para 0094. Mide logs de decisión antes de ajustar el ritmo.
