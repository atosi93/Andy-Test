# Fixture Mundial - Vicejefatura GCBA

MVP de una app tipo prode para una competencia interna: usuarios con nombre y contraseña, fixture, apuestas, resultados y ranking.

## Ejecutar local

```powershell
npm install
npm run dev
```

Abrir: <http://localhost:4280>

Usuario admin inicial:

- Usuario: `admin`
- Contraseña: `admin123`

Cambiar esos valores en `.env` antes de publicar.

## Reglas de puntaje

- Resultado exacto: 5 puntos.
- Ganador/empate correcto: 3 puntos.
- Diferencia de gol correcta: +1 punto.

Las apuestas quedan bloqueadas cuando llega la hora de inicio del partido.

## Próximo paso para Azure

Para producción conviene reemplazar `data/db.json` por Cosmos DB o Azure Table Storage y agregar una Azure Function con timer para sincronizar fixture/resultados desde una API deportiva.
