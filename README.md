# CareCheck

CareCheck helps patients and frontline health workers find healthcare facilities and check service details before travelling.

The initial Benue directory covers laboratory facilities in Makurdi and Apir. Listings use facility-published information. Inclusion does not imply a partnership. Contact the facility for current availability, fees, and cutoff times.

## Run locally

Serve the repository from a local HTTP server, for example `python -m http.server 8000`, then open `http://localhost:8000`. No package installation is required.

Once the service worker has installed, reload with the network offline to use the saved directory. Phone calls still require voice service. The current version stores directory entries in the app bundle and does not collect patient information.

The Benue pilot is planned. The facility portal requires the Supabase setup below.

## Enable the facility portal

1. Create or select a Supabase project. Run `supabase/schema.sql` once in its SQL editor.
2. Enable email/password authentication. Set the Site URL to your deployed app and use email confirmation.
3. Fill in `config.js` with the project URL and its **public publishable key**. Keep privileged keys out of the repository.
4. Staff open **Facility portal**, create an account, and submit their facility. Verify the facility and the staff member’s authority before approving it in Supabase. Set `approved` to true on that facility row. Only approved listings are publicly searchable.
5. Staff can confirm individual services, enter quoted prices and arrival cutoffs in WAT. Confirmations expire at the cutoff or at the end of the WAT calendar day.

To publish via GitHub Pages, select **Settings → Pages → Deploy from a branch → main → / (root)**. The public directory works with the default configuration while facility registration and live updates require Supabase.

When releasing changes to cached frontend files, increment the cache version in `sw.js`.

## Enable the admin portal

Run [supabase/admin.sql](supabase/admin.sql) once in the existing CareCheck project's SQL Editor. In Authentication → Users, copy the user UUID of the existing account that will be the main administrator. Run the commented bootstrap statement at the end of the migration with that UUID.

Open [Admin portal](https://mtaver.github.io/CareCheck/admin.html) and sign in with that CareCheck account. The main administrator can grant or revoke administrator access for existing accounts. Administrators can approve or remove facility listings and suspend or restore staff accounts. Removal hides the listing from public search while preserving the record. Suspension blocks CareCheck submissions and updates, and hides the account's listings. The moderation log is stored in the private database schema.
