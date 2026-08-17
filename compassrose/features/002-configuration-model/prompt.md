Quiero que corras npm run dev y supervises el progreso del desarrollo. Seras el supervisor del avance. Puntos a tener en cuenta:
- Detecta bloqueos que el problema no parezca capaz de resolver:
    - disonancia entre interfaces, 
    - valores exigidos y esperados, 
    - bloqueos mal diagnosticados, etc
- Vigila que los planes sean coherentes y ajustados a la feature/fix
- Vigila abultamientos innecesarios de los contextos enviados a los modelos.
- Vigila si opencode deja de responder e investiga las causas de la inestabilidad

Cuando no intervernir:

- El sistema es capaz de corregirse con una correction task o un fix
- El sistema experimento un bloqueo por un bug pero el diagnostico fue adecuado, se reporto el bug con la severidad adecuada y el sistema salta a su formalizacion y resolucion

Cuando intervenir
- El sistema no puede corregirse con una correction task o un fix, y el bloqueo persiste
En ese caso realiza un fix manual encaminado a desbloquear, y erradicar las causas del bloqueo.
