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

import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import * as Util from 'resource:///org/gnome/shell/misc/util.js';
import GLib from 'gi://GLib';

import { Extension, gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const CACHE_FILE = '/tmp/feriados_cache.json';
const API_URL = 'https://nolaborables.com.ar/api/v2/feriados';

const fetchHolidaysData = async (prune = false) => {
    try {
        if (prune) {
            GLib.unlink(CACHE_FILE);
        }

        if (!GLib.file_test(CACHE_FILE, GLib.FileTest.EXISTS)) {
            const command = `curl -sL ${API_URL}/${new Date().getFullYear()} -o ${CACHE_FILE}`;
            await Util.spawnCommandLine(command);
        }

        const fileContent = GLib.file_get_contents(CACHE_FILE);
        const decoder = new TextDecoder('utf-8'); // Use TextDecoder
        return JSON.parse(decoder.decode(fileContent[1]));
    } catch (error) {
        logError(error, 'Failed to fetch holidays data');
        return [];
    }
};

const isToday = (date) => {
    const today = new Date();
    return date.setHours(0, 0, 0, 0) === today.setHours(0, 0, 0, 0);
};

const isWeekend = (date) => {
    const day = date.getDay();
    return day === 0 || day === 6;
};

const getNextHoliday = async (skipWeekend = false, skipToday = false) => {
    const today = new Date();
    const holidays = await fetchHolidaysData();

    return holidays.find(holiday => {
        const date = new Date(new Date().getFullYear(), holiday.mes - 1, holiday.dia);
        if (skipToday) {
            return skipWeekend ? date > today && !isWeekend(date) : date > today;
        }
        return skipWeekend ? date > today && !isWeekend(date) : date > today || isToday(date);
    });
};

const Indicator = GObject.registerClass(
class Indicator extends PanelMenu.Button {
    _init(ext) {
        super._init(0.5);
        this._extension = ext;
        this._settings = this._extension.getSettings();

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
        addMenuItem('Preferencias', this._openSettings.bind(this));
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        addMenuItem('Debug', () => { /* Debug action */ });
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
        this._extension.openPreferences();
    }

    async _updateHolidaysData(skipWeekend) {
        await fetchHolidaysData(true).catch(error => logError(error, 'Failed to update holidays data'));
        this._updateLabel(skipWeekend);
    }

    async showNotification(skipWeekend = false, skipToday = false) {
        try {
            const nextHoliday = await getNextHoliday(skipWeekend, skipToday);
            if (!nextHoliday) return;

            const holidayDate = new Date(new Date().getFullYear(), nextHoliday.mes - 1, nextHoliday.dia);
            const dayName = new Intl.DateTimeFormat('es-AR', { weekday: 'long' }).format(holidayDate);
            const formattedDate = new Intl.DateTimeFormat('es-AR', { dateStyle: 'long' }).format(holidayDate);
            
            Main.notify(`Próximo feriado: ${nextHoliday.motivo}`, `El ${dayName} ${formattedDate} y de tipo ${nextHoliday.tipo}`);
        } catch (error) {
            logError(error, 'Failed to show notification');
        }
    }

    async _updateLabel(skipWeekend = true, skipToday = false) {
        try {
            const nextHoliday = await getNextHoliday(skipWeekend, skipToday);
            if (!nextHoliday) return;

            const holidayDate = new Date(new Date().getFullYear(), nextHoliday.mes - 1, nextHoliday.dia).setHours(0, 0, 0, 0);
            const timeToHoliday = holidayDate - new Date().setHours(0, 0, 0, 0);

            if (holidayDate === new Date().setHours(0, 0, 0, 0)) {
                this.label.set_text('Es hoy!');
            } else {
                this.label.set_text(`Faltan ${Math.floor(timeToHoliday / (1000 * 60 * 60 * 24))} días!`);
            }
        } catch (error) {
            logError(error, 'Failed to update label');
        }
    }
});

export default class IndicatorExampleExtension extends Extension {
    enable() {
        this._indicator = new Indicator(this);
        Main.panel.addToStatusArea(this.uuid, this._indicator);
    }

    disable() {
        this._indicator.destroy();
        this._indicator = null;
    }
}
