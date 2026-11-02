# Creación de contactos con IA

Crear contacto es un único formulario en ambos clientes; todo lo que se deja vacío se genera con IA.
La acción **Crear** está en la barra superior (barra de herramientas iOS, barra de página web); crear abre
el chat del contacto nuevo (iOS reemplaza la pantalla de añadir contacto por él). El formulario pide:

- **Nombre**: opcional. Su placeholder indica que un nombre vacío se genera con IA; un nombre escrito
  (1–100 caracteres, sin caracteres de control) se mantiene exactamente como nombre de la identidad.
- **Foto**: **Generar con IA** (predeterminado), **Subir una foto** (el mismo recorte JPEG cuadrado
  que en detalles del contacto) o **Sin foto**. El avatar anticipa la elección.
- Los campos del bot indicados abajo. **Estilo visual** solo aparece si se genera la foto; con
  foto subida o sin foto cambia a **Personaje** (Persona, Mascotas animadas en 3D, Personalizado),
  porque solo esos temas siguen dando forma a la identidad. Persona conserva el último estilo de retrato
  (Caricatura por defecto) como `style` enviado. Un pie explica que los campos vacíos se generan,
  la personalidad siempre se genera y todo puede editarse después.

Por tanto, cada contacto pasa por el trabajo en segundo plano y empieza con personalidad
 generada; no hay ruta instantánea sin personalidad en los clientes. El antiguo
`POST /api/v1/contacts` solo con nombre permanece por compatibilidad, pero ningún cliente
lo usa ya. Los campos del bot son:
estilo visual (Caricatura, Anime, Película animada en 3D, Personas realistas, Mascotas animadas en 3D o
Personalizado con tema de hasta 80 caracteres; consulta
[estilos de personaje](onboarding.md#character-styles)), relación
(Amigo, Compañero de estudio, Colega de trabajo), edad entera de 18–120, género, idioma
preferido y país. Idioma/país/estilo reutilizan inicialmente las preferencias guardadas del
onboarding; siguen siendo ajustes editables del bot. No se vuelven a pedir datos demográficos de la persona.
Las cuentas anteriores al onboarding pueden elegir los mismos campos del bot sin
completar un cuestionario personal.

`account_onboarding.input_json` ya persiste las entradas de onboarding después de completar.
Se retiene para esta función y reanudación, no se expone como perfil público.
La generación de identidad con Estándar recibe edad, idioma y país guardados y, para un contacto de
estudio/trabajo, ocupación/estudios. Los amigos omiten ocupación/estudios. Se excluyen nombre de usuario,
email, conversaciones y credenciales. La generación existente de personalidad
recibe el contexto de onboarding del creador y la personalidad guardada del contacto,
nunca historial de chat privado. Las entradas son datos no confiables del prompt. Las instrucciones del modelo
evitan copiar detalles personales de la persona a la identidad compartida generada; esto necesita
verificación semántica en vivo.

La generación nueva de identidad, regeneración de personalidad y onboarding comparten guía para
una identidad conductual concisa: valores, criterio, peculiaridades conversacionales y defectos.
Los intereses opcionales son temas de conversación, no actividades físicas realizadas por el contacto.
Los conocimientos y fortalezas siguen configurables mediante especialidades, sin credenciales
fabricadas ni experiencia vivida. Regenerar reemplaza la biografía anterior en el borrador
en lugar de parafrasearla; sigue requiriendo Guardar. Los planes guardados de trabajos son inmutables,
por lo que los reintentos con un plan previo pueden conservar una identidad anterior. Las instrucciones compartidas de
conversación también gestionan esos perfiles heredados. Sin cambios de esquema, API ni caché.
Siguen pendientes comprobaciones semánticas en vivo de generación y respuestas.

Una identidad nueva tiene nombre generado, retrato, personalidad habilitada, especialidades,
zona horaria y los diecisiete rasgos de temperamento (un perfil generado que omite Emojis o Stickers recibe un valor inferido). Muse Spark 1.3 Estándar crea el texto;
la integración existente Muse Image crea el retrato. El servidor elige un
cumpleaños civil válido aleatorio que da exactamente la edad solicitada en la zona
horaria generada del bot y lo persiste con el plan antes del trabajo de imágenes. El onboarding también asigna
cumpleaños aleatorios, con edades de al menos 18 en cada estilo visual. Las ediciones nuevas
de cumpleaños con menos de 18 años se rechazan en la API y ambos editores. Las filas heredadas de
personalidad siguen legibles; un cumpleaños inválido de menor edad debe corregirse
antes de guardar. Las personalidades de reemplazo generadas corrigen esos cumpleaños.

## Foto con IA para un contacto existente

El creador ve **Generar con IA** junto a Elegir/Eliminar foto en detalles del contacto
(hoja de foto web, menú de foto iOS). Una hoja pide el estilo visual (y tema
Personalizado), completado con el estilo guardado de onboarding. `POST /api/v1/contacts/:id/photo/generate`
acepta `{ style }` o `{ style: "custom", customStyle }`, comprueba acceso de creador y
consume su propio presupuesto de cuatro intentos por cuenta/minuto (`contact-photo-generate`).
Los contactos no guardan texto de apariencia, por lo que Muse Spark 1.3 Estándar deriva primero una a partir de
la identidad guardada, edad de cumpleaños y género del perfil de voz; Muse Image crea luego el
retrato. El resultado reemplaza la foto con el mismo compare-and-swap que una subida,
de modo que gana una foto cambiada entretanto (409) y los bytes generados se ponen en cola para eliminar.
La solicitud puede tardar minutos (iOS permite 240 segundos); el Worker termina en
`waitUntil` cuando la persona sale y la siguiente actualización del contacto muestra la foto nueva.
Solo esperan los controles de foto en ambos clientes. Un fallo (502) deja la foto sin cambios.
Si el cliente abandona antes (pasar iOS a segundo plano cancela la solicitud sin mostrar
error), la foto simplemente aparece en la siguiente actualización. En iOS la foto generada también
reemplaza cualquier elección local de foto sin guardar en detalles del contacto.

## Creación duradera

La migración `0052_contact_generation.sql` añade trabajos privados acotados a la cuenta con
entrada/plan inmutables y un trabajo activo único por cuenta (incluidos fallidos).
Los clientes envían un UUID de envío, lo retienen ante respuestas inciertas y
recuperan el último trabajo de D1 tras reiniciar. `POST /api/v1/contacts/generation`
acepta `{ id, input }`, donde `input` puede añadir `name` y `photo` (`generate`, `upload`,
`none`; los clientes anteriores lo omiten y reciben `generate`). Con `upload`, el cuerpo añade
`upload`, el JPEG cuadrado en base64 (máximo 512 KiB, límite de solicitud 720 KB). Un trabajo recién
insertado lo almacena temporalmente en `contacts/<user>/generation/<job>.jpg`; un fallo de almacenamiento
elimina el trabajo. Reintentar un trabajo de subida existente puede omitir los bytes. El paso de retrato
copia la foto temporal (o se omite con `none`); publicar fija `photo_version` solo
cuando existe foto y luego elimina la copia temporal. Una foto temporal ausente publica
sin foto. La migración 0095 añade la clave temporal al trigger de limpieza al eliminar trabajos.
El prompt de identidad recibe el nombre elegido como `assignedName` fijo, como dato no confiable. `GET` devuelve `{ job }`, incluidos estado y
`contactID` final. El `ONBOARDING_WORKFLOW` existente acepta un ID opcional de generación;
las instancias anteriores de onboarding conservan su rama original. El Cron de minuto existente
recupera despachos en cola y registra fallos terminales de Workflow. Reintentar reinicia
la misma instancia y reutiliza texto guardado y cualquier retrato completado.

Los pasos de texto y retrato tienen reintentos acotados y presupuestos de 2/4 minutos respectivamente.
Un lote atómico final publica un contacto, su personalidad y el trabajo completado. También marca como pendiente el [mensaje de bienvenida](initiative.md#welcome-messages) del contacto, y un paso posterior lo inicia de inmediato (migración 0094).
El trigger de contacto crea un agente; compartir después concede acceso a ese mismo
agente. Los contactos nuevos conservan los valores ordinarios de memoria compartida; no se inventa
grupo ni consentimiento. El único evento no leído es el mensaje de bienvenida generado por el contacto. Las fotos publicadas reutilizan rutas
privadas R2 y cachés existentes de imágenes. Eliminar un contacto generado elimina su trabajo y
pone sus checkpoints de Workflow en cola para eliminar. Las filas de trabajo/plan completado y retratos
no publicados fallidos permanecen con una cuenta/trabajo vigente sin vencimiento automático.
La migración 0069 registra prefijos de retratos no publicados al eliminar trabajos y prefijos
 de cuenta/checkpoints de onboarding al eliminar cuentas en el outbox duradero de limpieza.
El despacho vuelve a comprobar existencia del trabajo después de crear o reiniciar, incluida una confirmación de creación
perdida. Los pasos de retrato vuelven a comprobar después de generar y subir y ponen
los bytes tardíos en cola para eliminar. Los fallos externos reintentan mediante Cron; la aceptación de eliminación
de cuenta no implica que R2/Workflow terminen inmediatamente. Consulta
[limpieza administrativa](admin.md#deleting-an-account). Los trabajos abandonados en cuentas todavía
existentes conservan su estado normal de reintento. Un éxito del proveedor seguido de fallo de almacenamiento
puede repetir una solicitud facturable. No es facturación de inferencia exactamente una vez.

El lote de publicación también habilita [mensajes de voz](voice.md) para la conversación del
creador y guarda género y edad solicitados como perfil de voz del agente.
La migración 0061 también inicializa un acento compartido desde el país del bot elegido explícitamente
cuando es compatible con `shared/voice.ts`; otros países usan Voz predeterminada.
El creador puede cambiarlo o borrarlo en detalles del contacto en cualquier cliente. Es una
preferencia de habla, no una nacionalidad almacenada. No se rellenan contactos existentes.
Un paso separado de mejor esfuerzo asigna después una voz ElevenLabs coincidente, prefiriendo
descripciones conversacionales dentro del conjunto demográfico cuando están disponibles. Cuando la
función no está disponible, se elige la voz al necesitarla por primera vez.
Los contactos de onboarding del primer círculo reciben el mismo perfil y habilitación, sin inferir
acento desde el país de la persona. Regenerar personalidad conserva el acento guardado.


### Actividad visible de creación

En iOS y web, enviar reemplaza inmediatamente los campos del bot por un spinner
indeterminado destacado, **Iniciando la creación del contacto…** y **Enviando tu solicitud…**.
Después de confirmar el trabajo duradero, el título cambia a **Creando tu contacto…**
y los mensajes explicativos rotan cada cinco segundos. Describen el trabajo general,
no etapas medidas ni un porcentaje de finalización. El panel explica que la
creación puede tardar unos minutos y, tras confirmarse, continúa al salir
de la pantalla o cerrar la app. La acción Crear dice **Creando…** y está deshabilitada hasta que la solicitud/trabajo deja de
estar activa. Reabrir con estado activo en caché muestra la actividad de inmediato. El éxito sigue
abriendo el chat; los errores conservan el flujo existente de reintento/actualización.

El índice de mensajes es solo estado de presentación de la vista. Su temporizador se detiene al desmontar
(y mientras iOS está inactivo); no solicita datos, cambia estado del trabajo, persiste
progreso ni crea caché. Los stores de sesión, polling, IDs de envío,
reinicio por cuenta y protecciones de respuestas desactualizadas existentes siguen siendo autoritativos. Web expone los cambios
de texto mediante una región de estado no intrusiva y respeta movimiento reducido para el spinner;
iOS usa el indicador accesible nativo de actividad. Verifica envío inmediato,
solicitudes lentas/inciertas, reintento, recuperación en cola/en ejecución, finalización, pantallas estrechas,
texto grande, movimiento reducido, lectores de pantalla, recuperación sin conexión y cambio de cuenta
con datos ficticios en ambos clientes; las comprobaciones estáticas no establecen estos comportamientos.

## Personalidades existentes

Solo el creador ve **Generar con IA / Regenerar con IA** en Personalidad.
`POST /api/v1/contacts/:id/personality/generate` devuelve `{ personality, revision }`
como borrador editable, sin guardar. Reemplaza identidad, especialidades, zona y
todos los rasgos, habilita personalidad y conserva el nombre y un cumpleaños adulto
existente; los cumpleaños ausentes/de menor edad reciben un reemplazo adulto aleatorio. Los borradores
modificados preguntan antes de reemplazarse. Revisa, regenera o usa la acción Guardar existente.
Guardar usa la comparación existente de revisión y restablece observaciones emocionales.
La generación vuelve a comprobar propiedad/acceso y la revisión guardada después de inferir;
los cambios simultáneos devuelven conflicto. Seis intentos de generación por cuenta/minuto
limitan tanto creación como solicitudes de personalidad. Las solicitudes de personalidad tienen el
tiempo de espera acotado existente de inferencia de texto; iOS permite 90 segundos de transporte.
Un fallo transitorio de generación conserva el perfil guardado y el borrador actual.

## Cachés y verificación

La creación tiene un borrador de sesión, instantánea de opciones, trabajo actual e ID pendiente
 de envío: `AuthStore.contactGeneration` en iOS, `useContactGeneration` en web.
La reapertura muestra datos de caché inmediatamente y luego deduplica/revalida en
segundo plano; el polling es cada 3 segundos durante generación y 10 segundos en otro caso.
Los campos sin enviar permanecen solo en memoria. Un trabajo enviado sobrevive al reinicio del proceso
en D1. Mientras se ejecuta, el formulario muestra progreso y queda bloqueado. Un trabajo completado
nunca se muestra como estado del formulario: cuando esta sesión lo envió u observó, el formulario abre
el chat nuevo; en otro caso (por ejemplo tras reiniciar) empieza vacío
con un ID de envío nuevo. Un trabajo fallido conserva sus entradas y **Crear** reintenta el mismo
trabajo. La restricción del servidor de un único trabajo activo arbitra otros dispositivos.
Los fallos transitorios conservan datos, ofrecen Actualizar/Reintentar y los contadores de revisión rechazan
respuestas anteriores a una mutación/reinicio de cuenta. La pérdida confirmada de sesión/cambio de
cuenta borra todos los datos de creación. El contacto completado actualiza el store existente de
contactos. Los datos del trabajo/borrador no se paginan ni guardan en disco local; el servidor
devuelve un trabajo más reciente, no historial de trabajos. Los presupuestos existentes de caché protegida de imágenes,
claves de cuenta/contexto/versión y expulsión no cambian.

Los borradores generados de personalidad y generación en curso usan la caché de personalidad existente de ocho entradas
por sesión; las entradas en generación quedan protegidas de expulsión.
Actualizar en segundo plano no puede sobrescribir un borrador modificado/generado ni cambiar su revisión
base. Perder acceso/eliminar borra esa entrada. No se persiste ningún perfil generado
hasta Guardar; perder una respuesta al reiniciar requiere regenerar y puede causar otra
inferencia. Los permisos del servidor siguen siendo autoritativos.

Comprobaciones estáticas: TypeScript de API/web, comprobación completa de tipos Swift, preparación SQL existente de onboarding
y personalidad, y
`python3 scripts/checks/contact-generation-sql-compile.py`. No establecen
calidad del proveedor, ejecución real de Workflows, diseño en dispositivos ni comportamiento en navegador.
La verificación funcional aún necesita datos ficticios: ambos modos, todos los selectores,
edades exactas de cumpleaños/zonas horarias/años bisiestos, regeneración de perfiles vacíos/poblados,
ediciones manuales de menos de 18 años, revisión de borradores modificados, conflictos, reintentos, envío duplicado,
finalización en segundo plano/reinicio, navegación atrás, recuperación sin conexión, eliminación,
acceso de solo lectura de miembros compartidos y cambio de cuenta. Estas comprobaciones estáticas no implican tests/builds,
inferencia real, migración remota ni publicación.

Consulta [infraestructura](infrastructure.md#ai-contact-generation) para instalación y
compatibilidad de publicaciones.

## Nombres generados variados

La creación nueva y el onboarding del primer círculo comparten `contacts/names.ts`. Antes de generar
identidades, un completado Estándar propone 24 nombres de pila locales plausibles distintos
por género solicitado (24 para un contacto, 48 para el primer círculo mixto).
El servidor valida escritura nativa/longitud, filtra variantes de mayúsculas/acentos/espacios,
requiere al menos doce candidatos utilizables por género, mezcla con muestreo criptográfico
por rechazo y selecciona sin reemplazo. La generación de identidad recibe
los nombres/géneros asignados y debe conservarlos. Los nombres no eligen temperamento,
apariencia ni intereses. Esto evita aceptar repetidamente los pocos nombres
preferidos del modelo de identidad sin mantener una lista estrecha por país.
El conjunto lo genera el modelo; la adecuación cultural y diversidad real necesitan evaluación en vivo.

Las exclusiones usan como máximo los 256 nombres de contactos actualizados más recientemente en esta cuenta,
incluidos compartidos, más nombres de usuario del onboarding filtrados localmente. Solo
nombres de contactos y país/idioma/géneros solicitados van al completado del conjunto de nombres;
las exclusiones adicionales de nombres humanos permanecen en el servidor. No hay consulta de nombres entre cuentas,
historial privado, email, tabla global de popularidad ni caché de candidatos.
No se garantiza exclusión más allá de esa ventana acotada de cuenta. Las coincidencias de nombres
no se prohíben para contactos manuales ni identidades previas.

El nombre seleccionado se guarda con el plan inmutable normal de identidad antes del trabajo de retrato;
un reintento con plan guardado lo conserva. Un fallo antes de persistir el plan puede
regenerar un conjunto y causar otra llamada. Los contactos existentes, planes guardados y
regeneración de personalidad conservan sus nombres. El completado extra añade latencia
y costo de modelo acotados a creación/onboarding nuevos, dentro de su paso existente de identidad de dos minutos;
no añade binding, migración, ajuste ni campo de respuesta.
iOS/web reutilizan el progreso actual de generación, IDs de envío, caché de trabajos y
actualización del contacto completado. Las comprobaciones estáticas no prueban que cada locale solicitado
produzca un conjunto válido o suficientemente variado. Las comprobaciones ficticias en vivo deben repetir
ambas rutas de creación para los mismos y distintos locales, probar filtrado de nombres usados,
conjuntos inválidos/insuficientes, reintentos persistidos y regeneración de personalidad.
