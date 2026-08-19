# GMV Funnel — Priorización de Merchants (Aplazo)

Herramienta local para analizar el funnel BNPL, rankear merchants y recomendar acciones. Corre en el navegador: **no hay servidor ni base de datos remota**. Los CSV nunca salen de tu máquina.

## Descargar desde GitHub y correr (primera vez)

Necesitas [Node.js](https://nodejs.org/) 18 o superior y un navegador moderno.

1. **Clona el repo**:

   ```bash
   git clone https://github.com/ricmagmor-hue/Aplazo-GMV.git
   cd Aplazo-GMV
   ```

   Si descargas el proyecto como **ZIP**, descomprímelo y abre una terminal **dentro de esa carpeta** (no uses la carpeta padre).

2. **Instala dependencias** (solo la primera vez):

   ```bash
   npm install
   ```

3. **Arranca la app**:

   ```bash
   npm run dev
   ```

4. Abre en el navegador la URL que imprime Vite (normalmente `http://localhost:5173`).

5. **Carga tus CSV** con el botón **Cargar archivos CSV** (ver sección [Cómo cargar datos](#cómo-cargar-datos-primera-vez) más abajo).

> **Nota:** `localhost` es la computadora de quien corre la app. Cada persona clona el repo, ejecuta los comandos en su máquina y carga sus propios CSV. No hay un servidor central ni datos compartidos entre usuarios.

## Qué hace

1. Carga `merchants.csv`, `checkout_sessions.csv` e `integration_events.csv`.
2. Homologa columnas y valores (plataformas, booleans, tiers, devices).
3. Bloquea un archivo si faltan columnas o si hay campos vacíos/inválidos en variables de cálculo (`merchant_id`, `amount_requested`, `widget_shown`, `widget_interacted`, `approved`, `completed`).
4. Calcula métricas de funnel, GMV perdido, severidad, impacto, confianza y escalabilidad.
5. Rankea merchants con un slider: **concentración de GMV** vs **quick wins escalables**.
6. Muestra causa raíz y acción recomendada del merchant seleccionado, segmentada por **plataforma, tipo de integración y device** (desktop vs mobile).

---

## Requisitos

- [Node.js](https://nodejs.org/) 18 o superior
- Un navegador moderno (Chrome, Edge, Firefox)
- [Git](https://git-scm.com/) (solo para clonar; opcional si descargas el ZIP)

## Cómo arrancar (uso diario)

Si ya clonaste el repo e hiciste `npm install`, en la carpeta del proyecto:

```bash
npm run dev
```

Abre la URL que imprime Vite (normalmente `http://localhost:5173`).

Para una demo sin instalar Node, genera una carpeta estática y ábrela o súbela a cualquier hosting:

```bash
npm run build
npm run preview
```

La carpeta `dist/` es el entregable web. Puedes copiarla a Netlify, Vercel, GitHub Pages o un bucket estático.

---

## Cómo cargar datos (primera vez)

1. En la app, pulsa **Cargar archivos CSV**.
2. Selecciona los archivos. El nombre debe contener:
   - `merchant` → catálogo de merchants
   - `checkout` o `session` → sesiones de funnel
   - `integration` o `event` → eventos de integración (**opcional**)
3. Espera a que termine (checkout_sessions puede tener ~150k filas; tarda unos segundos).
4. Si un archivo se rechaza, corrige las columnas/filas indicadas y vuelve a cargarlo. Los archivos válidos de esa carga sí se conservan.

**Qué es obligatorio**

| Objetivo | Archivos |
|---|---|
| Ver ranking, funnel y recomendaciones | `merchants.csv` **y** `checkout_sessions.csv` |
| Agregar merchants nuevos | Esos dos, con las filas nuevas (mismo esquema) |
| Enriquecer diagnóstico técnico (errores, tickets) | `integration_events.csv` además |

Un merchant **no aparece** en el ranking si solo está en el catálogo (falta sesiones) o si solo tiene sesiones (falta fila en merchants). La integración no bloquea: sin ese archivo, funnel y ranking igual se calculan; solo no habrá error_code ni tickets en el diagnóstico.

Los datos se guardan en el **localStorage del navegador**. Al recargar la página, la base sigue ahí (en esa computadora y ese navegador).

## Cómo actualizar / agregar datos (sin borrar lo existente)

1. Con la base ya activa, el botón cambia a **Agregar archivos CSV**.
2. Sube **solo lo que tengas nuevo**: merchants, sesiones, integración, o cualquier combinación.
3. Comportamiento de merge:
   - **merchants**: se actualizan por `merchant_id` (no se duplican).
   - **sesiones**: si el `session_id` ya existe, se **omite**.
   - **eventos**: si el `event_id` ya existe, se **omite**.
4. El funnel y el ranking se recalculan sobre el universo acumulado.

Ejemplos:

| Qué quieres hacer | Qué subir |
|---|---|
| Primera carga completa | Los 3 (ideal) |
| Agregar merchants nuevos | `merchants.csv` + `checkout_sessions.csv` de esos merchants |
| Solo más sesiones de merchants que ya existen | Solo `checkout_sessions.csv` |
| Actualizar catálogo (KAM, status, tier) | Solo `merchants.csv` |
| Sumar errores técnicos | Solo `integration_events.csv` |

**Reiniciar base** borra merchants, sesiones y eventos de este navegador. Úsalo si quieres partir de cero.

---

## Columnas esperadas

### merchants.csv

`merchant_id, merchant_name, platform, integration_type, vertical, region, gmv_tier, kam_assigned, status, signup_date`

### checkout_sessions.csv

`session_id, merchant_id, session_timestamp, device, platform, region, vertical, gmv_tier, widget_shown, widget_interacted, payment_method_selected, amount_requested, plan_months, funnel_step_reached, drop_off_reason, approved, completed`

### integration_events.csv

`event_id, merchant_id, event_name, event_timestamp, completed, attempt_number, support_ticket_opened, error_code`

Todos los archivos del mismo tipo deben traer **esas columnas**. Nombres se normalizan (`Custom API` = `custom api`).

---

## Cómo leer el dashboard

### Slider (balance)

- A la derecha: prioriza merchants con **más GMV perdido** (concentración).
- A la izquierda: prioriza acciones que se **replican en más merchants similares** (escalabilidad).
- **15% fijo** del score viene de **confianza** (volumen de sesiones + bonus si el merchant está `live`).

Fórmula del score (default slider 65% GMV / 35% escalabilidad):

```
base = slider × GMV_perdido_norm + (1 − slider) × escalabilidad_norm
score = 85% × base + 15% × confianza_norm
```

Con slider en 65%, el reparto efectivo es: **~55% GMV · ~30% escalabilidad · 15% confianza**.

**Confianza** = `min(100, log₁₀(sesiones + 1) × 25 + (live ? 15 : 0))`.  
Merchants con pocas sesiones bajan en ranking aunque tengan mucho GMV perdido. Complementa el umbral de exclusión (< 50 sesiones) y la advertencia “datos bajos” (50–149).

**Severidad** no entra al score de ranking; se usa para el stat de portafolio y refleja qué tan lejos cayó en el funnel (`funnel_step_reached`) y la tasa de completion. **Sí define la recomendación** vía `drop_off_reason` y la mayor caída entre etapas (widget → interacción → KYC → underwriting → confirmación → completado).

### Ranking

| Columna | Significado |
|---|---|
| Plataforma | Checkout + tipo de integración (`plugin` / `custom`) |
| Foco | Device donde está el problema (`mobile`, `desktop` o `all`) |
| Escalab. | 0–100. Sube si muchos merchants **parecidos** se benefician de la misma acción |
| Cohorte | Cuántos merchants comparten exactamente esa acción |
| Conf. | Confianza 0–100 (sesiones + status live); pesa 15% del score |
| Score | Prioridad combinada (GMV + escalabilidad + confianza) |
| GMV perdido | Suma de `amount_requested` en sesiones **no completadas** |

Pulsa **Ver detalle** o usa el selector para cambiar de merchant. El diagnóstico, las tasas y el gráfico se actualizan.

### Diagnóstico

- **Desktop vs mobile completion**: si hay una brecha ≥ 8 puntos porcentuales (y suficientes sesiones), la acción se ancla al device peor.
- **Causa raíz / acción**: específicas de plataforma + integración + device + etapa de `funnel_step_reached` (widget no visible, sin interacción, KYC, underwriting, confirmación, error técnico).
- **Cohorte de escalabilidad**: solo merchants con la **misma** combinación (`Shopify + plugin + mobile + widget no visible`, por ejemplo). Un impacto alto en 1–2 merchants no puntúa como “escalable”.

### Métricas de funnel (por merchant)

El funnel usa **`funnel_step_reached`**, no `payment_method_selected` ni tasas condicionales entre booleanos. Cada barra es el % de sesiones que llegaron **al menos** a esa etapa (acumulativo, nunca > 100%):

1. Widget visible  
2. Interacción  
3. KYC  
4. Underwriting  
5. Confirmación  
6. Completado  

Orden de etapas: `widget` → `widget_shown` → `widget_interacted` → `kyc` → `underwriting` → `confirmation` → `completed`.

La severidad, el diagnóstico y las recomendaciones usan **las mismas tasas acumulativas** que el gráfico (% de sesiones que llegaron al menos a esa etapa), no tasas condicionales (interacción ÷ widget visible). La acción se elige con `drop_off_reason` y la mayor caída entre etapas consecutivas del funnel.

**Lost GMV** = suma de `amount_requested` donde la sesión no llegó a `completed`.  
**GMV en riesgo** (arriba) = suma de lost GMV de todos los merchants.

---

## Cómo entregar / publicar

Esta app **no depende de Cursor**. Opciones:

1. **Carpeta del proyecto** — comparte el repo o un zip (sin `node_modules`). El receptor corre `npm install` y `npm run dev`.
2. **Build estático** — `npm run build` y entrega/publica `dist/` (Netlify, Vercel, S3, IIS). `base: "./"` permite abrirla desde subcarpetas.
3. **GitHub** — [ricmagmor-hue/Aplazo-GMV](https://github.com/ricmagmor-hue/Aplazo-GMV). Tu equipo clona el repo y corre los pasos de arriba. No incluyas CSVs con datos sensibles en el repositorio.

No hay login ni API. Quien tenga la URL o la carpeta puede usarla con sus propios CSV.

---

## Umbrales de calidad de datos

Para evitar que merchants con poca data distorsionen el ranking, la app aplica automáticamente:

| Sesiones | Comportamiento |
|---|---|
| < 50 | **Excluido del ranking.** Con 50 sesiones, el margen de error en completion rate es ±11pp (95% confianza) — la posición sería aleatoria. Aparece en un aviso al cargar la data. |
| 50–149 | **Incluido, marcado como "datos bajos".** El diagnóstico y el score son orientativos. |
| 150+ | **Ranking estable.** Margen ≤ ±7pp. Se considera suficiente para priorizar. |

Estos valores se basan en el error estándar binomial de la tasa de completion real (~22% en el dataset actual): `±z × √(p(1−p)/n)`.  
Cuando un merchant excluido acumule 50+ sesiones en cargas posteriores, entra automáticamente al ranking.

## Limitaciones

- El procesamiento corre en el navegador. Archivos muy grandes (>200k filas de sesiones) pueden tardar o saturar memoria.
- localStorage tiene cupo (~5 MB). Si falla el guardado, la sesión sigue en memoria hasta cerrar la pestaña.
- No sustituye un data warehouse: es una herramienta de priorización operativa sobre dumps CSV.
