# Request: Correction Task Flow

I want CompassRose to handle failed reviews by generating correction tasks.

When a review rejects an implementation, CompassRose should create a bounded correction task instead of blindly retrying the whole feature.

The correction task should include:

- original task reference
- reviewer findings
- expected correction
- files likely involved
- acceptance criteria

The number of correction iterations should respect configured limits.
