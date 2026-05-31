# Request: Deterministic Orchestration Loop

I want CompassRose to execute the core orchestration loop deterministically.

The loop should follow a clear order:

1. inspect project state
2. detect pending feature requests
3. formalize requests when needed
4. select the next feature according to feature order and state
5. generate one small task
6. run implementation when allowed
7. run quality gates
8. run or skip review according to policy
9. update state

CompassRose should stop on failures instead of continuing blindly.

The orchestrator itself should not use AI directly. It delegates AI work to configured roles.
