# Playbook Training HUD - Workshop release

Title: **Playbook Training HUD**

Visibility: **Unlisted / Nicht gelistet** (not Private).

Description:

```text
Client-side HUD assets for the Playbook training plugin on CS2 community servers.

Provides a fixed training panel for grenade lineups, recording, practice tools and personal panel settings. The server plugin supplies the menu content and actions.

This is a content addon, not a playable map or a standalone training mode. It requires a server running the compatible Playbook plugin and MultiAddonManager. Players do not need the CS2 Workshop Tools.

Custom keyboard bindings must be applied locally using the commands provided by the server plugin.

Community project; not an official Valve release.
```

Initial change note: `Initial HUD release. Locally tested; Workshop delivery verification pending.`

## Upload

1. Open `matchzy_training_hud` with Launch Tools.
2. In the Asset Browser, open Tools > Counter-Strike 2 Workshop Manager.
3. Create a new submission and select the addon folder under `game/csgo_addons/matchzy_training_hud`.
4. Use the title, description and visibility above. Preview: `training-hud/dist/workshop-preview.jpg`.
5. Submit, complete any Steam agreement/email verification, and retain the Workshop page URL/ID.
6. Future uploads must update this same entry, preserving its ID.

## Server rollout

Once the item is available to other users, open the server settings in Playbook, enable **Trainings-HUD** and **HUD über Workshop ausliefern**, and enter the Workshop ID. Apply the settings so the server receives the updated configuration.

For the delivery test, close CS2 and move the two local development overrides out of `game/csgo/panorama/{layout,styles}/custom_game/` into a backup directory. Keep the original addon and compiled build outputs. Start normal CS2 via Steam, join the server, spawn, and run `css_training`. Also verify with a second player who has no local HUD files.

Do not treat a successful upload as proof that all clients have downloaded and mounted the addon.
