/*
 * Invertible Alert card for Home Assistant.
 *
 * Works like the built-in Alert card (background colour + optional pulse while
 * the entity is in an alert state) with an extra "Invert" option, so e.g. a
 * network/connectivity binary sensor can alert while it is "off".
 *
 * Card type: custom:invert-alert-card
 */

const CARD_VERSION = "1.0.0";

const THEME_COLORS = new Set([
  "primary", "accent", "red", "pink", "purple", "deep-purple", "indigo",
  "blue", "light-blue", "cyan", "teal", "green", "light-green", "lime",
  "yellow", "amber", "orange", "deep-orange", "brown", "light-grey", "grey",
  "dark-grey", "blue-grey", "black", "white", "disabled",
]);

// States that count as "alert" when invert is off (domain specific first).
const ALERT_STATES = {
  lock: ["unlocked", "unlocking", "open", "opening", "jammed"],
  cover: ["open", "opening", "closing"],
  alarm_control_panel: ["triggered", "pending", "arming"],
  alert: ["on"],
};
const DEFAULT_ALERT_STATES = ["on", "open", "unlocked", "detected", "home", "problem"];
const IGNORED_STATES = ["unknown", "unavailable"];

const LABELS = {
  entity: "Entity",
  alert: "Alert",
  clear_color: "Clear color",
  alert_color: "Alert color",
  pulse: "Pulse",
  invert: "Invert",
  content: "Content",
  name: "Name",
  icon: "Icon",
  show_state: "Show state",
  show_last_changed: "Show last changed",
  show_area: "Show area",
  interactions: "Interactions",
  tap_action: "Tap behavior",
  hold_action: "Hold behavior",
};

const HELPERS = {
  clear_color:
    "Used when the entity isn't in an alert state. The background doesn't pulse.",
  alert_color:
    "Used while the entity is in an alert state, such as a binary sensor that is on or an unlocked lock.",
  pulse:
    "Animates the colored background while the entity is in an alert state. When reduced motion is on, the background stays tinted instead.",
  invert:
    "Alert while the entity is NOT in its usual alert state, e.g. a network sensor that is off. Unknown and unavailable never alert.",
};

function cssColor(color) {
  if (!color) return undefined;
  if (THEME_COLORS.has(color)) return `var(--${color}-color)`;
  return color;
}

function stateCssColor(stateObj, inverted) {
  if (inverted) return "var(--error-color, #db4437)";
  const domain = stateObj.entity_id.split(".")[0];
  const state = stateObj.state.replace(/[^a-z0-9_]/gi, "_");
  const dc = stateObj.attributes.device_class;
  const chain = [
    dc && `--state-${domain}-${dc}-${state}-color`,
    `--state-${domain}-${state}-color`,
    `--state-${domain}-active-color`,
    "--state-active-color",
  ].filter(Boolean);
  return chain.reduceRight(
    (fallback, v) => `var(${v}${fallback ? `, ${fallback}` : ""})`,
    "var(--amber-color, #ffc107)"
  );
}

function relativeTime(date, language) {
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const units = [
    ["year", 31536000], ["month", 2592000], ["week", 604800],
    ["day", 86400], ["hour", 3600], ["minute", 60], ["second", 1],
  ];
  const rtf = new Intl.RelativeTimeFormat(language || "en", {
    numeric: "auto",
    style: "short",
  });
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size || unit === "second") {
      return rtf.format(Math.round(seconds / size), unit);
    }
  }
  return "";
}

class InvertAlertCard extends HTMLElement {
  static getStubConfig(hass) {
    const entity =
      Object.keys(hass?.states || {}).find((id) => id.startsWith("binary_sensor.")) ||
      "";
    return { entity, alert_color: "state", pulse: false, invert: false };
  }

  static getConfigForm() {
    return {
      schema: [
        { name: "entity", required: true, selector: { entity: {} } },
        {
          name: "alert",
          type: "expandable",
          flatten: true,
          expanded: true,
          icon: "mdi:alert-outline",
          title: "Alert",
          schema: [
            {
              type: "grid",
              name: "",
              schema: [
                {
                  name: "clear_color",
                  selector: { ui_color: { include_none: true, include_state: true } },
                },
                {
                  name: "alert_color",
                  selector: {
                    ui_color: {
                      include_none: true,
                      include_state: true,
                      default_color: "state",
                    },
                  },
                },
              ],
            },
            { name: "pulse", selector: { boolean: {} } },
            { name: "invert", selector: { boolean: {} } },
          ],
        },
        {
          name: "content",
          type: "expandable",
          flatten: true,
          icon: "mdi:text-short",
          title: "Content",
          schema: [
            {
              type: "grid",
              name: "",
              schema: [
                { name: "name", selector: { text: {} } },
                { name: "icon", selector: { icon: {} }, context: { icon_entity: "entity" } },
              ],
            },
            { name: "show_state", default: true, selector: { boolean: {} } },
            { name: "show_last_changed", default: true, selector: { boolean: {} } },
            { name: "show_area", default: true, selector: { boolean: {} } },
          ],
        },
        {
          name: "interactions",
          type: "expandable",
          flatten: true,
          icon: "mdi:gesture-tap",
          title: "Interactions",
          schema: [
            { name: "tap_action", selector: { ui_action: { default_action: "more-info" } } },
            { name: "hold_action", selector: { ui_action: { default_action: "none" } } },
          ],
        },
      ],
      computeLabel: (schema) => LABELS[schema.name],
      computeHelper: (schema) => HELPERS[schema.name],
    };
  }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._holdTimer = undefined;
    this._held = false;
  }

  setConfig(config) {
    if (!config || !config.entity) {
      throw new Error("Please define an entity");
    }
    this._config = {
      alert_color: "state",
      pulse: false,
      invert: false,
      show_state: true,
      show_last_changed: true,
      show_area: true,
      ...config,
    };
    this._built = false;
    this._render();
  }

  set hass(hass) {
    const old = this._hass;
    this._hass = hass;
    const id = this._config?.entity;
    if (!old || !id || old.states[id] !== hass.states[id] || old.locale !== hass.locale) {
      this._render();
    }
  }

  getCardSize() {
    return 1;
  }

  getGridOptions() {
    return { columns: 6, rows: 1, min_columns: 6, min_rows: 1 };
  }

  _isAlert(stateObj) {
    const state = stateObj.state;
    if (IGNORED_STATES.includes(state)) return false;
    const domain = stateObj.entity_id.split(".")[0];
    const active = (ALERT_STATES[domain] || DEFAULT_ALERT_STATES).includes(state);
    return this._config.invert ? !active : active;
  }

  _resolveColor(color, stateObj, alerting) {
    if (!color || color === "none") return undefined;
    if (color === "state") {
      return stateCssColor(stateObj, alerting && this._config.invert);
    }
    return cssColor(color);
  }

  _secondary(stateObj) {
    const hass = this._hass;
    const parts = [];
    if (this._config.show_state) {
      parts.push(hass.formatEntityState ? hass.formatEntityState(stateObj) : stateObj.state);
    }
    if (this._config.show_last_changed && stateObj.last_changed) {
      parts.push(relativeTime(new Date(stateObj.last_changed), hass.locale?.language));
    }
    if (this._config.show_area) {
      const ent = hass.entities?.[stateObj.entity_id];
      const areaId = ent?.area_id || hass.devices?.[ent?.device_id]?.area_id;
      const area = areaId && hass.areas?.[areaId]?.name;
      if (area) parts.push(area);
    }
    return parts.join(" \u00b7 ");
  }

  _build() {
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; height: 100%; }
        ha-card {
          height: 100%;
          box-sizing: border-box;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px;
          cursor: pointer;
          overflow: hidden;
          position: relative;
          --tint: transparent;
          --tint-strength: 40%;
          background: var(--ha-card-background, var(--card-background-color));
          transition: background-color 180ms ease-in-out;
        }
        ha-card::before {
          content: "";
          position: absolute;
          inset: 0;
          background: var(--tint);
          opacity: var(--tint-opacity, 0);
          pointer-events: none;
          border-radius: inherit;
        }
        ha-card.tinted::before { opacity: 0.4; }
        ha-card.pulse::before { animation: pulse 2s ease-in-out infinite; }
        @keyframes pulse {
          0%, 100% { opacity: 0.15; }
          50% { opacity: 0.5; }
        }
        @media (prefers-reduced-motion: reduce) {
          ha-card.pulse::before { animation: none; opacity: 0.4; }
        }
        .icon {
          position: relative;
          flex: none;
          width: 36px;
          height: 36px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--icon-color, var(--state-icon-color, var(--primary-text-color)));
        }
        .icon::before {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: 50%;
          background: var(--icon-color, var(--disabled-color, #bdbdbd));
          opacity: 0.2;
        }
        .icon > * { position: relative; --mdc-icon-size: 24px; }
        .info { position: relative; min-width: 0; flex: 1; }
        .name, .secondary {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .name {
          font-size: var(--ha-font-size-m, 14px);
          font-weight: var(--ha-font-weight-medium, 500);
          line-height: 20px;
          color: var(--primary-text-color);
        }
        .secondary {
          font-size: var(--ha-font-size-s, 12px);
          line-height: 16px;
          color: var(--secondary-text-color);
        }
        .warning { color: var(--error-color); padding: 4px; }
      </style>
      <ha-card>
        <div class="icon"></div>
        <div class="info">
          <div class="name"></div>
          <div class="secondary"></div>
        </div>
      </ha-card>
    `;
    const card = this.shadowRoot.querySelector("ha-card");
    card.addEventListener("pointerdown", () => {
      this._held = false;
      clearTimeout(this._holdTimer);
      this._holdTimer = setTimeout(() => {
        this._held = true;
        this._action("hold");
      }, 500);
    });
    const cancel = () => clearTimeout(this._holdTimer);
    card.addEventListener("pointerup", cancel);
    card.addEventListener("pointerleave", cancel);
    card.addEventListener("pointercancel", cancel);
    card.addEventListener("click", () => {
      if (this._held) {
        this._held = false;
        return;
      }
      this._action("tap");
    });
    card.addEventListener("contextmenu", (ev) => ev.preventDefault());
    this._built = true;
  }

  _action(action) {
    const config = {
      entity: this._config.entity,
      tap_action: { action: "more-info" },
      hold_action: { action: "none" },
      ...this._config,
    };
    if (config[`${action}_action`]?.action === "none") return;
    this.dispatchEvent(
      new CustomEvent("hass-action", {
        detail: { config, action },
        bubbles: true,
        composed: true,
      })
    );
  }

  _render() {
    if (!this._config || !this._hass) return;
    if (!this._built) this._build();

    const card = this.shadowRoot.querySelector("ha-card");
    const iconWrap = this.shadowRoot.querySelector(".icon");
    const nameEl = this.shadowRoot.querySelector(".name");
    const secondaryEl = this.shadowRoot.querySelector(".secondary");
    const stateObj = this._hass.states[this._config.entity];

    if (!stateObj) {
      nameEl.textContent = this._config.name || this._config.entity;
      secondaryEl.innerHTML = `<span class="warning">Entity not available</span>`;
      card.className = "";
      return;
    }

    const alerting = this._isAlert(stateObj);
    const color = alerting
      ? this._resolveColor(this._config.alert_color, stateObj, true)
      : this._resolveColor(this._config.clear_color, stateObj, false);

    card.classList.toggle("tinted", Boolean(color));
    card.classList.toggle("pulse", Boolean(color) && alerting && this._config.pulse);
    card.classList.toggle("alerting", alerting);
    card.style.setProperty("--tint", color || "transparent");
    if (color) {
      iconWrap.style.setProperty("--icon-color", color);
    } else {
      iconWrap.style.removeProperty("--icon-color");
    }

    let icon = iconWrap.firstElementChild;
    const wanted = customElements.get("ha-state-icon") ? "ha-state-icon" : "ha-icon";
    if (!icon || icon.localName !== wanted) {
      iconWrap.innerHTML = "";
      icon = document.createElement(wanted);
      iconWrap.appendChild(icon);
    }
    if (wanted === "ha-state-icon") {
      icon.hass = this._hass;
      icon.stateObj = stateObj;
      icon.icon = this._config.icon;
    } else {
      icon.icon = this._config.icon || stateObj.attributes.icon || "mdi:bell";
    }

    nameEl.textContent =
      this._config.name || stateObj.attributes.friendly_name || stateObj.entity_id;
    secondaryEl.textContent = this._secondary(stateObj);
  }
}

if (!customElements.get("invert-alert-card")) {
  customElements.define("invert-alert-card", InvertAlertCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: "invert-alert-card",
    name: "Alert card (invertible)",
    description:
      "Tints and pulses while an entity is in an alert state, with an option to invert it.",
    preview: true,
    documentationURL: "https://github.com/holdestmade/alert",
  });
  console.info(
    `%c INVERT-ALERT-CARD %c ${CARD_VERSION} `,
    "color: white; background: #db4437; font-weight: 700;",
    "color: #db4437; background: white; font-weight: 700;"
  );
}
