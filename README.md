# Alert (with invert)

A copy of Home Assistant's built-in [Alert](https://www.home-assistant.io/integrations/alert/)
integration, packaged as a custom component, with one extra option: `invert`.

With `invert: true` the alert fires while the watched entity is **not** in the
configured `state`. This is handy for things like a network/ping binary sensor,
where you want to be alerted when the device goes `off`.

When `invert` is on, `unknown` and `unavailable` states are ignored (the alert
keeps whatever status it had), so a Home Assistant restart doesn't fire a
spurious alert.

## Installation

### Manual

1. Copy the `custom_components/alert` folder into your Home Assistant
   `config/custom_components/` folder, so you end up with
   `config/custom_components/alert/manifest.json`.
2. Restart Home Assistant.

Because it uses the same `alert` domain, this custom component replaces the
built-in Alert integration. Home Assistant will log a warning saying a custom
integration is overriding a core one; that's expected. Your existing `alert:`
YAML keeps working unchanged.

### HACS

Add this repository as a custom repository (type: Integration) in HACS,
install "Alert (with invert)", then restart Home Assistant.

## Configuration

```yaml
alert:
  router_offline:
    name: Router is offline
    entity_id: binary_sensor.router_ping
    invert: true          # alert when the sensor is NOT "on"
    repeat: 30
    can_acknowledge: true
    skip_first: false
    message: "The router has gone offline"
    done_message: "The router is back online"
    notifiers:
      - mobile_app_my_phone
```

All the standard options from the
[core documentation](https://www.home-assistant.io/integrations/alert/) are
supported. The added option:

| Option   | Default | Description |
|----------|---------|-------------|
| `invert` | `false` | Fire the alert while the watched entity is *not* in `state` (default `state` is `on`). `unknown`/`unavailable` are ignored. |

The alert entity also exposes `watched_entity_id`, `alert_state` and `invert`
as attributes so you can see how it's configured.
