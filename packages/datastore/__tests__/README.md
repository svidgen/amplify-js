## DataStore Test Organization and Contracts

Please keep things organized.

# Table is WIP

| Folder            | Category | Scope   | Fail | Add | Change | Remove |
| ----------------- | -------- | ------- | ---- | --- | ------ | ------ |
| `__snapshots__/*` | Fixture  | ALL     | NA   | 🟢  | 🟢     | 🟢     |
| `helpers/*`       | Utility  | ALL     | NA   | 🟢  | 🟡     | 🟢     |
| `fuzz/*`          | Tests    | ALL     | 🔴   | 🟢  | 🟢     | 🟢     |
| `spec/*`          | Tests    | Public  | 🔴   | 🔴  | 🔴     | 🔴     |
| `unit/*`          | Tests    | Private | 🟡   | 🟢  | 🟢     | 🟢     |
| `unsorted/*`      | Tests    | Mixed   | 🔴   | 🔴  | 🔴     | 🔴     |
| `*/legacy/*`      | Tests    | Inherit | ⚪   | ⚪  | ⚪     | ⚪     |

Each of these folders may also contain a `README.md` to specify further organizational, reading, or authoring notes.

## Legend

How to interpret the color codes.

| Symbol | Meaning   |
| ------ | --------- |
| 🔴     | LIKELY    |
| 🟡     | POTENTIAL |
| 🟢     | UNLIKELY  |
| ⚪     | INHERIT   |

And what each color-coded "event" from the table means and the "Concern" it should trigger.

| On     | Meaning        | Potential Concern   | Potential Remedy           |
| ------ | -------------- | ------------------- | -------------------------- |
| Fail   | A test failure | Bug/Regression      | Fix                        |
| Add    | Added code     | New API/Behavior    | API BR                     |
| Change | Changed code   | API/Behavior change | API BR, Major Version Bump |
| Remove | Removed code   | API/Behavior change | API BR, Major Version Bump |

# Spec

1. Recommended Usage / "User stories" / "Use cases"
1. Behaviors for anti-patterns
1. Supported behavior
1. Regressions / Edges
