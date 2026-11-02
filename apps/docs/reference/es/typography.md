# Tipografía

La app iOS incluye la fuente variable TrueType Manrope de
[Google Fonts](https://github.com/google/fonts/tree/main/ofl/manrope), con su licencia
SIL Open Font License en `apps/ios/Wildcard/Fonts/OFL.txt`. No se requiere descargar
fuentes durante la ejecución ni acceder al proyecto archivado.

`Config/Info.plist` registra `Manrope.ttf` mediante `UIAppFonts`. La carpeta de
fuentes sincronizada de la app Xcode incluye la fuente como recurso; Info.plist se
encuentra fuera de esa carpeta para evitar que se copie como un recurso común.
Los metadatos generados de la app se combinan con este plist en Debug y Release.
La URL de la API es una entrada explícita `WildcardAPIURL` que referencia
`$(WILDCARD_API_URL)` en el mismo plist fuente.

`AppTypography` usa el nombre PostScript real de la fuente, `Manrope-ExtraLight`,
y establece explícitamente el eje variable `wght` (desde 400 regular hasta 800 extra
negrita). Usa `.manrope(.body)` o `.manrope(.largeTitle, weight: .bold)` para los estilos
nuevos de SwiftUI. La vista raíz proporciona la fuente de cuerpo predeterminada;
los estilos explícitos de título y nota al pie usan el mismo helper. Los íconos de
SF Symbols siguen siendo renderizados por el sistema.

SwiftUI usa `ScaledMetric` relativo a cada estilo semántico de texto. Los títulos de
navegación nativos y los botones de barra usan `UIFontMetrics`, con la configuración
de apariencia actualizada cuando cambia Dynamic Type. No se instala ninguna fuente
globalmente en el dispositivo.

Durante la implementación se comprobaron estáticamente los metadatos de la fuente,
el registro en plist y los tipos Swift. No se ejecutó un build de iOS, el simulador
ni una prueba visual o en dispositivo.

## Énfasis Markdown en el chat

Los fragmentos de mensajes de bots asignan explícitamente las intenciones de presentación
en línea de Foundation al eje de peso de Manrope. El énfasis fuerte usa peso 700.
El énfasis usa una matriz del descriptor de fuente para crear una variante oblicua,
porque el recurso Manrope incluido no tiene una variante cursiva; el énfasis combinado
conserva ambos. El código en línea usa la fuente monoespaciada del sistema. Los tamaños
salen de los valores ScaledMetric de SwiftUI para que las fuentes con atributos sigan
Dynamic Type. No dependas de la síntesis automática de negrita o cursiva de la fuente
personalizada regular. El Markdown web aplica explícitamente peso fuerte y estilo
cursivo con la síntesis de estilos del navegador. Sigue pendiente la confirmación
visual en dispositivo.

Referencias: [Intenciones de presentación en línea de Foundation](https://developer.apple.com/documentation/foundation/inlinepresentationintent),
[Transformaciones de UIFontDescriptor](https://developer.apple.com/documentation/uikit/uifontdescriptor).
