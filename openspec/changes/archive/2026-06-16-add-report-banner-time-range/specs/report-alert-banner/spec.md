## ADDED Requirements

### Requirement: Report alert banner SHALL include the active report time range
When the report page shows an alert banner, the explanatory copy SHALL explicitly identify the currently selected report period so users can understand which records the prompt summarizes.

#### Scenario: Warning banner in 30-day report includes 30-day scope
- **WHEN** the user views a 30-day report and the banner type is `warning`
- **THEN** the banner explanation SHALL state that the prompt is based on the recent 30-day report range

#### Scenario: Critical banner in 90-day report includes 90-day scope
- **WHEN** the user views a 90-day report and the banner type is `critical`
- **THEN** the banner explanation SHALL state that the prompt is based on the recent 90-day report range

#### Scenario: Low blood pressure banner also includes active period
- **WHEN** the user views any report period and the banner type is `warning` for low blood pressure
- **THEN** the banner explanation SHALL include that active report period in the displayed copy

### Requirement: Report alert banner SHALL remain consistent between preview and export
The exported report image SHALL use the same period-qualified banner title and explanation that are shown in the on-screen report preview for the same selected range.

#### Scenario: Exported report reuses preview banner copy
- **WHEN** the user exports a report after selecting a report period
- **THEN** the exported banner text SHALL match the on-screen banner text for that same report period

#### Scenario: Period switch updates all banner surfaces together
- **WHEN** the user switches from one report period to another before viewing or exporting the report
- **THEN** both the preview banner and the exported banner SHALL reflect the newly selected report period
