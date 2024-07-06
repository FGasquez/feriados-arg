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

import Gio from 'gi://Gio';
import Adw from 'gi://Adw';
import {ExtensionPreferences} from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js"

export default class ExamplePreferences extends ExtensionPreferences {
    
    fillPreferencesWindow(window) {
        // Create a preferences page, with a single group
        const page = new Adw.PreferencesPage({
            title: 'General',
            icon_name: 'dialog-information-symbolic',
        });
        window.add(page);

        const group = new Adw.PreferencesGroup({
            title: 'Settings',
            description: 'Configure the settings of the extension'
        });
        page.add(group);

        // Create a new preferences row
        const skipWeekend = new Adw.SwitchRow({
            title: 'Saltear fines de semana',
            subtitle: 'Si esta opcion esta activada, la cuenta regresiva no incluira feriados en fines de semana',
        });
        group.add(skipWeekend);

        const skipToday = new Adw.SwitchRow({
            title: 'Saltear si el feriado es hoy',
            subtitle: 'Si esta opcion esta activada, los días feriados se mostrará el siguiente en lugar del mensaje "Eso hoy!"',
        });

        group.add(skipToday);

        // Create a settings object and bind the skipWeekend to the `show-indicator` key
        window._settings = this.getSettings();
        window._settings.bind('skip-weekends', skipWeekend, 'active',
            Gio.SettingsBindFlags.DEFAULT);
        window._settings.bind('skip-today', skipToday, 'active',
            Gio.SettingsBindFlags.DEFAULT);
    }
}