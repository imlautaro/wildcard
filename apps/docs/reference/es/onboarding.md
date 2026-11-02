# Registro y primer círculo

Las cuentas nuevas pueden registrarse en iOS y web con email y contraseña. Tras
registrarse, ambos clientes requieren onboarding antes de mostrar la app normal.
Las cuentas existentes están exentas: la migración 0041 borra la bandera nueva de las filas ya
presentes, mientras que las inserciones futuras requieren onboarding por defecto. La autenticación
sigue usando Better Auth y las sesiones firmadas existentes. La propiedad del email no se
verifica; no hay recuperación configurada. No se añade proveedor de correo.

## Experiencia

El onboarding pide nombre, edad en años enteros (1–120), Masculino/Femenino, idioma preferido, país y estilo
de avatar: Caricatura, Anime, Película animada en 3D, Personas realistas, Mascotas animadas en 3D o Personalizado
(consulta [estilos de personaje](#character-styles)). También pide un
círculo de Amigos, Estudio o Trabajo y ofrece un interruptor independiente **Crear un grupo con mis
cinco contactos** (activado por defecto). El propósito del círculo da forma a los contactos incluso
con creación de grupo desactivada. Estudio pregunta qué estudia la persona; Trabajo
pregunta a qué se dedica (1–200 caracteres). Amigos oculta este campo y ambos
clientes omiten su valor al enviar; el servidor también lo borra y excluye
de la generación. El contexto de estudio/trabajo da forma a identidades complementarias y adecuadas
a la edad, sin afirmar credenciales ni forzar cada conversación a un rol. El catálogo compartido
contiene códigos de países/territorios ISO 3166-1 e idiomas ISO 639-1, con etiquetas en inglés
de los nombres visibles Intl del runtime. Ambos clientes consumen las mismas opciones
del servidor y reetiquetan países e idiomas por código en el idioma de la interfaz
(`Intl.DisplayNames` en web, `Locale.localizedString` en iOS), ordenados en
ese idioma y con la primera letra mayúscula; los estilos y tipos de círculo se
traducen por código, conservando el nombre de la API para códigos desconocidos. Un borrador nuevo
sugiere el idioma de interfaz (español o inglés) como idioma preferido de los contactos;
sigue editable y es independiente del idioma de interfaz
después ([localización](localization.md)). Los nombres introducidos pueden conservar su
ortografía original.

La pantalla pide explícitamente aceptación de memoria compartida antes de enviar.
Explica que los miembros del grupo pueden leer todo el historial y que los hechos de chats privados
y grupales pueden convertirse en recuerdos compartidos recordados en otros lugares. No añade
participantes humanos, envía invitaciones ni acepta procesamiento Contributor.

El servidor crea exactamente cinco contactos ficticios y opcionalmente un grupo con
la cuenta y esas mismas cinco identidades de agente. Los nombres de grupo son deterministas:
**Friends**, **Study Group** o **Work Team**; el modelo no elige nombre. Muse Spark 1.3 Estándar propone
nombres de pila comunes para el país seleccionado, un elenco mixto por género, identidades
conductuales distintas, afinidades temáticas opcionales, descripciones de identidad en inglés y
descripciones físicas. Las identidades usan valores, criterio, peculiaridades conversacionales y
defectos, sin asignar empleo, matriculación ni rutinas físicas. El contexto de trabajo/estudio
informa fortalezas temáticas y enfoques en lugar de una biografía humana.
Los planes guardados conservan sus identidades originales al reintentar; las instrucciones de respuesta interpretan
biografías heredadas sin afirmar experiencias vividas. Consulta [personalidad](personality.md).
Ningún ranking externo de popularidad verifica los nombres elegidos por el modelo. El género de la persona
no determina géneros, temperamentos ni roles románticos del elenco.
El país determina contexto de nombres, no apariencia ni comportamiento estereotipado.
Para cada estilo de avatar, los planes nuevos de identidad deben dar a cada contacto una edad
entera dentro de los dos años de la edad de la persona, limitada a 18–120, y género
masculino o femenino explícito. El servidor valida este rango y un elenco mixto antes de
guardar el plan. Descripciones y apariencia deben coincidir con edad y etapa vital
de cada contacto. Los envíos heredados sin edad conservan el respaldo adulto (18–80). El servidor asigna a cada contacto generado un cumpleaños aleatorio que coincide con su edad planificada, con mínimo de 18.
Los perfiles generados omiten el nombre/género de la persona e indican a cada contacto
usar por defecto el idioma seleccionado, incluso en grupos. Las respuestas dependen todavía
de que el modelo siga esa dirección; el idioma no es un filtro de traducción.

Cinco perfiles contrastantes (oyente paciente, aventurero juguetón, escéptico analítico,
artista expresivo, organizador práctico) activan automáticamente el sistema existente
de personalidad. La generación de texto aporta identidades separadas en torno a esos
perfiles. Cinco fortalezas (explicación/evidencia, planificación práctica, exploración
creativa, comunicación reflexiva y descubrimiento cotidiano) se mezclan por separado
de los temperamentos y se suministran junto a ellos al generar identidades. La fortaleza
de cada contacto incluye enfoques relacionados, sin convertirla en trabajo, rol exclusivo
ni afirmación de credenciales profesionales. Las descripciones conservan intereses no relacionados
y adaptan estas fortalezas a la edad. La asignación se guarda
como `specialties` en cada plan de identidad y luego en la personalidad compartida, para reutilizarla
en reintentos. Se conservan contactos ya completados y planes heredados sin especialidades;
no se reescriben automáticamente. Cada contacto puede seguir hablando
de cualquier tema; el contexto compartido de personalidad desalienta el encauzamiento forzado y
conocimientos no respaldados. Son indicaciones al modelo, no diferencias de capacidad medidas.
Los creadores pueden editar identidad y especialidades después en **Detalles del contacto → Personalidad**.
Los perfiles tienen cumpleaños ficticios aleatorios que coinciden con sus edades adultas generadas. Todas las descripciones redactadas por el equipo y
nombres de grupo están en inglés; los nombres de contactos conservan escritura nativa. Un grupo opcional empieza
vacío y acepta mensajes inmediatamente después de crearse. Los cinco contactos aparecen
en Contactos y de inmediato en Chats, con **Aún no hay mensajes** y cero mensajes
sin leer. La migración 0049 añade un marcador `onboarding_chat` por contacto; solo lo reciben los
contactos recién publicados de onboarding. Los demás contactos vacíos siguen ocultos en
Chats. Cada contacto listo del primer círculo envía luego un mensaje generado de bienvenida,
en orden del plan y separados 20–30 segundos, el primero inmediatamente ([mensajes de bienvenida](initiative.md#welcome-messages),
migración 0094); no se sintetizan estados de recibos ni otros eventos no leídos.
Las filas usan la hora de creación hasta que la actividad real establece el orden normal; iOS oculta
la hora del mensaje mientras está vacío y web muestra la hora de creación de la fila.

Cada avatar se genera con Meta `muse-image-1.0`, no con un modelo OpenAI, mediante
`POST https://api.meta.ai/v1/images/generations`. Solicita un JPEG cuadrado,
salida base64 y razonamiento bajo, con búsqueda de referencias/búsqueda web/shell deshabilitados.
El prompt de retrato realista es exactamente:

```text
${identity.age} years old ${identity.gender} social media natural photo taken with phone. profile picture for social media. Appearance: ${identity.portrait}. Personality cues: ${identity.description}.
```

Omite las fórmulas anteriores de cabeza y hombros, fondo, ropa, marca de agua y
persona ficticia. Otros estilos piden explícitamente apariencia adecuada a la edad y la edad planificada, sin la instrucción anterior de solo adultos.
Solo las descripciones ficticias de contactos van a las solicitudes de retrato, no los detalles personales de onboarding
ni conversaciones existentes. Los bytes generados se limitan a 8 MiB y un
JPEG cuadrado de hasta 4096 píxeles porque los controles de tamaño de Meta fijan proporción
en lugar de garantizar dimensiones. Las subidas manuales conservan sus límites de 1024 píxeles y
512 KiB. Las rutas privadas R2 y cachés de imágenes existentes sirven las fotos.

## Estilos de personaje

Además de Caricatura, Anime, Película animada en 3D y Personas realistas, onboarding y generación
 de contactos con IA ofrecen (2026-10-31):

- **Mascotas animadas en 3D**: cada contacto es una mascota animal (una especie distinta cada uno, por
  ejemplo golden retriever, gato atigrado, loro, tortuga, conejo) dibujada como
  personaje de película animada 3D. Los nombres proceden de un conjunto de nombres de mascotas usados
  comúnmente en el país seleccionado, en su idioma (una prueba argentina produjo
  Toby, Mate, Frida, Rocco y Gala).
- **Personalizado**: un campo de texto (**Describe tus personajes**, 1–80 caracteres,
  `customStyle`) como "robots simpáticos", "gatitos", "los padres fundadores de Estados Unidos" o
  "chicas como las Chicas Superpoderosas". Nombres, identidades y retratos siguen el tema.
  La llamada de nombres también informa si el tema implica un único género
  (`themeGender`); el onboarding entonces da ese género a los cinco contactos en lugar de la
  mezcla habitual (el tema de chicas produjo cinco contactos femeninos llamados Gema, Miel, Azúcar,
  Dulce y Nova). Para un contacto generado individualmente, la persona sigue eligiendo el
  género.

`characterTheme` (`shared/onboarding.ts`) convierte el estilo en tema. La generación de
identidad añade `themedIdentityInstruction` (`contacts/portrait.ts`): cada contacto recibe
un `kind` (máximo 60 caracteres, por ejemplo "Golden retriever" o "Colonial-era
statesman") que inicia su descripción ("Golden retriever (male), persona age 30.")
en lugar de "30 years old male"; edad y género siguen siendo la personalidad de voz y el
cumpleaños, dentro del rango habitual. Los personajes siguen siendo contactos conversacionales bajo
las mismas reglas de identidad. Los temas que nombran personas reales o personajes protegidos producen
personajes originales con ese espíritu, estilo y época, nunca las personas reales ni una
semejanza; el prompt del retrato indica lo mismo. El texto personalizado se trata como datos
creativos no confiables en cada prompt. Los planes temáticos de onboarding permiten 9.000 tokens de completado
(7.000 en otro caso) porque el modelo razona más sobre temas; un plan truncado
ocasional se reintenta con los reintentos existentes del paso.

Compatibilidad: `GET /onboarding/options` enumera Personalizado solo con `?custom=1`, que
envían los builds actuales iOS y web; así los builds iOS anteriores (que no pueden enviar
`customStyle`) solo reciben Mascotas animadas en 3D. `POST /onboarding` y
`POST /contacts/generation` aceptan el `customStyle` opcional y lo requieren para
Personalizado (salvo onboarding sin contactos IA); se ignora para otros estilos.

Comprobado en vivo el 2026-10-31 (Estándar, plan de onboarding con nombres, sin retratos):
mascotas para Argentina, "robots simpáticos", "padres fundadores de los Estados Unidos"
(después de una corrección, estadistas del siglo XVIII en lugar de animales) y "chicas estilo las
chicas superpoderosas". No se generaron retratos de los estilos nuevos en los tests.

## Configuración progresiva

Desde el 2026-10-31 nadie espera en la pantalla de onboarding mientras se generan contactos
(tardaba varios minutos: una llamada de identidad más cinco retratos secuenciales).

- **Contactos IA opcionales.** El formulario tiene **Crear mis primeros cinco contactos con IA**
  (activado por defecto). Al desactivarlo, oculta apariencia, círculo, grupo y consentimiento
  de memoria compartida; el botón dice **Comenzar** y `POST /onboarding` con
  `createContacts: false` completa el onboarding de inmediato: guarda el nombre y borra
  `onboarding_required`, sin Workflow, contactos ni grupo. Se pueden crear contactos
  después desde Contactos.
- **Directo a la app.** Con contactos IA, enviar guarda la entrada y
  borra `onboarding_required` en el mismo lote, luego inicia el Workflow. Ambos
  clientes actualizan el perfil tras enviar y abren Chats inmediatamente, también
  con contactos IA desactivados. Web navega directamente a `/chats` en lugar de
  pasar por el inicio de Para ti en pantallas amplias; reanudar configuración completada o
  en ejecución y la redirección de `/onboarding` ya completado usan la misma ruta.
  La [primera visita a Para ti](updates.md#first-visit-and-empty-feeds) ofrece estados
  de bienvenida conscientes de la configuración si se abre antes de que existan publicaciones.
- **Contactos deshabilitados durante la creación.** Después del plan de identidad, un paso atómico
  `publish-contacts` inserta los cinco contactos, personalidades e identidades compartidas de
  agentes con `contact.setup_pending = 1` (migración 0077) y sin versión de foto.
  Los cinco retratos corren después como pasos paralelos de Workflow; cada uno guarda su JPEG y
  habilita su propio contacto (`setup_pending = 0`, versión de foto fijada salvo que la persona
  ya subiera una foto), para poder hablar con el primer contacto mientras
  aún se dibujan los otros. Un retrato que sigue fallando tras reintentos
  habilita el contacto con iniciales en lugar de hacer fallar el círculo. `photo_count` ahora
  cuenta contactos listos, en cualquier orden. Un paso final `publish-circle` crea el
  grupo opcional con los contactos aún existentes y marca completa la configuración.
- **Chats durante la creación.** Ambas listas siguen `GET /onboarding` cada 3 segundos
  mientras el estado es `queued` o `generating` y muestran "Creando tus contactos… N de 5
  listos". Antes de que existan identidades muestran cinco marcadores "Contacto nuevo";
  después cada fila se atenúa con "Creando…" y no puede abrirse
  (también en el directorio web Contactos). Los contactos exponen `setupPending` (0 o 1); la
  revalidación de lista que los clientes ya ejecutan recoge cada contacto cuando
  está listo. `POST /contacts/:id/turns` responde 409 "Este contacto todavía se está
  creando" para un contacto pendiente.
- **Fallo y reintento.** Ante fallo se habilitan los contactos publicados (con iniciales si
  faltaba retrato) y la lista muestra "No pudimos terminar de crear
  tus contactos" con **Reintentar**, que vuelve a enviar a `/onboarding`: una configuración
  existente incompleta se reintenta con sus preferencias guardadas aunque
  `onboarding_required` ya esté borrado (una completada devuelve su estado).
- **Compatibilidad.** Los clientes anteriores no envían `createContacts` (se trata como true). Los builds
  iOS antiguos siguen mostrando progreso de onboarding hasta completar, como antes, y
  desconocen `setupPending`: si se abre un contacto pendiente, el envío se rechaza con
  el mensaje 409. Las instancias de Workflow ya en ejecución durante el release se repiten con
  el esquema nuevo de pasos; una discrepancia las hace fallar hacia la ruta existente Reintentar.

No verificado en dispositivos ni contra una ejecución real de Workflow: se comprobó con tipos estáticos de API, web e
iOS, `onboarding-sql-compile.py` y las sentencias cambiadas en D1 local de
workerd.

## Configuración duradera y recuperación

- `GET /api/v1/onboarding/options` devuelve el catálogo autenticado de opciones.
- `GET /api/v1/onboarding` devuelve estado, entrada guardada, cantidad de retratos e ID final
  de grupo, dentro de la cuenta firmada actual.
- `POST /api/v1/onboarding` acepta exactamente `name`, `age`, `gender`, `language`, `country`,
  `style`, `createGroup` (booleano), `circleType` (`friends`, `study`, `work`),
  `occupation` (cadena, obligatoria y no vacía para trabajo/estudio) y
  `sharedMemoryConsent: true`, más `createContacts` opcional (booleano; con `false`,
  consentimiento puede ser false y trabajo/estudio no necesitan ocupación, consulta
  [configuración progresiva](#progressive-setup)). Se sigue aceptando la solicitud anterior de siete campos
  como Amigos con creación de grupo habilitada, para clientes instalados anteriores. La validación y seis envíos por
  cuenta/minuto acotan solicitudes. El registro permite cinco intentos por IP/minuto.

Los envíos nuevos requieren edad. Los envíos persistidos existentes sin edad siguen siendo
reintentables sin cambios: se reutilizan perfiles/fotos guardados; un plan nuevo de identidad para un
 envío heredado usa el rango adulto. Un plan heredado guardado sin edad/género
explícitos usa la redacción de foto con teléfono sin inventar demografía faltante.
No se regeneran imágenes existentes. El primer envío aceptado congela la entrada. Los posteriores reintentan la misma
configuración y no pueden reemplazar su plan de identidad. `account_onboarding` guarda entrada,
plan, progreso e ID final de grupo. Un ID determinista único de Workflow por cuenta
arbitra el despacho simultáneo. El Cron recupera despachos pendientes y registra
fallo terminal. Un **Reintentar configuración** visible reinicia una instancia con error/terminada.

La generación de identidad persiste el plan antes del trabajo de retrato. Los contactos se
publican después deshabilitados y se habilitan uno a uno al terminar sus retratos (consulta
[configuración progresiva](#progressive-setup)); cinco pasos paralelos guardan JPEGs bajo
IDs inmutables en el bucket privado existente y los reintentos omiten imágenes ya almacenadas.
El lote final D1 crea el grupo opcional y marca completa la configuración. Cada lote es
atómico e idempotente tras completarse. El trigger normal de contactos crea cada
agente, conservando identidades compartidas en lugar de copias. No se inventa mensaje de bienvenida ni
conversación en segundo plano durante la configuración.

La generación continúa después de cerrar cualquier cliente. Las llamadas al modelo tienen reintentos/tiempos de espera
acotados (45 segundos para texto, 180 por retrato; presupuestos de paso
2/4 minutos). Una solicitud exitosa al proveedor antes de un fallo de almacenamiento puede
repetirse y cobrarse otra vez; no es facturación exactamente una vez. El trabajo fallido retiene
plan e imágenes completadas para reintentar. Los contactos son visibles pero deshabilitados hasta terminar su propio paso de retrato. No hay vencimiento automático
de configuración fallida: los operadores deben considerar filas/imágenes retenidas al gestionar
almacenamiento. Eliminar contactos normalmente elimina fotos publicadas por rutas existentes.
Eliminar cuenta ahora pone en cola prefijos de fotos de cuenta y el Workflow de onboarding,
aunque nunca se publicara un contacto o ya terminara la configuración (migración
0069). El despacho vuelve a comprobar el padre tras crear/reiniciar y los pasos de retrato
comprueban alrededor de la subida, poniendo duraderamente en cola instancias/bytes tardíos cuando gana la eliminación.
El outbox/Cron existente reintenta fallos externos; consulta
[limpieza de cuentas](admin.md#deleting-an-account). Estos cambios no añaden caché de cliente
ni UI de configuración y requieren verificación en ejecución con datos ficticios.

## Caché y aislamiento de cuentas

Cada cliente posee una instantánea de configuración en memoria, catálogo de opciones, borrador y envío
pendiente por sesión. La primera lectura bloquea; reabrir reutiliza opciones, progreso
e incluso resultados vacíos/pendientes inmediatamente y luego revalida. Los borradores sin enviar
sobreviven a navegación en memoria; las entradas enviadas se reanudan desde D1 tras reiniciar app/navegador.
No hay persistencia local de campos personales del onboarding. Edad, propósito del círculo, interruptor de grupo y ocupación/estudios siguen las mismas reglas de borrador/instantánea/reinicio de sesión que los otros campos. La entrada D1
se retiene explícitamente con la configuración de cuenta para reanudar y [generar contactos con IA](contact-generation.md); edad, género,
país y ocupación/estudios no son campos públicos del perfil ni se adjuntan a respuestas de miembros de grupo. El contexto de trabajo/estudio se envía a generación de identidad Estándar; los contactos generados reflejan el campo sin incorporar detalles personales de la persona.

Las lecturas se deduplican, los envíos pendientes sobreviven a navegación y las revisiones
rechazan respuestas anteriores a una mutación o cambio de cuenta. El polling actualiza
aproximadamente cada 3 segundos durante trabajo y 10 segundos en otro caso; hay actualización manual
ante fallo. El contenido en caché y borrador siguen utilizables ante errores
transitorios. Cerrar sesión, expiración y cambio de cuenta borran todo el estado de configuración y
rechazan respuestas tardías. Actualizar un perfil completado abre la app normal, cuyas cargas
iniciales de contactos/grupos descubren los recursos creados atómicamente. Los bytes de avatar
siguen usando las cachés existentes acotadas por cuenta/contexto/versión
y sus presupuestos de protección/expulsión; no se añade caché independiente de imágenes.
La autorización del servidor se comprueba en cada solicitud. Los clientes controlan la entrada a la app;
esto no es una frontera de autorización que impida usar a clientes API antiguos
las rutas existentes de cuenta firmada antes del onboarding.

## Configuración, validación y limitaciones

Consulta [infraestructura](infrastructure.md#account-onboarding) para la migración 0041,
aprovisionamiento de Workflow, acceso a secretos y publicación automática. Las comprobaciones estáticas de tipos API/web,
tipos iOS y `python3 scripts/checks/onboarding-sql-compile.py`
son adecuadas sin lanzar la app. Los builds y tests funcionales requieren
solicitud de la persona según los acuerdos del repositorio.

Comprobaciones pendientes en dispositivo/navegador: registro nuevo, exención de cuentas existentes,
opciones vacías/recuperación de errores, cada selector, validación y coincidencia de edades en los cuatro estilos, los tres propósitos, entrada condicional de trabajo/estudio, Amigos ignorando ese contexto, configuración con/sin grupo, nombres simples de grupo, cinco filas vacías de Chats y exclusión de otros contactos vacíos, validación de consentimiento, generar cada
estilo, reapertura/navegación atrás, retención del borrador sin conexión, envíos duplicados, reintento de retrato
fallido, expiración de sesión/cambio de cuenta, lista final de grupo, personalidades/especialidades
editables, fortalezas distintas sin emparejamientos fijos de temperamento, respuestas sobre temas amplios sin encauzamiento forzado, respuestas privadas/grupales en idioma preferido y acceso privado a avatares.
Verifica también reinicio tras interrupción de despacho y fallo de transacción final. La validación
estática no establece calidad del modelo, acceso real a proveedores, diseño UI,
despliegue en vivo ni comportamiento funcional. Durante la implementación no se realizó inferencia en vivo, migración remota ni
publicación.

Contratos de proveedores comprobados el 28 de octubre de 2026:
[modelos de Meta](https://dev.meta.ai/docs/models),
[esquema de generación de imágenes](https://dev.meta.ai/docs/api-reference/images/schemas),
[reglas de Workflows Cloudflare](https://developers.cloudflare.com/workflows/build/rules-of-workflows/).

La creación con IA reutiliza estas preferencias persistidas sin pedir otra vez el perfil de la persona. Los planes heredados incompletos con menores se reemplazan por planes adultos antes de publicar; pueden quedar fotos previas no publicadas en R2 para limpieza del operador. Los círculos completados no se regeneran automáticamente.

## Explicaciones

El formulario de onboarding mantiene visible el texto de consentimiento de memoria compartida junto a su interruptor o
casilla. Las notas sobre contactos generados (nombres, idioma, edades, género) y el tipo
de círculo están detrás de botones de información en iOS y web, igual que la nota Tu bot en Crear contacto. Consulta el patrón de ajustes en
[contactos](contacts.md#contact-details-layout).

## Preferencias de generación conversacional

Las descripciones nuevas de identidad retienen preferencias de idioma y redacción regional, con
gramática y vocabulario sutiles en lugar de caricatura nacional. Los contactos nuevos
también inicializan el preset existente de acento cuando el país seleccionado tiene
uno. El temperamento creativo favorece ideas pertinentes nuevas sin exigir habla
poética ni verbosidad máxima. Las descripciones existentes permanecen intactas.

[Estilo de conversación](conversation-style.md) solo puede leer códigos de idioma/país
de las preferencias de generación del plan original retenido para agentes existentes
del primer círculo. Identifica origen por ID de agente en ese plan, no por la bandera mutable de
lista del onboarding, de modo que vaciar historial no pierde la preferencia. Nunca
reenvía el perfil de onboarding como contexto de conversación ni aplica el país de
un participante nuevo a un agente compartido. No se añade retención, caché ni migración.
Ambos clientes usan el mismo comportamiento del servidor; siguen pendientes comprobaciones semánticas/en dispositivo.

## Variedad de nombres

Los primeros círculos nuevos usan el [conjunto compartido de nombres](contact-generation.md#varied-generated-names):
24 candidatos por género masculino/femenino, selección aleatoria del servidor sin reemplazo
y una mezcla 2/3 de géneros barajada. Los nombres se asignan independientemente de los cinco
temperamentos ordenados y especialidades barajadas. El modelo de identidad debe conservar los
nombres/géneros asignados. La escritura nativa sigue siendo válida. Se excluyen los nombres de contactos existentes de
la cuenta y el nombre humano dentro de la ventana acotada documentada;
no se leen nombres de otras cuentas. Un completado extra Estándar de texto añade latencia
y costo antes de guardar el plan inmutable. Los contactos completados y planes guardados
conservan sus nombres; no se añade regeneración histórica. Ambos clientes usan el
mismo Workflow y contrato existente de progreso/caché. La diversidad real cultural/de nombres,
gestión de fallos del proveedor y recuperación en dispositivo siguen pendientes de verificación en vivo.
