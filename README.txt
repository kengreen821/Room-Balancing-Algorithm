ROOM BALANCING ALGORITHM - DEMONSTRATION
Embassy Suites Centennial Park

OVERVIEW:
Automated room balancing system that replicates MOD decision-making for optimal guest assignments.

FILES INCLUDED:
1. room_balancer.py - Core algorithm (Python)
2. embassy_suites_reservations_jan15_feb14_2026.json - Test dataset (31 days, 7,596 reservations)
3. room_assignments_2026-01-17.json - Sample output (Jan 17, 100% sold out night)

KEY FEATURES:
✓ Priority Logic: ADA → Avoid Walks → Status Upgrades → Connecting Rooms → Preferences
✓ Intelligent Upgrades: Same-bed-type preferred, cross-category as last resort
✓ 100% Assignment Rate: Successfully assigned all 321 guests on sold-out night
✓ MOD Warnings: Flags ADA, cross-category, and emergency assignments for review

TEST SCENARIO (Jan 17, 2026):
- 321 arrivals (100% capacity)
- 5 room types overbooked simultaneously
- Hawks vs. Celtics game + major convention
- Result: 0 guests walked, 31 strategic upgrades

ALGORITHM PRIORITY:
1. ADA requests (legal requirement)
2. Fit all guests (avoid walking)
3. When overbooked: Diamond/Gold + 3+ nights get upgrades first
4. Connecting rooms (first-request priority)
5. High floor, VIP preferences

BUSINESS VALUE:
- Saves MOD 2-3 hours per night on sold-out dates
- Eliminates human error in complex scenarios
- Scales across any hotel property with minimal customization
- Reduces guest complaints through optimal assignments

Built by Ken Green
Embassy Suites Centennial Park, Guest Service Agent
