# Configuración de Railway

El servicio `lente` se administra con `.railway/railway.ts`: Dockerfile,
`npm run worker` y una réplica en `iad`. Las variables permanecen administradas
en Railway y no se guardan en el repositorio.

Antes de modificar la configuración, vincular el entorno correcto y ejecutar
`railway config plan`; revisar que no se eliminen recursos. Aplicar únicamente
el plan revisado con `railway config apply`. Los despliegues desde GitHub no
ejecutan `config apply` automáticamente: los cambios de infraestructura deben
aplicarse aparte.

La política de reinicio es el valor predeterminado de Railway: `ON_FAILURE`
con hasta 10 reinicios. La API representa esos valores predeterminados como
ausentes; declararlos explícitamente hace que el plan los proponga una y otra
vez. Referencia: https://docs.railway.com/deployments/restart-policy.

Si un cambio necesita reversión, volver a aplicar una configuración IaC revisada;
antes comprobar que no haya análisis activos, porque un despliegue puede
interrumpirlos. No volver a agregar `railway.json` sin revisar el conflicto
entre Config as Code e IaC.
