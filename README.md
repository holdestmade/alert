# Alert card (invertible)

A Home Assistant dashboard card that works like the built-in **Alert card**
(the card tints, and can pulse, while an entity is in an alert state) with one
extra option: **Invert**.

With **Invert** on, the card alerts while the entity is *not* in its usual
alert state. That's handy for a network/connectivity binary sensor, where you
want the card to light up when the device goes **off** (disconnected).
`unknown` and `unavailable` never trigger an alert.

Everything is configurable from the visual card editor. **Invert** sits under
**Pulse** in the **Alert** section.

## Installation

### HACS

1. HACS → ⋮ → **Custom repositories** → add this repository's URL with type **Dashboard**.
2. Install **Alert card (invertible)**.
3. Reload the browser.

### Manual

1. Copy `dist/invert-alert-card.js` to `config/www/invert-alert-card.js`.
2. **Settings → Dashboards → ⋮ → Resources → Add resource**
   - URL: `/local/invert-alert-card.js?v=1.0.0`
   - Type: **JavaScript module**
3. Reload the browser. (Bump the `?v=` number when you update the file.)

Then edit a dashboard, **Add card**, and search for **Alert card (invertible)**.

## YAML

```yaml
type: custom:invert-alert-card
entity: binary_sensor.remote_ui
invert: true
pulse: true
alert_color: red      # a theme colour name, a hex code, "state" or "none"
clear_color: none
```

| Option              | Default      | Description |
|---------------------|--------------|-------------|
| `entity`            | *(required)* | Entity to watch. |
| `invert`            | `false`      | Alert while the entity is **not** in its alert state. `unknown`/`unavailable` never alert. |
| `pulse`             | `false`      | Animate the background while alerting (respects reduced motion). |
| `alert_color`       | `state`      | Colour while alerting. With `state` and `invert` on, red is used (the inactive state colour is grey). |
| `clear_color`       | none         | Colour while not alerting. |
| `name`, `icon`      | from entity  | Override the name / icon. |
| `show_state`        | `true`       | Show the state in the second line. |
| `show_last_changed` | `true`       | Show when the state last changed. |
| `show_area`         | `true`       | Show the entity's area. |
| `tap_action`        | more-info    | Standard action config. |
| `hold_action`       | none         | Standard action config. |

### What counts as an "alert state"?

| Domain                | Alert states |
|-----------------------|--------------|
| `lock`                | unlocked, unlocking, open, opening, jammed |
| `cover`               | open, opening, closing |
| `alarm_control_panel` | triggered, pending, arming |
| everything else       | on, open, unlocked, detected, home, problem |

`invert` flips this.
