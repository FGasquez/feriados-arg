/* 
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * Copyright 2024 Federico Gasquez
 */

const { GObject, St, Clutter, GLib } = imports.gi;
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const CACHE_FILE = '/tmp/feriados_cache.json';
const API_URL = 'https://nolaborables.com.ar/api/v2/feriados';

function fetchHolidaysData(prune = false) {
    if (prune) {
        try {
            GLib.spawn_command_line_sync(`rm ${CACHE_FILE}`);
        } catch (error) {
            logError(error, `Failed to prune cache file: ${CACHE_FILE}`);
        }
    }

    if (!GLib.file_test(CACHE_FILE, GLib.FileTest.EXISTS)) {
        try {
            GLib.spawn_command_line_sync(`curl -sL ${API_URL}/${new Date().getFullYear()} -o ${CACHE_FILE}`);
        } catch (error) {
            logError(error, `Failed to fetch holidays data using curl: ${API_URL}`);
        }
    }

    const fileContent = GLib.file_get_contents(CACHE_FILE);
    return JSON.parse(fileContent[1].toString());
}

function isToday(date) {
    const today = new Date();
    return date.setHours(0, 0, 0, 0) === today.setHours(0, 0, 0, 0);
}

function isWeekend(date) {
    const day = date.getDay();
    return day === 0 || day === 6;
}

function getNextHoliday(skipWeekend = false, skipToday = false) {
    const today = new Date();
    const holidays = fetchHolidaysData();

    return holidays.find(holiday => {
        const date = new Date(new Date().getFullYear(), holiday.mes - 1, holiday.dia);
        if (skipToday) {
            return skipWeekend ? date > today && !isWeekend(date) : date > today;
        }
        return skipWeekend ? date > today && !isWeekend(date) : date > today || isToday(date);
    });
}

const Indicator = GObject.registerClass(
class Indicator extends PanelMenu.Button {
    _init(settings) {
        super._init(0.5);
        this._settings = settings;

        const box = new St.BoxLayout({ vertical: false, style_class: 'panel-status-menu-box' });
        this.label = new St.Label({ 
            text: '',
            y_expand: true,
            y_align: Clutter.ActorAlign.CENTER 
        });

        const skipWeekend = this._settings.get_boolean('skip-weekends');
        const skipToday = this._settings.get_boolean('skip-today');
        this._updateLabel(skipWeekend, skipToday);

        box.add_child(this.label);
        this.add_child(box);

        this._createMenuItems(skipWeekend, skipToday);
        this._connectSettingsChanges();
    }

    _createMenuItems(skipWeekend, skipToday) {
        const addMenuItem = (label, callback) => {
            const item = new PopupMenu.PopupMenuItem(label);
            item.connect('activate', callback);
            this.menu.addMenuItem(item);
        };

        addMenuItem('Ver próximo', () => this.showNotification(false, true));
        addMenuItem('Ver próximo salteando fin de semana', () => this.showNotification(true, true));
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        addMenuItem('Actualizar', () => this._updateHolidaysData(skipWeekend));
        // addMenuItem('Preferencias', this._openSettings.bind(this));
    }

    _connectSettingsChanges() {
        this._settings.connect('changed::skip-weekends', (settings, key) => {
            this._updateLabel(settings.get_boolean(key), settings.get_boolean('skip-today'));
        });

        this._settings.connect('changed::skip-today', (settings, key) => {
            this._updateLabel(settings.get_boolean('skip-weekends'), settings.get_boolean(key));
        });
    }

    _openSettings() {
        ExtensionUtils.openPrefs(Me.uuid);
    }

    async _updateHolidaysData(skipWeekend) {
        fetchHolidaysData(true);
        this._updateLabel(skipWeekend);
    }

    showNotification(skipWeekend = false, skipToday = false) {
        const nextHoliday = getNextHoliday(skipWeekend, skipToday);
        if (!nextHoliday) return;

        const holidayDate = new Date(new Date().getFullYear(), nextHoliday.mes - 1, nextHoliday.dia);
        const dayName = new Intl.DateTimeFormat('es-AR', { weekday: 'long' }).format(holidayDate);
        const formattedDate = new Intl.DateTimeFormat('es-AR', { dateStyle: 'long' }).format(holidayDate);
        
        Main.notify(`Próximo feriado: ${nextHoliday.motivo}`, `El ${dayName} ${formattedDate} y de tipo ${nextHoliday.tipo}`);
    }

    _updateLabel(skipWeekend = true, skipToday = false) {
        const nextHoliday = getNextHoliday(skipWeekend, skipToday);
        if (!nextHoliday) return;

        const holidayDate = new Date(new Date().getFullYear(), nextHoliday.mes - 1, nextHoliday.dia).setHours(0, 0, 0, 0);
        const timeToHoliday = holidayDate - new Date().setHours(0, 0, 0, 0);

        if (holidayDate === new Date().setHours(0, 0, 0, 0)) {
            this.label.set_text('Es hoy!');
        } else {
            this.label.set_text(`Faltan ${Math.floor(timeToHoliday / (1000 * 60 * 60 * 24))} días!`);
        }
    }
});

class FeriadosExtension {
    constructor() {
        this._indicator = null;
        this._settings = ExtensionUtils.getSettings();
    }

    enable() {
        this._indicator = new Indicator(this._settings);
        Main.panel.addToStatusArea('FeriadosIndicator', this._indicator);
    }

    disable() {
        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
    }
}

function init() {
    return new FeriadosExtension();
}
