# Identidad visual de la app

El logo proporcionado el 29 de octubre de 2026 se incluye localmente en los clientes:

- Ícono de la app iOS: `apps/ios/Wildcard/Wildcard.icon`, copiado del paquete de
  Icon Composer proporcionado, con sus ajustes de escala de capas, apariencia y material.
- Pantalla de inicio de SwiftUI en iOS: `WildcardLaunchMark.imageset/mark.svg`, con la
  exportación transparente `isotype.svg` proporcionada después del problema con el inicio
  nativo. El inicio nativo usa versiones PNG de esa fuente en
  `apps/ios/Wildcard/LaunchResources`. Ambas pantallas encajan la marca de 56:53 en
  aproximadamente 105.66 × 100 puntos sobre el fondo azul existente.
- Inicio de sesión y registro web: `apps/web/public/icon.svg`, con el ícono proporcionado,
  que incluye el fondo, sin cambios y a 64 × 64 píxeles.
- Pestañas del navegador de web y administración: `public/favicon.svg` de cada app,
  con el favicon proporcionado sin cambios. El favicon web se reemplazó por el archivo
  proporcionado el 30 de octubre de 2026, por pedido del usuario limitado a web;
  administración conserva el favicon anterior. Ambas configuraciones de Nuxt agregan
  los primeros 12 caracteres de su resumen SHA-256 como parámetro de versión para
  actualizar favicons almacenados previamente en caché.

Son recursos públicos incluidos con la app y no requieren caché de cuenta ni caché
para funciones con acceso a la red. Para actualizar un favicon compartido, cambia ambas
copias y sus parámetros de versión en el mismo cambio; respeta los pedidos limitados
explícitamente a web o administración. Conserva el espaciado distinto del favicon y del
ícono completo.

La verificación estática cubre el análisis de SVG/XML y JSON, la igualdad con la fuente,
las referencias de capas de Icon Composer y la eliminación de la ruta del logo anterior.
No se verificaron builds, renderizado en navegador ni apariencia en dispositivo. Después
de instalar la actualización de iOS, revisa el ícono de la pantalla de inicio en las
apariencias predeterminada, oscura y teñida, y la transición entre el inicio nativo y
la pantalla de SwiftUI. Después de publicar web/administración, revisa las pestañas del
navegador y el inicio de sesión y registro web en ambos esquemas de color.

## Actualización del recurso de inicio nativo

El storyboard nativo se llama `WildcardLaunch.storyboard` y se selecciona con
`UILaunchStoryboardName = WildcardLaunch` en `apps/ios/Config/Info.plist`.
SwiftUI usa el vector `WildcardLaunchMark`. El storyboard referencia directamente
`WildcardLaunchIsotype.png` en el paquete de la app, con recursos PNG 1x/2x/3x en
`apps/ios/Wildcard/LaunchResources`. El grupo sincronizado de la app en Xcode copia
estos recursos al paquete. La imagen nativa usa sus píxeles blancos originales sobre
transparencia y no depende del teñido de plantillas ni de búsquedas en el catálogo de recursos.

La corrección anterior basada en PNG del catálogo seguía mostrando solo azul en el
dispositivo físico del usuario después de desinstalar y limpiar la carpeta del build.
La inspección de ese build del dispositivo confirmó la clave correcta de Info.plist,
el storyboard compilado, la versión PNG del catálogo y la referencia de imagen.
La falta de archivos fuente y una clave de inicio desactualizada no explicaban ese
build. La causa exacta durante la ejecución sigue sin confirmarse. El 29 de octubre
de 2026, el usuario confirmó que cargar directamente desde el paquete muestra el logo
de inicio nativo correctamente.

El usuario proporcionó una exportación nueva de `isotype.svg` con un lienzo 56:53.
Se conserva como `WildcardLaunchMark.imageset/mark.svg` y es la fuente de los PNG
nativos y de la pantalla de inicio de SwiftUI. El ícono de Icon Composer y los recursos
web no cambian. Regenera los recursos fuente PNG versionados con `rsvg-convert`
(macOS: `brew install librsvg`) desde la raíz del repositorio:

```sh
for scale in 1 2 3; do
  suffix="@${scale}x"
  if [ "$scale" -eq 1 ]; then suffix=""; fi
  rsvg-convert --width "$((112 * scale))" --height "$((106 * scale))" \
    --output "apps/ios/Wildcard/LaunchResources/WildcardLaunchIsotype${suffix}.png" \
    apps/ios/Wildcard/Assets.xcassets/WildcardLaunchMark.imageset/mark.svg
done
```

Todas las versiones conservan el fondo transparente y la marca blanca. El diseño
mantiene la marca con una altura de 100 puntos y la relación de aspecto de la fuente.
El usuario confirmó que el logo nativo aparece después de este cambio. El agente de
código no ejecutó un build ni el Simulator. Ambas apariencias de color, las orientaciones
admitidas y la alineación de la transición no se verificaron de forma independiente.
