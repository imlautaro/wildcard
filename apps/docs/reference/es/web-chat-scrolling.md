# Desplazamiento del chat web

Este trabajo se limita explícitamente a los chats privados y grupos de web. iOS
nativo conserva su implementación de desplazamiento existente.

## Posición inicial

Cada visita coloca los mensajes almacenados en caché o cargados por primera vez al
final, en un observador de Vue posterior al parche y antes del renderizado, con
desplazamiento instantáneo. Una ruta reutilizada restablece este estado de visita.
El área visible de mensajes tiene una altura mínima explícita de cero para reducirse
dentro de la estructura de la app en lugar de expandirse con la conversación.

Sigue pendiente la verificación en navegador: abrir chats cortos y largos con y sin
historial en caché, cambiar entre contactos y grupos y reabrir mediante navegación
hacia atrás. No se ejecutaron pruebas ni builds; las instrucciones del repositorio
solo permiten validación estática.

## Seguir el crecimiento del contenido

Un ResizeObserver compartido sigue el contenido de los mensajes y los cambios de
tamaño del área visible mientras la persona está cerca del final. Esto cubre mensajes
nuevos, multimedia, tarjetas de documentos/apps y cambios de tamaño del compositor
sin esperar reacciones ni solicitudes auxiliares de sondeo. Los envíos explícitos
activan el seguimiento inmediatamente. Los observadores se desconectan al desmontar;
el estado de desplazamiento pertenece a la visita y no agrega datos de conversación
almacenados.

Verificación en navegador pendiente: respuestas consecutivas, imágenes y tarjetas
con demora, cargas de voz y cambios de tamaño del compositor o del área visible
mientras se está al final.

## Historial abierto y sincronización del panel lateral

Cuando una respuesta de la lista detecta actividad más reciente en la conversación
visible, espera a que se actualice el historial de esa conversación antes de publicar
el resumen. El contenido existente en caché sigue disponible durante la solicitud o
un fallo transitorio. Los demás chats conservan la precarga acotada en segundo plano.
Las solicitudes de historial privado y de grupo comparten una promesa en curso por
entrada en caché; la precarga de listas y el sondeo visible ya no reemplazan las
respuestas entre sí. Los cambios de sesión o cuenta y la eliminación siguen
rechazando resultados obsoletos mediante las comprobaciones existentes de identidad
y revisión de caché.

Esto coordina respuestas que la lista ya observó; las lecturas separadas del servidor
no son una instantánea atómica. La actividad más reciente se concilia en sondeos
posteriores. Verificación en navegador pendiente: respuestas privadas y de grupo
entrantes con el panel lateral visible, actualizaciones superpuestas, solicitudes
lentas o fallidas, navegación y restablecimiento de cuenta.

## Mantener el control de quien lee

Las actualizaciones nunca ejecutan un desplazamiento demorado basado en una posición
capturada antes de una solicitud de red. Enviar activa el seguimiento una vez, cuando
comienza el envío; completar una carga no puede anular un desplazamiento realizado
durante la solicitud. Las entradas hacia arriba de rueda, tacto y teclado desactivan
el seguimiento de inmediato. Volver a desplazarse hasta dos píxeles del final lo
reactiva. El seguimiento provocado por el diseño comprueba la visita y la intención
actuales en el momento de ejecución.

Las filas de mensajes visibles anclan la paginación del historial y las actualizaciones
de mensajes antes y después de los parches de Vue. El anclaje de desplazamiento del
navegador está desactivado para esta área visible, para evitar una doble compensación.
El crecimiento demorado de multimedia con el seguimiento desactivado nunca obliga a
bajar. Verificación en navegador pendiente: desplazarse hacia arriba durante un
sondeo o carga lentos, cargar historial anterior mientras llegan respuestas, abrir
citas y usar rueda, tacto y teclado.

## Volver a los mensajes más recientes

Los chats privados y de grupo muestran un botón flotante accesible de 44 píxeles
encima del compositor cuando el seguimiento está desactivado. Al pulsarlo se desplaza
instantáneamente a los mensajes más recientes y se reanuda el seguimiento. Se posiciona
en relación con el área visible de mensajes, de modo que no se mueve con el historial
ni se superpone al compositor.

Verificación en navegador pendiente: visibilidad en diseños de escritorio y estrechos,
activación con teclado, desaparición al llegar al final y seguimiento continuo después
de pulsarlo.
