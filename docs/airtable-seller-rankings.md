# Tabla Airtable: Rankings vendedores

Crear una tabla llamada `Rankings vendedores` o configurar la variable `AIRTABLE_SELLER_RANKINGS_TABLE_ID` con el ID de la tabla.

Campos requeridos:

| Campo | Tipo recomendado | Uso |
| --- | --- | --- |
| `Clave` | Single line text, primary field | Identificador unico: `YYYY-MM-Vendedor` |
| `Mes` | Single line text | Periodo del ranking en formato `YYYY-MM` |
| `Vendedor` | Single line text | Nombre visible del vendedor |
| `Posicion` | Number | Puesto dentro del mes |
| `Monto total` | Currency o Number | Total vendido confirmado |
| `Ventas confirmadas` | Number | Cantidad de ventas confirmadas |
| `Ticket promedio` | Currency o Number | Promedio por venta confirmada |
| `Fecha de calculo` | Date/time | Momento en que se guardo el snapshot |

La pantalla `/sales/ranking` calcula el ranking en vivo desde la tabla de ventas.
El boton `Guardar ranking en Airtable` persiste o actualiza el snapshot del mes seleccionado en esta tabla.
