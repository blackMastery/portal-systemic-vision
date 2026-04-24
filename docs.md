# 1.⁠ ⁠Agreement acceptance infrastructure
Tell him to build the system for presenting and recording agreement acceptance, even though the actual agreement text will come from the lawyer later. The system needs to:
Present a scrollable agreement screen during driver signup, before account activation. Same for passengers at their signup. Require an explicit checkbox tick plus a tap on "I Agree" button — not auto-acceptance. Store, for every acceptance: the user's ID, the agreement version number, the exact timestamp, the IP address, the device info (model, OS version), and the specific text hash of what they accepted. Support multiple agreement versions so when the lawyer produces the final text, it gets loaded as "v1.0" and future updates become "v1.1", "v2.0" etc. Force re-acceptance when a new version is published — on next app open, user sees new agreement and must accept before continuing. Generate a PDF copy of what each user signed, stored in cloud storage, retrievable by user ID.
He can build all of this using placeholder text right now. When the lawyer delivers the final agreement, you paste it in as v1.0 and the system is ready to go.


# 2.⁠ ⁠Dashcam footage handling policy in-app
Since dashcams are going to be a platform requirement, the app needs a way for drivers to upload footage when requested. Tell him to build:
A "Submit Footage" feature in the driver app where, when a complaint is opened on a trip, the driver gets a notification requesting the footage and can upload video files directly. Tie submitted footage to the specific trip ID and complaint ID. Secure storage with access restricted to you and eventually your operations team. Automatic deletion of footage older than a defined retention period (lawyer will specify — likely 90 days absent a dispute, longer if a dispute is active).


# 3.⁠ ⁠Incident and complaint reporting system
This is the backbone of your safety response. Tell him to build:
In-app "Report an Incident" flow for both drivers and passengers. Categories including: safety concern, harassment, assault, robbery, accident, payment dispute, driver conduct, passenger conduct, other. Required fields: trip ID (auto-populated if reporting about a specific trip), description, optional photo/evidence upload. Automatic creation of a complaint record in an admin dashboard you can view. Timestamp of report, status tracking (open, under review, resolved, escalated). Automatic preservation of trip data, location logs, and associated dashcam request when a complaint is filed — so evidence is locked down immediately, not weeks later when you get around to investigating.


# 4.⁠ ⁠Admin dashboard for you
You need a way to actually see what's happening on your platform without asking the developer for reports every week. Tell him to build a simple admin web dashboard where you can:
See active drivers, active passengers, trips in progress. See complaints in queue, filterable by type and status. View any user's profile, their agreement acceptance history, their trip history, their verification documents. Suspend or reactivate any account with one click, with a required reason field logged. Export data (trips, revenue, complaints) for reporting. See key metrics: daily trips, revenue, driver signups, passenger signups, complaint rate.
Even a basic version of this is transformative for your ability to operate. Right now I'm guessing you're either bothering him for data or going into a database directly, both of which don't scale.



 5.⁠ ⁠Emergency / panic button
Safety feature. Tell him to build:
An SOS button in both driver and passenger apps, accessible during active trips. When pressed: captures current GPS location, trip ID, all trip details, and sends them immediately to a designated emergency contact configured in platform settings (for now, your phone number — eventually an operations team line). Shows the user a confirmation that help has been notified. In the admin dashboard, triggers a high-priority alert that can't be missed.
This is one of those features that probably never gets used in a thousand trips but the one time it's used, it matters immensely.


 6.⁠ ⁠Document verification storage
For driver onboarding, the app needs to collect and store:
Driver's license (front and back). Vehicle registration. Insurance certificate (with expiry date tracked — system should flag drivers 30 days before expiry and auto-suspend when expired). Police clearance certificate (with issue date tracked — system should require a new one every 12 months). Photo of the driver. Photo of the vehicle (all sides).
All documents encrypted at rest, accessible only to you/admin, never to other users. Expiry tracking with automatic alerts to both you and the driver.


 7.⁠ ⁠Rating system (both ways)
Tell him to build:
Post-trip rating prompt for both driver and passenger, 1-5 stars, optional written feedback. Drivers can see their own average rating, passengers can see their own. You, in the admin dashboard, can see all ratings and flag drivers/passengers below a threshold. Low ratings automatically trigger a review queue in your admin dashboard.



 8.⁠ ⁠Trip data logging (if not already comprehensive)
Verify with him what's currently captured per trip. Minimum you want:
Pickup location and time, drop-off location and time, full GPS track of the route taken, fare calculated, payment method, payment status, driver ID, passenger ID, any complaints filed, any ratings given. All stored permanently in the company database (with standard retention policies). Exportable for legal/regulatory purposes if ever needed.


 9.⁠ ⁠Suspension and account management
Beyond just the admin dashboard, he needs to build:
Soft suspension (account locked but data retained, user sees a message to contact support). Hard suspension (account disabled entirely). Reason codes required for every suspension, logged with timestamp and admin user. Appeal mechanism — user can submit a written appeal which creates a record in your queue. Automatic suspension triggers: expired insurance, expired police clearance, rating below threshold, multiple unresolved complaints, failed payment attempts.


10.⁠ ⁠Version control for terms, policies, and fare structure
Everything that affects the legal relationship between Links and users needs version control:
Terms of Service (passenger), Platform Agreement (driver), Privacy Policy, Community Guidelines, Fare structure and commission rates. When any of these change, users must re-accept before their next action. Historical versions accessible to you in the admin dashboard with effective-date ranges.
