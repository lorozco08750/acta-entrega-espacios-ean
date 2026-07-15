# Acta de entrega de espacios

Aplicación web local para registrar la entrega de espacios desde un iPad. Permite capturar fotografías, descripciones y firmas, conservar un borrador en el dispositivo y generar un PDF sin enviar información a servicios externos.

## Desarrollo local

```bash
npm install
npm run dev
```

La aplicación estará disponible en `http://localhost:5173`.

## Compilación

```bash
npm run build
```

El resultado listo para publicar queda en `dist/`.

## Personalización

- El catálogo provisional de espacios está en `src/catalog.js`.
- Los colores y la presentación están en `src/styles.css`.
- La composición del documento está en `src/pdf.js`.
- El logotipo actual es provisional y está en `public/icon.svg`.

## Privacidad

Los datos, fotografías y firmas se almacenan en IndexedDB dentro del dispositivo. El PDF se genera localmente en el navegador. La aplicación no contiene conexiones con Microsoft ni otros servicios de datos.
